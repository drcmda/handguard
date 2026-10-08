// While there are few samples, an edge-aware à-trous filter smooths the noise: a 5×5 kernel at
// growing steps, held back across the part's edges by its normals and depth, and by colour as the
// samples grow.

struct R { res: vec2u, n: f32, strength: f32, step: u32, sigma: f32, _a: f32, _b: f32 };

@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read> gbuf: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;

fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

@compute @workgroup_size(8, 8)
fn atrous(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= r.res.x || gid.y >= r.res.y) { return; }
  let i = gid.y * r.res.x + gid.x;
  let cp = src[i];
  let gp = gbuf[i];
  let kern = array<f32, 5>(0.0625, 0.25, 0.375, 0.25, 0.0625);
  var sum = vec4f(0.0);
  var wsum = 0.0;
  let st = i32(r.step);
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      let q = vec2i(i32(gid.x) + dx * st, i32(gid.y) + dy * st);
      if (q.x < 0 || q.y < 0 || q.x >= i32(r.res.x) || q.y >= i32(r.res.y)) { continue; }
      let j = u32(q.y) * r.res.x + u32(q.x);
      let cq = src[j];
      let gq = gbuf[j];
      var w = kern[dx + 2] * kern[dy + 2];
      // (only within one thing: the part, the floor, or nothing)
      let kp = sign(gp.w);
      if (kp != sign(gq.w)) { continue; }
      // (the floor: near in depth, its shadow smoothed freely; the part: alike in normal, near in
      // depth, and, as the samples grow, alike in colour and in how much of the pixel it covers)
      w *= exp(-abs(abs(gp.w) - abs(gq.w)) / (0.004 * abs(gp.w) * f32(r.step) + 0.05));
      if (kp > 0.0) {
        w *= pow(max(0.0, dot(gp.xyz, gq.xyz)), 64.0);
        w *= exp(-abs(lum(cp.rgb) - lum(cq.rgb)) / r.sigma - abs(cp.a - cq.a) * 2.0 / r.sigma);
      }
      sum += cq * w;
      wsum += w;
    }
  }
  dst[i] = select(cp, sum / wsum, wsum > 1e-6);
}
