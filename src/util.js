// Small shared helpers: math, seeded randomness, noise, safe storage.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent approach toward a target.
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const wrapPi = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (a, b, k, dt) => a + wrapPi(b - a) * (1 - Math.exp(-k * dt));
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 2D value noise.
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += noise2(x * f + i * 17.3, z * f - i * 9.1) * amp;
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return s / norm;
}

// Distance from a point to a polyline, with the parameter along it (0..1 by length).
export function nearestOnPath(path, x, z) {
  let best = Infinity, bestT = 0, acc = 0, total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0], az = path[i][1], bx = path[i + 1][0], bz = path[i + 1][1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (len * len), 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; bestT = (acc + len * t) / total; }
    acc += len;
  }
  return { d: best, t: bestT };
}

// localStorage that never throws (sandboxed frames and private windows can throw on access).
export const store = (() => {
  let ok = false, ls = null;
  try { ls = window.localStorage; ls.setItem('__cis', '1'); ok = ls.getItem('__cis') === '1'; ls.removeItem('__cis'); } catch (e) { ok = false; }
  return {
    ok,
    get(key) { if (!ok) return null; try { const v = ls.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(key, val) { if (!ok) return; try { ls.setItem(key, JSON.stringify(val)); } catch (e) { /* full or blocked */ } },
    del(key) { if (!ok) return; try { ls.removeItem(key); } catch (e) { /* ignore */ } },
  };
})();

export const $ = (id) => document.getElementById(id);
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
