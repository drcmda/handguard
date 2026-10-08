// What the tracer has gathered so far, as a picture: the part's radiance and coverage, and over the
// floor the shadow (how much of the light the part keeps from it).

struct R { res: vec2u, n: f32, strength: f32, step: u32, sigma: f32, _a: f32, _b: f32 };

@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var<storage, read> accum: array<vec4f>;
@group(0) @binding(2) var<storage, read> shadow: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> img: array<vec4f>;

@compute @workgroup_size(8, 8)
fn resolve(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= r.res.x || gid.y >= r.res.y) { return; }
  let i = gid.y * r.res.x + gid.x;
  let a = accum[i] / r.n;
  let s = shadow[i];
  var sa = 0.0;
  if (s.y > 0.0) { sa = (s.z / r.n) * clamp(1.0 - s.x / s.y, 0.0, 1.0) * r.strength; }
  // (the part's own colour, not yet weighed by how much of the pixel it covers)
  let rgb = select(vec3f(0.0), a.rgb / max(a.a, 1e-4), a.a > 0.0);
  img[i] = vec4f(rgb, min(1.0, a.a + sa));
}
