// The part in a CAD app's dark look: an even light and one lamp over the viewer's left shoulder
// (wherever the part is turned), a cool rim where its faces turn away (so that a black part stands
// off the dark page), its B-rep edges and its silhouettes inked. Its faces are also on the MASK layer,
// for the frame's passes (Frame.jsx: their ambient occlusion).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { silhouette } from './body'
import { MASK } from './Frame'
import { useShop } from '../store'

const INK = '#07080a'

// The faces: their colour, half of it as an even light, half from the lamp (in view space, so it
// stays over the viewer's shoulder as the part turns); a rim of cool light where they turn away; and
// a sweep of light along the part while the engine rebuilds it.
const vertexShader = /* glsl */ `
varying vec3 vNv;
varying vec3 vPos;
void main() {
  vNv = normalize(normalMatrix * normal);
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const fragmentShader = /* glsl */ `
uniform vec3 uBase;
uniform float uScan;
uniform float uScanK;
varying vec3 vNv;
varying vec3 vPos;
void main() {
  vec3 Nv = normalize(vNv);
  if (!gl_FrontFacing) Nv = -Nv;
  float lamp = max(dot(Nv, normalize(vec3(-0.46, 0.56, 0.69))), 0.0);
  float rim = pow(1.0 - max(Nv.z, 0.0), 3.0);
  vec3 c = uBase * (0.42 + 0.58 * lamp) + vec3(0.58, 0.64, 0.76) * 0.22 * rim;
  float d = (vPos.x - uScan) / 9.0;
  c = mix(c, vec3(1.0, 0.86, 0.82), uScanK * exp(-d * d));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

// The ink. An edge lies exactly on the faces it bounds, and the faces are flat facets of the true
// curve the edge follows: where they meet, the faces would cover part of the line's width and leave
// it ragged. So every line is drawn a hair nearer the eye than it is (its ends pulled toward the
// camera along their own rays: on screen nothing moves).
function inkMaterial() {
  const m = new LineMaterial({ color: INK, linewidth: 1.4, transparent: true, depthWrite: false })
  const end = 'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );'
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(end, `${end}\nstart.xyz *= 0.9975;\nend.xyz *= 0.9975;`)
  }
  m.customProgramCacheKey = () => 'ink'
  return m
}

// a set of inked lines, drawn after the faces
function inkLines(material) {
  const lines = new LineSegments2(new LineSegmentsGeometry(), material)
  lines.frustumCulled = false
  lines.renderOrder = 2
  return lines
}
function setSegments(lines, segments) {
  lines.geometry.dispose()
  lines.geometry = new LineSegmentsGeometry()
  lines.geometry.setPositions(segments.length ? segments : [0, 0, 0, 0, 0, 0])
}

// `scan`: where the sweep of light is along the part (its x, in mm), and how bright, while a rebuild runs
export function Part({ body, color, scan, width = 1.1 }) {
  const { size, camera } = useThree()
  const faces = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uBase: { value: new THREE.Color(color) }, uScan: { value: 0 }, uScanK: { value: 0 } },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        // (the faces a little behind their edges and silhouettes)
        polygonOffset: true,
        polygonOffsetFactor: 1.5,
        polygonOffsetUnits: 2,
      }),
    [],
  )
  const ink = useMemo(inkMaterial, [])
  const edges = useMemo(() => inkLines(ink), [ink])
  const outline = useMemo(() => inkLines(ink), [ink])
  const group = useRef()
  const seen = useRef({ eye: null, body: null }) // (where the silhouette was last found from)

  // (the colour eases to the finish's)
  const target = useMemo(() => new THREE.Color(), [])
  useEffect(() => void target.set(color), [color, target])

  useEffect(() => {
    if (!body) return
    setSegments(edges, body.edges)
    seen.current.body = null
  }, [body, edges])

  useFrame((state, dt) => {
    faces.uniforms.uBase.value.lerp(target, 1 - Math.exp(-dt * 10))
    const s = scan?.() ?? null
    faces.uniforms.uScanK.value = s ? s.k : 0
    if (s) faces.uniforms.uScan.value = s.x
    const dpr = state.gl.getPixelRatio()
    ink.resolution.set(size.width * dpr, size.height * dpr)
    ink.linewidth = width * dpr
    if (!body || !group.current) return
    // (while the photo shows the part, its silhouettes are not wanted)
    const shop = useShop.getState()
    if (shop.look === 'photo' && shop.photoOK) return
    // the silhouette, from where the eye is (in the part's own space), when it has moved
    const eye = camera.position.clone().applyMatrix4(group.current.matrixWorld.clone().invert())
    const seenNow = seen.current
    if (seenNow.body === body && seenNow.eye && seenNow.eye.distanceToSquared(eye) < 1e-4) return
    Object.assign(seenNow, { body, eye })
    const segments = silhouette(body, eye.toArray())
    setSegments(outline, segments)
    outline.visible = segments.length > 0
  })

  if (!body) return null
  // (the model's z is up, three.js's y: the part is stood up; its rear face stays where it is, so that
  // a longer part grows forward, and its middle height is at the room's middle)
  const zMid = (body.box.min.z + body.box.max.z) / 2
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={group} position={[0, 0, -zMid]}>
        <mesh geometry={body.geometry} material={faces} onUpdate={m => m.layers.enable(MASK)} />
        <primitive object={edges} />
        <primitive object={outline} />
      </group>
    </group>
  )
}
