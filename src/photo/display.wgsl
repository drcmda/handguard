// The picture onto the page: exposed, tone mapped as a product photographer would want it (Khronos
// PBR Neutral: the finish's own colour kept, highlights rolled off), encoded for the screen, and laid
// over the page with its coverage (the part solid, its shadow a veil, the rest the page itself).

struct D { res: vec2u, out: vec2u, exposure: f32, _a: f32, _b: f32, _c: f32 };

@group(0) @binding(0) var<uniform> d: D;
@group(0) @binding(1) var<storage, read> img: array<vec4f>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn neutral(color: vec3f) -> vec3f {
  let start = 0.8 - 0.04;
  let desat = 0.15;
  let x = min(color.r, min(color.g, color.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  var c = color - offset;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < start) { return c; }
  let k = 1.0 - start;
  let np = 1.0 - k * k / (peak + k - start);
  c *= np / peak;
  let g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(c, vec3f(np), g);
}

fn srgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn at(x: i32, y: i32) -> vec4f {
  let q = vec2u(u32(clamp(x, 0, i32(d.res.x) - 1)), u32(clamp(y, 0, i32(d.res.y) - 1)));
  return img[q.y * d.res.x + q.x];
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  // (the picture may be smaller than the canvas, while the part turns: drawn up, smoothly)
  let s = (pos.xy) * vec2f(d.res) / vec2f(d.out) - 0.5;
  let i = vec2i(floor(s));
  let t = s - floor(s);
  let c = mix(mix(at(i.x, i.y), at(i.x + 1, i.y), t.x), mix(at(i.x, i.y + 1), at(i.x + 1, i.y + 1), t.x), t.y);
  if (c.a <= 0.0005) { return vec4f(0.0); }
  // (the part's colour where it covers the pixel; the shadow carries no colour of its own)
  let cover = clamp(c.a, 0.0, 1.0);
  let col = srgb(clamp(neutral(max(c.rgb, vec3f(0.0)) * d.exposure), vec3f(0.0), vec3f(1.0)));
  return vec4f(col * cover, cover);
}
