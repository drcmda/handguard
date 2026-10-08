// The frame, drawn in passes: the room as it is; the part's faces again (on the MASK layer), as their
// normals and depth; ambient occlusion from those (light that does not get into the slots, the
// corners, under the rails), blurred and laid over the faces.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useShop } from '../store'

export const MASK = 1
const SAMPLES = 16

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

const pass = (fragmentShader, uniforms, o = {}) =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: quadVert,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    ...o,
  })

// `radius`: how far round a point the occlusion looks (mm); `strength`: how dark it gets; `body`: the part shown
export function Frame({ body, radius = 12, strength = 1.8 }) {
  const size = useThree(s => s.size)
  const gl = useThree(s => s.gl)
  const kit = useMemo(() => {
    const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }
    // the part's normals (rgb) and its mask (a), with its depth
    const normal = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthTexture: new THREE.DepthTexture(1, 1) })
    const ao = new THREE.WebGLRenderTarget(1, 1, nearest)
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
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), occlusion)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const normals = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { normal, ao, texel, occlusion, blur, quad, scene, normals, cam }
  }, [])
  useEffect(
    () => () =>
      [kit.normal, kit.ao, kit.occlusion, kit.blur, kit.normals, kit.quad.geometry].forEach(x => x.dispose()),
    [kit],
  )
  useEffect(() => {
    kit.occlusion.uniforms.uRadius.value = radius
    kit.blur.uniforms.uStrength.value = strength
  }, [kit, radius, strength])

  useEffect(() => {
    const dpr = gl.getPixelRatio()
    const w = Math.max(1, Math.round(size.width * dpr))
    const h = Math.max(1, Math.round(size.height * dpr))
    for (const t of [kit.normal, kit.ao]) t.setSize(w, h)
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
    gl.setClearAlpha(clear)
  }, 1)
  return null
}
