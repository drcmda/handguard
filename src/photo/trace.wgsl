// The part, path traced: rays from the camera into the room; on the part, light gathered the way it
// really arrives: from three softboxes (sampled directly, weighed against the material's own choice
// of direction), from the studio round it, and from the floor's bounce, over several bounces. The
// material is a microfacet one (GGX, its visible normals sampled) over a diffuse base; the part's
// sharp edges are rounded a little where the rays meet them; Cerakote has a fine orange peel.
// Rays that pass the part and meet the floor measure how much of the light the part keeps from it:
// the shadow, the page shows through everywhere else.

struct Node { lo: vec3f, a: u32, hi: vec3f, b: u32 };
struct Tri { v0: vec4f, e1: vec4f, e2: vec4f };
struct Shade { n0: vec4f, n1: vec4f, n2: vec4f, b0: vec4f, b1: vec4f, b2: vec4f, h: vec4f };
struct Light { c: vec4f, u: vec4f, v: vec4f, le: vec4f };
struct Uniforms {
  invVP: mat4x4f,
  cam: vec4f,
  res: vec2u, frame: u32, spp: u32,
  floorY: f32, bevel: f32, total: u32, gbuf: u32,
  base: vec4f,     // rgb albedo (linear), a roughness
  spec: vec4f,     // x F0, y share of rays the specular lobe takes, z orange peel, w its frequency (1/mm)
  envTop: vec4f,
  envLow: vec4f,
  floorCol: vec4f, // rgb the floor's albedo
  lights: array<Light, 3>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<Node>;
@group(0) @binding(2) var<storage, read> tris: array<Tri>;
@group(0) @binding(3) var<storage, read> shades: array<Shade>;
@group(0) @binding(4) var<storage, read_write> accum: array<vec4f>;  // radiance on the part · its coverage
@group(0) @binding(5) var<storage, read_write> shadow: array<vec4f>; // light that reaches the floor · light that would · floor coverage
@group(0) @binding(6) var<storage, read_write> gbuf: array<vec4f>;   // first hit: normal · depth (+ the part, − the floor, 0 nothing)

const PI = 3.14159265359;
const NONE = 0xffffffffu;
const FAR = 1e9;
const EPS = 0.01; // mm

// ---- random numbers
var<private> seed: u32;
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd() -> f32 { seed = pcg(seed); return f32(seed >> 8u) / 16777216.0; }

// ---- the part: its hierarchy and its triangles
struct Hit { t: f32, u: f32, v: f32, i: u32 };

fn slab(o: vec3f, inv: vec3f, lo: vec3f, hi: vec3f, tmax: f32) -> f32 {
  let t0 = (lo - o) * inv;
  let t1 = (hi - o) * inv;
  let tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  return select(FAR * 2.0, tn, tf >= max(tn, 0.0) && tn < tmax);
}

fn triangle(o: vec3f, d: vec3f, t: Tri, tmax: f32) -> vec3f {
  let p = cross(d, t.e2.xyz);
  let det = dot(t.e1.xyz, p);
  if (abs(det) < 1e-14) { return vec3f(-1.0); }
  let id = 1.0 / det;
  let s = o - t.v0.xyz;
  let a = dot(s, p) * id;
  if (a < 0.0 || a > 1.0) { return vec3f(-1.0); }
  let q = cross(s, t.e1.xyz);
  let b = dot(d, q) * id;
  if (b < 0.0 || a + b > 1.0) { return vec3f(-1.0); }
  let tt = dot(t.e2.xyz, q) * id;
  if (tt <= 1e-5 || tt >= tmax) { return vec3f(-1.0); }
  return vec3f(tt, a, b);
}

fn trace(o: vec3f, d: vec3f, tmax: f32, any: bool) -> Hit {
  var h = Hit(tmax, 0.0, 0.0, NONE);
  let inv = 1.0 / select(d, vec3f(1e-20), abs(d) < vec3f(1e-20));
  if (slab(o, inv, nodes[0].lo, nodes[0].hi, h.t) > FAR) { return h; }
  var stack: array<u32, 48>;
  var sp = 0u;
  var node = 0u;
  loop {
    let nd = nodes[node];
    if (nd.b > 0u) {
      for (var k = 0u; k < nd.b; k++) {
        let r = triangle(o, d, tris[nd.a + k], h.t);
        if (r.x > 0.0) {
          h = Hit(r.x, r.y, r.z, nd.a + k);
          if (any) { return h; }
        }
      }
      if (sp == 0u) { break; }
      sp -= 1u;
      node = stack[sp];
      continue;
    }
    let l = nd.a;
    let r = nd.a + 1u;
    let tl = slab(o, inv, nodes[l].lo, nodes[l].hi, h.t);
    let tr = slab(o, inv, nodes[r].lo, nodes[r].hi, h.t);
    if (tl < FAR && tr < FAR) {
      if (tl <= tr) { node = l; stack[sp] = r; } else { node = r; stack[sp] = l; }
      sp = min(sp + 1u, 47u);
    } else if (tl < FAR) {
      node = l;
    } else if (tr < FAR) {
      node = r;
    } else {
      if (sp == 0u) { break; }
      sp -= 1u;
      node = stack[sp];
    }
  }
  return h;
}

// ---- the floor, the softboxes, the studio
fn floorAt(o: vec3f, d: vec3f) -> f32 {
  if (d.y >= -1e-6 || o.y <= u.floorY) { return FAR; }
  return (u.floorY - o.y) / d.y;
}
fn lightNormal(L: Light) -> vec3f { return normalize(cross(L.u.xyz, L.v.xyz)); }
// (the nearest softbox along a ray, and how far: its emitting side faces the part)
fn lightAt(o: vec3f, d: vec3f) -> vec2f {
  var best = vec2f(FAR, -1.0);
  for (var i = 0u; i < 3u; i++) {
    let L = u.lights[i];
    let n = lightNormal(L);
    let dn = dot(d, n);
    if (dn >= 0.0) { continue; }
    let t = dot(L.c.xyz - o, n) / dn;
    if (t <= 0.0 || t >= best.x) { continue; }
    let p = o + d * t - L.c.xyz;
    let a = dot(p, L.u.xyz) / dot(L.u.xyz, L.u.xyz);
    let b = dot(p, L.v.xyz) / dot(L.v.xyz, L.v.xyz);
    if (abs(a) <= 1.0 && abs(b) <= 1.0) { best = vec2f(t, f32(i)); }
  }
  return best;
}
fn env(d: vec3f) -> vec3f { return mix(u.envLow.rgb, u.envTop.rgb, smoothstep(-0.25, 0.9, d.y)); }

// ---- the surface where a ray meets the part
fn bevel(n: vec3f, b: vec4f, dist: f32) -> vec3f {
  if (b.w < 0.5 || dist >= u.bevel) { return n; }
  return normalize(mix(n, b.xyz, 0.5 * (1.0 - dist / u.bevel)));
}
fn hash(p: vec3f) -> f32 {
  let q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  let r = q + dot(q, q.yxz + 33.33);
  return fract((r.x + r.y) * r.z);
}
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3f(1, 0, 0)), s.x), mix(hash(i + vec3f(0, 1, 0)), hash(i + vec3f(1, 1, 0)), s.x), s.y),
    mix(mix(hash(i + vec3f(0, 0, 1)), hash(i + vec3f(1, 0, 1)), s.x), mix(hash(i + vec3f(0, 1, 1)), hash(i + vec3f(1, 1, 1)), s.x), s.y),
    s.z);
}
fn peel(n: vec3f, p: vec3f) -> vec3f {
  if (u.spec.z <= 0.0) { return n; }
  let q = p * u.spec.w;
  let e = 0.35;
  let g = vec3f(noise(q + vec3f(e, 0, 0)) - noise(q - vec3f(e, 0, 0)),
                noise(q + vec3f(0, e, 0)) - noise(q - vec3f(0, e, 0)),
                noise(q + vec3f(0, 0, e)) - noise(q - vec3f(0, 0, e))) / (2.0 * e);
  return normalize(n - u.spec.z * (g - dot(g, n) * n));
}

struct Surface { p: vec3f, ng: vec3f, ns: vec3f };
fn surface(h: Hit, d: vec3f) -> Surface {
  let t = tris[h.i];
  let s = shades[h.i];
  let w = 1.0 - h.u - h.v;
  let p = t.v0.xyz + t.e1.xyz * h.u + t.e2.xyz * h.v;
  var ng = normalize(cross(t.e1.xyz, t.e2.xyz));
  var ns = normalize(s.n0.xyz * w + s.n1.xyz * h.u + s.n2.xyz * h.v);
  ns = bevel(ns, s.b0, w * s.h.x);
  ns = bevel(ns, s.b1, h.u * s.h.y);
  ns = bevel(ns, s.b2, h.v * s.h.z);
  ns = peel(ns, p);
  if (dot(ng, d) > 0.0) { ng = -ng; }
  if (dot(ns, ng) < 0.0) { ns = normalize(ns - 2.0 * dot(ns, ng) * ng); }
  return Surface(p, ng, ns);
}

// ---- the material
fn basis(n: vec3f) -> mat3x3f {
  let s = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (s + n.z);
  let b = n.x * n.y * a;
  return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}
fn ggxD(nh: f32, a2: f32) -> f32 { let k = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * k * k); }
fn ggxG1(nx: f32, a2: f32) -> f32 { return 2.0 * nx / (nx + sqrt(a2 + (1.0 - a2) * nx * nx)); }
fn fresnel(f0: f32, vh: f32) -> f32 { return f0 + (1.0 - f0) * pow(1.0 - vh, 5.0); }

fn brdf(n: vec3f, wo: vec3f, wi: vec3f) -> vec3f {
  let nl = dot(n, wi);
  let nv = dot(n, wo);
  if (nl <= 0.0 || nv <= 0.0) { return vec3f(0.0); }
  let h = normalize(wi + wo);
  let a = max(u.base.a * u.base.a, 0.002);
  let a2 = a * a;
  let F = fresnel(u.spec.x, max(dot(wo, h), 0.0));
  let spec = ggxD(max(dot(n, h), 0.0), a2) * ggxG1(nl, a2) * ggxG1(nv, a2) * F / (4.0 * nl * nv);
  return u.base.rgb / PI * (1.0 - F) + vec3f(spec);
}
fn pdf(n: vec3f, wo: vec3f, wi: vec3f) -> f32 {
  let nl = dot(n, wi);
  let nv = dot(n, wo);
  if (nl <= 0.0 || nv <= 0.0) { return 0.0; }
  let h = normalize(wi + wo);
  let a = max(u.base.a * u.base.a, 0.002);
  let a2 = a * a;
  let ps = u.spec.y;
  return ps * ggxG1(nv, a2) * ggxD(max(dot(n, h), 0.0), a2) / (4.0 * nv) + (1.0 - ps) * nl / PI;
}
fn sample(n: vec3f, wo: vec3f) -> vec3f {
  let B = basis(n);
  let r1 = rnd();
  let r2 = rnd();
  if (rnd() < u.spec.y) {
    // the visible normals of the GGX lobe, by spherical caps
    let a = max(u.base.a * u.base.a, 0.002);
    let v = vec3f(dot(wo, B[0]), dot(wo, B[1]), dot(wo, B[2]));
    let vs = normalize(vec3f(v.xy * a, v.z));
    let phi = 2.0 * PI * r1;
    let z = (1.0 - r2) * (1.0 + vs.z) - vs.z;
    let st = sqrt(clamp(1.0 - z * z, 0.0, 1.0));
    let hh = vec3f(st * cos(phi), st * sin(phi), z) + vs;
    let m = normalize(vec3f(hh.xy * a, max(hh.z, 0.0)));
    let mw = B * m;
    return reflect(-wo, mw);
  }
  let r = sqrt(r1);
  let phi = 2.0 * PI * r2;
  return B * vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - r1)));
}

// ---- light, sampled directly, weighed against the material's own sampling
fn lightPdf(L: Light, p: vec3f, wi: vec3f, t: f32) -> f32 {
  let c = dot(lightNormal(L), -wi);
  if (c <= 0.0) { return 0.0; }
  return t * t / (c * L.le.w) / 3.0;
}
fn direct(p: vec3f, ng: vec3f, ns: vec3f, wo: vec3f, diffuse: vec3f, isFloor: bool) -> vec3f {
  let li = min(u32(rnd() * 3.0), 2u);
  let L = u.lights[li];
  let q = L.c.xyz + L.u.xyz * (rnd() * 2.0 - 1.0) + L.v.xyz * (rnd() * 2.0 - 1.0);
  var wi = q - p;
  let t = length(wi);
  wi /= t;
  if (dot(wi, ng) <= 0.0) { return vec3f(0.0); }
  let lp = lightPdf(L, p, wi, t);
  if (lp <= 0.0) { return vec3f(0.0); }
  var f: vec3f;
  var bp: f32;
  if (isFloor) {
    f = diffuse / PI;
    bp = max(dot(ns, wi), 0.0) / PI;
  } else {
    f = brdf(ns, wo, wi);
    bp = pdf(ns, wo, wi);
  }
  let c = f * max(dot(ns, wi), 0.0);
  if (max(c.x, max(c.y, c.z)) <= 0.0) { return vec3f(0.0); }
  if (trace(p + ng * EPS, wi, t - 2.0 * EPS, true).i != NONE) { return vec3f(0.0); }
  let w = lp * lp / (lp * lp + bp * bp);
  return c * L.le.rgb * w / lp;
}

// ---- a path from a first hit on the part
fn radiance(o0: vec3f, d0: vec3f, h0: Hit) -> vec3f {
  var L = vec3f(0.0);
  var T = vec3f(1.0);
  var o = o0;
  var d = d0;
  var h = h0;
  var lastPdf = 0.0;
  for (var bounce = 0u; bounce < 6u; bounce++) {
    let tf = floorAt(o, d);
    let lt = lightAt(o, d);
    let tp = select(FAR, h.t, h.i != NONE);
    if (bounce > 0u && lt.x < tf && lt.x < tp) {
      let Lg = u.lights[u32(lt.y)];
      let lp = lightPdf(Lg, o, d, lt.x);
      L += T * Lg.le.rgb * (lastPdf * lastPdf / (lastPdf * lastPdf + lp * lp));
      break;
    }
    if (tp < tf) {
      let s = surface(h, d);
      let wo = -d;
      L += T * direct(s.p, s.ng, s.ns, wo, vec3f(0.0), false);
      let wi = sample(s.ns, wo);
      let p = pdf(s.ns, wo, wi);
      if (p <= 1e-6 || dot(wi, s.ng) <= 0.0) { break; }
      T *= brdf(s.ns, wo, wi) * dot(s.ns, wi) / p;
      lastPdf = p;
      o = s.p + s.ng * EPS;
      d = wi;
    } else if (tf < FAR) {
      // the floor, seen in the part or lighting it from below: a matte grey
      let p = o + d * tf;
      let n = vec3f(0.0, 1.0, 0.0);
      L += T * direct(p, n, n, -d, u.floorCol.rgb, true);
      let B = basis(n);
      let r1 = rnd();
      let r2 = rnd();
      let r = sqrt(r1);
      d = B * vec3f(r * cos(2.0 * PI * r2), r * sin(2.0 * PI * r2), sqrt(max(0.0, 1.0 - r1)));
      T *= u.floorCol.rgb;
      lastPdf = d.y / PI;
      o = p + n * EPS;
    } else {
      L += T * env(d);
      break;
    }
    if (bounce >= 2u) {
      let q = clamp(max(T.x, max(T.y, T.z)), 0.05, 0.95);
      if (rnd() > q) { break; }
      T /= q;
    }
    h = trace(o, d, FAR, false);
  }
  // (no firefly wins a pixel on its own)
  let m = max(L.x, max(L.y, L.z));
  return select(L, L * (24.0 / m), m > 24.0);
}

// ---- what the part keeps from the floor at a point: light from the softboxes and the studio, with
// and without the part in the way
fn floorShadow(p: vec3f) -> vec2f {
  let n = vec3f(0.0, 1.0, 0.0);
  var wi: vec3f;
  var t: f32;
  var e: f32;
  if (rnd() < 0.5) {
    let B = basis(n);
    let r1 = rnd();
    let r2 = rnd();
    let r = sqrt(r1);
    wi = B * vec3f(r * cos(2.0 * PI * r2), r * sin(2.0 * PI * r2), sqrt(max(0.0, 1.0 - r1)));
    t = FAR;
    let c = env(wi);
    e = (c.x + c.y + c.z) / 3.0 * PI * 2.0;
  } else {
    let li = min(u32(rnd() * 3.0), 2u);
    let Lg = u.lights[li];
    let q = Lg.c.xyz + Lg.u.xyz * (rnd() * 2.0 - 1.0) + Lg.v.xyz * (rnd() * 2.0 - 1.0);
    wi = q - p;
    t = length(wi);
    wi /= t;
    let cl = dot(lightNormal(Lg), -wi);
    if (cl <= 0.0 || wi.y <= 0.0) { return vec2f(0.0); }
    let le = (Lg.le.r + Lg.le.g + Lg.le.b) / 3.0;
    e = le * wi.y * cl / (t * t) * Lg.le.w * 3.0 * 2.0;
  }
  let lit = select(e, 0.0, trace(p + n * EPS, wi, t, true).i != NONE);
  return vec2f(lit, e);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.res.x || gid.y >= u.res.y) { return; }
  let pix = gid.y * u.res.x + gid.x;
  var acc = vec4f(0.0);
  var sh = vec4f(0.0);
  for (var s = 0u; s < u.spp; s++) {
    seed = pcg(pix * 1973u + pcg(u.frame * 9781u + s * 6271u + 1u));
    let ndc = vec2f((f32(gid.x) + rnd()) / f32(u.res.x) * 2.0 - 1.0, 1.0 - (f32(gid.y) + rnd()) / f32(u.res.y) * 2.0);
    let a = u.invVP * vec4f(ndc, -1.0, 1.0);
    let b = u.invVP * vec4f(ndc, 1.0, 1.0);
    let o = a.xyz / a.w;
    let d = normalize(b.xyz / b.w - o);
    let h = trace(o, d, FAR, false);
    let tf = floorAt(o, d);
    var g = vec4f(0.0);
    if (h.i != NONE && h.t < tf) {
      acc += vec4f(radiance(o, d, h), 1.0);
      g = vec4f(surface(h, d).ns, h.t);
    } else if (tf < FAR) {
      let f = floorShadow(o + d * tf);
      sh += vec4f(f.x, f.y, 1.0, 0.0);
      g = vec4f(0.0, 1.0, 0.0, -tf);
    }
    if (s == 0u && u.gbuf == 1u) { gbuf[pix] = g; }
  }
  if (u.total == 0u) {
    accum[pix] = acc;
    shadow[pix] = sh;
  } else {
    accum[pix] += acc;
    shadow[pix] += sh;
  }
}
