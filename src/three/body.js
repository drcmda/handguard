// The engine's solid as three.js geometry, the way a CAD app draws it: the faces (each keeping
// its surface type, for the silhouettes), the B-rep's own edges as line segments, and the silhouettes
// of its curved faces as the eye sees them.
import * as THREE from 'three'

// `containers`: the solid's graphics as buerli keeps them. Their meshes are the faces (vertices,
// normals, triangles, the loops of edges that bound them, the surface type); their edges come as
// lines (point lists) and arcs.
export function makeBody(containers) {
  const meshes = containers.flatMap(c => c.meshes ?? [])
  const pos = new Float32Array(meshes.reduce((n, m) => n + m.vertices.length, 0))
  const nor = new Float32Array(pos.length)
  const idx = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0))
  const faces = []
  let vo = 0 // (vertices so far)
  let io = 0 // (indices so far)
  for (const m of meshes) {
    const count = m.vertices.length / 3
    const surface = m.properties?.surface?.type ?? 'other'
    pos.set(m.vertices, vo * 3)
    if (m.normals?.length === m.vertices.length) nor.set(m.normals, vo * 3)
    for (let i = 0; i < m.indices.length; i++) idx[io + i] = m.indices[i] + vo
    faces.push({ start: vo, count, i0: io, ni: m.indices.length, surface })
    vo += count
    io += m.indices.length
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geometry.setIndex(new THREE.BufferAttribute(idx, 1))
  if (meshes.some(m => m.normals?.length !== m.vertices.length)) geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // The edges: the B-rep's own, all but the seams (where a closed face meets itself: only that one
  // face names such an edge).
  const named = new Map()
  for (const loop of meshes.flatMap(m => m.loops ?? [])) for (const id of loop) named.set(id, (named.get(id) ?? 0) + 1)
  const real = e => (named.get(e.id) ?? 2) > 1
  const segs = []
  const polyline = p => {
    for (let i = 0; i + 5 < p.length; i += 3) segs.push(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5])
  }
  for (const c of containers) {
    // (edges as point lists, as the engine sends them; or, as buerli keeps them, as lines and arcs)
    for (const e of [...(c.edges ?? []), ...(c.lines ?? [])]) if (real(e)) polyline(e.points)
    for (const e of c.arcs ?? []) if (real(e)) polyline(arcPoints(e))
  }

  const body = { geometry, faces, pos, idx, edges: new Float32Array(segs), box: geometry.boundingBox.clone() }
  let candidates = null
  body.silCands = () => (candidates ??= silhouetteCandidates(body))
  return body
}

// An arc edge as points: round its centre, `angle` from its x axis toward its y axis (z × x).
function arcPoints(a) {
  const center = new THREE.Vector3(...a.center)
  const x = new THREE.Vector3(...a.xAxis)
  const y = new THREE.Vector3(...a.zAxis).cross(x)
  const n = Math.max(6, Math.ceil((Math.abs(a.angle) / (2 * Math.PI)) * 96)) // (96 segments a full turn)
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = (a.angle * i) / n
    const p = center
      .clone()
      .addScaledVector(x, Math.cos(t) * a.radius)
      .addScaledVector(y, Math.sin(t) * a.radius)
    out.push(p.x, p.y, p.z)
  }
  return out
}

// The edges inside the curved faces, each with the normals of its two triangles: the silhouette is
// where one of them faces the eye and the other does not. (A closed face's seam is welded first, so a
// cylinder's outline is found across its seam too.)
function silhouetteCandidates({ faces, pos, idx }) {
  const out = []
  const P = i => new THREE.Vector3().fromArray(pos, 3 * i)
  for (const f of faces) {
    if (f.surface === 'plane') continue
    // (the face's vertices that sit at one place, to 1/500 mm, as one)
    const first = new Map()
    const weld = new Map()
    for (let i = f.start; i < f.start + f.count; i++) {
      const key = [0, 1, 2].map(k => Math.round(pos[3 * i + k] * 500)).join()
      if (!first.has(key)) first.set(key, i)
      weld.set(i, first.get(key))
    }
    // each triangle's normal, and each edge's two triangles
    const normals = []
    const edges = new Map()
    for (let t = 0; t < f.ni / 3; t++) {
      const [a, b, c] = [0, 1, 2].map(k => weld.get(idx[f.i0 + 3 * t + k]))
      const n = P(b)
        .sub(P(a))
        .cross(P(c).sub(P(a)))
      normals.push(n.lengthSq() < 1e-12 ? null : n.normalize())
      if (!normals[t]) continue
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = p < q ? `${p}_${q}` : `${q}_${p}`
        const e = edges.get(key)
        if (e) e.t2 = t
        else edges.set(key, { p, q, t1: t, t2: -1 })
      }
    }
    for (const { p, q, t1, t2 } of edges.values()) {
      const n1 = normals[t1]
      const n2 = t2 < 0 ? null : normals[t2]
      if (!n1 || !n2 || n1.dot(n2) > 0.99999) continue // (an open edge, or a flat one)
      out.push(...P(p).toArray(), ...P(q).toArray(), ...n1.toArray(), ...n2.toArray())
    }
  }
  return new Float32Array(out)
}

// The silhouette as an eye at `eye` (in the body's own space) sees it: the candidates one of whose
// triangles it sees from the front, the other from behind.
export function silhouette(body, eye) {
  const c = body.silCands()
  const out = []
  for (let i = 0; i < c.length; i += 12) {
    // (from the edge's middle to the eye)
    const dx = eye[0] - (c[i] + c[i + 3]) / 2
    const dy = eye[1] - (c[i + 1] + c[i + 4]) / 2
    const dz = eye[2] - (c[i + 2] + c[i + 5]) / 2
    const side1 = c[i + 6] * dx + c[i + 7] * dy + c[i + 8] * dz
    const side2 = c[i + 9] * dx + c[i + 10] * dy + c[i + 11] * dz
    if (side1 * side2 < 0) out.push(c[i], c[i + 1], c[i + 2], c[i + 3], c[i + 4], c[i + 5])
  }
  return out
}
