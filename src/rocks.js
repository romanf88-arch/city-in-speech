// Rocks made in code, several shapes for each size, in place of the kit's single model per size.
// How a shape is made (the usual way, as in the three.js forum's procedural rock threads):
//   1. a round body, a little lumpy, stretched to the size wanted
//   2. cut by several flat planes, so it has the broken flat faces of split stone rather than the look of a blob
//   3. fine bumps and faint horizontal layers on top, as in the limestone of Attica
//   4. the bottom flattened and pushed into the ground, so a rock on a slope never shows a gap underneath
// Colors are baked in: pale grey limestone, darker in hollows and where earth has stained the foot. The kit's
// surface pass (surfaces.js, the 'rock' type) then adds the stone texture, lichen, and weathering streaks.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

// Smooth value noise in 3D, with a seed.
export function noise3(seed) {
  const R = mulberry32(seed), P = new Uint8Array(512), V = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; V[i] = R(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x, y, z) => V[P[P[P[x & 255] + (y & 255)] + (z & 255)]], s = (t) => t * t * (3 - 2 * t), l = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = s(x - xi), v = s(y - yi), w = s(z - zi);
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
}

// size: [width, height, depth] of the part above ground. detail: how finely the round body is divided.
// tint (optional) multiplies the baked colors, for darker stone such as the cave's.
// flat = false keeps the underside rough (for a stone that is seen from below, like a lintel).
export function makeRock(seed, size, detail = 4, tint = null, flat = true) {
  const R = mulberry32(seed * 7919 + 13), N = noise3(seed * 31 + 7);
  const fbm = (x, y, z) => N(x, y, z) * 0.55 + N(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.3 + N(x * 4.3, y * 4.3 + 9, z * 4.3) * 0.15;
  const [sx, sy0, sz] = size, sy = sy0 * 1.35;   // made taller, then sunk by the extra
  const g = new THREE.IcosahedronGeometry(1, detail), P = g.attributes.position.array, n = P.length / 3;
  // The cutting planes: mostly on the sides and top (a rock is rarely cut underneath), each at 55-85% of the reach.
  const planes = [], np = 7 + Math.floor(R() * 6);
  for (let k = 0; k < np; k++) {
    const a = R() * Math.PI * 2, up = -0.15 + R() * 1.0, hz = Math.sqrt(Math.max(0, 1 - up * up));
    const nx = Math.cos(a) * hz, ny = up, nz = Math.sin(a) * hz;
    const reach = Math.sqrt((nx * sx / 2) ** 2 + (ny * sy / 2) ** 2 + (nz * sz / 2) ** 2);
    planes.push([nx, ny, nz, reach * (0.5 + R() * 0.28), 0.85 + R() * 0.15]);
  }
  const tilt = (R() - 0.5) * 0.5, strata = 9 + R() * 8, base = -sy * 0.28;
  const raw = new Float32Array(n), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const vx = P[i * 3], vy = P[i * 3 + 1], vz = P[i * 3 + 2];
    const lump = 1 + 0.34 * (fbm(vx * 1.3 + 3, vy * 1.3, vz * 1.3) - 0.5);
    let x = vx * sx / 2 * lump, y = vy * sy / 2 * lump, z = vz * sz / 2 * lump;
    for (const [nx, ny, nz, d, k] of planes) { const s = x * nx + y * ny + z * nz - d; if (s > 0) { x -= nx * s * k; y -= ny * s * k; z -= nz * s * k; } }
    // fine bumps along the outward direction, and shallow layers (stronger on the sides than the top)
    const bump = (fbm(vx * 5 + 11, vy * 5, vz * 5) - 0.5) * 0.07 * Math.min(sx, sy, sz);
    const side = 1 - Math.abs(vy), layer = Math.sin((y + x * tilt) * strata + fbm(vx * 2, vy * 2, vz * 2) * 4) * 0.012 * Math.min(sx, sz) * side;
    x += vx * (bump + layer); y += vy * bump; z += vz * (bump + layer);
    if (flat && y < base) y = base + (y - base) * 0.25;   // a flat-ish bottom
    raw[i] = bump / (0.07 * Math.min(sx, sy, sz));
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  // Bring it to the size asked for (the cuts take a good part off), then sink it: the lowest point goes 30% of the
  // visible height below the ground, and the top stands at the height asked for.
  let minY = 1e9, maxY = -1e9, mx = 0, mz = 0;
  for (let i = 0; i < n; i++) { minY = Math.min(minY, out[i * 3 + 1]); maxY = Math.max(maxY, out[i * 3 + 1]); mx = Math.max(mx, Math.abs(out[i * 3])); mz = Math.max(mz, Math.abs(out[i * 3 + 2])); }
  const ky = sy0 * 1.3 / (maxY - minY), kx = sx / 2 / mx, kz = sz / 2 / mz;
  for (let i = 0; i < n; i++) { out[i * 3] *= kx; out[i * 3 + 2] *= kz; out[i * 3 + 1] = (out[i * 3 + 1] - minY) * ky - sy0 * 0.3; }
  // Colors (linear): pale warm grey, a little different for each rock; darker in hollows and at the stained foot.
  const t = 0.92 + R() * 0.16, warm = R() * 0.06, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = out[i * 3 + 1], hollow = Math.min(1, Math.max(0, -raw[i] * 1.6)), foot = Math.min(1, Math.max(0, 1 - (y + 0.04) / 0.22));
    const vary = 0.9 + 0.2 * N(out[i * 3] * 1.7 + 40, y * 1.7, out[i * 3 + 2] * 1.7);
    const k = t * vary * (1 - 0.35 * hollow) * (1 - 0.3 * foot);
    col[i * 3] = (0.47 + warm) * k; col[i * 3 + 1] = (0.44 + warm * 0.6) * k; col[i * 3 + 2] = 0.39 * k * (1 - 0.15 * foot);
    if (tint) { col[i * 3] *= tint[0]; col[i * 3 + 1] *= tint[1]; col[i * 3 + 2] *= tint[2]; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.dispose();
  return geo;
}

// The mouth of the cave: a rough rock face with an opening, built from a few big overlapping rocks. The opening is
// 5 m wide (the kit's walls stand at x = -4 and 4, 1.5 m either side), about 3.8 m high, with a dark recess behind it.
export function makeCaveMouth(mergeGeometries) {
  const parts = [];
  const put = (seed, size, x, y, z, rot, detail, flat = true) => { const g = makeRock(seed, size, detail, null, flat); g.rotateY(rot); g.translate(x, y, z); parts.push(g); };
  put(511, [4.6, 4.9, 5.4], -4.8, 0, 0.0, 0.1, 6); put(512, [3.8, 2.4, 4.6], -5.0, 4.2, -0.4, -0.3, 5);
  put(513, [4.6, 4.6, 5.4], 4.8, 0, 0.1, -0.12, 6); put(514, [3.6, 2.2, 4.4], 5.1, 4.0, -0.3, 0.35, 5);
  put(515, [10.2, 2.8, 5.4], 0.0, 4.3, -0.2, 0.04, 6, false); put(516, [6.2, 1.8, 4.4], -0.6, 6.5, -0.8, 0.5, 5);
  put(517, [1.5, 0.9, 1.3], 3.4, 0, 3.1, 1.1, 4); put(518, [1.1, 0.7, 1.0], -3.6, 0, 2.9, 0.4, 4);
  // the dark recess: a deep box behind the opening, colored almost black, its sides hidden behind the rock
  const box = new THREE.BoxGeometry(6.4, 5.2, 3.0).toNonIndexed();
  box.deleteAttribute('uv'); box.translate(0, 2.3, -2.9);
  const n = box.attributes.position.count, c = new Float32Array(n * 3).fill(0.012);
  box.setAttribute('color', new THREE.BufferAttribute(c, 3));
  parts.push(box);
  return mergeGeometries(parts);
}
