// People: low-polygon figures built in code. Each is one skinned mesh posed by code.
// A figure has a face (brows, lids, mouth on their own bones), moods, talking gestures,
// one-shot gestures, and work activities with tools baked into the same mesh.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapPi, mulberry32 } from './util.js';

const HY = 1.635;        // height of the middle of the head in the build pose
const BONES = [
  ['root', null, 0, 0, 0],
  ['hips', 'root', 0, 0.93, 0],
  ['spine', 'hips', 0, 0.2, 0],
  ['neck', 'spine', 0, 0.31, 0],
  ['head', 'neck', 0, 0.08, 0],
  ['armL', 'spine', 0.205, 0.26, 0], ['foreL', 'armL', 0, -0.29, 0], ['handL', 'foreL', 0, -0.26, 0],
  ['armR', 'spine', -0.205, 0.26, 0], ['foreR', 'armR', 0, -0.29, 0], ['handR', 'foreR', 0, -0.26, 0],
  ['thighL', 'hips', 0.095, -0.03, 0], ['shinL', 'thighL', 0, -0.44, 0], ['footL', 'shinL', 0, -0.42, 0],
  ['thighR', 'hips', -0.095, -0.03, 0], ['shinR', 'thighR', 0, -0.44, 0], ['footR', 'shinR', 0, -0.42, 0],
  ['skirtU', 'hips', 0, 0.02, 0], ['skirtL', 'skirtU', 0, -0.45, 0],
  // Face bones. They only slide and tilt small patches of the face.
  ['browL', 'head', 0.04, HY + 0.05 - 1.52, 0.1], ['browR', 'head', -0.04, HY + 0.05 - 1.52, 0.1],
  ['lidL', 'head', 0.04, HY + 0.03 - 1.52, 0.1], ['lidR', 'head', -0.04, HY + 0.03 - 1.52, 0.1],
  ['jaw', 'head', 0, HY - 0.063 - 1.52, 0.1], ['mouthL', 'head', 0.034, HY - 0.058 - 1.52, 0.1], ['mouthR', 'head', -0.034, HY - 0.058 - 1.52, 0.1],
];
const BI = {}; BONES.forEach((b, i) => { BI[b[0]] = i; });
// Where each bone sits in the build pose, in model space.
const BIND = {}; for (const [n, p, x, y, z] of BONES) { const q = p ? BIND[p] : [0, 0, 0]; BIND[n] = [q[0] + x, q[1] + y, q[2] + z]; }

// Collects colored triangles, each corner bound to one bone.
export class Builder {
  constructor(seed) { this.pos = []; this.col = []; this.bone = []; this.rng = mulberry32(seed); this.c = new THREE.Color(); this.out = null; this.off = null; this.tv = 0.14; }   // tv: how much each triangle's color varies
  // `bone` is one bone index, or three (one per corner). When this.out is set, the triangle is turned to face that way.
  tri(a, b, c, hex, bone, tone = 1) {
    if (this.out) { const o = this.out, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; if ((uy * vz - uz * vy) * o[0] + (uz * vx - ux * vz) * o[1] + (ux * vy - uy * vx) * o[2] < 0) { const t = b; b = c; c = t; if (bone.length) bone = [bone[0], bone[2], bone[1]]; } }
    this.c.set(hex).multiplyScalar(tone * (1 - this.tv / 2 + this.tv * this.rng()));
    const o = this.off, pts = [a, b, c];
    for (let i = 0; i < 3; i++) { const v = pts[i]; if (o) this.pos.push(v[0] + o[0], v[1] + o[1], v[2] + o[2]); else this.pos.push(v[0], v[1], v[2]); this.col.push(this.c.r, this.c.g, this.c.b); this.bone.push(bone.length ? bone[i] : bone); }
  }
  quad(a, b, c, d, hex, bone, tone = 1) { this.tri(a, b, c, hex, bone, tone); this.tri(a, c, d, hex, bone, tone); }
  // Rings are { y, rx, rz, x, z, hex }. Faces between ring i and i+1 take ring i's color.
  loft(rings, n, bone, hex, opts = {}) {
    const pt = (r, k) => { const a = (k / n) * Math.PI * 2 + (r.tw || 0); return [(r.x || 0) + Math.sin(a) * r.rx, r.y, (r.z || 0) + Math.cos(a) * r.rz]; };
    for (let i = 0; i < rings.length - 1; i++) {
      const lo = rings[i], hi = rings[i + 1];
      for (let k = 0; k < n; k++) {
        if (opts.skip && opts.skip(i, k)) continue;
        const tone = opts.tone ? opts.tone(i, k) : 1;
        this.quad(pt(lo, k), pt(lo, k + 1), pt(hi, k + 1), pt(hi, k), lo.hex || hex, bone, tone);
      }
    }
    const cap = (r, flip) => { const c = [r.x || 0, r.y, r.z || 0]; for (let k = 0; k < n; k++) flip ? this.tri(c, pt(r, k + 1), pt(r, k), r.hex || hex, bone, 0.9) : this.tri(c, pt(r, k), pt(r, k + 1), r.hex || hex, bone); };
    if (opts.capLo !== false) cap(rings[0], true);
    if (opts.capHi !== false) cap(rings[rings.length - 1], false);
  }
  // The same, but stacked along z (for animal bodies and lying things). Rings are { z, rx, ry, x, y, hex }.
  loftZ(rings, n, bone, hex, opts = {}) {
    // r.sq above 2 squares the ring off (a superellipse): flatter sides and a broader back, as a ribcage is.
    const pt = (r, k) => { const a = (k / n) * Math.PI * 2 + (r.tw || 0); let sn = Math.sin(a), cs = Math.cos(a); if (r.sq) { const e = 2 / r.sq; sn = Math.sign(sn) * Math.abs(sn) ** e; cs = Math.sign(cs) * Math.abs(cs) ** e; } return [(r.x || 0) + sn * r.rx, (r.y || 0) - cs * r.ry, r.z]; };
    for (let i = 0; i < rings.length - 1; i++) {
      const lo = rings[i], hi = rings[i + 1];
      for (let k = 0; k < n; k++) { if (opts.skip && opts.skip(i, k)) continue; this.quad(pt(lo, k), pt(lo, k + 1), pt(hi, k + 1), pt(hi, k), lo.hex || hex, bone, opts.tone ? opts.tone(i, k) : 1); }
    }
    const cap = (r, flip) => { const c = [r.x || 0, r.y || 0, r.z]; for (let k = 0; k < n; k++) flip ? this.tri(c, pt(r, k + 1), pt(r, k), r.hex || hex, bone, 0.9) : this.tri(c, pt(r, k), pt(r, k + 1), r.hex || hex, bone); };
    if (opts.capLo !== false) cap(rings[0], true);
    if (opts.capHi !== false) cap(rings[rings.length - 1], false);
  }
  // A straight round bar from point a to point b.
  rod(a, b, r, hex, bone, n = 4, r2 = r) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= L; d[1] /= L; d[2] /= L;
    const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = d[1] * up[2] - d[2] * up[1], uy = d[2] * up[0] - d[0] * up[2], uz = d[0] * up[1] - d[1] * up[0]; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
    const pt = (p, rr, k) => { const t = (k / n) * Math.PI * 2, c = Math.cos(t) * rr, s = Math.sin(t) * rr; return [p[0] + ux * c + vx * s, p[1] + uy * c + vy * s, p[2] + uz * c + vz * s]; };
    for (let k = 0; k < n; k++) { this.quad(pt(a, r, k), pt(a, r, k + 1), pt(b, r2, k + 1), pt(b, r2, k), hex, bone); this.tri(b, pt(b, r2, k), pt(b, r2, k + 1), hex, bone); this.tri(a, pt(a, r, k + 1), pt(a, r, k), hex, bone, 0.9); }
  }
  box(cx, cy, cz, sx, sy, sz, hex, bone) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const f of [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]]) this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], hex, bone);
  }
  // Part of a faceted ball. keep(nx, ny, nz) chooses faces by their direction from the center. `coarse` uses 20 faces instead of 80.
  ball(cx, cy, cz, rx, ry, rz, hex, bone, keep, coarse) {
    const g = coarse ? Builder.ico0 : Builder.ico, p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      const mx = (p[i] + p[i + 3] + p[i + 6]) / 3, my = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, mz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      if (keep && !keep(mx, my, mz)) continue;
      const v = (k) => [cx + p[i + k] * rx, cy + p[i + k + 1] * ry, cz + p[i + k + 2] * rz];
      this.tri(v(0), v(3), v(6), hex, bone);
    }
  }
  get tris() { return this.bone.length / 3; }
  // skinned = false leaves out the bone data, for props that do not bend.
  geometry(skinned = true) {
    const g = new THREE.BufferGeometry(), n = this.bone.length;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (skinned) {
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = this.bone[i]; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.computeVertexNormals();
    return g;
  }
}
Builder.ico = new THREE.IcosahedronGeometry(1, 1);
Builder.ico0 = new THREE.IcosahedronGeometry(1, 0);

const SKIN = { fair: 0xd9a47c, tan: 0xc48a5e, olive: 0xb37a4f, dark: 0x8a5a3a, pale: 0xe2c2a4, bronze: 0x6f9a86 };
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const shortDress = (s) => s.length === 'short' || (s.length == null && (s.dress === 'exomis' || s.age === 'child'));

// Fill in defaults and unpack the shorthand keys (dress, age).
function fullSpec(spec) {
  const s = Object.assign({ skin: 'tan', hair: null, hairStyle: null, beard: 'none', robe: 0xe6dcc0, robe2: null, length: null, build: 1, height: 1, hat: 'none', nose: 'straight' }, spec);
  if (s.dress === 'exomis') { s.bare = true; }
  if (s.dress === 'peplos' || s.dress === 'mantle') s.woman = true;
  if (s.dress === 'mantle') { if (!s.robe2) s.robe2 = shade(s.robe, 0.72); if (!s.hairStyle) s.hairStyle = 'veil'; }
  s.length = shortDress(s) ? 'short' : 'long';
  if (s.hair == null) s.hair = s.age === 'old' ? 0xcfcac0 : 0x2a221c;
  if (!s.hairStyle) s.hairStyle = s.woman ? 'bun' : 'full';
  return s;
}

// spec: { skin, hair, hairStyle: full|bald|long|veil|bun|curls|receding|none, beard: none|short|full|long, robe, robe2,
//   length: long|short, bare (right shoulder bare), build, height, shoes, hat: none|petasos|wreath|goldWreath|phrygian|helmet|crown|hood|pilos,
//   hatColor, nose: straight|snub|hook|broad, age: adult|old|child, dress: chiton|peplos|mantle|exomis, woman, apron (color or true), trim (color) }
// `extra(builder)` may add more triangles (hand tools and carried things).
// Hats of the low-polygon figure. A smooth person wears these too (wreaths excepted, which a kit has).
function addHat(b, s, hy, over) {
  const B = BI;
  // The petasos, a traveller's sun hat: a wide brim that droops a little at the edge and a low rounded crown.
  // Twenty sides; with eight it read as an octagon.
  if (s.hat === 'petasos') { b.loft([{ y: hy + 0.064, rx: 0.205, rz: 0.205 }, { y: hy + 0.079, rx: 0.165, rz: 0.165 }, { y: hy + 0.094, rx: 0.115, rz: 0.115 }, { y: hy + 0.104, rx: 0.09, rz: 0.09 }, { y: hy + 0.13, rx: 0.083, rz: 0.083 }, { y: hy + 0.15, rx: 0.062, rz: 0.062 }, { y: hy + 0.161, rx: 0.03, rz: 0.03 }], 20, B.head, s.hatColor || 0x9a8a68); }
  if (s.hat === 'pilos') { b.loft([{ y: hy + 0.055, rx: 0.114, rz: 0.124, z: -0.004 }, { y: hy + 0.12, rx: 0.09, rz: 0.096, z: -0.006 }, { y: hy + 0.2, rx: 0.03, rz: 0.03, z: -0.008 }], 8, B.head, s.hatColor || 0xc9b892, { capLo: false }); }
  if (s.hat === 'wreath' || s.hat === 'goldWreath') { const hx = s.hat === 'wreath' ? 0x5f7a3a : 0xd9a93c; b.loft([{ y: hy + 0.062, rx: 0.115, rz: 0.125, z: -0.004 }, { y: hy + 0.095, rx: 0.112, rz: 0.122, z: -0.004 }], 10, B.head, hx, { capLo: false, capHi: false }); }
  if (s.hat === 'crown') { b.loft([{ y: hy + 0.07, rx: 0.108, rz: 0.118 }, { y: hy + 0.16, rx: 0.12, rz: 0.13 }], 8, B.head, 0xd9a93c, { capLo: false, capHi: false }); b.ball(0, hy + 0.05, -0.004, 0.1, 0.1, 0.11, 0x8a2f2a, B.head, (x, y) => y > 0.5); }
  if (s.hat === 'phrygian') { b.ball(0, hy + 0.03, -0.01, 0.112, 0.125, 0.122, s.hatColor || 0xa33b2e, B.head, (x, y, z) => y > 0.3 || (z < -0.1 && y > -0.35)); b.loft([{ y: hy + 0.13, rx: 0.06, rz: 0.06, z: 0.0 }, { y: hy + 0.2, rx: 0.035, rz: 0.04, z: 0.05 }, { y: hy + 0.19, rx: 0.02, rz: 0.02, z: 0.1 }], 6, B.head, s.hatColor || 0xa33b2e); }
  if (s.hat === 'helmet') { b.ball(0, hy + 0.02, -0.004, 0.114, 0.135, 0.124, 0xa8733a, B.head, (x, y, z) => y > 0.15 || z < 0.2); b.quad([0, hy + 0.14, 0.09], [0, hy + 0.14, -0.13], [0, hy + 0.27, -0.12], [0, hy + 0.25, 0.07], 0xa33b2e, B.head); b.quad([0, hy + 0.14, -0.13], [0, hy + 0.14, 0.09], [0, hy + 0.25, 0.07], [0, hy + 0.27, -0.12], 0xa33b2e, B.head); }
  if (s.hat === 'hood') b.ball(0, hy + 0.012, -0.02, 0.125, 0.145, 0.135, over, B.head, (x, y, z) => z < 0.35 || y > 0.55);
}

// `shift(builder)` may move the finished triangles (a kit uses it to put them on its own joints).
export function buildFigure(spec, seed = 1, extra = null, shift = null) {
  const b = new Builder(seed), s = fullSpec(spec);
  const skin = SKIN[s.skin] || s.skin, w = s.build, cloth = s.robe, over = s.robe2 || s.robe, chest = s.bare ? skin : cloth;
  const B = BI, fem = !!s.woman, sw = fem ? 0.9 : 1, mantle = s.dress === 'mantle';
  // hips and torso
  b.loft([{ y: 0.84, rx: 0.175 * w, rz: 0.125 * w }, { y: 0.98, rx: 0.17 * w, rz: 0.12 * w }], 8, B.hips, over, { capLo: false, capHi: false });
  // The chiton shows on the right chest; the himation crosses from the left shoulder.
  const torso = [{ y: 0.96, rx: 0.172 * w, rz: 0.122 * w }, { y: 1.2, rx: 0.2 * w * sw, rz: (fem ? 0.146 : 0.135) * w }, { y: 1.4, rx: 0.2 * w * sw, rz: 0.118 * w }, { y: 1.46, rx: 0.075, rz: 0.07 }];
  b.loft(torso, 8, B.spine, chest, { capLo: false });
  if (s.robe2 || s.bare) {
    // Outer wrap: full below the chest, then only over the left shoulder (k = 0..3 is the +x side). A mantle covers both.
    const o = 1.07;
    const wrap = [{ y: 0.95, rx: 0.172 * w * o, rz: 0.122 * w * o }, { y: 1.2, rx: 0.2 * w * o * sw, rz: (fem ? 0.146 : 0.135) * w * o }, { y: 1.41, rx: 0.2 * w * o * sw, rz: 0.118 * w * o }, { y: 1.475, rx: 0.08, rz: 0.075 }];
    b.loft(wrap, 8, B.spine, over, { capLo: false, capHi: false, skip: (i, k) => !mantle && i >= 1 && !(k >= 0 && k <= 3) });
    // The loose end hanging behind the left shoulder.
    if (!mantle) b.quad([0.2 * w, 1.42, -0.1], [0.06, 1.44, -0.13], [0.07, 0.86, -0.17], [0.23 * w, 0.9, -0.13], over, B.spine, 0.92);
  }
  if (s.dress === 'peplos') {
    // The overfold: a second layer of the same cloth hanging from the shoulders to the waist, with a border.
    const trim = s.trim || shade(cloth, 0.62);
    b.loft([{ y: 1.0, rx: 0.212 * w, rz: 0.158 * w, hex: trim }, { y: 1.04, rx: 0.212 * w, rz: 0.158 * w }, { y: 1.22, rx: 0.215 * w * sw, rz: 0.157 * w }, { y: 1.42, rx: 0.205 * w * sw, rz: 0.125 * w }], 8, B.spine, shade(cloth, 0.94), { capLo: false, capHi: false });
  }
  if (s.apron) {
    const ap = s.apron === true ? 0x6b4a32 : s.apron;
    b.out = [0, 0, 1];
    b.quad([-0.13 * w, 0.97, 0.139 * w], [0.13 * w, 0.97, 0.139 * w], [0.12 * w, 1.3, 0.156 * w], [-0.12 * w, 1.3, 0.156 * w], ap, B.spine);
    b.quad([-0.15 * w, 0.6, 0.2 * w], [0.15 * w, 0.6, 0.2 * w], [0.13 * w, 0.97, 0.15 * w], [-0.13 * w, 0.97, 0.15 * w], ap, B.skirtU, 0.92);
    b.out = null;
  }
  // neck and head
  b.loft([{ y: 1.43, rx: 0.05, rz: 0.05 }, { y: 1.55, rx: 0.047, rz: 0.05 }], 6, B.neck, skin, { capLo: false, capHi: false });
  const hy = HY, hs = s.hairStyle, bearded = s.beard && s.beard !== 'none';
  // The facets under the mouth face the ground and shade dark, which reads as a beard from a distance. Lighten them.
  const chin = (x, y, z) => y < -0.2 && z > 0.1;
  b.ball(0, hy, 0.01, 0.098, 0.122, 0.108, skin, B.head, (x, y, z) => !chin(x, y, z));
  b.ball(0, hy, 0.01, 0.098, 0.122, 0.108, shade(skin, 1.28), B.head, chin);
  // Face. Every patch is turned to face forward, so none can end up inside out.
  b.out = [0, 0.15, 1];
  const N = { straight: [0.016, 0.014, -0.03, 0.148, 0.017, -0.036], snub: [0.014, 0.006, -0.016, 0.144, 0.025, -0.03], hook: [0.014, 0.02, -0.04, 0.156, 0.016, -0.036], broad: [0.02, 0.012, -0.03, 0.146, 0.027, -0.036] }[s.nose] || [0.016, 0.014, -0.03, 0.148, 0.017, -0.036];
  const nT = [[-N[0], hy + N[1], 0.11], [N[0], hy + N[1], 0.11]], tip = [0, hy + N[2], N[3]], nB = [[-N[4], hy + N[5], 0.105], [N[4], hy + N[5], 0.105]];
  b.tri(nT[0], nT[1], tip, skin, B.head, 1.04);
  b.out = [-1, 0, 0.3]; b.tri(nT[0], tip, nB[0], skin, B.head, 0.84);
  b.out = [1, 0, 0.3]; b.tri(nT[1], tip, nB[1], skin, B.head, 0.84);
  b.out = [0, -1, 0.2]; b.tri(nB[0], nB[1], tip, skin, B.head, 0.7);
  b.out = [0, 0, 1];
  const ey = hy + 0.02, browHex = shade(s.hair, s.age === 'old' ? 0.75 : 0.7);
  for (const sx of [1, -1]) {
    const ex = sx * 0.04, lid = sx > 0 ? B.lidL : B.lidR, brow = sx > 0 ? B.browL : B.browR;
    b.quad([ex - 0.019, ey - 0.014, 0.106], [ex + 0.019, ey - 0.014, 0.106], [ex + 0.019, ey + 0.018, 0.106], [ex - 0.019, ey + 0.018, 0.106], 0xf2ede2, B.head);         // white
    const px = ex - sx * 0.003;
    b.quad([px - 0.009, ey - 0.012, 0.109], [px + 0.009, ey - 0.012, 0.109], [px + 0.009, ey + 0.012, 0.109], [px - 0.009, ey + 0.012, 0.109], 0x1a1410, B.head);        // pupil
    b.quad([ex - 0.022, ey + 0.012, 0.113], [ex + 0.022, ey + 0.012, 0.113], [ex + 0.022, ey + 0.044, 0.109], [ex - 0.022, ey + 0.044, 0.109], skin, lid, 0.9);            // upper lid, slides down to blink
    b.quad([ex - 0.025, hy + 0.043, 0.117], [ex + 0.025, hy + 0.043, 0.117], [ex + 0.025, hy + 0.057, 0.115], [ex - 0.025, hy + 0.057, 0.115], browHex, brow);
    b.box(sx * 0.1, hy + 0.005, -0.005, 0.02, 0.05, 0.03, skin, B.head);                                                                                                // ear
  }
  // Mouth: corners on two bones, lower edge on the jaw bone, so it can smile, frown, and open.
  const my = hy - 0.058, mz = bearded ? 0.122 : 0.108, cL = [0.034, my, mz - 0.006], cR = [-0.034, my, mz - 0.006], uL = [0.013, my + 0.005, mz], uR = [-0.013, my + 0.005, mz], lL = [0.013, my - 0.005, mz], lR = [-0.013, my - 0.005, mz], dark = 0x3a1512;
  b.tri(cR, cL, uL, dark, [B.mouthR, B.mouthL, B.head]); b.tri(cR, uL, uR, dark, [B.mouthR, B.head, B.head]);
  b.tri(cR, lL, cL, dark, [B.mouthR, B.jaw, B.mouthL]); b.tri(cR, lR, lL, dark, [B.mouthR, B.jaw, B.jaw]);
  const lip = new THREE.Color(skin).lerp(new THREE.Color(0x9a4a3a), 0.45).getHex();
  b.quad([-0.017, my - 0.017, mz - 0.002], [0.017, my - 0.017, mz - 0.002], [0.013, my - 0.005, mz + 0.001], [-0.013, my - 0.005, mz + 0.001], lip, B.jaw);
  if (bearded) for (const sx of [1, -1]) b.quad([sx * 0.002, my + 0.006, mz], [sx * 0.04, my - 0.004, mz - 0.008], [sx * 0.036, my + 0.012, mz - 0.006], [sx * 0.002, my + 0.02, mz], s.hair, B.head, 0.9);   // moustache
  b.out = null;
  // hair
  if (hs === 'full' || hs === 'long' || hs === 'bun' || hs === 'curls') b.ball(0, hy + 0.012, -0.004, 0.108, 0.13, 0.118, s.hair, B.head, (x, y, z) => y > 0.42 || (z < -0.05 && y > -0.5) || (z < 0.45 && y > 0.2));
  if (hs === 'bald') b.ball(0, hy + 0.005, -0.006, 0.106, 0.125, 0.116, s.hair, B.head, (x, y, z) => z < 0.12 && y > -0.5 && y < 0.34);
  if (hs === 'receding') b.ball(0, hy + 0.01, -0.006, 0.107, 0.128, 0.117, s.hair, B.head, (x, y, z) => (z < 0.3 && y > -0.5 && y < 0.5) || (z < -0.1 && y > -0.5));
  if (hs === 'long') b.loft([{ y: 1.4, rx: 0.1, rz: 0.035, z: -0.085 }, { y: 1.6, rx: 0.1, rz: 0.04, z: -0.075 }], 6, B.neck, s.hair, { capHi: false });
  if (hs === 'bun') { b.ball(0, hy + 0.03, -0.135, 0.055, 0.055, 0.05, s.hair, B.head, null, true); b.loft([{ y: hy + 0.07, rx: 0.111, rz: 0.121, z: -0.004 }, { y: hy + 0.09, rx: 0.108, rz: 0.118, z: -0.004 }], 8, B.head, s.trim || 0xb9a27a, { capLo: false, capHi: false }); }
  if (hs === 'curls') for (let i = 0; i < 9; i++) { const a = -1.9 + i * 0.475, r = 0.03; b.ball(Math.sin(a) * 0.1, hy + 0.075 + 0.012 * (i % 2), Math.cos(a) * 0.105 - 0.01, r, r, r, s.hair, B.head, (x, y) => y > -0.6, true); }
  if (hs === 'veil') {
    b.ball(0, hy + 0.014, -0.012, 0.116, 0.138, 0.126, over, B.head, (x, y, z) => y > 0.38 || z < 0.05);
    b.loft([{ y: 1.36, rx: 0.15, rz: 0.06, z: -0.07 }, { y: 1.62, rx: 0.115, rz: 0.06, z: -0.07 }], 6, B.neck, over, { capHi: false });
  }
  const beardLen = { none: 0, short: 0.045, full: 0.09, long: 0.17 }[s.beard] || 0;
  // The beard starts below the mouth in front and runs up the cheeks at the sides.
  if (beardLen) b.ball(0, hy - 0.082 - beardLen * 0.35, 0.03, 0.09, 0.055 + beardLen * 0.62, 0.082, s.hair, B.head, (x, y, z) => z > -0.25 && (y < 0.2 || (Math.abs(x) > 0.5 && y < 0.75)));
  addHat(b, s, hy, over);
  // arms
  const at = fem ? 0.9 : 1;
  for (const [side, arm, fore, hand] of [[1, B.armL, B.foreL, B.handL], [-1, B.armR, B.foreR, B.handR]]) {
    const x = side * 0.205 * w, covered = mantle || (side === 1 && (s.robe2 || s.bare));
    b.ball(x * 0.97, 1.385, 0, 0.064, 0.064, 0.064, covered ? over : (s.bare ? skin : cloth), arm, null, true);
    b.loft([{ y: 1.1, rx: 0.043 * at, rz: 0.043 * at, x }, { y: 1.4, rx: 0.052 * at, rz: 0.052 * at, x }], 6, arm, covered ? over : skin, { capHi: false });
    b.loft([{ y: 0.84, rx: 0.034 * at, rz: 0.034 * at, x }, { y: 1.11, rx: 0.044 * at, rz: 0.044 * at, x }], 6, fore, skin, { capHi: false });
    b.box(x, 0.79, 0.008, 0.05, 0.1, 0.07, skin, hand);
    b.box(x - side * 0.03, 0.805, 0.03, 0.022, 0.05, 0.025, skin, hand);     // thumb
  }
  // legs
  for (const [side, th, sh, ft] of [[1, B.thighL, B.shinL, B.footL], [-1, B.thighR, B.shinR, B.footR]]) {
    const x = side * 0.095;
    b.loft([{ y: 0.47, rx: 0.058, rz: 0.06, x }, { y: 0.9, rx: 0.078, rz: 0.08, x }], 6, th, skin, { capHi: false });
    b.loft([{ y: 0.07, rx: 0.04, rz: 0.042, x }, { y: 0.48, rx: 0.055, rz: 0.058, x }], 6, sh, skin, { capHi: false });
    b.box(x, 0.035, 0.045, 0.085, 0.07, 0.22, s.shoes === false ? skin : 0x5a4634, ft);
  }
  // skirt
  if (s.length === 'long') {
    b.loft([{ y: 0.5, rx: 0.2 * w, rz: 0.165 * w }, { y: 0.97, rx: 0.182 * w, rz: 0.132 * w }], 8, B.skirtU, over, { capLo: false, capHi: false });
    b.loft([{ y: 0.09, rx: 0.235 * w, rz: 0.2 * w, hex: s.trim || cloth }, { y: 0.22, rx: 0.225 * w, rz: 0.19 * w }, { y: 0.52, rx: 0.205 * w, rz: 0.17 * w }], 8, B.skirtL, over, { capLo: false, capHi: false, tone: (i) => (i === 0 ? 0.9 : 1) });
  } else {
    b.loft([{ y: 0.56, rx: 0.215 * w, rz: 0.18 * w }, { y: 0.97, rx: 0.182 * w, rz: 0.132 * w }], 8, B.skirtU, over, { capHi: false, capLo: false });
  }
  if (extra) extra(b);
  if (shift) shift(b);
  return b.geometry();
}

// ---------------------------------------------------------------------------------------------
// Tools and carried things. Hand tools are drawn around the palm of the holding hand, in the
// directions they have when the hand is not turned: +z forward, +y up. Body things use model space.
const WOOD = 0x6b4a32, PALE = 0x9a7a52, IRON = 0x4a4a4e, CLAY = 0xb5673a, STRAW = 0xc9b06a, WOOL = 0xe8e2d2, ROPE = 0xa89468;
const lathe = (b, bone, x, y, z, prof, hex, n = 6) => b.loft(prof.map((p) => ({ y: y + p[0], rx: p[1], rz: p[1], x, z, hex: p[2] })), n, bone, hex);
const TOOLS = {
  hammer: (b, k) => { b.rod([0, 0, -0.07], [0, 0, 0.3], 0.014, WOOD, k); b.box(0, 0, 0.3, 0.06, 0.12, 0.06, IRON, k); },
  tongs: (b, k) => { b.rod([0.012, 0, -0.06], [-0.008, 0, 0.4], 0.008, IRON, k, 3); b.rod([-0.012, 0, -0.06], [0.008, 0, 0.4], 0.008, IRON, k, 3); },
  hoe: (b, k) => { b.rod([0, 0, -0.5], [0, 0, 0.75], 0.016, WOOD, k); b.box(0, -0.1, 0.75, 0.13, 0.2, 0.02, IRON, k); },
  sickle: (b, k) => { b.rod([0, 0, -0.05], [0, 0, 0.12], 0.014, WOOD, k); let p = [0, 0, 0.12]; for (const q of [[0.1, 0, 0.26], [0.22, 0, 0.27], [0.3, 0, 0.18]]) { b.rod(p, q, 0.012, 0x8a8a8e, k, 3, 0.006); p = q; } },
  ladle: (b, k) => { b.rod([0, 0.1, 0], [0, -0.55, 0], 0.014, PALE, k); b.box(0, -0.56, 0, 0.07, 0.05, 0.07, PALE, k); },
  fan: (b, k) => { b.rod([0, 0, -0.04], [0, 0, 0.1], 0.01, WOOD, k, 3); b.box(0, 0, 0.23, 0.22, 0.008, 0.24, STRAW, k); },
  distaff: (b, k) => { b.rod([0, -0.18, 0], [0, 0.5, 0], 0.01, WOOD, k, 3); b.ball(0, 0.45, 0, 0.075, 0.11, 0.075, WOOL, k, null, true); },
  spindle: (b, k) => { b.rod([0, 0, 0], [0, -0.3, 0], 0.003, WOOL, k, 3); b.rod([0, -0.3, 0], [0, -0.52, 0], 0.008, WOOD, k, 3); b.box(0, -0.47, 0, 0.06, 0.02, 0.06, CLAY, k); b.ball(0, -0.38, 0, 0.025, 0.05, 0.025, WOOL, k, null, true); },
  mallet: (b, k) => { b.rod([0, 0, -0.05], [0, 0, 0.2], 0.014, WOOD, k); b.box(0, 0, 0.22, 0.09, 0.15, 0.09, PALE, k); },
  chisel: (b, k) => b.rod([0, 0, -0.03], [0, 0, 0.2], 0.01, IRON, k, 3, 0.006),
  saw: (b, k) => { b.box(0, 0, 0, 0.03, 0.05, 0.1, WOOD, k); b.box(0, -0.03, 0.32, 0.006, 0.08, 0.54, 0x8a8a8e, k); },
  adze: (b, k) => { b.rod([0, 0, -0.32], [0, 0, 0.4], 0.016, WOOD, k); b.box(0, -0.07, 0.4, 0.07, 0.14, 0.025, IRON, k); },
  knife: (b, k) => { b.box(0, 0, 0.0, 0.02, 0.03, 0.08, WOOD, k); b.box(0, 0, 0.12, 0.005, 0.03, 0.16, 0x9a9aa0, k); },
  fish: (b, k) => { b.rod([0, 0, 0], [0, -0.2, 0], 0.02, 0xa9b4bc, k, 4, 0.04); b.rod([0, -0.2, 0], [0, -0.36, 0], 0.04, 0xa9b4bc, k, 4, 0.012); b.box(0, 0.02, 0, 0.005, 0.07, 0.08, 0x7f8c96, k); },
  tablet: (b, k) => { b.box(0.02, 0, 0.07, 0.17, 0.014, 0.23, WOOD, k); b.box(0.02, 0.009, 0.07, 0.14, 0.004, 0.2, 0x3a2f24, k); },
  stylus: (b, k) => b.rod([0, 0.06, -0.02], [0, -0.07, 0.04], 0.005, 0xd8cdb0, k, 3),
  broom: (b, k) => { b.rod([0, 0, -0.45], [0, 0, 0.72], 0.014, WOOD, k); b.box(0, 0, 0.82, 0.2, 0.05, 0.22, STRAW, k); },
  staff: (b, k) => b.rod([0, -1.2, 0], [0, 0.14, 0], 0.018, WOOD, k),
  crook: (b, k) => { b.rod([0, -1.02, 0], [0, 0.42, 0], 0.016, WOOD, k); b.rod([0, 0.42, 0], [0, 0.52, 0.08], 0.014, WOOD, k, 3); b.rod([0, 0.52, 0.08], [0, 0.44, 0.15], 0.012, WOOD, k, 3); },
  rod: (b, k) => { b.rod([0, 0, -0.3], [0, 0, 2.3], 0.012, PALE, k, 4, 0.004); b.rod([0, 0, 2.3], [0, -1.26, 1.69], 0.0025, 0xe8e2d2, k, 3); },
  cup: (b, k) => lathe(b, k, 0, 0, 0.05, [[-0.03, 0.03], [-0.01, 0.012], [0.01, 0.03], [0.045, 0.075]], 0x2a2522),
  cloth: (b, k) => b.box(0.1, -0.04, 0.03, 0.3, 0.04, 0.2, 0xd8d2c0, k),
  stone: (b, k) => b.box(0.1, -0.055, 0.02, 0.34, 0.07, 0.14, 0x8f8a80, k),
  rope: (b, k) => b.rod([0, 0, 0.05], [0, -0.06, -0.12], 0.008, ROPE, k, 3),
  fork: (b, k) => { b.rod([0, 0, -0.5], [0, 0, 0.7], 0.014, PALE, k); b.rod([0, 0, 0.7], [0.07, 0, 1.0], 0.009, PALE, k, 3); b.rod([0, 0, 0.7], [-0.07, 0, 1.0], 0.009, PALE, k, 3); },
  goods: (b, k) => lathe(b, k, 0, 0.02, 0.02, [[-0.02, 0.03], [0.04, 0.06], [0.12, 0.05], [0.17, 0.025]], CLAY),
  // Body things, in model space.
  amphora: (b) => { b.loftZ([[-0.34, 0.01], [-0.16, 0.1], [0.05, 0.125], [0.2, 0.08], [0.27, 0.04], [0.36, 0.05]].map((p) => ({ z: p[0], rx: p[1], ry: p[1], x: 0.2, y: 1.6 })), 6, BI.spine, CLAY); },
  hydria: (b) => { lathe(b, BI.head, 0, HY + 0.125, 0, [[0, 0.07, 0x8a7a5a], [0.03, 0.07], [0.04, 0.05], [0.14, 0.14], [0.26, 0.15], [0.33, 0.06], [0.4, 0.075]], CLAY, 7); b.box(0.15, HY + 0.33, 0, 0.06, 0.025, 0.03, CLAY, BI.head); b.box(-0.15, HY + 0.33, 0, 0.06, 0.025, 0.03, CLAY, BI.head); },
  basket: (b) => { lathe(b, BI.spine, 0, 0.94, 0.32, [[0, 0.15], [0.17, 0.21, STRAW], [0.2, 0.17, 0x8a9a52]], 0xb89a5a, 7); },
  sack: (b) => b.ball(-0.04, 1.42, -0.2, 0.2, 0.3, 0.18, 0xb9a57a, BI.spine, null, true),
  seedbag: (b) => { lathe(b, BI.spine, 0.14, 0.98, 0.18, [[0, 0.07], [0.12, 0.1], [0.14, 0.085, 0xd9c27a]], 0x9a8a68, 5); b.out = [0, 0, 1]; b.quad([0.2, 1.1, 0.14], [0.24, 1.1, 0.12], [-0.1, 1.44, 0.13], [-0.14, 1.44, 0.13], 0x9a8a68, BI.spine); b.out = null; },
  aulos: (b) => { for (const sx of [1, -1]) b.rod([sx * 0.008, HY - 0.06, 0.12], [sx * 0.11, HY - 0.3, 0.46], 0.009, 0xd8c9a0, BI.head, 4); },
  lyre: (b) => { const x = 0.19, y = 1.12, z = 0.2; b.ball(x, y, z, 0.11, 0.1, 0.05, 0x7a5a36, BI.spine, null, true); b.rod([x - 0.08, y + 0.05, z], [x - 0.11, y + 0.36, z], 0.011, PALE, BI.spine, 3); b.rod([x + 0.08, y + 0.05, z], [x + 0.11, y + 0.36, z], 0.011, PALE, BI.spine, 3); b.rod([x - 0.13, y + 0.33, z], [x + 0.13, y + 0.33, z], 0.011, PALE, BI.spine, 3); b.out = [0, 0, 1]; b.quad([x - 0.05, y + 0.04, z + 0.04], [x + 0.05, y + 0.04, z + 0.04], [x + 0.06, y + 0.33, z + 0.01], [x - 0.06, y + 0.33, z + 0.01], 0xe8dcb8, BI.spine); b.out = null; },
};
const BODY_TOOLS = { amphora: 1, hydria: 1, basket: 1, sack: 1, seedbag: 1, aulos: 1, lyre: 1 };
const PALM = [0, -0.05, 0.01];
function addTools(b, props) {
  if (!props) return;
  for (const key of ['R', 'L', 'body']) {
    const kind = props[key]; if (!kind || !TOOLS[kind]) continue;
    if (key === 'body') { b.off = null; TOOLS[kind](b); continue; }
    const h = BIND[key === 'R' ? 'handR' : 'handL']; b.off = [h[0] + PALM[0], h[1] + PALM[1], h[2] + PALM[2]];
    TOOLS[kind](b, BI[key === 'R' ? 'handR' : 'handL']); b.off = null;
  }
}

// ---------------------------------------------------------------------------------------------
// Named poses: bone -> [x, y, z] rotation in radians. `lift` moves the whole body up or down.
// `feet` puts the ankles at fixed places instead: [zLeft, zRight, extra spread, height, foot pitch].
// `hands` gives resting places for the palms, in torso space.
const POSES = {
  stand: { armL: [0, 0, 0.07], armR: [0, 0, -0.07], foreL: [-0.18, 0, 0], foreR: [-0.18, 0, 0] },
  sit: { lift: -0.4, thighL: [-1.45, 0, 0.06], thighR: [-1.45, 0, -0.06], shinL: [1.42, 0, 0], shinR: [1.42, 0, 0], skirtU: [-1.45, 0, 0], skirtL: [1.42, 0, 0], spine: [0.06, 0, 0], armL: [-0.32, 0, 0.1], armR: [-0.32, 0, -0.1], foreL: [-0.95, 0, 0], foreR: [-0.95, 0, 0] },
  // Sitting on the ground with the knees up and the hands resting on them.
  ground: { lift: -0.8, hips: [-0.3, 0, 0], spine: [0.5, 0, 0], head: [-0.15, 0, 0], feet: [0.5, 0.4, 0.07, 0.04, 0], hands: [[0.17, 0.98, 0.42], [-0.17, 1.0, 0.36]] },
  // Sitting on the ground with the legs out, leaning back (against a wall).
  groundOut: { lift: -0.8, hips: [-0.4, 0, 0], spine: [0.12, 0, 0], feet: [0.8, 0.74, 0.03, 0.06, -1.1], hands: [[0.09, 0.98, 0.2], [-0.08, 1.0, 0.22]] },
  low: { lift: -0.57, spine: [0.12, 0, 0], feet: [0.4, 0.34, 0.06, 0.04, 0], hands: [[0.16, 1.0, 0.3], [-0.16, 1.0, 0.3]] },
  crouch: { lift: -0.63, hips: [0.2, 0, 0], spine: [0.35, 0, 0], head: [-0.3, 0, 0], feet: [0.24, 0.18, 0.08, 0.04, 0], hands: [[0.2, 0.95, 0.4], [-0.2, 0.95, 0.4]] },
  kneel2: { lift: -0.46, hips: [0.15, 0, 0], spine: [0.2, 0, 0], feet: [-0.3, -0.27, 0.02, 0.05, 2.9] },
  heels: { lift: -0.69, spine: [0.08, 0, 0], feet: [-0.02, 0.0, 0.03, 0.05, 2.9], hands: [[0.12, 1.0, 0.25], [-0.12, 1.0, 0.25]] },
  carry: { armR: [-2.75, 0, -0.1], foreR: [-0.25, 0, 0], armL: [0, 0, 0.07], foreL: [-0.2, 0, 0], head: [0.05, 0, 0] },
  staff: { armL: [-0.45, 0, 0.12], foreL: [-1.0, 0, 0], armR: [0, 0, -0.07], foreR: [-0.18, 0, 0] },
  lie: { lift: 0.13, rootX: -Math.PI / 2, armL: [0, 0, 0.3], armR: [0, 0, -0.3] },
  kneel: { lift: -0.42, thighL: [-1.5, 0, 0], thighR: [0.1, 0, 0], shinL: [1.5, 0, 0], shinR: [1.55, 0, 0], skirtU: [-0.7, 0, 0], skirtL: [1.2, 0, 0], spine: [0.25, 0, 0], armR: [-0.9, 0, -0.1], foreR: [-0.7, 0, 0] },
  throne: { lift: -0.28, thighL: [-1.45, 0, 0.12], thighR: [-1.45, 0, -0.12], shinL: [1.42, 0, 0], shinR: [1.42, 0, 0], skirtU: [-1.45, 0, 0], skirtL: [1.42, 0, 0], armL: [-0.2, 0, 0.3], armR: [-0.2, 0, -0.3], foreL: [-1.2, 0, 0], foreR: [-1.2, 0, 0] },
  guard: { armR: [-0.5, 0, -0.1], foreR: [-1.3, 0, 0], armL: [0, 0, 0.1], foreL: [-0.2, 0, 0] },
};

// ---------------------------------------------------------------------------------------------
// Moods. Face: bl brow lift, bt brow tilt (+ inner ends down), lid (1 shut, negative wide), open, smile, asym.
// Body: hx head pitch, hz head tilt, sx spine lean (+ forward), sh shoulders up.
// Talking style: raise, bend, out (arms apart), sp speed, sharp (jabs), both (how much the second arm joins), palm (palms up).
// hw: how strongly the hands are held at fixed places (hR, hL, in torso space) while the mood lasts.
const MOOD0 = { bl: 0, bt: 0, lid: 0.15, open: 0, smile: 0.12, asym: 0, hx: 0, hz: 0, sx: 0, sh: 0, raise: 0.3, bend: 0.75, out: 0.12, sp: 2.2, sharp: 0, both: 0.45, palm: 0.2, hw: 0, bounce: 0 };
const MOODS = {
  neutral: {},
  happy: { bl: 0.35, bt: -0.15, lid: 0.25, open: 0.2, smile: 1, hx: -0.06, raise: 0.4, bend: 0.85, out: 0.4, sp: 2.6, both: 0.95, palm: 0.9 },
  laugh: { bl: 0.6, bt: -0.25, lid: 0.8, open: 1, smile: 1, hx: -0.22, sx: -0.08, raise: 0.3, bend: 0.9, out: 0.3, sp: 3, both: 1, palm: 0.5, bounce: 1 },
  angry: { bl: -0.7, bt: 1, lid: 0.3, open: 0.25, smile: -0.8, hx: 0.12, sx: 0.16, sh: 0.3, raise: 0.5, bend: 0.95, out: 0.05, sp: 3.6, sharp: 1, both: 0.55, palm: 0 },
  sad: { bl: 0.15, bt: -1, lid: 0.5, open: 0, smile: -0.9, hx: 0.3, hz: 0.06, sx: 0.12, sh: -0.2, raise: 0.1, bend: 0.4, out: 0, sp: 1.2, both: 0.3, palm: 0.4 },
  afraid: { bl: 0.9, bt: -0.8, lid: -0.3, open: 0.55, smile: -0.5, hx: -0.05, sx: -0.16, sh: 0.8, raise: 0.5, bend: 1.2, sp: 4, both: 1, hw: 0.8, hR: [-0.2, 1.4, 0.3], hL: [0.2, 1.36, 0.3], palm: -0.8 },
  surprised: { bl: 1, bt: -0.1, lid: -0.3, open: 0.8, smile: 0, hx: -0.1, sx: -0.07, sh: 0.4, raise: 0.25, bend: 1.0, out: 0.45, sp: 1.6, both: 1, palm: 0.3 },
  think: { bl: 0.1, bt: 0.45, lid: 0.35, open: 0, smile: -0.15, asym: 0.8, hx: 0.1, hz: 0.14, sx: 0.03, raise: 0.1, bend: 0.4, sp: 1.2, both: 0.1, hw: 0.9, hR: [-0.03, 1.5, 0.165], hL: [-0.08, 1.14, 0.2] },
  scorn: { bl: -0.1, bt: 0.5, lid: 0.55, open: 0, smile: -0.35, asym: -1, hx: -0.14, hz: -0.1, sx: -0.05, raise: 0.25, bend: 0.6, out: 0.15, sp: 1.6, both: 0.05, palm: 0.6 },
  plead: { bl: 0.7, bt: -1, lid: 0, open: 0.3, smile: -0.35, hx: 0.04, hz: 0.12, sx: 0.12, sh: 0.2, raise: 0.3, bend: 0.9, sp: 2, both: 1, hw: 0.85, hR: [-0.04, 1.3, 0.3], hL: [0.04, 1.29, 0.3], palm: 0.5 },
};
const MOOD_KEYS = Object.keys(MOOD0);
for (const k in MOODS) MOODS[k] = Object.assign({ hR: [-0.2, 1.1, 0.25], hL: [0.2, 1.1, 0.25] }, MOOD0, MOODS[k]);

// ---------------------------------------------------------------------------------------------
// Scratch space shared by every figure while it is being posed.
const ANIM_BONES = ['hips', 'spine', 'neck', 'head', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR', 'skirtU', 'skirtL', 'handL', 'handR'];
const hand0 = () => ({ p: [0, 0, 0], w: 0, q: [0, 0, 0], hasQ: false });
// K is what an activity writes; G is what a one-shot gesture writes. Hand places in K follow the activity's `space`; G is always torso space.
const K = { b: {}, R: hand0(), L: hand0(), open: -1, lid: -1, lift: 0, shrug: 0, lockHead: 0 }, G = { R: hand0(), L: hand0() };
for (const n of ANIM_BONES) K.b[n] = [0, 0, 0];
const bo = (n, x, y, z) => { const v = K.b[n]; v[0] += x; v[1] += y; v[2] += z; };
const setH = (H, x, y, z, w = 1) => { H.p[0] = x; H.p[1] = y; H.p[2] = z; H.w = w; };
const hR = (x, y, z) => setH(K.R, x, y, z), hL = (x, y, z) => setH(K.L, x, y, z);
const qR = (x, y, z) => { K.R.q[0] = x; K.R.q[1] = y; K.R.q[2] = z; K.R.hasQ = true; }, qL = (x, y, z) => { K.L.q[0] = x; K.L.q[1] = y; K.L.q[2] = z; K.L.hasQ = true; };
// Both hands on one long tool: the right palm at p, the left hand d meters back along the shaft.
const two = (px, py, pz, pitch, yaw, d, dx = 0.1) => { hR(px, py, pz); qR(pitch, yaw, 0); hL(px - Math.sin(yaw) * Math.cos(pitch) * d + dx, py + Math.sin(pitch) * d, pz - Math.cos(yaw) * Math.cos(pitch) * d); qL(pitch, yaw, 0); };
// Bend forward at the waist while the legs stay upright.
const bend = (a) => { bo('hips', a, 0, 0); bo('thighL', -a, 0, 0); bo('thighR', -a, 0, 0); bo('skirtU', -a * 0.85, 0, 0); };
const cyc = (t, period) => (t / period) % 1, ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
// How far through a rowing stroke: 0 with the arms reached forward (the catch), 1 with the hands at the chest. The
// pull takes 45% of the 2.6 s stroke, the slower return the rest.
export const rowPull = (t) => { const u = cyc(t, 2.6); return u < 0.45 ? ease(u / 0.45) : 1 - ease((u - 0.45) / 0.55); };
const strike = (u) => (u < 0.6 ? ease(u / 0.6) : u < 0.74 ? 1 - ((u - 0.6) / 0.14) ** 2 : 0);    // slow lift, fast blow, short rest
const bump = (u, a, b2) => ease((u - a) / 0.15) - ease((u - b2) / 0.15);                              // 0, up to 1 between a and b2, back to 0
const S = Math.sin, C = Math.cos, mix = (a, b2, k) => a + (b2 - a) * k;

// One-shot gestures: [seconds, function(u, e)]. u runs 0..1; e is a soft in-and-out envelope.
const GESTURES = {
  pour: [1.9, (u,e)=>{setH(G.L,0.20,1.22,0.42,e);setH(G.R,-0.05,0.94,0.49,e);bo('handL',0,0,-0.85*e);bo('head',0.20*e,0,0);}],
  scatter: [1.5, (u,e)=>{setH(G.R,-0.15+0.35*u,1.13+0.12*S(u*3.14),0.36+0.3*u,e);bo('handR',-0.8*e,0,0);bo('head',0.1*e,0,0);}],
  offer: [1.6, (u,e)=>{setH(G.R,-0.08,1.05,0.62,e);setH(G.L,0.14,1.0,0.35,e);bo('head',0.1*e,0,0);}],
  nod: [0.9, (u, e) => bo('head', 0.28 * S(u * 9.4) * e, 0, 0)],
  shake: [1.1, (u, e) => bo('head', 0, 0.45 * S(u * 12.6) * e, 0)],
  shrug: [1.3, (u, e) => { K.shrug += e; bo('head', 0, 0, 0.14 * e); for (const [s, a] of [[1, 'L'], [-1, 'R']]) { bo('arm' + a, -0.15 * e, 0, s * 0.3 * e); bo('fore' + a, -1.0 * e, 0, 0); bo('hand' + a, -0.7 * e, 0, 0); } }],
  point: [1.5, (u, e, o) => setH(G.R, -0.2 + (o.x || 0), 1.42 + (o.y || 0), 0.72, e)],
  wave: [1.7, (u, e) => { setH(G.R, -0.36 + 0.13 * S(u * 25), 1.82, 0.18, e); bo('handR', 0, 0, 0.3 * S(u * 25) * e); }],
  laugh: [1.7, (u, e) => { bo('spine', (-0.14 + 0.07 * S(u * 38)) * e, 0, 0); bo('head', -0.25 * e, 0, 0); K.open = Math.max(K.open, e * (0.7 + 0.3 * S(u * 38))); K.shrug += 0.3 * e * (1 + S(u * 38)); }],
  bow: [1.7, (u, e) => { bend(0.55 * e); bo('head', 0.25 * e, 0, 0); }],
  clap: [1.6, (u, e) => { const c = 0.07 + 0.07 * S(u * 44); setH(G.R, -0.012 - c, 1.3, 0.34, e); setH(G.L, 0.012 + c, 1.3, 0.34, e); }],
  facepalm: [1.9, (u, e) => { setH(G.R, -0.03, 1.665, 0.17, e); bo('head', 0.32 * e, 0, 0); K.lid = Math.max(K.lid, e); }],
  startle: [0.8, (u, e) => { bo('spine', -0.22 * e, 0, 0); K.shrug += e; setH(G.R, -0.26, 1.45, 0.22, e); setH(G.L, 0.26, 1.45, 0.22, e); K.open = Math.max(K.open, 0.7 * e); }],
  armsUp: [1.7, (u, e) => { setH(G.R, -0.3, 1.98, 0.08, e); setH(G.L, 0.3, 1.98, 0.08, e); bo('head', -0.2 * e, 0, 0); }],
  beckon: [1.5, (u, e) => { const c = 0.5 + 0.5 * S(u * 19); setH(G.R, -0.2, 1.25 + 0.12 * c, 0.52 - 0.2 * c, e); bo('handR', -1.2 * e - 0.6 * c * e, 0, 0); }],
  chinStroke: [2.3, (u, e) => { setH(G.R, -0.02, 1.5 + 0.02 * S(u * 19), 0.165, e); bo('head', 0.08 * e, 0, 0.1 * e); }],
  fistShake: [1.5, (u, e) => { setH(G.R, -0.3, 1.72 + 0.07 * S(u * 31), 0.25 + 0.05 * C(u * 31), e); bo('spine', 0.1 * e, 0, 0); }],
};

// ---------------------------------------------------------------------------------------------
// Work activities. Each has a base pose, tools, and a loop that places the hands every frame.
// space 'w': hand places are meters in front of the feet (the thing worked on stands in the world).
// space 't': hand places move with the torso (the work is carried on the body), so it also works while walking or seated.
// The comment on each says where the vignette must put the thing being worked on.
const ACTS = {
  // Soil about 0.9 m ahead.
  hoe: { space: 'w', props: { R: 'hoe' }, f(t) { const h = strike(cyc(t, 1.8)); bend(0.3 - 0.12 * h); bo('spine', 0.2 - 0.1 * h, 0, 0); bo('head', -0.25, 0, 0); two(-0.1, 0.7 + 0.5 * h, 0.4 - 0.06 * h, 0.75 - 1.25 * h, 0, 0.45, 0.16); } },
  // Standing grain 0.5 m ahead.
  reap: { space: 'w', props: { R: 'sickle' }, f(t) { const u = cyc(t, 1.6), s = ease(u / 0.45) - ease((u - 0.6) / 0.4); bend(0.55); bo('spine', 0.4, 0.15 * s, 0); bo('head', -0.4, 0, 0); hL(0.14, 0.55, 0.58); hR(-0.38 + 0.42 * s, 0.45, 0.5 + 0.1 * S(u * 6.28)); qR(0, 0.2 + 0.7 * s, 0); } },
  sow: { space: 't', props: { body: 'seedbag' }, f(t) { const u = cyc(t, 1.7), s = ease(u / 0.4) - ease((u - 0.55) / 0.45); hL(0.2, 1.13, 0.22); hR(0.1 - 0.62 * s, 1.1 + 0.12 * S(s * 3.14), 0.24 + 0.3 * s); bo('spine', 0, -0.25 * s, 0); bo('handR', -0.5 * s, 0, 0); } },
  // The animal stands side-on 0.55 m ahead; the pail is under it.
  milk: { pose: 'low', space: 'w', f(t) { const s = S(t * 5.5); bo('spine', 0.4, 0, 0); bo('head', 0.1, 0, 0); hR(-0.09, 0.4 + 0.06 * s, 0.52); hL(0.09, 0.4 - 0.06 * s, 0.52); } },
  // Pot rim at 0.75 m, center 0.6 m ahead.
  stir: { space: 'w', props: { R: 'ladle' }, f(t) { const a = t * 2.4; bo('spine', 0.18, 0, 0); bo('head', 0.15, 0, 0); hR(-0.03 + 0.12 * C(a), 1.12, 0.56 + 0.12 * S(a)); qR(0.25 * S(a), 0, -0.25 * C(a)); } },
  // Brazier top at 0.75 m, center 0.6 m ahead.
  grill: { space: 'w', props: { R: 'tongs', L: 'fan' }, f(t) { const u = cyc(t, 3.2); bo('spine', 0.15, 0, 0); bo('head', 0.2, 0, 0); hR(-0.2 + 0.3 * Math.abs(2 * u - 1), 0.98 + 0.05 * Math.abs(S(u * 19)), 0.36); qR(0.55, 0, 0); hL(0.3, 1.0, 0.38); qL(0.2 + 0.45 * S(t * 9), 0.3, 0); } },
  // Quern slab on the ground from 0.3 to 0.8 m ahead, top near 0.14 m.
  grind: { pose: 'kneel2', space: 'w', props: { R: 'stone' }, f(t) { const s = S(t * 3.2); bo('spine', 0.45 + 0.16 * s, 0, 0); bo('head', -0.3, 0, 0); hR(-0.1, 0.25, 0.5 + 0.13 * s); hL(0.1, 0.25, 0.5 + 0.13 * s); qR(0.25, 0, 0); } },
  // Table top at 0.82 m, 0.5 m ahead.
  knead: { space: 'w', f(t) { const s = S(t * 3.4), c = Math.abs(C(t * 3.4)); bo('spine', 0.25 + 0.08 * s, 0, 0); bo('head', 0.15, 0, 0); hR(-0.1, 0.9 + 0.05 * c, 0.44 + 0.08 * s); hL(0.1, 0.9 + 0.05 * c, 0.44 + 0.08 * s); } },
  // Loom standing 0.62 m ahead.
  weave: { space: 'w', f(t) { const u = cyc(t, 3), tri = Math.abs(2 * u - 1), up = bump(cyc(t, 1.5), 0.6, 0.8); hR(-0.3 + 0.55 * ease(tri), 1.22 + 0.2 * up, 0.5); hL(0.3, 1.5 + 0.06 * up, 0.5); bo('head', -0.1, 0.35 - 0.7 * tri, 0); } },
  spin: { space: 't', props: { L: 'distaff', R: 'spindle' }, f(t) { const u = cyc(t, 4.5), d = u < 0.8 ? ease(u / 0.8) : 1 - ease((u - 0.8) / 0.2); hL(0.3, 1.42, 0.16); qL(0.25, 0, -0.3); hR(-0.14, 1.36 - 0.3 * d, 0.3); qR(0, 0.5 * S(t * 7), 0); bo('head', 0.12, -0.2, 0); } },
  // Wheel head at 0.42 m, 0.5 m ahead, with the pot on it.
  pot: { pose: 'low', space: 'w', f(t) { bo('spine', 0.35, 0, 0); bo('head', 0.15, 0, 0); hR(-0.13, 0.6 + 0.1 * S(t * 1.6), 0.48); hL(0.13, 0.6 + 0.1 * S(t * 1.6 + 1.2), 0.5); } },
  // Anvil top at 0.74 m, 0.7 m ahead.
  hammer: { space: 'w', props: { R: 'hammer', L: 'tongs' }, f(t) { const h = strike(cyc(t, 1.15)); bo('spine', 0.28 - 0.14 * h, 0.14 * h, 0); bo('head', 0.1, 0, 0); hR(-0.14, 0.9 + 0.6 * h, 0.44 - 0.2 * h); qR(0.3 - 1.7 * h, 0, 0); hL(0.17, 0.84, 0.4); qL(0.12, -0.5, 0); } },
  // Stone face 0.65 m ahead, worked at 1.0 m.
  chisel: { space: 'w', props: { R: 'mallet', L: 'chisel' }, f(t) { const h = strike(cyc(t, 0.85)); bo('spine', 0.12, 0, 0); hL(0.05, 1.02, 0.42); qL(0.1, 0.1, 0); hR(-0.12, 1.05 + 0.28 * h, 0.25 - 0.06 * h); qR(0.1 - 1.1 * h, 0.3, 0); } },
  // Plank top at 0.7 m, 0.45 m ahead, lying left to right.
  saw: { space: 'w', props: { R: 'saw' }, f(t) { const s = S(t * 5); bend(0.25); bo('spine', 0.15, 0.1 * s, 0); bo('head', 0.1, 0, 0); hR(-0.12, 0.9, 0.3 + 0.15 * s); qR(0.3, 0, 0); hL(0.22, 0.77, 0.45); } },
  // Plank top at 0.6 m, 0.5 m ahead.
  adze: { space: 'w', props: { R: 'adze' }, f(t) { const h = strike(cyc(t, 1.3)); bend(0.3 - 0.1 * h); bo('spine', 0.15, 0, 0); bo('head', -0.1, 0, 0); two(-0.06, 0.88 + 0.42 * h, 0.3, 0.95 - 1.3 * h, 0, 0.3, 0.12); } },
  mend: { pose: 'ground', space: 't', f(t) { hR(-0.07 + 0.06 * S(t * 3), 1.12 + 0.05 * C(t * 3), 0.36); hL(0.1, 1.08, 0.38); bo('head', 0.3, 0, 0); } },
  // Table top at 0.8 m, 0.5 m ahead.
  gut: { space: 'w', props: { R: 'knife' }, f(t) { const s = S(t * 4); bo('spine', 0.2, 0, 0); bo('head', 0.2, 0, 0); hL(0.13, 0.87, 0.48); hR(-0.05, 0.89, 0.42 + 0.07 * s); qR(0.5, 0.5, 0); } },
  hawk: { space: 't', props: { R: 'fish' }, f(t) { const u = cyc(t, 5), call = bump(u, 0.15, 0.6); hR(-0.3, 1.78 + 0.05 * S(t * 3), 0.25); qR(0, 0, 0); if (call > 0.02) { setH(K.L, 0.09, 1.55, 0.17, call); K.open = call * (0.6 + 0.4 * S(t * 7)); } bo('head', -0.1 * call, 0.45 * S(t * 0.9), 0); } },
  haggle: { space: 't', f(t) { const s = S(t * 2.6), c = S(t * 1.7 + 1); hR(-0.22, 1.2 + 0.08 * s, 0.38); hL(0.22, 1.14 + 0.07 * c, 0.34); bo('handR', -0.9, 0, 0); bo('handL', -0.9, 0, 0); bo('head', 0, 0.2 * S(t * 3.3) * (c > 0 ? 1 : 0), 0.08 * s); K.open = 0.25 + 0.25 * S(t * 8); } },
  count: { space: 't', f(t) { const u = cyc(t, 1.1), k = bump(u, 0.1, 0.55); hL(0.1, 1.1, 0.3); bo('handL', -1.3, 0, 0); hR(mix(0.06, -0.18, k), mix(1.15, 1.0, k), mix(0.3, 0.4, k)); bo('head', 0.35, 0, 0); } },
  amphora: { space: 't', props: { body: 'amphora' }, f() { hL(0.3, 1.62, 0.12); bo('spine', 0, 0, -0.06); bo('head', 0, 0, -0.12); K.lockHead = 1; } },
  hydria: { space: 't', props: { body: 'hydria' }, f() { hR(-0.17, 1.92, 0.02); K.lockHead = 1; } },
  basket: { space: 't', props: { body: 'basket' }, f() { hR(-0.22, 1.02, 0.3); hL(0.22, 1.02, 0.3); bo('spine', -0.06, 0, 0); } },
  sack: { space: 't', props: { body: 'sack' }, f() { hR(-0.1, 1.5, 0.08); bo('spine', 0.3, 0, 0); bo('head', -0.2, 0, 0); } },
  // Ground 0.8 m ahead.
  sweep: { space: 'w', props: { R: 'broom' }, f(t) { const s = S(t * 2.6); bo('spine', 0.2, 0.2 * s, 0); bo('head', 0.1, 0, 0); two(-0.05 + 0.22 * s, 0.8, 0.3, 1.1, 0.4 * s, 0.4, 0.12); } },
  // Rope rising from the well mouth 0.55 m ahead.
  well: { space: 'w', f(t) { const u = cyc(t, 1.6), a = u < 0.5 ? ease(u * 2) : 1 - ease(u * 2 - 1); bend(0.22); bo('spine', 0.25 - 0.2 * a, 0, 0); hR(-0.03, 0.95 + 0.42 * a, 0.5); hL(0.03, 1.37 - 0.42 * a, 0.5); } },
  // Trough top at 0.45 m, 0.55 m ahead.
  wash: { pose: 'kneel2', space: 'w', props: { R: 'cloth' }, f(t) { const s = S(t * 4); bo('spine', 0.4 + 0.1 * s, 0, 0); bo('head', -0.2, 0, 0); hR(-0.1, 0.56, 0.5 + 0.11 * s); hL(0.1, 0.56, 0.5 + 0.11 * s); } },
  write: { space: 't', props: { L: 'tablet', R: 'stylus' }, f(t) { hL(0.1, 1.16, 0.27); qL(-0.7, 0.2, 0); hR(0.06 + 0.05 * S(t * 5), 1.24 + 0.012 * S(t * 13), 0.3); bo('head', 0.35, -0.1, 0); } },
  knuckle: { pose: 'crouch', space: 't', f(t) { const u = cyc(t, 2.2), k = bump(u, 0.1, 0.4); hR(-0.2, 0.98 + 0.3 * k, 0.45); bo('handR', -1.4 * k, 0, 0); hL(0.2, 0.95, 0.4); bo('head', -0.35 * k, 0, 0); } },
  aulos: { space: 't', props: { body: 'aulos' }, f(t) { hR(-0.065, 1.44, 0.32); hL(0.065, 1.44, 0.32); bo('spine', 0.04 * S(t * 2), 0, 0.06 * S(t * 1.6)); K.lockHead = 1; K.open = 0.2; } },
  lyre: { space: 't', props: { body: 'lyre' }, f(t) { hL(0.24, 1.3, 0.2); hR(0.14 + 0.07 * S(t * 4.2), 1.24, 0.27); bo('head', 0.1, 0.2, 0.08); } },
  drink: { space: 't', props: { R: 'cup' }, f(t) { const k = bump(cyc(t, 5.5), 0.5, 0.8); hR(mix(-0.22, -0.03, k), mix(1.03, 1.5, k), mix(0.33, 0.2, k)); qR(-0.2 - 0.9 * k, 0, 0); bo('head', -0.25 * k, 0, 0); } },
  pray: { space: 't', f(t) { const s = 0.02 * S(t * 0.9); hR(-0.34, 1.78 + s, 0.3); hL(0.34, 1.78 + s, 0.3); bo('handR', 1.0, 0, 0); bo('handL', 1.0, 0, 0); bo('head', -0.35, 0, 0); bo('spine', -0.08, 0, 0); K.lockHead = 1; } },
  doze: { pose: 'groundOut', space: 't', f(t) { const s = S(t * 1.1); bo('spine', 0.03 * s, 0, 0); bo('head', 0.5 + 0.03 * s, 0, 0.25); K.lid = 1; K.lockHead = 1; } },
  lean: { space: 't', props: { R: 'staff' }, f() { hR(-0.02, 1.24, 0.38); qR(0, 0, 0); hL(0.04, 1.3, 0.38); bo('spine', 0.22, 0, 0); bo('head', -0.12, 0, 0); } },
  fish: { space: 't', props: { R: 'rod' }, f(t) { const j = bump(cyc(t, 6), 0.7, 0.76); two(-0.08, 1.05 + 0.06 * j, 0.34, -0.45 - 0.12 * j, 0, 0.26, 0.1); } },
  lead: { space: 't', props: { R: 'rope' }, f() { hR(-0.3, 0.98, -0.16); } },
  herd: { space: 't', props: { R: 'crook' }, f() { hR(-0.27, 1.08, 0.24); qR(0, 0, 0); } },
  // Heap of grain and straw 0.9 m ahead.
  fork: { space: 'w', props: { R: 'fork' }, f(t) { const h = strike(cyc(t, 2.2)); bend(0.25 - 0.15 * h); bo('spine', 0.15, 0.25 * h, 0); two(-0.08, 0.85 + 0.4 * h, 0.32, 0.6 - 1.0 * h, 0.3 * h, 0.5, 0.14); } },
  // Bellows handles at 0.6 m, 0.42 m ahead.
  bellows: { space: 'w', f(t) { const s = S(t * 2.8); bend(0.3); bo('spine', 0.25 + 0.1 * s, 0, 0); bo('head', -0.25, 0, 0); hR(-0.1, 0.62 + 0.16 * s, 0.42); hL(0.1, 0.62 + 0.16 * s, 0.42); } },
  // The customer sits 0.5 m ahead with his head near 1.15 m.
  shave: { space: 'w', props: { R: 'knife' }, f(t) { bo('spine', 0.15, 0, 0); bo('head', 0.2, 0, 0); hL(0.1, 1.27, 0.42); hR(-0.07 + 0.03 * S(t * 2.2), 1.15 + 0.04 * S(t * 2.2), 0.4); qR(-0.5, 0.6, 0); } },
  // Rowing, seated, facing the stern (harbor-boats.js, 2026-11-19): reach forward with both hands, then pull them in
  // to the chest while leaning back. One stroke every 2.6 s; the boat's oars follow the same cycle (rowPull).
  row: { pose: 'sit', space: 'w', f(t) { const p = rowPull(t), reach = 1 - p; bo('spine', 0.38 * reach - 0.14 * p, 0, 0); bo('head', -0.12 * reach + 0.06 * p, 0, 0); hR(-0.27, 0.74 + 0.05 * p, 0.2 + 0.5 * reach); hL(0.27, 0.74 + 0.05 * p, 0.2 + 0.5 * reach); } },
  dance: { space: 't', f(t) { const s = S(t * 3.1); hR(-0.42, 1.5 + 0.16 * s, 0.14); hL(0.42, 1.5 - 0.16 * s, 0.14); bo('spine', 0, 0.3 * s, 0.08 * s); bo('hips', 0, -0.2 * s, 0); bo('thighL', -0.35 * Math.max(0, s), 0, 0); bo('shinL', 0.6 * Math.max(0, s), 0, 0); bo('thighR', -0.35 * Math.max(0, -s), 0, 0); bo('shinR', 0.6 * Math.max(0, -s), 0, 0); K.lift = 0.03 * Math.abs(C(t * 3.1)); } },
};
const ACT_ALIAS = { scatter: 'sow', quern: 'grind', sell: 'hawk', coins: 'count', tablet: 'write', knucklebones: 'knuckle', net: 'mend', rope: 'well', skewers: 'grill', mason: 'chisel', wheel: 'pot', loom: 'weave', staff: 'lean', rod: 'fish', cup: 'drink' };
export const ACTIVITIES = Object.keys(ACTS), MOOD_NAMES = Object.keys(MOODS), GESTURE_NAMES = Object.keys(GESTURES), POSE_NAMES = Object.keys(POSES);

// ---------------------------------------------------------------------------------------------
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _tt = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _pH = new THREE.Vector3(), _pS = new THREE.Vector3(), _tg = new THREE.Vector3(), _p = new THREE.Vector3(), _pole = new THREE.Vector3();
const _qRoot = new THREE.Quaternion(), _qH = new THREE.Quaternion(), _qS = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const XAXIS = new THREE.Vector3(1, 0, 0), ZERO = [0, 0, 0], _t3 = [0, 0, 0];
// Turn a bone so its length (-y) lies along `dir` and its hinge (x) along `hinge`.
function basis(dir, hinge, q) { _y.copy(dir).negate(); _x.copy(hinge); _z.crossVectors(_x, _y); _m.makeBasis(_x, _y, _z); q.setFromRotationMatrix(_m); }
// Two-bone limb: joint at S, end wanted at T (both in the parent bone's space). The middle joint bends toward `pole`.
// sg is +1 for arms and -1 for legs. Writes q1 for the upper bone and q2 for the lower bone.
function solve2(Sx, Sy, Sz, T, l1, l2, pole, sg, q1, q2) {
  _d.set(T.x - Sx, T.y - Sy, T.z - Sz); const dist = clamp(_d.length(), Math.abs(l1 - l2) + 0.02, (l1 + l2) * 0.998); _d.normalize();
  const a1 = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  _n.crossVectors(_d, pole); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize().multiplyScalar(sg);
  _tt.crossVectors(_n, _d).multiplyScalar(sg);
  _u.copy(_d).multiplyScalar(Math.cos(a1)).addScaledVector(_tt, Math.sin(a1));
  _f.copy(_d).multiplyScalar(dist).addScaledVector(_u, -l1).normalize();
  basis(_u, _n, q1); basis(_f, _n, _qw); q2.copy(q1).invert().multiply(_qw);
}

export const figureMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// ---------------------------------------------------------------------------------------------
// Smooth people built in Blender (blender/people.py, from the MakeHuman base mesh). A kit file holds the parts of
// one body: faces, garments, hair, beards. All are made for these same bones, with the kit's own joint places, so
// every pose, gesture, and activity works on them. An Actor picks the parts that fit its look and colors them.
// When no kit fits a look (or its file did not load) the low-polygon figure is built instead. The low-polygon
// figure also stands in for a smooth person who is far away.
export const MODELS = {};
// Joint places the posing code needs. These are the low-polygon figure's; a kit brings its own.
const DIM0 = { shX: 0.205, shY: 0.26, shZ: 0, arm: 0.29, fore: 0.26, palm: 0.05, hipX: 0.095, hipY: -0.03, hipZ: 0, thigh: 0.44, shin: 0.42, ankle: 0, armOut: 0.07, headUp: 0.12 };
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
// Light wraps a little way past the edge of the lit side, by an amount set for skin, cloth, hair, and eyes.
const LAMBERT_WRAP = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + gWrap ) / ( 1.0 + gWrap ) );');
// Every vertex of a part names a slot; the Actor gives each slot a color. "fixed" parts carry their own colors.
const SLOTS = { skin: 0, robe: 1, robe2: 2, hair: 3, fixed: 4, accent: 5, leaf: 6, trim: 7 };
function makeModelMaterial(colors) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const cols = []; for (let i = 0; i < 8; i++) cols.push(new THREE.Color(1, 1, 1));
  m.userData.cols = cols; setSlotColors(m, colors);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCol = { value: cols };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aux;\nvarying vec2 vAux;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aux;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vAux;\nuniform vec3 uCol[ 8 ];\nfloat gWrap = 0.0;')
      .replace('#include <lights_lambert_pars_fragment>', LAMBERT_WRAP)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= 1.3;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // aux.x: the slot. aux.y: meters from a cloth edge that carries a border.
        int slot = int( floor( vAux.x + 0.5 ) );
        // How much the distance from the cloth edge changes across one pixel (worked out here, outside any branch,
        // because the chip can only measure it where all four pixels of a 2 by 2 block run the same code).
        float edgeFw = max( fwidth( vAux.y ), 1e-4 );
        gWrap = slot == 0 ? 0.32 : ( slot == 1 || slot == 2 ) ? 0.2 : slot == 4 ? 0.5 : 0.15;
        vec3 tintOnly = diffuseColor.rgb;
        diffuseColor.rgb *= uCol[ slot ];
        if ( slot == 1 || slot == 2 ) {
          // The border: a band 22 mm wide at the edge and a line 5.5 mm wide beside it. Each is drawn as the share
          // of the pixel it covers, so a line thinner than a pixel shows as a faint stripe instead of blinking on and
          // off as the cloth or the camera moves.
          float e = vAux.y, fw = edgeFw;
          float band = clamp( ( 0.02175 - e ) / fw + 0.5, 0.0, 1.0 );
          float line = clamp( ( min( e + 0.5 * fw, 0.03475 ) - max( e - 0.5 * fw, 0.02925 ) ) / fw, 0.0, 1.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, uCol[ 7 ] * tintOnly, max( band, line ) );
        }`);
  };
  m.customProgramCacheKey = () => 'people-model-3';
  return m;
}
function setSlotColors(m, colors) { const cols = m.userData.cols; for (const k in SLOTS) if (k !== 'fixed') cols[SLOTS[k]].set(colors[k] != null ? colors[k] : 0xffffff); }
function parseKit(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x50534943) throw new Error('not a people file');
  const jl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
  if (head.version !== 2) throw new Error('old people file');
  const n = head.verts, nt = head.tris; let o = 8 + jl;
  const pos = new Float32Array(buf.slice(o, o + n * 12)); o += n * 12;
  const nb = new Int8Array(buf, o, n * 4); o += n * 4;
  const cb = new Uint8Array(buf, o, n * 4); o += n * 4;
  const ib = new Uint8Array(buf, o, n * 4); o += n * 4;
  const wb = new Uint8Array(buf, o, n * 4); o += n * 4;
  const idx = new Uint16Array(buf.slice(o, o + nt * 6));
  const nor = new Float32Array(n * 3), col = new Float32Array(n * 3), aux = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const map = head.boneOrder.map((b) => BI[b]);
  for (let i = 0; i < n; i++) {
    const slot = cb[i * 4 + 3];
    // A tint is a multiple of the slot's color, stored at half size. Fixed parts store their own color the same way.
    for (let k = 0; k < 3; k++) { nor[i * 3 + k] = nb[i * 4 + k] / 127; const t = cb[i * 4 + k] / 127.5; col[i * 3 + k] = slot === 4 ? toLin(Math.min(1, t)) : Math.pow(t, 2.2); }
    aux[i * 2] = slot; aux[i * 2 + 1] = (nb[i * 4 + 3] / 127) * 0.128;
    let s = 0; for (let k = 0; k < 4; k++) s += wb[i * 4 + k];
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = map[ib[i * 4 + k]]; sw[i * 4 + k] = wb[i * 4 + k] / (s || 1); }
  }
  const B = head.bones, d = (a, b, k) => B[a][k] - B[b][k], parts = {};
  for (const p of head.parts) parts[p.name] = p;
  const D = { shX: B.armL[0], shY: d('armL', 'spine', 1), shZ: B.armL[2], arm: -d('foreL', 'armL', 1), fore: -d('handL', 'foreL', 1), palm: 0.05,
    hipX: B.thighL[0], hipY: d('thighL', 'hips', 1), hipZ: B.thighL[2], thigh: -d('shinL', 'thighL', 1), shin: -d('footL', 'shinL', 1), ankle: B.footL[1] - 0.04,
    armOut: head.armOut, headUp: head.eyeY - B.head[1] };
  return { name: head.name, head, pos, nor, col, aux, si, sw, idx, parts, bones: B, D, lid: head.lidOpen - head.lidShut, geo: new Map(),
    faces: head.parts.filter((p) => p.name.startsWith('skin:')).map((p) => p.name.slice(5)) };
}
// One mesh out of the named parts of a kit. People who wear the same parts share it.
function composeGeometry(kit, names) {
  const key = names.join('|'); let g = kit.geo.get(key); if (g) return g;
  const ps = names.map((n) => kit.parts[n]).filter(Boolean);
  let nv = 0, ni = 0; for (const p of ps) { nv += p.nv; ni += p.ni; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), aux = new Float32Array(nv * 2), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v = 0, i = 0;
  for (const p of ps) {
    const a = p.v0, b = p.v0 + p.nv;
    pos.set(kit.pos.subarray(a * 3, b * 3), v * 3); nor.set(kit.nor.subarray(a * 3, b * 3), v * 3); col.set(kit.col.subarray(a * 3, b * 3), v * 3);
    aux.set(kit.aux.subarray(a * 2, b * 2), v * 2); si.set(kit.si.subarray(a * 4, b * 4), v * 4); sw.set(kit.sw.subarray(a * 4, b * 4), v * 4);
    for (let k = 0; k < p.ni; k++) idx[i + k] = kit.idx[p.i0 + k] + v;
    v += p.nv; i += p.ni;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aux', new THREE.BufferAttribute(aux, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  kit.geo.set(key, g); return g;
}
const lum = (hex) => { const c = new THREE.Color(hex); return 0.3 * c.r + 0.6 * c.g + 0.1 * c.b; };
// Which kit, which of its parts, and which colors make the person a look describes. Null when no kit can.
// A look may name them itself: model (the kit), face, wear (a list of garments). Otherwise they follow from the
// same words the low-polygon figure reads: woman, age, dress, length, robe2, bare, hairStyle, beard, hat.
function modelFor(spec, seed) {
  if (spec.model === false) return null;
  const s = fullSpec(spec), child = s.age === 'child';
  if (s.hairStyle === 'veil' && (!s.beard || s.beard === 'none')) s.woman = true;      // a veiled head is a woman's, whatever else the look says
  const kit = MODELS[spec.model || (child ? 'child' : s.woman ? 'woman' : 'man')];
  if (!kit) return null;
  const has = (n) => !!kit.parts[n], parts = [];
  // face
  let face = spec.face && has('skin:' + spec.face) ? spec.face : null;
  if (!face) { const pools = kit.head.pools || {}, pool = (s.age === 'old' && pools.old) || (child && s.woman && pools.girl) || pools.any || kit.faces; face = pool[seed % pool.length]; }
  parts.push('skin:' + face);
  // garments
  const short = s.length === 'short';
  if (spec.wear) parts.push(...spec.wear.map((w) => 'g:' + w));
  else if (has('g:peplos') && (s.woman && !child || !has('g:tunic_long'))) parts.push('g:peplos');
  else if ((s.dress === 'exomis' || (s.bare && short)) && has('g:exomis')) parts.push('g:exomis');
  else if (s.bare && has('g:wrap_bare')) parts.push('g:wrap_bare');
  else {
    const len = short && !(child && s.woman) ? 'short' : 'long', cloak = (s.robe2 || s.bare) && has('g:wrap');
    parts.push(cloak && has('g:under_' + len) ? 'g:under_' + len : 'g:tunic_' + len); if (cloak) parts.push('g:wrap');
  }
  // hair, beard, wreath
  const want = { full: ['full'], curls: ['curls', 'full'], receding: ['receding', 'full'], bald: ['bald'], long: ['long', 'tail', 'full'], bun: ['bun', 'tail'], veil: ['veil', 'bun', 'tail'], none: [] }[s.hairStyle] || ['full'];
  const hair = spec.hairPart || want.find((h) => has('hair:' + h)); if (hair) parts.push('hair:' + hair);
  if (s.beard && s.beard !== 'none' && !s.woman && !child) { const b = [s.beard, 'full', 'short'].find((x) => has('beard:' + x)); if (b) parts.push('beard:' + b); }
  const leafy = s.hat === 'wreath' || s.hat === 'goldWreath';
  if (leafy && has('hat:wreath')) parts.push('hat:wreath');
  const robe = s.robe, veil = hair === 'veil';
  const colors = { skin: SKIN[s.skin] || s.skin, robe, robe2: s.robe2 || (veil ? shade(robe, 0.8) : shade(robe, 0.72)), hair: s.hair,
    accent: spec.belt != null ? spec.belt : 0x6b4a32, leaf: s.hat === 'goldWreath' ? 0xd9a93c : 0x5f7a3a,
    trim: s.trim != null ? s.trim : lum(robe) > 0.25 ? shade(robe, 0.66) : 0xe9e2d0 };
  return { kit, parts: parts.filter(has), colors, lowHat: !leafy && s.hat && s.hat !== 'none' };
}
// Load the kit files. Call before making any Actor. A file that fails to load is skipped, and the looks it would
// have served get the low-polygon figure.
export async function loadPeople(names = ['mika', 'man', 'woman', 'socrates', 'child'], base = './assets/people/') {
  await Promise.all(names.map(async (n) => {
    try { const r = await fetch(base + n + '.bin'); if (!r.ok) throw new Error(r.status); MODELS[n] = parseKit(await r.arrayBuffer()); } catch (e) { console.warn('People kit ' + n + ' not loaded:', e && e.message); }
  }));
  return MODELS;
}

// Posing a person (Actor.update) is the costly part of the game's step: about 75 microseconds each on Intel UHD 620,
// and it ran for every person within 60 m at every step, two steps a drawn frame (9 ms a frame in the market,
// measured 2026-11-15). Now people queue the time that has passed (queue) and the game poses the queue once per
// drawn frame (poseQueued): near people every frame, farther ones and those behind the camera less often. Their
// place on the ground still moves at every step.
const QUEUED = new Set(), _cf = new THREE.Vector3();
export function poseQueued(camera) {
  if (!QUEUED.size) return;
  camera.getWorldDirection(_cf);
  const fl = Math.hypot(_cf.x, _cf.z) || 1, fx = _cf.x / fl, fz = _cf.z / fl, cx = camera.position.x, cz = camera.position.z;
  for (const a of QUEUED) {
    const m = a.group.matrixWorld.elements, dx = m[12] - cx, dz = m[14] - cz, d = Math.hypot(dx, dz);
    const ahead = d < 6 || (dx * fx + dz * fz) / d > 0.35;
    // seconds a pose may wait: 0 every frame; 0.03 every frame at 30 a second, every other at 60; 0.065 about 15 times
    // a second; 0.095 about 10 times a second
    const wait = d < 15 ? 0 : !ahead ? 0.095 : d < 35 ? 0.03 : 0.065;
    if (a.pend >= wait) { const t = a.pend, q = a.pendQ; a.pend = 0; QUEUED.delete(a); a.update(t, q); }
  }
}

// How the wearer of the ring looks to the player: a pale figure you can see through, brighter at its edges. It is
// drawn in two steps (two groups over the same triangles): first only its depth, then its color where it is the
// nearest surface. Without the first step the far side of the clothes and the body under them would show through.
let GHOST = null;
function ghostMaterials() {
  if (GHOST) return GHOST;
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, side: THREE.DoubleSide });
  const body = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.78, 0.9, 1.0) }, uGain: { value: 1.25 } },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = transformedNormal; vV = -mvPosition.xyz; vY = (modelMatrix * vec4(transformed, 1.0)).y;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uGain;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = f * f;
        float wave = 0.5 + 0.5 * sin(vY * 24.0 - uTime * 2.4);
        float a = 0.1 + 0.8 * rim + 0.06 * wave * wave;
        gl_FragColor = vec4(uColor * uGain * (0.8 + 0.7 * rim), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return (GHOST = [depth, body]);
}
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Actor {
  // Let time pass for this person without posing it yet (see poseQueued). The place is updated at once.
  queue(dt, quality = 1) { this.pend = Math.min((this.pend || 0) + dt, 0.25); this.pendQ = quality; QUEUED.add(this); this.sync(); }
  constructor(spec = {}, seed = 1) {
    this.spec = spec; this.seed = seed;
    this.group = new THREE.Group();
    this.bones = {}; const list = [];
    const pick = modelFor(spec, seed), M = pick ? pick.kit : null; this.model = M; this.pick = pick; this.D = M ? M.D : DIM0;
    for (const [name, parent, x, y, z] of BONES) {
      const bone = new THREE.Bone(); bone.name = name;
      if (M) { const p = M.bones[name], q = parent ? M.bones[parent] : ZERO; bone.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); } else bone.position.set(x, y, z);
      this.bones[name] = bone; list.push(bone);
      if (parent) this.bones[parent].add(bone);
    }
    // Where the face bones rest, for a model (its face is moved by turning lids and jaw, not by sliding patches).
    this.face0 = null; if (M) { this.face0 = {}; for (const n of ['browL', 'browR', 'mouthL', 'mouthR']) this.face0[n] = this.bones[n].position.clone(); }
    this.material = M ? makeModelMaterial(pick.colors) : spec.ownMaterial ? figureMaterial.clone() : figureMaterial;
    this.material2 = M && spec.ownMaterial ? figureMaterial.clone() : figureMaterial;      // for a smooth person's low-polygon hat and tools
    this.geoNear = M ? composeGeometry(M, pick.parts) : null; this.geoMid = null;
    this.mesh = new THREE.SkinnedMesh(M ? this.geoNear : buildFigure(spec, seed), this.material);
    this.mesh.add(this.bones.root);
    this.mesh.bind(new THREE.Skeleton(list));
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.6);
    this.mesh.frustumCulled = true;
    // A kit's child is already shaped like one; the low-polygon child is the adult figure with its bones resized.
    const child = spec.age === 'child' && !M, h = spec.height || (spec.age === 'child' ? 0.62 : 1), wide = M ? 1 + 0.4 * ((spec.build || 1) - 1) : 1;
    this.h = h; this.mesh.scale.set(h * wide, h, h * wide);
    // A child is the same figure with a larger head and shorter limbs.
    this.legS = child ? 0.84 : 1; this.armS = child ? 0.88 : 1; this.lift0 = -0.9 * (1 - this.legS);
    if (child) { this.bones.head.scale.setScalar(1.3); for (const n of ['thighL', 'thighR']) this.bones[n].scale.setScalar(this.legS); for (const n of ['armL', 'armR']) this.bones[n].scale.setScalar(this.armS); }
    this.stoop = spec.age === 'old' ? 1 : 0;
    this.group.add(this.mesh);
    // state
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.height = (M ? M.head.height - 0.04 : 1.72 + this.lift0 + (child ? 0.07 : 0)) * h;
    this.pose = 'stand'; this.walk = 0; this.phase = (seed * 1.7) % 6; this.speed = 0;
    this.talking = 0; this.talkT = seed * 3.1; this.gesture = spec.gesture || 1; this.speaking = false;
    this.lookAt = null; this.headYaw = 0; this.headPitch = 0;
    this.cur = {}; for (const n of ANIM_BONES) this.cur[n] = [0, 0, 0];
    this.lift = 0; this.rootX = 0; this.t = seed * 0.37; this.extra = null;
    this.visible = true;
    // mood and face
    this.mood = 'neutral'; this.M = Object.assign({}, MOOD0); this.mR = MOODS.neutral.hR.slice(); this.mL = MOODS.neutral.hL.slice();
    this.blinkT = 1 + (seed % 7) * 0.5; this.blink = 0; this.blinkN = 0;
    // talking style, different for each person
    const r = mulberry32(seed * 31 + 7);
    this.gs = { dom: r() < 0.8 ? 'R' : 'L', f: 0.85 + 0.4 * r(), both: 0.5 + 0.9 * r(), ph: r() * 6, amp: 0.75 + 0.5 * r() };
    // activity, one-shot gesture, and limb placement
    this.act = null; this.actOn = false; this.actW = 0; this.actT = 0; this.actPose = null; this.actSpeed = 1; this.props = null;
    this.shot = null; this.held = { R: false, L: false };
    this.legW = 0; this.feet = [0.2, 0.2, 0.05, 0.04, 0]; this.poseHW = 0; this.pR = [-0.2, 1, 0.3]; this.pL = [0.2, 1, 0.3];
    // A smooth person: near is the kit's mesh (plus low-polygon hat and tools), far is the low-polygon figure.
    this.lod = 0; this.near = true; this.far = null; this.extras = null;
    if (M) this._extras();
  }
  attach(boneName, obj) { this.bones[boneName].add(obj); if (boneName === 'handR') this.held.R = true; if (boneName === 'handL') this.held.L = true; return obj; }
  place(x, z, heading, y) { this.x = x; this.z = z; if (heading != null) this.heading = heading; if (y != null) this.y = y; this.sync(); }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.heading; }
  headWorld(out) { return this.bones.head.getWorldPosition(out || new THREE.Vector3()).add(_v.set(0, this.D.headUp, 0)); }
  face(x, z, dt, k = 8) { const want = Math.atan2(x - this.x, z - this.z); this.heading = dt ? dampAngle(this.heading, want, k, dt) : want; }
  get triangles() { const g = this.mesh.geometry; return (g.index ? g.index.count : g.attributes.position.count) / 3; }
  // Move low-polygon triangles from that figure's joints to this kit's, so they sit right on its bones.
  _lowShift(b) {
    const B = this.model.bones, top = this.model.head.height - 1.757;
    for (let i = 0; i < b.bone.length; i++) {
      const k = b.bone[i], n = BONES[k][0], o = BIND[n], q = B[n];
      if (k === BI.head || k >= BI.browL) { b.pos[i * 3 + 1] += top; b.pos[i * 3 + 2] += 0.012; }       // heads line up at the crown
      else { b.pos[i * 3] += q[0] - o[0]; b.pos[i * 3 + 1] += k === BI.footL || k === BI.footR ? 0 : q[1] - o[1]; b.pos[i * 3 + 2] += q[2] - o[2]; }
    }
  }
  _low(geometry) {
    const m = new THREE.SkinnedMesh(geometry, this.material2); m.bind(this.mesh.skeleton, this.mesh.bindMatrix);
    m.scale.copy(this.mesh.scale); m.castShadow = this.mesh.castShadow; m.boundingSphere = this.mesh.boundingSphere; this.group.add(m); if (this.ghost) this._ghostMesh(m); return m;
  }
  // A smooth person's hat (other than a wreath) and the tools of its activity: low-polygon, on the same bones.
  _extras() {
    if (this.extras) { this.group.remove(this.extras); this.extras.geometry.dispose(); this.extras = null; }
    const lod = this.lod;
    if (this.far) { this.group.remove(this.far); this.far.geometry.dispose(); this.far = null; }
    const b = new Builder(this.seed), s = fullSpec(this.spec);
    if (this.pick.lowHat) addHat(b, s, HY, s.robe2 || s.robe);
    if (this.props) addTools(b, this.props);
    if (b.tris) { this._lowShift(b); this.extras = this._low(b.geometry()); }
    this.lod = -1; this.setLod(lod);
  }
  // Three levels of a smooth person: 0 the kit's full mesh, 1 its thinned mesh for the middle distance,
  // 2 the low-polygon figure for far away (built the first time it is needed).
  setLod(l) {
    if (!this.model || l === this.lod) return;
    this.lod = l; this.near = l < 2;
    if (l === 2 && !this.far) this.far = this._low(buildFigure(this.spec, this.seed, this.props ? (b) => addTools(b, this.props) : null, (b) => this._lowShift(b)));
    if (l < 2) this.mesh.geometry = l === 0 ? this.geoNear : this.geoMid || (this.geoMid = composeGeometry(this.model, this.pick.parts.map((n) => (this.model.parts['m:' + n] ? 'm:' + n : n))));
    if (this.ghost && l < 2) this._ghostMesh(this.mesh);
    this.mesh.visible = l < 2; if (this.extras) this.extras.visible = l < 2; if (this.far) this.far.visible = l === 2;
  }
  // Pick the level from the distance to whoever is looking, with some slack so it does not flicker at a boundary.
  setDistance(d) { const l = this.lod; this.setLod(d < (l === 0 ? 7.5 : 6) ? 0 : d < (l === 2 ? 19 : 22) ? 1 : 2); }
  setNear(on) { this.setLod(on ? 0 : 2); }
  shadows(on) { this.mesh.castShadow = on; if (this.extras) this.extras.castShadow = on; if (this.far) this.far.castShadow = on; }
  // The ring: show this person as a pale see-through figure (see ghostMaterials), or as usual again.
  setGhost(on) {
    on = !!on; if (on === !!this.ghost) return;
    this.ghost = on;
    for (const m of [this.mesh, this.extras, this.far]) if (m) this._ghostMesh(m);
  }
  _ghostMesh(m) {
    const g = m.geometry; g.clearGroups();
    if (this.ghost) { g.addGroup(0, Infinity, 0); g.addGroup(0, Infinity, 1); m.material = ghostMaterials(); }
    else m.material = m === this.mesh ? this.material : this.material2;
  }
  // Change the look in place (the ring story dresses the player as other people).
  setLook(spec) {
    this.spec = Object.assign({}, spec, this.spec.ownMaterial ? { ownMaterial: true } : null);
    if (!this.model) { this.mesh.geometry.dispose(); this.mesh.geometry = buildFigure(spec, this.seed); return; }
    const pick = modelFor(spec, this.seed);
    if (!pick || pick.kit !== this.model) { console.warn('That look needs another body; keeping the present one.'); return; }
    this.pick = pick; this.geoNear = composeGeometry(this.model, pick.parts); this.geoMid = null; setSlotColors(this.material, pick.colors); this._extras();
  }
  // Play a short gesture over whatever the figure is doing. Returns its length in seconds.
  play(name, opts = {}) { const g = GESTURES[name]; if (!g) return 0; const sp = opts.speed || 1; this.shot = { g, t: 0, sp, o: opts }; return g[0] / sp; }

  // Start a work activity (or stop with null). opts: { pose, props, phase, speed }.
  setActivity(name, opts = {}) {
    name = ACT_ALIAS[name] || name; const def = name ? ACTS[name] : null;
    let props = null;
    if (def) { this.act = name; this.actOn = true; this.actT = opts.phase != null ? opts.phase : (this.seed * 0.77) % 5; this.actPose = opts.pose || def.pose || null; this.actSpeed = opts.speed || 1; props = opts.props === null ? null : Object.assign({}, def.props, opts.props); }
    else this.actOn = false;
    const sig = props ? JSON.stringify(props) : '';
    if (sig !== (this.propSig || '')) {
      this.propSig = sig; this.props = props;
      if (this.model) this._extras();
      else { this.mesh.geometry.dispose(); this.mesh.geometry = buildFigure(this.spec, this.seed, props ? (b) => addTools(b, props) : null); }
    }
    return this;
  }
  // Jump straight to the settled pose (for figures that appear already at work).
  settle(n = 40) { for (let i = 0; i < n; i++) this.update(1 / 20); return this; }

  update(dt, quality = 1) {
    this.t += dt; if (this.ghost) GHOST[1].uniforms.uTime.value = this.t;
    const def = this.act ? ACTS[this.act] : null, D = this.D, armX = D.armOut - 0.07;
    this.actW = damp(this.actW, this.actOn ? 1 : 0, 7, dt);
    if (def && !this.actOn && this.actW < 0.02) { this.act = null; this.actW = 0; }
    const P = POSES[(this.actOn && this.actPose) || this.pose] || POSES.stand, base = POSES.stand, k = 9;
    const moving = clamp(this.speed / 1.6, 0, 1), short = shortDress(this.spec);
    this.walk = damp(this.walk, moving, 10, dt);
    // The gait. Steps a second rise with speed, and so does the stride. A long robe limits how far the leg can
    // swing, so past that the steps come faster instead of longer, which keeps the feet planted. Above about
    // 4 m/s the walk turns into a run: the weight is off the ground part of each stride, the knees lift, the
    // body leans in, and the elbows bend.
    const v = Math.max(0, this.speed), Ls = Math.max(0.6, this.h * this.legS);
    const runT = clamp((v - 3.8) / 1.6, 0, 1), runK = runT * runT * (3 - 2 * runT), stance = 1 - 0.45 * runK;
    const maxA = short ? 0.56 + 0.16 * runK : 0.42, legL = 0.88 * Ls, reachMax = 2 * legL * Math.sin(maxA) / stance;
    const cad = Math.max((1.8 - 1.15 * Math.exp(-v / 2.6)) / Math.sqrt(Ls), v / (2 * reachMax));      // strides a second
    const stepLen = v / (2 * cad);
    const aWant = Math.asin(clamp(stepLen * stance / (2 * legL), 0, Math.sin(maxA)));
    this.gaitA = damp(this.gaitA || 0, aWant, 8, dt); this.runK = damp(this.runK || 0, runK, 5, dt);
    this.phase += 2 * Math.PI * cad * dt * clamp(v / 0.3, 0, 1);
    const wk = this.walk, ph = this.phase, rk = this.runK * wk;
    const A = this.gaitA * wk, s = Math.sin(ph);
    // Bare legs show everything a long robe hides, so their walk is shaped more closely (Roman, 2026-11-15: the
    // shepherd "walks funny": his legs opened like a pair of compasses and his feet hung in the air).
    const bare = short && !!this.model;
    this.talking = damp(this.talking, this.speaking ? 1 : 0, 6, dt);
    if (this.speaking) this.talkT += dt;
    const tk = this.talking * this.gesture, tt = this.talkT;
    // Blend the mood numbers toward the current mood (about a quarter of a second).
    const MT = MOODS[this.mood] || MOODS.neutral, M = this.M, mk = 1 - Math.exp(-12 * dt);
    for (const key of MOOD_KEYS) M[key] += (MT[key] - M[key]) * mk;
    for (let i = 0; i < 3; i++) { this.mR[i] += (MT.hR[i] - this.mR[i]) * mk; this.mL[i] += (MT.hL[i] - this.mL[i]) * mk; }
    // Clear the scratch space, then let the activity, the talking, and the one-shot gesture write into it.
    for (const n of ANIM_BONES) { const v = K.b[n]; v[0] = v[1] = v[2] = 0; }
    K.R.w = K.L.w = G.R.w = G.L.w = 0; K.R.hasQ = K.L.hasQ = false; K.open = -1; K.lid = -1; K.lift = 0; K.shrug = 0; K.lockHead = 0;
    if (def) {
      this.actT += dt * this.actSpeed; def.f(this.actT, this);
      const w = this.actW;
      if (w < 0.999) { for (const n of ANIM_BONES) { const v = K.b[n]; v[0] *= w; v[1] *= w; v[2] *= w; } K.R.w *= w; K.L.w *= w; K.lift *= w; K.lockHead *= w; if (K.open > 0) K.open *= w; if (K.lid > 0) K.lid *= w; }
    }
    const actOpen = K.open, actLid = K.lid;
    if (tk > 0.01) {
      const g = this.gs, sp = M.sp * g.f;
      for (let i = 0; i < 2; i++) {
        const a = i ? 'L' : 'R', side = i ? 1 : -1, dom = a === g.dom;
        const wa = tk * (dom ? 1 : clamp(M.both * g.both, 0, 1)) * (this.held[a] ? 0.3 : 1);
        if (wa < 0.01) continue;
        let beat = 0.5 + 0.5 * Math.sin(tt * sp + (dom ? 0 : 1.3 + g.ph) + 0.7 * Math.sin(tt * sp * 0.31 + g.ph));
        if (M.sharp > 0.01) beat = Math.pow(beat, 1 + 3 * M.sharp);
        const slow = 0.5 + 0.5 * Math.sin(tt * 0.9 * g.f + g.ph + (dom ? 0 : 2));
        bo('arm' + a, -wa * (M.raise * (0.6 + 0.6 * slow) + 0.3 * beat * g.amp), -side * wa * 0.3 * (1 - M.out), side * wa * M.out * (0.6 + 0.5 * slow));
        bo('fore' + a, -wa * (M.bend * (0.7 + 0.4 * slow) + 0.45 * beat * g.amp), 0, 0);
        bo('hand' + a, -wa * M.palm * 0.8, 0, 0);
      }
      bo('head', tk * 0.06 * Math.sin(tt * 2.7), tk * 0.08 * Math.sin(tt * 1.4), 0);
      if (M.sharp > 0.01) bo('spine', 0.05 * M.sharp * tk * Math.sin(tt * sp), 0, 0);
    }
    if (M.bounce > 0.01) { const j = Math.sin(this.t * 15); bo('spine', 0.045 * M.bounce * j, 0, 0); K.shrug += 0.35 * M.bounce * (1 + j); }
    if (this.shot) { const sh = this.shot; sh.t += dt * sh.sp; const u = sh.t / sh.g[0]; if (u >= 1) this.shot = null; else sh.g[1](u, ease(u / 0.2) * ease((1 - u) / 0.25), sh.o); }
    const lock = 1 - K.lockHead, st = this.stoop * (P.rootX ? 0 : 1);
    const target = (name) => {
      const p = P[name] || base[name] || ZERO;
      let x = p[0], y = p[1], z = p[2];
      switch (name) {
        // (The stride itself is added after the smoothing below, so that it keeps its full swing at any pace.)
        // A model's arms hang a little farther out, clear of its draped cloth, unless the pose lifts them.
        case 'armL': z += armX * (1 - clamp(Math.abs(p[0]) / 1.4, 0, 1)); break;
        case 'armR': z -= armX * (1 - clamp(Math.abs(p[0]) / 1.4, 0, 1)); break;
        case 'skirtL': x += -(0.05 + 0.07 * Math.abs(s)) * wk; break;
        case 'spine': x += 0.03 * wk + Math.sin(this.t * 1.3) * 0.012 + M.sx + 0.17 * st; break;
        case 'head': x += this.headPitch * lock + M.hx - 0.12 * st; y += this.headYaw * 0.65 * lock; z += M.hz; break;
        case 'neck': y += this.headYaw * 0.3 * lock; x += 0.12 * st; break;
      }
      if (this.extra && this.extra[name]) { const e = this.extra[name]; x += e[0]; y += e[1]; z += e[2]; }
      _t3[0] = x; _t3[1] = y; _t3[2] = z; return _t3;
    };
    // Head follows a point of interest.
    if (this.lookAt) {
      const dx = this.lookAt.x - this.x, dz = this.lookAt.z - this.z;
      const yaw = clamp(wrapPi(Math.atan2(dx, dz) - this.heading), -1.1, 1.1), d = Math.hypot(dx, dz);
      const pitch = clamp(-Math.atan2((this.lookAt.y || this.y + 1.5) - (this.y + 1.6 * this.h) - (P.lift || 0), Math.max(0.5, d)), -0.5, 0.5);
      this.headYaw = damp(this.headYaw, yaw, 5, dt); this.headPitch = damp(this.headPitch, pitch, 5, dt);
    } else { this.headYaw = damp(this.headYaw, Math.sin(this.t * 0.31 + this.seed) * 0.25 * (1 - wk), 2, dt); this.headPitch = damp(this.headPitch, 0, 3, dt); }
    const bones = this.bones, kd = 1 - Math.exp(-k * dt);
    // The stride, by bone (x is the bend: for legs and arms, minus swings forward; for shins, plus bends the knee).
    // Each leg swings forward while cos(phase) > 0 for the left leg; the knee bends most early in that swing and
    // is straight when the heel comes down, with a smaller bend under the weight (more of it when running).
    const gw = this.gw || (this.gw = {}), legs = [['L', ph], ['R', ph + Math.PI]];
    for (const name of ANIM_BONES) { const gv = gw[name] || (gw[name] = [0, 0, 0]); gv[0] = gv[1] = gv[2] = 0; }
    for (const [side, q] of legs) {
      const sq = Math.sin(q), cq = Math.cos(q);
      const fw = bare ? 0.14 * (1 - this.runK) : 0;   // at a walk a bare leg reaches farther forward than back
      gw['thigh' + side][0] = -(A * ((1 - fw) * sq + fw) + 0.16 * rk);
      const swing = Math.max(0, Math.cos(q + 0.55)), load = Math.max(0, -cq);
      // A bare leg's knee starts to bend before the foot leaves the ground, bends most just after, and is straight when the heel comes down.
      const dq = wrapPi(q + 1.12), bell = Math.exp(-dq * dq / 0.5625);
      const bend = bare ? 0.9 * bell * (1 - this.runK) + (0.32 + 1.15 * rk) * swing * swing * this.runK : (0.32 + (short ? 1.15 : 0.45) * rk) * swing * swing;
      gw['shin' + side][0] = wk * (0.05 + bend * (A / 0.5) + (0.1 + 0.3 * rk) * (A / 0.5) * load);   // in a long robe the heel kicks less, or the leg shows behind the hem
      // The arm on this side swings back as this leg comes forward.
      gw['arm' + (side === 'L' ? 'L' : 'R')][0] = (0.55 + 0.35 * rk) * A * sq;
      gw['fore' + side][0] = -(0.12 * wk + 1.0 * rk);
    }
    gw.skirtU[0] = Math.sin(ph * 2) * 0.03 * wk;
    gw.spine[0] = 0.14 * rk; gw.spine[1] = s * (0.07 + 0.05 * rk) * wk;
    gw.hips[1] = -s * 0.06 * wk;
    for (const name of ANIM_BONES) {
      const t = target(name), cu = this.cur[name], o = K.b[name], gv = gw[name];
      cu[0] += (t[0] - cu[0]) * kd; cu[1] += (t[1] - cu[1]) * kd; cu[2] += (t[2] - cu[2]) * kd;
      let x = cu[0] + o[0] + gv[0]; if (name === 'foreL' || name === 'foreR') x = Math.max(x, -2.45);
      bones[name].quaternion.setFromEuler(_e.set(x, cu[1] + o[1] + gv[1], cu[2] + o[2] + gv[2], 'YXZ'));
    }
    // Bare legs: the feet. The foot on the ground lies flat on it. It comes down heel first and leaves toes last
    // with the heel raised. heelUp is how far that raises the ankle, for setting the body's height below.
    const heel = this.heelUp || (this.heelUp = [0, 0]); heel[0] = heel[1] = 0;
    const wf = wk * (1 - this.runK);
    if (bare && wf > 0.005 && !P.feet) {
      const c = this.cur, kb = K.b, hx = c.hips[0] + kb.hips[0];
      for (let i = 0; i < 2; i++) {
        const side = legs[i][0], q = legs[i][1];
        const a2 = hx + c['thigh' + side][0] + kb['thigh' + side][0] + gw['thigh' + side][0] + c['shin' + side][0] + kb['shin' + side][0] + gw['shin' + side][0];
        const on = smooth01(-0.3, 0.1, -Math.cos(q));                      // 1 while this foot is on the ground
        const d1 = wrapPi(q - Math.PI / 2), d2 = wrapPi(q + Math.PI / 2);   // from the heel coming down, from the toes leaving
        const W = -0.22 * Math.exp(-d1 * d1 / 0.16) + 0.8 * Math.exp(-d2 * d2 / 0.3);   // the foot's slope: minus is toes up
        bones['foot' + side].quaternion.setFromAxisAngle(XAXIS, wf * (on * (W - a2) - (1 - on) * 0.1));
        heel[i] = wf * on * 0.11 * Math.max(0, Math.sin(W));
      }
      this.gaitFoot = true;
    } else if (this.gaitFoot) { bones.footL.quaternion.identity(); bones.footR.quaternion.identity(); this.gaitFoot = false; }
    this.lift = damp(this.lift, P.lift || 0, 9, dt);
    const bob = (bare ? 0 : 1 - this.runK) * (1 - Math.abs(s)) * 0.022 * (A / 0.5) + this.runK * Math.abs(s) * 0.05;   // bare legs: the rise and fall comes from the legs, below
    this.rootX = damp(this.rootX, P.rootX || 0, 6, dt);
    let lift = this.lift + this.lift0 + K.lift + bob * wk;
    if (this.model && !P.feet && Math.abs(this.rootX) < 0.2) {
      // A kit's ankle is higher above its sole than the low-polygon figure's. In poses that bend the legs by angle
      // (sitting, kneeling) work out where the lower ankle ends up and raise the figure until that sole is on the ground.
      const c = this.cur, kb = K.b, hx = c.hips[0] + kb.hips[0], hipY = lift + 0.93 + D.hipY;
      let low = 9;
      for (const s of ['L', 'R']) { const a1 = hx + c['thigh' + s][0] + kb['thigh' + s][0] + gw['thigh' + s][0], a2 = a1 + c['shin' + s][0] + kb['shin' + s][0] + gw['shin' + s][0]; low = Math.min(low, hipY - D.thigh * Math.cos(a1) - D.shin * Math.cos(a2) - heel[s === 'L' ? 0 : 1]); }
      const need = D.ankle + 0.04 - low; if (need > 0) lift += Math.min(need, 0.08);
      else if (bare) lift += need * wk;   // in a wide step, and with the knees bent in a run, both ankles are above the ground: the body comes down until the lower foot stands on it
    }
    bones.root.position.y = lift;
    bones.root.rotation.x = this.rootX;
    const shr = 0.035 * clamp(M.sh + K.shrug, -1, 1.5);
    bones.armL.position.y = D.shY + shr; bones.armR.position.y = D.shY + shr;

    // Limb placement: legs for poses with fixed feet, arms for anything that puts a hand somewhere.
    const F = P.feet;
    this.legW = damp(this.legW, F ? 1 : 0, 8, dt);
    if (F) for (let i = 0; i < 5; i++) this.feet[i] = damp(this.feet[i], F[i], 8, dt);
    const PH = P.hands, mw = P.rootX ? 0 : M.hw;
    this.poseHW = damp(this.poseHW, PH ? 1 : 0, 8, dt);
    if (PH) for (let i = 0; i < 3; i++) { this.pL[i] = damp(this.pL[i], PH[0][i], 8, dt); this.pR[i] = damp(this.pR[i], PH[1][i], 8, dt); }
    const needLeg = this.legW > 0.01, needArm = K.R.w > 0 || K.L.w > 0 || G.R.w > 0 || G.L.w > 0 || mw > 0.01 || this.poseHW > 0.01;
    if (needLeg || needArm) {
      _qRoot.setFromAxisAngle(XAXIS, this.rootX);
      _pH.set(0, 0.93, 0).applyQuaternion(_qRoot); _pH.y += lift;
      _qH.copy(_qRoot).multiply(bones.hips.quaternion);
      if (needLeg) {
        const f = this.feet, lw = this.legW, ls = this.legS;
        _qi.copy(_qH).invert();
        for (let i = 0; i < 2; i++) {
          const sx = i ? -1 : 1, th = bones[i ? 'thighR' : 'thighL'], sh = bones[i ? 'shinR' : 'shinL'], ft = bones[i ? 'footR' : 'footL'];
          _tg.set(sx * (D.hipX + f[2]), f[3] + D.ankle, f[i]).sub(_pH).applyQuaternion(_qi);
          _pole.set(sx * 0.4, 0.3, 1).applyQuaternion(_qi);
          solve2(sx * D.hipX, D.hipY, D.hipZ, _tg, D.thigh * ls, D.shin * ls, _pole, -1, _q1, _q2);
          th.quaternion.slerp(_q1, lw); sh.quaternion.slerp(_q2, lw);
          // Keep the foot level (or at the pose's pitch) whatever the leg does.
          _qa.copy(_qH).multiply(th.quaternion).multiply(sh.quaternion).invert().multiply(_qb.setFromAxisAngle(XAXIS, f[4]));
          ft.quaternion.identity().slerp(_qa, lw);
        }
        // The skirt hangs between the two legs.
        _qa.copy(bones.thighL.quaternion).slerp(bones.thighR.quaternion, 0.5); bones.skirtU.quaternion.slerp(_qa, lw);
        _qa.copy(bones.shinL.quaternion).slerp(bones.shinR.quaternion, 0.5); bones.skirtL.quaternion.slerp(_qa, lw);
      } else if (this.footSet) { bones.footL.quaternion.identity(); bones.footR.quaternion.identity(); }
      this.footSet = needLeg;
      if (needArm) {
        _qS.copy(_qH).multiply(bones.spine.quaternion);
        _pS.set(0, 0.2, 0).applyQuaternion(_qH).add(_pH);
        const world = def && def.space === 'w';
        this._arm('R', -1, K.R, G.R, this.mR, this.held.R ? 0 : mw, this.pR, world, shr, tk, tt);
        this._arm('L', 1, K.L, G.L, this.mL, this.held.L ? 0 : mw, this.pL, world, shr, tk, tt);
      }
    }

    // Face.
    if (quality >= 0.5) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blink = 0.15; this.blinkN++; const r = Math.sin(this.blinkN * 12.9898 + this.seed) * 43758.5453; this.blinkT = 2 + 3.6 * (r - Math.floor(r)); }
      this.blink = Math.max(0, this.blink - dt);
      const bl = this.blink > 0 ? Math.sin((this.blink / 0.15) * Math.PI) : 0;
      const lidV = Math.max(M.lid, bl, actLid, G.lidV || 0, K.lid);
      const talkOpen = this.talking * (0.2 + 0.8 * Math.abs(Math.sin(tt * 9.5 + 1.3 * Math.sin(tt * 4.1)))) * 0.75;
      const open = clamp(Math.max(M.open * (1 - 0.4 * this.talking) * (1 - 0.25 * M.bounce * (1 + Math.sin(this.t * 15))), talkOpen, actOpen, K.open), 0, 1);
      if (this.model) {
        // A model's lids turn about the middle of the eye and its jaw about its hinge; brows and mouth corners slide.
        const f0 = this.face0, sa = Math.abs(M.smile), wide = 0.0065 * sa - 0.003 * open * (1 - sa), drop = 0.006 * open, up = M.smile > 0 ? 0.0115 : 0.007;
        bones.lidL.rotation.x = bones.lidR.rotation.x = (lidV > 0 ? lidV : lidV * 0.35) * this.model.lid;
        bones.jaw.rotation.x = 0.16 * open;
        bones.browL.position.y = f0.browL.y + (M.bl + 0.6 * M.asym) * 0.0055; bones.browR.position.y = f0.browR.y + (M.bl - 0.6 * M.asym) * 0.0055;
        bones.browL.rotation.z = M.bt * 0.26; bones.browR.rotation.z = -M.bt * 0.26;
        bones.mouthL.position.set(f0.mouthL.x + wide, f0.mouthL.y + (M.smile - 0.7 * M.asym) * up - drop, f0.mouthL.z - 0.004 * sa);
        bones.mouthR.position.set(f0.mouthR.x - wide, f0.mouthR.y + (M.smile + 0.7 * M.asym) * up - drop, f0.mouthR.z - 0.004 * sa);
      } else {
        const by = HY + 0.05 - 1.52, ly = HY + 0.03 - 1.52, my = HY - 0.058 - 1.52;
        bones.browL.position.y = by + (M.bl + 0.6 * M.asym) * 0.012; bones.browR.position.y = by + (M.bl - 0.6 * M.asym) * 0.012;
        bones.browL.rotation.z = M.bt * 0.42; bones.browR.rotation.z = -M.bt * 0.42;
        bones.lidL.position.y = ly - 0.03 * lidV; bones.lidR.position.y = ly - 0.03 * lidV;
        bones.jaw.position.y = my - 0.005 - 0.034 * open;
        const wide = 0.004 * Math.abs(M.smile) - 0.009 * open * (1 - Math.abs(M.smile));
        bones.mouthL.position.set(0.034 + wide, my + (M.smile - 0.7 * M.asym) * 0.013 - 0.006 * open, 0.1);
        bones.mouthR.position.set(-0.034 - wide, my + (M.smile + 0.7 * M.asym) * 0.013 - 0.006 * open, 0.1);
      }
    }
    this.sync();
  }

  // Blend the hand places asked for by the pose, the mood, the activity, and the gesture, then bend the arm to reach.
  _arm(a, sx, KH, GH, moodP, mw, poseP, world, shr, tk, tt) {
    let W = 0;
    const torso = (p) => _p.set(p[0], p[1] - 1.13, p[2]).applyQuaternion(_qS).add(_pS);
    const over = (w) => { if (W <= 0) _tg.copy(_p); else _tg.lerp(_p, w / (W + w - W * w)); W = W + (1 - W) * w; };
    if (this.poseHW > 0.01) { torso(poseP); over(this.poseHW); }
    if (mw > 0.01) { torso(moodP); _p.y += 0.012 * tk * Math.sin(tt * 3.1 + sx); over(mw); }
    let qw = 0;
    if (KH.w > 0.001) {
      if (world) _p.set(KH.p[0], KH.p[1], KH.p[2]).divideScalar(this.h); else torso(KH.p);
      if (KH.hasQ) { _qa.setFromEuler(_e.set(KH.q[0], KH.q[1], KH.q[2], 'YXZ')); _p.sub(_v.set(PALM[0], PALM[1], PALM[2]).applyQuaternion(_qa)); qw = KH.w; } else if (GH.w <= 0) qw = 0;
      over(KH.w);
    }
    if (GH.w > 0.001) { torso(GH.p); over(GH.w); qw *= 1 - GH.w; }
    if (W <= 0.001) return;
    const bones = this.bones, arm = bones['arm' + a], fore = bones['fore' + a], hand = bones['hand' + a], as = this.armS, D = this.D;
    _qi.copy(_qS).invert();
    _tg.sub(_pS).applyQuaternion(_qi);
    _pole.set(sx * 0.6, -0.55, -0.55);
    // With a turned hand the wrist is what gets placed; otherwise the palm, a little past the wrist.
    solve2(sx * D.shX, D.shY + shr, D.shZ, _tg, D.arm * as, (D.fore + D.palm * (qw > 0 ? 1 - qw : 1)) * as, _pole, 1, _q1, _q2);
    arm.quaternion.slerp(_q1, W); fore.quaternion.slerp(_q2, W);
    if (qw > 0) { _qb.copy(_qS).multiply(arm.quaternion).multiply(fore.quaternion).invert().multiply(_qa); hand.quaternion.slerp(_qb, qw); }
  }
}

// ---------------------------------------------------------------------------------------------
// Small props carried in a hand or planted beside a figure. These are separate meshes for the story code.
// Work activities do not use them: their tools are part of the figure's own mesh.
const propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const propMaterial = propMat;
function coloredBox(sx, sy, sz, hex) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(), n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
// A round rod (staffs, spears, poles), slightly thinner at the top, with seven sides: square ones read as planks.
function coloredRod(r, h, hex) {
  const g = new THREE.CylinderGeometry(r * 0.8, r, h, 7).toNonIndexed(), n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
export function makeProp(kind) {
  const g = new THREE.Group();
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, propMat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  if (kind === 'staff') add(coloredRod(0.019, 1.7, 0x5a4634), 0, 0.55, 0.03);
  else if (kind === 'crook') { add(coloredRod(0.019, 1.6, 0x6b4a32), 0, 0.5, 0.03); add(coloredBox(0.16, 0.035, 0.035, 0x6b4a32), 0.07, 1.3, 0.03); }
  else if (kind === 'spear') { add(coloredRod(0.016, 2.3, 0x5a4634), 0, 0.8, 0.03); add(coloredBox(0.06, 0.24, 0.02, 0xa8a8a0), 0, 2.05, 0.03); }
  else if (kind === 'scroll') add(coloredBox(0.05, 0.05, 0.26, 0xe3d5a8), 0, -0.02, 0.06);
  else if (kind === 'cup') add(coloredBox(0.09, 0.06, 0.09, 0x2a2522), 0, -0.02, 0.06);
  else if (kind === 'lyre') { add(coloredBox(0.26, 0.2, 0.05, 0x8a6a42), 0, 0.05, 0.08); add(coloredBox(0.03, 0.3, 0.03, 0x6b4a32), -0.11, 0.28, 0.08); add(coloredBox(0.03, 0.3, 0.03, 0x6b4a32), 0.11, 0.28, 0.08); add(coloredBox(0.28, 0.03, 0.03, 0x6b4a32), 0, 0.42, 0.08); }
  else if (kind === 'pole') add(coloredRod(0.016, 1.5, 0x4a3423), 0, -0.6, 0.03);
  else if (TOOLS[kind] && !BODY_TOOLS[kind]) { const b = new Builder(7); b.off = PALM; TOOLS[kind](b, 0); const m = new THREE.Mesh(b.geometry(false), propMat); m.castShadow = true; g.add(m); }
  return g;
}

