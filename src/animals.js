// Animals: goat, kid, sheep, donkey, dog, chicken, gull. Built in code in the same flat-shaded style as the people.
// Each is one skinned mesh with rigid per-bone skinning.
import * as THREE from 'three';
import { clamp, damp, mulberry32 } from './util.js';
import { Builder, figureMaterial } from './actors.js';

// A small skeleton builder. Positions are given in model space.
class Rig {
  constructor() { this.list = []; this.by = {}; this.abs = {}; }
  add(name, parent, x, y, z) {
    const bn = new THREE.Bone(), p = parent ? this.abs[parent] : [0, 0, 0]; bn.name = name; bn.position.set(x - p[0], y - p[1], z - p[2]);
    if (parent) this.by[parent].add(bn);
    this.by[name] = bn; this.abs[name] = [x, y, z]; this.list.push(bn); return this.list.length - 1;
  }
}
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

// len: body length, girth: body half width, leg: leg length, nl / na: neck length and its angle above level, head / hw: head length and half width.
const QUAD = {
  goat: { len: 0.72, girth: 0.15, leg: 0.36, nl: 0.3, na: 1.0, head: 0.24, hw: 0.065, cols: [0x8a6a4a, 0xe4dccb, 0x3a3028, 0xb89a72, 0x6a5038], ear: [0.1, -0.02, -0.02], tail: [0, 0.1, -0.05], horns: 0.2, beard: 1, pace: 1.1 },
  kid: { len: 0.42, girth: 0.09, leg: 0.24, nl: 0.17, na: 1.0, head: 0.16, hw: 0.05, cols: [0xe4dccb, 0xb89a72, 0x8a6a4a], ear: [0.07, -0.01, -0.01], tail: [0, 0.06, -0.03], pace: 0.9 },
  sheep: { len: 0.74, girth: 0.21, leg: 0.3, nl: 0.22, na: 0.8, head: 0.22, hw: 0.065, cols: [0xe6dfcf, 0xdcd4c0, 0xcfc6b0], face: [0x3a3028, 0xd8cfc0, 0x5a4a3c], ear: [0.09, -0.01, 0], tail: [0, -0.1, -0.04], legHex: 0x3a3028, wool: 1, pace: 0.9 },
  donkey: { len: 1.12, girth: 0.22, leg: 0.6, nl: 0.46, na: 0.85, head: 0.4, hw: 0.085, cols: [0x8a8078, 0x7a6450, 0x9a9088], ear: [0.03, 0.25, -0.05], tail: [0, -0.5, -0.1], muzzle: 0xd8d0c4, mane: 1, pace: 1.3 },
  dog: { len: 0.56, girth: 0.1, leg: 0.3, nl: 0.2, na: 0.75, head: 0.2, hw: 0.06, cols: [0xb08a5a, 0x4a3a2c, 0xd8c8a8, 0x8a6a4a], ear: [0.02, 0.08, -0.01], tail: [0, 0.2, -0.12], muzzle: 0, pace: 1.4, wag: 1 },
};
const STATES = ['idle', 'graze', 'walk', 'peck', 'sit', 'sleep', 'fly'];

export class Animal {
  constructor(kind = 'goat', seed = 1, opts = {}) {
    this.kind = kind; this.seed = seed; this.opts = opts;
    this.group = new THREE.Group();
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.speed = 0; this.state = opts.state || 'idle'; this.bank = 0;
    this.t = seed * 1.31; this.phase = seed * 0.9; this.wk = 0; this.gz = 0; this.si = 0; this.sl = 0; this.fl = 0; this.flick = 0; this.flickT = 1 + (seed % 5); this.earT = 2 + (seed % 3); this.ear = 0; this.flap = 1;
    const b = new Builder(seed * 17 + 3), rig = this.rig = new Rig(), r = mulberry32(seed * 53 + 11);
    if (kind === 'chicken') this._chicken(b, rig, r); else if (kind === 'gull') this._gull(b, rig, r); else this._quad(b, rig, r, QUAD[kind] || QUAD.goat);
    this.bones = rig.by; this.triangles = b.tris;
    this.mesh = new THREE.SkinnedMesh(b.geometry(), figureMaterial);
    this.mesh.add(rig.by.root); this.mesh.bind(new THREE.Skeleton(rig.list));
    this.mesh.castShadow = true; this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.6);
    const s = this.scale = (opts.scale || 1) * (0.94 + 0.12 * r()); this.mesh.scale.setScalar(s);
    this.group.add(this.mesh);
  }
  place(x, z, heading, y) { this.x = x; this.z = z; if (heading != null) this.heading = heading; if (y != null) this.y = y; this.sync(); return this; }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.heading; }

  _quad(b, rig, r, d) {
    this.d = d;
    const L = d.len, g = d.girth, H = this.H = d.leg + g * 0.85, zf = L / 2, zb = -L / 2, col = pick(r, d.cols), belly = shade(col, 1.12), legHex = d.legHex || shade(col, 0.82), face = d.face ? pick(r, d.face) : col;
    const R = {}; R.root = rig.add('root', null, 0, 0, 0); R.body = rig.add('body', 'root', 0, H, 0);
    const N0 = [0, H + g * 0.35, zf - g * 0.35], N1 = [0, N0[1] + Math.sin(d.na) * d.nl, N0[2] + Math.cos(d.na) * d.nl];
    R.neck = rig.add('neck', 'body', N0[0], N0[1], N0[2]); R.head = rig.add('head', 'neck', N1[0], N1[1], N1[2]);
    const wy = d.wool ? 1.12 : 1;
    b.loftZ([{ z: zb, rx: 0.55 * g, ry: 0.6 * g * wy, y: H + 0.1 * g }, { z: zb + 0.2 * L, rx: 0.97 * g, ry: g * wy, y: H }, { z: 0, rx: 1.05 * g, ry: 1.05 * g * wy, y: H - 0.03, hex: d.wool ? col : belly }, { z: zf - 0.2 * L, rx: g, ry: g * wy, y: H }, { z: zf, rx: 0.6 * g, ry: 0.7 * g * wy, y: H + 0.12 * g }], 6, R.body, col);
    b.rod(N0, N1, 0.62 * g, col, R.neck, 5, Math.max(0.42 * g, d.hw * 0.9));
    const hd = d.head, hw = d.hw, y1 = N1[1], z1 = N1[2];
    b.loftZ([{ z: z1 - 0.25 * hd, rx: 0.75 * hw, ry: 0.8 * hw, y: y1 + 0.02 }, { z: z1 + 0.15 * hd, rx: hw, ry: hw * 1.05, y: y1 }, { z: z1 + 0.65 * hd, rx: 0.66 * hw, ry: 0.7 * hw, y: y1 - 0.2 * hd, hex: d.muzzle || face }, { z: z1 + hd, rx: 0.45 * hw, ry: 0.48 * hw, y: y1 - 0.32 * hd, hex: d.muzzle || face }], 5, R.head, face);
    for (const sx of [1, -1]) {
      b.box(sx * hw * 0.92, y1 + 0.25 * hw, z1 + 0.3 * hd, 0.012, 0.028, 0.028, 0x15110e, R.head);                                  // eye
      const e0 = [sx * hw * 0.8, y1 + hw * 0.7, z1 - 0.1 * hd], ear = rig.add(sx > 0 ? 'earL' : 'earR', 'head', e0[0], e0[1], e0[2]);
      b.rod(e0, [e0[0] + sx * d.ear[0], e0[1] + d.ear[1], e0[2] + d.ear[2]], hw * 0.42, shade(face, 0.9), ear, 3, hw * 0.15);
      if (d.horns) b.rod([sx * hw * 0.4, y1 + hw * 0.85, z1 - 0.02], [sx * hw * 1.1, y1 + hw + d.horns, z1 - 0.14], 0.02, 0xc9bfa6, R.head, 3, 0.006);
      // legs: an upper and a lower bone each
      for (const [nm, lz] of [['F', zf - g * 0.7], ['B', zb + g * 0.7]]) {
        const lx = sx * g * 0.62, top = H - g * 0.35, mid = top * 0.5, side = sx > 0 ? 'L' : 'R';
        const up = rig.add(nm + side + 'u', 'body', lx, top, lz), lo = rig.add(nm + side + 'l', nm + side + 'u', lx, mid, lz);
        b.rod([lx, top + g * 0.1, lz], [lx, mid, lz], g * (nm === 'B' ? 0.4 : 0.34), d.wool ? col : legHex, up, 4, g * 0.2);
        b.rod([lx, mid, lz], [lx, 0, lz], Math.max(0.016, g * 0.2), legHex, lo, 4, Math.max(0.018, g * 0.18));
      }
    }
    if (d.beard) b.rod([0, y1 - 0.3 * hd, z1 + 0.75 * hd], [0, y1 - 0.3 * hd - 0.09, z1 + 0.68 * hd], 0.016, shade(face, 0.85), R.head, 3, 0.004);
    if (d.mane) b.box(0, (N0[1] + N1[1]) / 2 + 0.07, (N0[2] + N1[2]) / 2 - 0.08, 0.03, d.nl * 0.9, 0.08, 0x2a221c, R.neck);
    const T0 = [0, H + g * 0.55, zb + 0.02]; R.tail = rig.add('tail', 'body', T0[0], T0[1], T0[2]);
    b.rod(T0, [T0[0] + d.tail[0], T0[1] + d.tail[1], T0[2] + d.tail[2]], g * 0.16, d.mane ? 0x2a221c : col, R.tail, 3, g * (d.mane ? 0.22 : 0.08));
    if (this.opts.pack) {
      // Pack saddle: a blanket and a basket on each side.
      b.box(0, H + g * 0.95, -0.02, g * 2.25, 0.05, 0.5, 0x9a4a3a, R.body);
      for (const sx of [1, -1]) b.loft([{ y: H - 0.12, rx: 0.13, rz: 0.17, x: sx * (g + 0.14) }, { y: H + 0.22, rx: 0.17, rz: 0.22, x: sx * (g + 0.15) }, { y: H + 0.27, rx: 0.13, rz: 0.17, x: sx * (g + 0.15), hex: 0xd9c27a }], 6, R.body, 0xb89a5a);
    }
  }

  _chicken(b, rig, r) {
    const col = pick(r, [0xb5673a, 0xe4dccb, 0x3a3028, 0xc98a4a, 0x8a5a3a]), H = this.H = 0.2;
    const R = {}; R.root = rig.add('root', null, 0, 0, 0); R.body = rig.add('body', 'root', 0, H, 0);
    R.neck = rig.add('neck', 'body', 0, H + 0.05, 0.08); R.head = rig.add('head', 'neck', 0, H + 0.17, 0.12); R.tail = rig.add('tail', 'body', 0, H + 0.05, -0.1);
    b.loftZ([{ z: -0.13, rx: 0.03, ry: 0.04, y: H + 0.05 }, { z: -0.04, rx: 0.075, ry: 0.085, y: H }, { z: 0.06, rx: 0.07, ry: 0.08, y: H }, { z: 0.12, rx: 0.035, ry: 0.045, y: H + 0.03 }], 6, R.body, col);
    b.rod([0, H + 0.04, 0.08], [0, H + 0.17, 0.12], 0.035, col, R.neck, 4, 0.026);
    b.ball(0, H + 0.19, 0.125, 0.032, 0.034, 0.036, col, R.head, null, true);
    b.rod([0, H + 0.185, 0.155], [0, H + 0.175, 0.2], 0.012, 0xd9a93c, R.head, 3, 0.002);
    b.box(0, H + 0.232, 0.125, 0.008, 0.03, 0.05, 0xb5352a, R.head); b.box(0, H + 0.155, 0.15, 0.008, 0.025, 0.02, 0xb5352a, R.head);
    b.box(0.03, H + 0.195, 0.14, 0.006, 0.012, 0.012, 0x15110e, R.head); b.box(-0.03, H + 0.195, 0.14, 0.006, 0.012, 0.012, 0x15110e, R.head);
    b.rod([0, H + 0.04, -0.1], [0, H + 0.18, -0.2], 0.04, shade(col, 0.8), R.tail, 3, 0.012);
    for (const sx of [1, -1]) { const lg = rig.add(sx > 0 ? 'legL' : 'legR', 'body', sx * 0.035, H - 0.05, 0); b.rod([sx * 0.035, H - 0.04, 0], [sx * 0.035, 0, 0], 0.01, 0xd9a93c, lg, 3); b.box(sx * 0.035, 0.006, 0.02, 0.035, 0.012, 0.06, 0xd9a93c, lg); }
  }

  _gull(b, rig) {
    const R = {}, W = 0xf0f0ec, G = 0xa8b0b8; this.H = 0.12;
    R.root = rig.add('root', null, 0, 0, 0); R.body = rig.add('body', 'root', 0, 0.12, 0);
    b.loftZ([{ z: -0.2, rx: 0.015, ry: 0.012, y: 0.125 }, { z: -0.08, rx: 0.055, ry: 0.05, y: 0.12 }, { z: 0.07, rx: 0.06, ry: 0.055, y: 0.12 }, { z: 0.16, rx: 0.035, ry: 0.035, y: 0.135 }], 5, R.body, W);
    b.rod([0, 0.135, 0.16], [0, 0.128, 0.23], 0.012, 0xd9a93c, R.body, 3, 0.003);
    b.out = [0, 1, 0]; b.quad([-0.06, 0.125, -0.19], [0.06, 0.125, -0.19], [0.025, 0.125, -0.3], [-0.025, 0.125, -0.3], W, R.body); b.out = null;
    for (const sx of [1, -1]) {
      const w1 = rig.add(sx > 0 ? 'wingL' : 'wingR', 'body', sx * 0.04, 0.15, 0.03), w2 = rig.add(sx > 0 ? 'tipL' : 'tipR', sx > 0 ? 'wingL' : 'wingR', sx * 0.3, 0.15, 0.02);
      const q = (p, hex, bone) => { for (const o of [[0, 1, 0], [0, -1, 0]]) { b.out = o; b.quad(p[0], p[1], p[2], p[3], hex, bone); } b.out = null; };
      q([[sx * 0.04, 0.15, 0.1], [sx * 0.3, 0.15, 0.08], [sx * 0.3, 0.15, -0.05], [sx * 0.04, 0.15, -0.06]], G, w1);
      q([[sx * 0.3, 0.15, 0.08], [sx * 0.62, 0.15, 0.0], [sx * 0.6, 0.15, -0.05], [sx * 0.3, 0.15, -0.05]], shade(G, 0.85), w2);
    }
  }

  update(dt) {
    const B = this.bones, st = this.state, t = (this.t += dt), k = 1 - Math.exp(-6 * dt);
    this.wk += (clamp(this.speed / 0.5, 0, 1) - this.wk) * k;
    this.gz += ((st === 'graze' || st === 'peck' ? 1 : 0) - this.gz) * k; this.si += ((st === 'sit' ? 1 : 0) - this.si) * k; this.sl += ((st === 'sleep' ? 1 : 0) - this.sl) * k; this.fl += ((st === 'fly' ? 1 : 0) - this.fl) * k;
    // Tail and ear flicks now and then.
    this.flickT -= dt; if (this.flickT <= 0) { this.flick = 0.6; this.flickT = 2.5 + 4 * Math.abs(Math.sin(t * 7.1 + this.seed)); }
    this.earT -= dt; if (this.earT <= 0) { this.ear = 0.35; this.earT = 2 + 5 * Math.abs(Math.sin(t * 3.3 + this.seed * 2)); }
    this.flick = Math.max(0, this.flick - dt); this.ear = Math.max(0, this.ear - dt);
    const wk = this.wk, gz = this.gz, si = this.si, sl = this.sl, up = 1 - sl, d = this.d;
    if (this.kind === 'gull') {
      const fl = this.fl; this.flap = damp(this.flap, Math.sin(t * 0.37 + this.seed) > -0.2 ? 1 : 0.12, 2, dt);
      this.phase += dt * 11 * (0.6 + 0.4 * this.flap);
      const a = Math.sin(this.phase) * 0.6 * this.flap + 0.12, a2 = Math.sin(this.phase - 0.9) * 0.45 * this.flap - 0.1;
      for (const [sx, s] of [[1, 'L'], [-1, 'R']]) { B['wing' + s].rotation.set(0, sx * 1.35 * (1 - fl), sx * a * fl); B['tip' + s].rotation.set(0, sx * 0.3 * (1 - fl), sx * a2 * fl); }
      B.body.rotation.set(-0.05 * fl, 0, -this.bank * fl); this.sync(); return;
    }
    if (this.kind === 'chicken') {
      this.phase += this.speed * dt * 22;
      const s = Math.sin(this.phase) * wk, u = (t * 0.4 + this.seed * 0.37) % 1, pk = gz * (u < 0.6 ? Math.abs(Math.sin(u * 5.24 * 2)) : 0);
      B.legL.rotation.x = s * 0.7; B.legR.rotation.x = -s * 0.7;
      B.body.rotation.x = 0.5 * pk + 0.05 * Math.abs(s); B.body.position.y = this.H - 0.02 * pk;
      B.neck.rotation.set(1.25 * pk + 0.25 * wk * Math.sin(this.phase * 2), (1 - gz) * (1 - wk) * 0.7 * Math.round(Math.sin(t * 0.8 + this.seed) * 1.6) / 1.6, 0);
      B.head.rotation.x = -0.3 * pk; B.tail.rotation.x = -0.3 * pk + 0.3 * this.flick * Math.sin(t * 20);
      this.sync(); return;
    }
    // Four-legged animals.
    this.phase += this.speed * dt * 3.0 / d.leg;
    const ph = this.phase, A = 0.5 * wk, g = d.girth, L = d.len;
    const sitP = 0.5 * si, sitDrop = si * (this.H - (this.H - g * 0.35 - (L / 2 - g * 0.7) * Math.sin(0.5) + 0.35 * g * Math.cos(0.5)));
    B.root.position.y = Math.abs(Math.sin(ph * 2)) * 0.012 * wk - sitDrop - sl * (this.H - g * 0.95) + 0.004 * sl * Math.sin(t * 1.6);
    B.body.rotation.set(-sitP + 0.1 * gz * up, 0, 0.14 * sl);
    for (const [nm, off, front] of [['FL', 0, 1], ['FR', Math.PI, 1], ['BL', Math.PI, 0], ['BR', 0, 0]]) {
      const s = Math.sin(ph + off), lift = Math.max(0, Math.sin(ph + off - 1.2));
      let ux = -s * A, lx = lift * A * 1.7;
      if (front) { ux += sitP - 0.1 * gz * up; ux = ux * up - 1.45 * sl; lx = lx * up + 2.7 * sl; }
      else { ux += si * -0.75 - 0.1 * gz * up; lx += si * 1.5; ux = ux * up - 1.3 * sl; lx = lx * up + 2.5 * sl; }
      B[nm + 'u'].rotation.x = ux; B[nm + 'l'].rotation.x = lx;
    }
    const look = (1 - gz) * (1 - wk) * up;
    B.neck.rotation.set((d.na + 0.95) * gz * up + (d.na + 0.25) * sl + 0.08 * wk * Math.sin(ph * 2) + sitP * 0.6, 0.35 * look * Math.sin(t * 0.43 + this.seed), 0);
    B.head.rotation.set(-0.45 * gz * up + 0.07 * gz * Math.sin(t * 9) - 0.25 * sl + 0.1 * look * Math.sin(t * 0.7 + this.seed), 0.3 * look * Math.sin(t * 0.43 + this.seed), 0);
    const wag = d.wag && !sl ? 0.5 * Math.sin(t * 10) * (0.3 + 0.7 * (1 - wk)) : 0;
    B.tail.rotation.set(0, 0, wag + (this.flick > 0 ? 0.6 * Math.sin(t * 22) * (this.flick / 0.6) : 0));
    const e = this.ear > 0 ? Math.sin((this.ear / 0.35) * Math.PI * 2) * 0.5 : 0;
    B.earL.rotation.z = e; B.earR.rotation.z = -e * 0.6;
    this.sync();
  }
}
export const ANIMAL_KINDS = ['goat', 'kid', 'sheep', 'donkey', 'dog', 'chicken', 'gull'], ANIMAL_STATES = STATES;
