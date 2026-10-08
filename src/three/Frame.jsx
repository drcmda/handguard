// The frame, drawn in passes: the room as it is; the part's faces again (on the MASK layer), as their
// normals and depth, which is also the mask of what is outlined; ambient occlusion from those (light
// that does not get into the slots, the corners, under the rails), blurred and laid over the faces;
// and the outline round the part, as the CAD app draws one round what is in hand: orange, a few pixels
// wide, its outer edge soft, a little glow beyond. How far each pixel outside the mask is from it is
// found in two passes (along the rows, then down the columns: the distance itself, not a square's);
// within the outline's width it is the outline's colour. A new part (a rebuild landing) makes the
// outline heavier for a moment.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useShop } from '../store'

export const MASK = 1
const RMAX = 32
const SAMPLES = 16
const STEPS = 192

const quadVert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

// ---- the occlusion: for each pixel of the part, where it is (from the depth), which way it faces, and
// how much of what lies round it, within a few millimetres, stands over it. The samples turn from one
// pixel to the next over a 4×4 tile, which the blur then averages away.
const aoFrag = /* glsl */ `
uniform sampler2D uDepth, uNormal; uniform mat4 uProj, uProjInv; uniform float uRadius, uBias;
varying vec2 vUv;
vec3 at(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, texture2D(uDepth, uv).x * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
void main() {
  if (texture2D(uNormal, vUv).a < 0.5) { gl_FragColor = vec4(1.0); return; }
  vec3 P = at(vUv);
  vec3 N = normalize(texture2D(uNormal, vUv).xyz * 2.0 - 1.0);
  vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
  float turn = (cell.x + 4.0 * cell.y) / 16.0 * 6.2831853;
  vec2 reach = vec2(uProj[0][0], uProj[1][1]) * uRadius / -P.z * 0.5;
  float r2 = uRadius * uRadius, sum = 0.0;
  for (int i = 0; i < ${SAMPLES}; i++) {
    float fi = float(i);
    float a = turn + fi * 2.3999632;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * reach * sqrt((fi + 0.5) / ${SAMPLES}.0);
    vec3 v = at(uv) - P;
    float vv = dot(v, v);
    sum += clamp(1.0 - vv / (4.0 * r2), 0.0, 1.0) * max(dot(v, N) - uBias, 0.0) / (vv + 0.05 * r2) * uRadius;
  }
  gl_FragColor = vec4(vec3(sum / ${SAMPLES}.0), 1.0);
}`
// (the 4×4 average of the occlusion, over the part only, multiplied into the frame)
const aoBlurFrag = /* glsl */ `
uniform sampler2D uAO, uNormal; uniform vec2 uTexel; uniform float uStrength;
varying vec2 vUv;
void main() {
  if (texture2D(uNormal, vUv).a < 0.5) discard;
  float sum = 0.0, n = 0.0;
  for (int x = -2; x < 2; x++) for (int y = -2; y < 2; y++) {
    vec2 uv = vUv + vec2(float(x) + 0.5, float(y) + 0.5) * uTexel;
    float m = step(0.5, texture2D(uNormal, uv).a);
    sum += m * texture2D(uAO, uv).r; n += m;
  }
  float occ = sum / max(n, 1.0);
  gl_FragColor = vec4(vec3(clamp(1.0 - uStrength * occ, 0.0, 1.0)), 1.0);
}`

// ---- the outline
const rowFrag = /* glsl */ `
uniform sampler2D uMask; uniform vec2 uTexel; uniform float uR;
varying vec2 vUv;
void main() {
  if (texture2D(uMask, vUv).a > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float best = uR + 1.0;
  for (int i = 1; i <= ${RMAX}; i++) {
    float fi = float(i);
    if (fi > uR) break;
    if (texture2D(uMask, vUv + vec2(fi * uTexel.x, 0.0)).a > 0.5 || texture2D(uMask, vUv - vec2(fi * uTexel.x, 0.0)).a > 0.5) { best = fi; break; }
  }
  gl_FragColor = vec4(best / (uR + 1.0), 0.0, 0.0, 1.0);
}`
// (only round the part, not inside what can be seen through it, a screw hole, slots in line: a pixel
// there has the part all round it, while one outside it finds a way out of the part's box in some
// direction, whatever lies between)
const outlineFrag = /* glsl */ `
uniform sampler2D uDist, uMask; uniform vec2 uTexel; uniform float uR, uWidth, uAlpha, uGlow; uniform vec3 uColor;
uniform vec4 uBox; uniform float uStep;
varying vec2 vUv;
bool out_(vec2 dir) {
  vec2 p = vUv, d = dir * uStep * uTexel;
  for (int s = 0; s < ${STEPS}; s++) {
    p += d;
    if (p.x < uBox.x || p.y < uBox.y || p.x > uBox.z || p.y > uBox.w) return true;
    if (texture2D(uMask, p).a > 0.5) return false;
  }
  return true;
}
bool enclosed() {
  const float h = 0.7071068;
  return !(out_(vec2(1.0, 0.0)) || out_(vec2(-1.0, 0.0)) || out_(vec2(0.0, 1.0)) || out_(vec2(0.0, -1.0)) ||
           out_(vec2(h, h)) || out_(vec2(-h, h)) || out_(vec2(h, -h)) || out_(vec2(-h, -h)));
}
void main() {
  float h0 = texture2D(uDist, vUv).r * (uR + 1.0);
  if (h0 < 0.5) discard;
  float d2 = h0 * h0;
  for (int j = 1; j <= ${RMAX}; j++) {
    float fj = float(j);
    if (fj > uR || fj * fj >= d2) break;
    float a = texture2D(uDist, vUv + vec2(0.0, fj * uTexel.y)).r * (uR + 1.0);
    float b = texture2D(uDist, vUv - vec2(0.0, fj * uTexel.y)).r * (uR + 1.0);
    d2 = min(d2, min(a * a, b * b) + fj * fj);
  }
  float d = sqrt(d2);
  float band = 1.0 - smoothstep(uWidth - 0.8, uWidth + 0.8, d);
  float glow = uGlow * exp(-pow(max(0.0, d - uWidth) / max(1.0, (uR - uWidth) * 0.45), 2.0));
  float a = clamp(max(band, glow), 0.0, 1.0) * uAlpha;
  if (a < 0.002 || enclosed()) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`

const pass = (fragmentShader, uniforms, o = {}) =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: quadVert,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    ...o,
  })

// `width`: the outline's, in CSS pixels; `radius`: how far round a point the occlusion looks (mm);
// `strength`: how dark it gets; `body`: the part shown (a new one kicks the outline heavier for a moment)
export function Frame({ body, color = '#d98a50', width = 4.2, glow = 0.22, radius = 12, strength = 1.8 }) {
  const size = useThree(s => s.size)
  const gl = useThree(s => s.gl)
  const kit = useMemo(() => {
    const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }
    // the part's normals (rgb) and its mask (a), with its depth
    const normal = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthTexture: new THREE.DepthTexture(1, 1) })
    const ao = new THREE.WebGLRenderTarget(1, 1, nearest)
    const dist = new THREE.WebGLRenderTarget(1, 1, nearest)
    const texel = new THREE.Vector2()
    const occlusion = pass(aoFrag, {
      uDepth: { value: normal.depthTexture },
      uNormal: { value: normal.texture },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uRadius: { value: radius },
      uBias: { value: 0.15 },
    })
    const blur = pass(
      aoBlurFrag,
      {
        uAO: { value: ao.texture },
        uNormal: { value: normal.texture },
        uTexel: { value: texel },
        uStrength: { value: strength },
      },
      // (multiplied into what is there: its colour darkened, its alpha kept)
      {
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      },
    )
    const row = pass(rowFrag, { uMask: { value: normal.texture }, uTexel: { value: texel }, uR: { value: 8 } })
    const line = pass(
      outlineFrag,
      {
        uDist: { value: dist.texture },
        uMask: { value: normal.texture },
        uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
        uStep: { value: 2 },
        uTexel: { value: texel },
        uR: { value: 8 },
        uWidth: { value: 4 },
        uAlpha: { value: 1 },
        uGlow: { value: glow },
        uColor: { value: new THREE.Color(color) },
      },
      { transparent: true },
    )
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), row)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const normals = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    // (the part's box, and its corners on the screen)
    const box = new THREE.Box3()
    const corner = new THREE.Vector3()
    return { normal, ao, dist, texel, occlusion, blur, row, line, quad, scene, normals, cam, box, corner }
  }, [])
  useEffect(
    () => () =>
      [
        kit.normal,
        kit.ao,
        kit.dist,
        kit.occlusion,
        kit.blur,
        kit.row,
        kit.line,
        kit.normals,
        kit.quad.geometry,
      ].forEach(x => x.dispose()),
    [kit],
  )
  useEffect(() => void kit.line.uniforms.uColor.value.set(color), [kit, color])
  useEffect(() => {
    kit.occlusion.uniforms.uRadius.value = radius
    kit.blur.uniforms.uStrength.value = strength
  }, [kit, radius, strength])

  // (the moment a new part landed)
  const landed = useRef(-1e9)
  useEffect(() => void (landed.current = performance.now()), [body])

  useEffect(() => {
    const dpr = gl.getPixelRatio()
    const w = Math.max(1, Math.round(size.width * dpr))
    const h = Math.max(1, Math.round(size.height * dpr))
    for (const t of [kit.normal, kit.ao, kit.dist]) t.setSize(w, h)
    kit.texel.set(1 / w, 1 / h)
  }, [kit, gl, size])

  const draw = (material, target) => {
    kit.quad.material = material
    gl.setRenderTarget(target)
    gl.render(kit.scene, kit.cam)
  }

  useFrame(({ gl, scene, camera }) => {
    // (the photo shows the part: the drawing's canvas stays empty under it)
    const s = useShop.getState()
    if (s.look === 'photo' && s.photoOK) {
      gl.setRenderTarget(null)
      gl.clear()
      return
    }
    // the room
    gl.setRenderTarget(null)
    gl.render(scene, camera)
    if (!body) return
    const clear = gl.getClearAlpha()
    const auto = gl.autoClear
    gl.setClearAlpha(0)
    // the part's normals, its mask and its depth
    const layers = camera.layers.mask
    camera.layers.set(MASK)
    scene.overrideMaterial = kit.normals
    gl.setRenderTarget(kit.normal)
    gl.clear()
    gl.render(scene, camera)
    scene.overrideMaterial = null
    camera.layers.mask = layers
    // the occlusion, then over the faces
    kit.occlusion.uniforms.uProj.value.copy(camera.projectionMatrix)
    kit.occlusion.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse)
    draw(kit.occlusion, kit.ao)
    gl.autoClear = false
    draw(kit.blur, null)
    gl.autoClear = auto
    // the outline: the distances along the rows, then the outline itself, over the room
    const dpr = gl.getPixelRatio()
    const kick = Math.exp(-((performance.now() - landed.current) / 1000) * 6)
    const w = width * (1 + 0.9 * kick) * dpr
    const R = Math.min(RMAX, Math.ceil(w + (glow > 0 ? 7 * dpr : 1)))
    kit.row.uniforms.uR.value = R
    draw(kit.row, kit.dist)
    kit.line.uniforms.uR.value = R
    kit.line.uniforms.uWidth.value = w
    // (the part's box on the screen, a little larger, and a step that crosses it in the steps a ray has)
    const { box, corner } = kit
    box.makeEmpty()
    scene.traverse(o => o.isMesh && o.layers.isEnabled(MASK) && box.expandByObject(o))
    let x0 = 1,
      y0 = 1,
      x1 = 0,
      y1 = 0
    for (let i = 0; i < 8; i++) {
      corner
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .project(camera)
      const u = (corner.x + 1) / 2,
        v = (corner.y + 1) / 2
      x0 = Math.min(x0, u)
      x1 = Math.max(x1, u)
      y0 = Math.min(y0, v)
      y1 = Math.max(y1, v)
    }
    const pad = 3 * kit.texel.x
    kit.line.uniforms.uBox.value.set(
      Math.max(0, x0 - pad),
      Math.max(0, y0 - pad),
      Math.min(1, x1 + pad),
      Math.min(1, y1 + pad),
    )
    const across = Math.hypot((x1 - x0) / kit.texel.x, (y1 - y0) / kit.texel.y)
    kit.line.uniforms.uStep.value = Math.max(1.5, across / STEPS)
    gl.autoClear = false
    draw(kit.line, null)
    gl.autoClear = auto
    gl.setClearAlpha(clear)
  }, 1)
  return null
}
