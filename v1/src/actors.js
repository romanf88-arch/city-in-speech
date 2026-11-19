// People: low-polygon figures built in code. Each is one skinned mesh posed by code.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapPi, mulberry32 } from './util.js';

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
];
const BI = {}; BONES.forEach((b, i) => { BI[b[0]] = i; });

// Collects colored triangles, each bound to one bone.
class Builder {
  constructor(seed) { this.pos = []; this.col = []; this.bone = []; this.rng = mulberry32(seed); this.c = new THREE.Color(); }
  tri(a, b, c, hex, bone, tone = 1) {
    this.c.set(hex).multiplyScalar(tone * (0.93 + 0.14 * this.rng()));
    for (const v of [a, b, c]) { this.pos.push(v[0], v[1], v[2]); this.col.push(this.c.r, this.c.g, this.c.b); this.bone.push(bone); }
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
  box(cx, cy, cz, sx, sy, sz, hex, bone) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const f of [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]]) this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], hex, bone);
  }
  // Part of a faceted ball. keep(nx, ny, nz) chooses faces by their direction from the center.
  ball(cx, cy, cz, rx, ry, rz, hex, bone, keep) {
    const g = Builder.ico, p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      const mx = (p[i] + p[i + 3] + p[i + 6]) / 3, my = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, mz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      if (keep && !keep(mx, my, mz)) continue;
      const v = (k) => [cx + p[i + k] * rx, cy + p[i + k + 1] * ry, cz + p[i + k + 2] * rz];
      this.tri(v(0), v(3), v(6), hex, bone);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.bone.length;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = this.bone[i]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.computeVertexNormals();
    return g;
  }
}
Builder.ico = new THREE.IcosahedronGeometry(1, 1);

const SKIN = { fair: 0xd9a47c, tan: 0xc48a5e, olive: 0xb37a4f, dark: 0x8a5a3a, pale: 0xe2c2a4, bronze: 0x6f9a86 };

// spec: { skin, hair, hairStyle: full|bald|long|veil|none, beard: none|short|full|long, robe, robe2, length: long|short, bare (right shoulder bare),
//         build (width factor), height (scale), hat: none|petasos|wreath|goldWreath|phrygian|helmet|crown|hood, shoes }
export function buildFigure(spec, seed = 1) {
  const b = new Builder(seed), s = Object.assign({ skin: 'tan', hair: 0x2a221c, hairStyle: 'full', beard: 'none', robe: 0xe6dcc0, robe2: null, length: 'long', build: 1, height: 1, hat: 'none' }, spec);
  const skin = SKIN[s.skin] || s.skin, w = s.build, cloth = s.robe, over = s.robe2 || s.robe, chest = s.bare ? skin : cloth;
  const B = BI;
  // hips and torso
  b.loft([{ y: 0.84, rx: 0.175 * w, rz: 0.125 * w }, { y: 0.98, rx: 0.17 * w, rz: 0.12 * w }], 8, B.hips, over, { capLo: false, capHi: false });
  // The chiton shows on the right chest; the himation crosses from the left shoulder.
  const torso = [{ y: 0.96, rx: 0.172 * w, rz: 0.122 * w }, { y: 1.2, rx: 0.2 * w, rz: 0.135 * w }, { y: 1.4, rx: 0.2 * w, rz: 0.118 * w }, { y: 1.46, rx: 0.075, rz: 0.07 }];
  b.loft(torso, 8, B.spine, chest, { capLo: false });
  if (s.robe2 || s.bare) {
    // Outer wrap: full below the chest, then only over the left shoulder (k = 0..3 is the +x side).
    const o = 1.07;
    const wrap = [{ y: 0.95, rx: 0.172 * w * o, rz: 0.122 * w * o }, { y: 1.2, rx: 0.2 * w * o, rz: 0.135 * w * o }, { y: 1.41, rx: 0.2 * w * o, rz: 0.118 * w * o }, { y: 1.475, rx: 0.08, rz: 0.075 }];
    b.loft(wrap, 8, B.spine, over, { capLo: false, capHi: false, skip: (i, k) => i >= 1 && !(k >= 0 && k <= 3) });
    // The loose end hanging behind the left shoulder.
    b.quad([0.2 * w, 1.42, -0.1], [0.06, 1.44, -0.13], [0.07, 0.86, -0.17], [0.23 * w, 0.9, -0.13], over, B.spine, 0.92);
  }
  // neck and head
  b.loft([{ y: 1.43, rx: 0.05, rz: 0.05 }, { y: 1.55, rx: 0.047, rz: 0.05 }], 6, B.neck, skin, { capLo: false, capHi: false });
  const hy = 1.635;
  b.ball(0, hy, 0.01, 0.098, 0.122, 0.108, skin, B.head);
  b.tri([-0.016, hy + 0.012, 0.112], [0.016, hy + 0.012, 0.112], [0, hy - 0.03, 0.142], skin, B.head, 0.92);       // nose
  b.tri([-0.016, hy + 0.012, 0.112], [0, hy - 0.03, 0.142], [-0.014, hy - 0.034, 0.108], skin, B.head, 0.85);
  b.tri([0.016, hy + 0.012, 0.112], [0.014, hy - 0.034, 0.108], [0, hy - 0.03, 0.142], skin, B.head, 0.85);
  for (const sx of [-1, 1]) {                                                                                      // eyes and brows
    b.quad([sx * 0.052, hy + 0.018, 0.097], [sx * 0.024, hy + 0.018, 0.106], [sx * 0.024, hy + 0.034, 0.105], [sx * 0.052, hy + 0.034, 0.096], 0x1c1612, B.head);
    b.quad([sx * 0.058, hy + 0.04, 0.094], [sx * 0.02, hy + 0.043, 0.107], [sx * 0.02, hy + 0.053, 0.105], [sx * 0.058, hy + 0.05, 0.093], s.hair, B.head, 0.8);
  }
  if (s.hairStyle === 'full' || s.hairStyle === 'long') b.ball(0, hy + 0.012, -0.004, 0.108, 0.13, 0.118, s.hair, B.head, (x, y, z) => y > 0.42 || (z < -0.05 && y > -0.5) || (z < 0.45 && y > 0.2));
  if (s.hairStyle === 'bald') b.ball(0, hy + 0.005, -0.006, 0.106, 0.125, 0.116, s.hair, B.head, (x, y, z) => z < 0.12 && y > -0.5 && y < 0.34);
  if (s.hairStyle === 'long') b.loft([{ y: 1.4, rx: 0.1, rz: 0.035, z: -0.085 }, { y: 1.6, rx: 0.1, rz: 0.04, z: -0.075 }], 6, B.neck, s.hair, { capHi: false });
  if (s.hairStyle === 'veil') {
    b.ball(0, hy + 0.014, -0.012, 0.116, 0.138, 0.126, over, B.head, (x, y, z) => y > 0.38 || z < 0.05);
    b.loft([{ y: 1.36, rx: 0.15, rz: 0.06, z: -0.07 }, { y: 1.62, rx: 0.115, rz: 0.06, z: -0.07 }], 6, B.neck, over, { capHi: false });
  }
  const beardLen = { none: 0, short: 0.045, full: 0.09, long: 0.17 }[s.beard] || 0;
  if (beardLen) b.ball(0, hy - 0.075 - beardLen * 0.35, 0.032, 0.088, 0.055 + beardLen * 0.62, 0.082, s.hair, B.head, (x, y, z) => z > -0.25 && y < 0.55);
  // hats
  if (s.hat === 'petasos') { b.loft([{ y: hy + 0.075, rx: 0.2, rz: 0.2 }, { y: hy + 0.105, rx: 0.085, rz: 0.085 }, { y: hy + 0.15, rx: 0.05, rz: 0.05 }], 8, B.head, 0x9a8a68); }
  if (s.hat === 'wreath' || s.hat === 'goldWreath') { const hx = s.hat === 'wreath' ? 0x5f7a3a : 0xd9a93c; b.loft([{ y: hy + 0.062, rx: 0.115, rz: 0.125, z: -0.004 }, { y: hy + 0.095, rx: 0.112, rz: 0.122, z: -0.004 }], 10, B.head, hx, { capLo: false, capHi: false }); }
  if (s.hat === 'crown') { b.loft([{ y: hy + 0.07, rx: 0.108, rz: 0.118 }, { y: hy + 0.16, rx: 0.12, rz: 0.13 }], 8, B.head, 0xd9a93c, { capLo: false, capHi: false, skip: (i, k) => false }); b.ball(0, hy + 0.05, -0.004, 0.1, 0.1, 0.11, 0x8a2f2a, B.head, (x, y) => y > 0.5); }
  if (s.hat === 'phrygian') { b.ball(0, hy + 0.03, -0.01, 0.112, 0.125, 0.122, s.hatColor || 0xa33b2e, B.head, (x, y, z) => y > 0.3 || (z < -0.1 && y > -0.35)); b.loft([{ y: hy + 0.13, rx: 0.06, rz: 0.06, z: 0.0 }, { y: hy + 0.2, rx: 0.035, rz: 0.04, z: 0.05 }, { y: hy + 0.19, rx: 0.02, rz: 0.02, z: 0.1 }], 6, B.head, s.hatColor || 0xa33b2e); }
  if (s.hat === 'helmet') { b.ball(0, hy + 0.02, -0.004, 0.114, 0.135, 0.124, 0xa8733a, B.head, (x, y, z) => y > 0.15 || z < 0.2); b.quad([0, hy + 0.14, 0.09], [0, hy + 0.14, -0.13], [0, hy + 0.27, -0.12], [0, hy + 0.25, 0.07], 0xa33b2e, B.head); b.quad([0, hy + 0.14, -0.13], [0, hy + 0.14, 0.09], [0, hy + 0.25, 0.07], [0, hy + 0.27, -0.12], 0xa33b2e, B.head); }
  if (s.hat === 'hood') b.ball(0, hy + 0.012, -0.02, 0.125, 0.145, 0.135, over, B.head, (x, y, z) => z < 0.35 || y > 0.55);
  // arms
  for (const [side, arm, fore, hand] of [[1, B.armL, B.foreL, B.handL], [-1, B.armR, B.foreR, B.handR]]) {
    const x = side * 0.205 * w, covered = side === 1 && (s.robe2 || s.bare);
    b.ball(x * 0.97, 1.385, 0, 0.062, 0.062, 0.062, covered ? over : (s.bare ? skin : cloth), B.spine);
    b.loft([{ y: 1.1, rx: 0.043, rz: 0.043, x }, { y: 1.4, rx: 0.052, rz: 0.052, x }], 6, arm, covered ? over : skin, { capHi: false });
    b.loft([{ y: 0.84, rx: 0.034, rz: 0.034, x }, { y: 1.11, rx: 0.044, rz: 0.044, x }], 6, fore, skin, { capHi: false });
    b.box(x, 0.79, 0.008, 0.05, 0.1, 0.07, skin, hand);
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
    b.loft([{ y: 0.09, rx: 0.235 * w, rz: 0.2 * w, hex: cloth }, { y: 0.22, rx: 0.225 * w, rz: 0.19 * w }, { y: 0.52, rx: 0.205 * w, rz: 0.17 * w }], 8, B.skirtL, over, { capLo: false, capHi: false, tone: (i) => (i === 0 ? 0.9 : 1) });
  } else {
    b.loft([{ y: 0.56, rx: 0.215 * w, rz: 0.18 * w }, { y: 0.97, rx: 0.182 * w, rz: 0.132 * w }], 8, B.skirtU, over, { capHi: false, capLo: false });
  }
  return b.geometry();
}

// Named poses: bone -> [x, y, z] rotation in radians. `lift` moves the whole body up or down.
const POSES = {
  stand: { armL: [0, 0, 0.07], armR: [0, 0, -0.07], foreL: [-0.18, 0, 0], foreR: [-0.18, 0, 0] },
  sit: { lift: -0.4, thighL: [-1.45, 0, 0.06], thighR: [-1.45, 0, -0.06], shinL: [1.42, 0, 0], shinR: [1.42, 0, 0], skirtU: [-1.45, 0, 0], skirtL: [1.42, 0, 0], spine: [0.06, 0, 0], armL: [-0.32, 0, 0.1], armR: [-0.32, 0, -0.1], foreL: [-0.95, 0, 0], foreR: [-0.95, 0, 0] },
  ground: { lift: -0.8, thighL: [-1.52, 0, 0.08], thighR: [-1.52, 0, -0.08], shinL: [0.12, 0, 0], shinR: [0.12, 0, 0], skirtU: [-1.52, 0, 0], skirtL: [0.1, 0, 0], spine: [0.1, 0, 0], head: [-0.2, 0, 0], armL: [0.25, 0, 0.12], armR: [0.25, 0, -0.12], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0] },
  carry: { armR: [-2.75, 0, -0.1], foreR: [-0.25, 0, 0], armL: [0, 0, 0.07], foreL: [-0.2, 0, 0], head: [0.05, 0, 0] },
  staff: { armL: [-0.45, 0, 0.12], foreL: [-1.0, 0, 0], armR: [0, 0, -0.07], foreR: [-0.18, 0, 0] },
  lie: { lift: -0.78, rootX: -Math.PI / 2, armL: [0, 0, 0.3], armR: [0, 0, -0.3] },
  kneel: { lift: -0.42, thighL: [-1.5, 0, 0], thighR: [0.1, 0, 0], shinL: [1.5, 0, 0], shinR: [1.55, 0, 0], skirtU: [-0.7, 0, 0], skirtL: [1.2, 0, 0], spine: [0.25, 0, 0], armR: [-0.9, 0, -0.1], foreR: [-0.7, 0, 0] },
  throne: { lift: -0.28, thighL: [-1.45, 0, 0.12], thighR: [-1.45, 0, -0.12], shinL: [1.42, 0, 0], shinR: [1.42, 0, 0], skirtU: [-1.45, 0, 0], skirtL: [1.42, 0, 0], armL: [-0.2, 0, 0.3], armR: [-0.2, 0, -0.3], foreL: [-1.2, 0, 0], foreR: [-1.2, 0, 0] },
  guard: { armR: [-0.5, 0, -0.1], foreR: [-1.3, 0, 0], armL: [0, 0, 0.1], foreL: [-0.2, 0, 0] },
};
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const ANIM_BONES = ['hips', 'spine', 'neck', 'head', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR', 'skirtU', 'skirtL', 'handL', 'handR'];

export const figureMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export class Actor {
  constructor(spec = {}, seed = 1) {
    this.spec = spec; this.seed = seed;
    this.group = new THREE.Group();
    this.bones = {}; const list = [];
    for (const [name, parent, x, y, z] of BONES) {
      const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, z);
      this.bones[name] = bone; list.push(bone);
      if (parent) this.bones[parent].add(bone);
    }
    this.material = spec.ownMaterial ? figureMaterial.clone() : figureMaterial;
    this.mesh = new THREE.SkinnedMesh(buildFigure(spec, seed), this.material);
    this.mesh.add(this.bones.root);
    this.mesh.bind(new THREE.Skeleton(list));
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    this.mesh.frustumCulled = true;
    const h = spec.height || 1;
    this.mesh.scale.set(h, h, h);
    this.group.add(this.mesh);
    // state
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.height = 1.72 * h;
    this.pose = 'stand'; this.walk = 0; this.phase = (seed * 1.7) % 6; this.speed = 0;
    this.talking = 0; this.talkT = seed * 3.1; this.gesture = spec.gesture || 1;
    this.lookAt = null; this.headYaw = 0; this.headPitch = 0;
    this.cur = {}; for (const n of ANIM_BONES) this.cur[n] = [0, 0, 0];
    this.lift = 0; this.rootX = 0; this.t = seed * 0.37; this.extra = null;
    this.visible = true;
  }
  attach(boneName, obj) { this.bones[boneName].add(obj); return obj; }
  place(x, z, heading, y) { this.x = x; this.z = z; if (heading != null) this.heading = heading; if (y != null) this.y = y; this.sync(); }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.heading; }
  headWorld(out) { return this.bones.head.getWorldPosition(out || new THREE.Vector3()).add(_v.set(0, 0.12, 0)); }
  face(x, z, dt, k = 8) { const want = Math.atan2(x - this.x, z - this.z); this.heading = dt ? dampAngle(this.heading, want, k, dt) : want; }

  update(dt, quality = 1) {
    this.t += dt;
    const P = POSES[this.pose] || POSES.stand, base = POSES.stand, k = 9;
    const moving = clamp(this.speed / 1.6, 0, 1);
    this.walk = damp(this.walk, moving, 10, dt);
    this.phase += this.speed * dt * (this.spec.length === 'short' ? 4.0 : 4.6);
    const wk = this.walk, ph = this.phase, long = this.spec.length !== 'short';
    const A = (long ? 0.3 : 0.5) * wk, s = Math.sin(ph), c = Math.cos(ph);
    this.talking = damp(this.talking, this.speaking ? 1 : 0, 6, dt);
    if (this.speaking) this.talkT += dt;
    const tk = this.talking * this.gesture, tt = this.talkT;
    const target = (name) => {
      const p = P[name] || base[name] || ZERO;
      let x = p[0], y = p[1], z = p[2];
      switch (name) {
        case 'thighL': x += -s * A; break;
        case 'thighR': x += s * A; break;
        case 'shinL': x += Math.max(0, Math.sin(ph - 0.6)) * A * 1.5; break;
        case 'shinR': x += Math.max(0, -Math.sin(ph - 0.6)) * A * 1.5; break;
        case 'armL': x += s * 0.38 * wk; break;
        case 'armR': x += -s * 0.38 * wk - tk * (0.55 + 0.22 * Math.sin(tt * 2.1)); z += -tk * 0.22; break;
        case 'foreL': x += -0.12 * wk; break;
        case 'foreR': x += -0.12 * wk - tk * (0.85 + 0.3 * Math.sin(tt * 3.3 + 1)); break;
        case 'skirtU': x += Math.sin(ph * 2) * 0.03 * wk; break;
        case 'skirtL': x += -(0.05 + 0.07 * Math.abs(s)) * wk; break;
        case 'spine': y += s * 0.07 * wk; x += 0.03 * wk + Math.sin(this.t * 1.3) * 0.012; break;
        case 'hips': y += -s * 0.05 * wk; break;
        case 'head': x += this.headPitch + tk * 0.06 * Math.sin(tt * 2.7); y += this.headYaw * 0.65 + tk * 0.08 * Math.sin(tt * 1.4); break;
        case 'neck': y += this.headYaw * 0.3; break;
      }
      if (this.extra && this.extra[name]) { const e = this.extra[name]; x += e[0]; y += e[1]; z += e[2]; }
      return [x, y, z];
    };
    // Head follows a point of interest.
    if (this.lookAt) {
      const dx = this.lookAt.x - this.x, dz = this.lookAt.z - this.z;
      const yaw = clamp(wrapPi(Math.atan2(dx, dz) - this.heading), -1.1, 1.1), d = Math.hypot(dx, dz);
      const pitch = clamp(-Math.atan2((this.lookAt.y || this.y + 1.5) - (this.y + 1.6 * (this.spec.height || 1)) - (P.lift || 0), Math.max(0.5, d)), -0.5, 0.5);
      this.headYaw = damp(this.headYaw, yaw, 5, dt); this.headPitch = damp(this.headPitch, pitch, 5, dt);
    } else { this.headYaw = damp(this.headYaw, Math.sin(this.t * 0.31 + this.seed) * 0.25 * (1 - wk), 2, dt); this.headPitch = damp(this.headPitch, 0, 3, dt); }
    for (const name of ANIM_BONES) {
      const t = target(name), cu = this.cur[name];
      cu[0] = damp(cu[0], t[0], k, dt); cu[1] = damp(cu[1], t[1], k, dt); cu[2] = damp(cu[2], t[2], k, dt);
      this.bones[name].quaternion.setFromEuler(_e.set(cu[0], cu[1], cu[2], 'YXZ'));
    }
    this.lift = damp(this.lift, (P.lift || 0) + Math.abs(s) * 0.028 * wk, 9, dt);
    this.rootX = damp(this.rootX, P.rootX || 0, 6, dt);
    this.bones.root.position.y = this.lift;
    this.bones.root.rotation.x = this.rootX;
    this.sync();
  }
}
const ZERO = [0, 0, 0];

// Small props carried in a hand or planted beside a figure.
const propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function coloredBox(sx, sy, sz, hex) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(), n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
export function makeProp(kind) {
  const g = new THREE.Group();
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, propMat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  if (kind === 'staff') add(coloredBox(0.035, 1.7, 0.035, 0x5a4634), 0, 0.55, 0.03);
  if (kind === 'crook') { add(coloredBox(0.035, 1.6, 0.035, 0x6b4a32), 0, 0.5, 0.03); add(coloredBox(0.16, 0.035, 0.035, 0x6b4a32), 0.07, 1.3, 0.03); }
  if (kind === 'spear') { add(coloredBox(0.03, 2.3, 0.03, 0x5a4634), 0, 0.8, 0.03); add(coloredBox(0.06, 0.24, 0.02, 0xa8a8a0), 0, 2.05, 0.03); }
  if (kind === 'scroll') add(coloredBox(0.05, 0.05, 0.26, 0xe3d5a8), 0, -0.02, 0.06);
  if (kind === 'cup') add(coloredBox(0.09, 0.06, 0.09, 0x2a2522), 0, -0.02, 0.06);
  if (kind === 'lyre') { add(coloredBox(0.26, 0.2, 0.05, 0x8a6a42), 0, 0.05, 0.08); add(coloredBox(0.03, 0.3, 0.03, 0x6b4a32), -0.11, 0.28, 0.08); add(coloredBox(0.03, 0.3, 0.03, 0x6b4a32), 0.11, 0.28, 0.08); add(coloredBox(0.28, 0.03, 0.03, 0x6b4a32), 0, 0.42, 0.08); }
  if (kind === 'pole') add(coloredBox(0.03, 1.5, 0.03, 0x4a3423), 0, -0.6, 0.03);
  return g;
}
