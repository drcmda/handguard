// The photo: the part path traced on the GPU (WebGPU, compute shaders of our own), into a canvas of
// its own over the drawing's. Each frame adds samples to what is gathered; the picture settles in a
// second or two and then rests (nothing is drawn once it has enough). While there are few samples
// (just after a turn, a rebuild, a change of finish) an edge-aware filter keeps the noise down.
import * as THREE from 'three'
import traceCode from './trace.wgsl?raw'
import resolveCode from './resolve.wgsl?raw'
import denoiseCode from './denoise.wgsl?raw'
import displayCode from './display.wgsl?raw'
import { prepare } from './mesh'

// The finishes, as materials: hard anodized black is a satin, dark, a little metallic surface;
// Cerakote flat dark earth a matte ceramic coat with a fine orange peel.
const FINISHES = {
  black: { base: [0.016, 0.017, 0.02], rough: 0.34, f0: 0.075, spec: 0.8, peel: 0.01, freq: 1.4 },
  fde: { base: [0.3, 0.205, 0.115], rough: 0.6, f0: 0.04, spec: 0.35, peel: 0.07, freq: 2.4 },
}
const ENOUGH = 768 // samples per pixel, then the picture rests
const FILTERED = 96 // below this many samples the picture is filtered

export async function createPhoto(canvas) {
  if (!navigator.gpu) return null
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) return null
  const device = await adapter.requestDevice()
  return new Photo(canvas, device)
}

class Photo {
  constructor(canvas, device) {
    this.canvas = canvas
    this.device = device
    this.lost = false
    device.lost.then(() => (this.lost = true))
    this.context = canvas.getContext('webgpu')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device, format: this.format, alphaMode: 'premultiplied' })
    const module = code => device.createShaderModule({ code })
    const compute = (code, entryPoint) =>
      device.createComputePipeline({ layout: 'auto', compute: { module: module(code), entryPoint } })
    this.tracer = compute(traceCode, 'main')
    this.resolver = compute(resolveCode, 'resolve')
    this.filter = compute(denoiseCode, 'atrous')
    const shown = module(displayCode)
    this.shower = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shown, entryPoint: 'vs' },
      fragment: { module: shown, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    })
    const U = GPUBufferUsage
    this.uniform = device.createBuffer({ size: 384, usage: U.UNIFORM | U.COPY_DST })
    this.rUniforms = Array.from({ length: 6 }, () => device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST }))
    this.dUniform = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST })
    this.data = new ArrayBuffer(384)
    this.f = new Float32Array(this.data)
    this.i = new Uint32Array(this.data)
    this.total = 0
    this.frames = 0
    this.spp = 1
    this.scale = 1
    this.movedAt = null
    this.timing = false
    this.finish = 'black'
    this.exposure = 1
    this.w = 0
    this.h = 0
    this.last = new Float32Array(32)
    this.vp = new THREE.Matrix4()
  }

  reset() {
    this.total = 0
  }

  setFinish(key) {
    if (key === this.finish) return
    this.finish = key
    this.reset()
  }

  // a new part: its triangles, hierarchy and shading to the GPU, and the studio set round it
  setScene(body, matrix) {
    const m = prepare(body, matrix)
    const d = this.device
    const U = GPUBufferUsage
    const upload = data => {
      const b = d.createBuffer({ size: Math.max(16, data.byteLength), usage: U.STORAGE | U.COPY_DST })
      d.queue.writeBuffer(b, 0, data)
      return b
    }
    this.scene?.buffers.forEach(b => b.destroy())
    const buffers = [upload(m.nodes), upload(m.tris), upload(m.shade)]
    this.scene = { ...m, buffers }
    this.floorY = m.box.min.y - 0.25
    // the studio: one large softbox overhead, a long strip either side along the part
    const c = m.box.getCenter(new THREE.Vector3())
    const R = Math.max(m.box.max.x - m.box.min.x, 260) / 2
    const light = (pos, u, v, le) => ({
      c: [c.x + pos[0] * R, c.y + pos[1] * R, c.z + pos[2] * R],
      u: u.map(x => x * R),
      v: v.map(x => x * R),
      le,
    })
    this.lights = [
      light([-0.15, 2.4, 0.35], [1.15, 0, 0], [0, 0, 0.75], 4.2),
      light([0, 0.85, 2.3], [1.5, 0, 0], [0, -0.24, 0.08], 7.5),
      light([0.25, 0.45, -2.4], [1.5, 0, 0], [0, 0.22, 0.06], 4.5),
    ]
    this.bindings = null
    this.reset()
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return
    if (!w || !h) return
    this.w = w
    this.h = h
    this.canvas.width = w
    this.canvas.height = h
    this.images?.forEach(b => b.destroy())
    const size = w * h * 16
    const U = GPUBufferUsage
    this.images = Array.from({ length: 5 }, () => this.device.createBuffer({ size, usage: U.STORAGE }))
    this.bindings = null
    this.reset()
  }

  bind() {
    const d = this.device
    const [accum, shadow, gbuf, a, b] = this.images
    const [nodes, tris, shade] = this.scene.buffers
    const group = (pipe, list) =>
      d.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: list.map((buffer, binding) => ({ binding, resource: { buffer } })),
      })
    this.bindings = {
      trace: group(this.tracer, [this.uniform, nodes, tris, shade, accum, shadow, gbuf]),
      resolve: group(this.resolver, [this.rUniforms[0], accum, shadow, a]),
      // (the filter's passes, back and forth between two pictures)
      filter: [1, 2, 3, 4].map(k => group(this.filter, [this.rUniforms[k], k % 2 ? a : b, gbuf, k % 2 ? b : a])),
      showA: group(this.shower, [this.dUniform, a]),
      showB: group(this.shower, [this.dUniform, b]),
    }
  }

  render(camera) {
    if (this.lost || !this.scene || !this.w) return
    const now = performance.now()
    // Has the camera moved? Not by the hair it still drifts as the turn eases out, or as the
    // framing settles: by what one would see. While it moves the picture is made at half size, a few
    // samples a frame; once it rests, at full size, gathering until it has enough.
    const e = camera.matrixWorld.elements
    const p = camera.projectionMatrix.elements
    let moved = false
    for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) if (Math.abs(e[k] - this.last[k]) > 2e-5) moved = true
    for (const k of [12, 13, 14]) if (Math.abs(e[k] - this.last[k]) > 0.02) moved = true
    for (let k = 0; k < 16; k++) if (Math.abs(p[k] - this.last[16 + k]) > 1e-5 * (1 + Math.abs(p[k]))) moved = true
    if (moved) {
      this.last.set(e, 0)
      this.last.set(p, 16)
      this.movedAt = now
      this.total = 0
    }
    const scale = now - (this.movedAt ?? -1e9) < 160 ? 0.5 : 1
    if (scale !== this.scale) {
      this.scale = scale
      this.total = 0
    }
    if (this.total >= ENOUGH) return
    if (!this.bindings) this.bind()
    const d = this.device
    const rw = Math.ceil(this.w * scale)
    const rh = Math.ceil(this.h * scale)
    // (a picture begun afresh at full size starts with a few samples: from one alone the floor's shadow,
    // a ratio of the light kept from it to the light there is, comes out far too dark, and the filter
    // spreads it over the whole floor for a frame)
    const spp = scale < 1 ? 2 : this.total === 0 ? Math.max(4, this.spp) : this.spp
    const mat = FINISHES[this.finish] ?? FINISHES.black

    // the frame's uniforms
    const { f, i } = this
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert()
    f.set(this.vp.elements, 0)
    f.set([camera.position.x, camera.position.y, camera.position.z, 0], 16)
    i[20] = rw
    i[21] = rh
    i[22] = this.frames
    i[23] = spp
    f[24] = this.floorY
    f[25] = 0.55 // the edges' rounding (mm)
    i[26] = this.total
    i[27] = 1
    f.set([...mat.base, mat.rough], 28)
    f.set([mat.f0, mat.spec, mat.peel, mat.freq], 32)
    f.set([0.62, 0.63, 0.66, 0], 36) // the studio above
    f.set([0.3, 0.3, 0.31, 0], 40) // ... and low round it
    f.set([0.55, 0.55, 0.53, 0], 44) // the floor
    this.lights.forEach((L, k) => {
      const o = 48 + k * 16
      const len = v => Math.hypot(...v)
      f.set([...L.c, 0, ...L.u, 0, ...L.v, 0, L.le, L.le, L.le * 0.98, 4 * len(L.u) * len(L.v)], o)
    })
    d.queue.writeBuffer(this.uniform, 0, this.data)
    this.total += spp
    const filtered = this.total < FILTERED
    const r = new ArrayBuffer(32)
    const rf = new Float32Array(r)
    const ri = new Uint32Array(r)
    ri[0] = rw
    ri[1] = rh
    rf[2] = this.total
    rf[3] = 0.82 // the shadow's strength
    ri[4] = 1
    rf[5] = 1
    d.queue.writeBuffer(this.rUniforms[0], 0, r)
    // (the filter lets go as the samples grow)
    const sigma = 0.03 + 0.8 * Math.max(0, 1 - this.total / FILTERED) ** 2
    for (let k = 1; k <= 4; k++) {
      ri[4] = 1 << (k - 1)
      rf[5] = sigma
      d.queue.writeBuffer(this.rUniforms[k], 0, r)
    }
    const du = new ArrayBuffer(32)
    new Uint32Array(du).set([rw, rh, this.w, this.h])
    new Float32Array(du)[4] = this.exposure
    d.queue.writeBuffer(this.dUniform, 0, du)

    const enc = d.createCommandEncoder()
    const gx = Math.ceil(rw / 8)
    const gy = Math.ceil(rh / 8)
    const pass = (pipe, group) => {
      const c = enc.beginComputePass()
      c.setPipeline(pipe)
      c.setBindGroup(0, group)
      c.dispatchWorkgroups(gx, gy)
      c.end()
    }
    pass(this.tracer, this.bindings.trace)
    pass(this.resolver, this.bindings.resolve)
    if (filtered) for (const g of this.bindings.filter) pass(this.filter, g)
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
    })
    rp.setPipeline(this.shower)
    rp.setBindGroup(0, this.bindings.showA)
    rp.draw(3)
    rp.end()
    d.queue.submit([enc.finish()])
    this.frames++

    // (as many samples a frame as the GPU does in a part of a frame's time, so that the page, and
    // the hand turning the part, never wait for it)
    if (!this.timing && scale === 1) {
      this.timing = true
      const t0 = performance.now()
      d.queue.onSubmittedWorkDone().then(() => {
        const dt = performance.now() - t0
        if (dt < 6 && this.spp < 8) this.spp *= 2
        else if (dt > 12 && this.spp > 1) this.spp /= 2
        this.timing = false
      })
    }
  }

  // (for checking: the picture as it stands, as a PNG)
  snapshot() {
    if (!this.bindings) return null
    const d = this.device
    const enc = d.createCommandEncoder()
    const rw = Math.ceil(this.w * this.scale)
    const rh = Math.ceil(this.h * this.scale)
    const pass = (pipe, group) => {
      const c = enc.beginComputePass()
      c.setPipeline(pipe)
      c.setBindGroup(0, group)
      c.dispatchWorkgroups(Math.ceil(rw / 8), Math.ceil(rh / 8))
      c.end()
    }
    pass(this.resolver, this.bindings.resolve)
    if (this.total < FILTERED) for (const g of this.bindings.filter) pass(this.filter, g)
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
    })
    rp.setPipeline(this.shower)
    rp.setBindGroup(0, this.bindings.showA)
    rp.draw(3)
    rp.end()
    d.queue.submit([enc.finish()])
    return this.canvas.toDataURL('image/png')
  }
}
