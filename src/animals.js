// Animals: goat, kid, sheep, donkey, dog, chicken, gull. Built in code, each one skinned mesh with rigid per-bone
// skinning. Their bodies are smooth (round cross-sections with enough sides, smooth shading that keeps hard edges
// such as hooves and eyes sharp) and use their own material with a fine hair grain, a lighter underside, and a
// little light caught at the edges of the coat, so they sit beside the smooth people rather than the old faceted ones.
import * as THREE from 'three';
import { toCreasedNormals } from '../vendor/BufferGeometryUtils.js';
import { clamp, damp, mulberry32 } from './util.js';
import { Builder } from './actors.js';

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

// The coat. `fur` (a per-vertex value) is 0 for short hair and feathers and 1 for wool.
//   grain      fine noise in the color, finer for hair and coarser and deeper for wool
//   underside  a little lighter (most of these animals are paler underneath), which also keeps the belly from
//              going black in shade
//   edges      light caught at the edges of the coat, where the eye looks across the hairs
export const animalMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
animalMaterial.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float fur;\nvarying vec3 vAP; varying vec3 vAN; varying float vFur;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAP = position; vAN = normal; vFur = fur;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vAP; varying vec3 vAN; varying float vFur;
float aHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float aNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(aHash(i), aHash(i + vec3(1, 0, 0)), f.x), mix(aHash(i + vec3(0, 1, 0)), aHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(aHash(i + vec3(0, 0, 1)), aHash(i + vec3(1, 0, 1)), f.x), mix(aHash(i + vec3(0, 1, 1)), aHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  {
    // hair runs along the body, so the grain is stretched front to back
    float hair = aNoise(vAP * vec3(150.0, 150.0, 45.0)) * 0.6 + aNoise(vAP * vec3(330.0, 330.0, 110.0)) * 0.4;
    float wool = aNoise(vAP * 70.0) * 0.55 + aNoise(vAP * 160.0) * 0.45;
    float g = mix(hair, wool, vFur);
    diffuseColor.rgb *= mix(0.88 + 0.24 * g, 0.72 + 0.4 * g, vFur);
    float under = smoothstep(-0.15, -0.75, normalize(vAN).y);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.22 + 0.03, under * 0.6);
  }`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
    reflectedLight.indirectDiffuse *= 1.0 + rim * (0.9 + 0.6 * vFur); }`);
};

// len: body length, girth: body half width, leg: leg length, nl / na: neck length and its angle above level, head / hw: head length and half width.
// chest: how deep the chest is against the girth; hoof: the color of hooves (paws when absent).
const QUAD = {
  goat: { len: 0.72, girth: 0.15, leg: 0.36, nl: 0.3, na: 1.0, head: 0.24, hw: 0.065, cols: [0x8a6a4a, 0xe4dccb, 0x3a3028, 0xb89a72, 0x6a5038], ear: [0.1, -0.02, -0.02], tail: [0, 0.1, -0.05], horns: 0.2, beard: 1, pace: 1.1, chest: 1.12, hoof: 0x2a221c },
  kid: { len: 0.42, girth: 0.09, leg: 0.24, nl: 0.17, na: 1.0, head: 0.16, hw: 0.05, cols: [0xe4dccb, 0xb89a72, 0x8a6a4a], ear: [0.07, -0.01, -0.01], tail: [0, 0.06, -0.03], pace: 0.9, chest: 1.05, hoof: 0x3a3028 },
  sheep: { len: 0.74, girth: 0.21, leg: 0.3, nl: 0.22, na: 0.8, head: 0.22, hw: 0.065, cols: [0xe6dfcf, 0xdcd4c0, 0xcfc6b0], face: [0x3a3028, 0xd8cfc0, 0x5a4a3c], ear: [0.09, -0.01, 0], tail: [0, -0.1, -0.04], legHex: 0x3a3028, wool: 1, pace: 0.9, chest: 1.0, hoof: 0x221a14 },
  donkey: { len: 1.12, girth: 0.22, leg: 0.6, nl: 0.46, na: 0.85, head: 0.4, hw: 0.085, cols: [0x8a8078, 0x7a6450, 0x9a9088], ear: [0.03, 0.25, -0.05], tail: [0, -0.5, -0.1], muzzle: 0xd8d0c4, mane: 1, pace: 1.3, chest: 1.1, hoof: 0x2a241e, nose: 0x3a3430 },
  dog: { len: 0.62, girth: 0.12, leg: 0.32, nl: 0.15, na: 0.5, head: 0.21, hw: 0.066, cols: [0xb08a5a, 0x4a3a2c, 0xd8c8a8, 0x8a6a4a], ear: [0.015, 0.075, -0.015], tail: [0, 0.16, -0.16], muzzle: 0, pace: 1.4, wag: 1, chest: 1.3, waist: 0.66, nose: 0x1c1612, neckW: 0.9 },
};
const STATES = ['idle', 'graze', 'walk', 'peck', 'sit', 'sleep', 'fly'];

export class Animal {
  constructor(kind = 'goat', seed = 1, opts = {}) {
    this.kind = kind; this.seed = seed; this.opts = opts;
    this.group = new THREE.Group();
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.speed = 0; this.state = opts.state || 'idle'; this.bank = 0;
    this.t = seed * 1.31; this.phase = seed * 0.9; this.wk = 0; this.gz = 0; this.si = 0; this.sl = 0; this.fl = 0; this.flick = 0; this.flickT = 1 + (seed % 5); this.earT = 2 + (seed % 3); this.ear = 0; this.flap = 1;
    const b = new Builder(seed * 17 + 3), rig = this.rig = new Rig(), r = mulberry32(seed * 53 + 11);
    b.tv = 0.03;   // an even coat: the grain comes from the material
    if (kind === 'chicken') this._chicken(b, rig, r); else if (kind === 'gull' || kind === 'pigeon' || kind === 'swallow') this._gull(b, rig, r); else this._quad(b, rig, r, QUAD[kind] || QUAD.goat);
    this.bones = rig.by; this.triangles = b.tris;
    const geo = toCreasedNormals(b.geometry(), 1.2);   // smooth across the body, sharp at hooves, eyes, and the like
    // Wool on the sheep's body, neck, and upper legs; short hair or feathers everywhere else.
    const nv = geo.attributes.position.count, fur = new Float32Array(nv);
    if (this.d && this.d.wool) { const si = geo.attributes.skinIndex.array, woolly = new Set(['body', 'neck', 'FLu', 'FRu', 'BLu', 'BRu'].map((n) => rig.list.indexOf(rig.by[n]))); for (let i = 0; i < nv; i++) if (woolly.has(si[i * 4])) fur[i] = 1; }
    geo.setAttribute('fur', new THREE.BufferAttribute(fur, 1));
    this.mesh = new THREE.SkinnedMesh(geo, animalMaterial);
    this.mesh.add(rig.by.root); this.mesh.bind(new THREE.Skeleton(rig.list));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.6);
    const s = this.scale = (opts.scale || 1) * (0.94 + 0.12 * r()); this.mesh.scale.setScalar(s);
    this.group.add(this.mesh);
  }
  place(x, z, heading, y) { this.x = x; this.z = z; if (heading != null) this.heading = heading; if (y != null) this.y = y; this.sync(); return this; }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.heading; }

  _quad(b, rig, r, d) {
    this.d = d;
    const L = d.len, g = d.girth, H = this.H = d.leg + g * 0.85, zf = L / 2, zb = -L / 2, col = pick(r, d.cols), legHex = d.legHex || shade(col, 0.86), face = d.face ? pick(r, d.face) : col;
    const R = {}; R.root = rig.add('root', null, 0, 0, 0); R.body = rig.add('body', 'root', 0, H, 0);
    const N0 = [0, H + g * 0.35, zf - g * 0.35], N1 = [0, N0[1] + Math.sin(d.na) * d.nl, N0[2] + Math.cos(d.na) * d.nl];
    R.neck = rig.add('neck', 'body', N0[0], N0[1], N0[2]); R.head = rig.add('head', 'neck', N1[0], N1[1], N1[2]);
    // The body, rump to shoulders: round hindquarters, a waist (tucked in a dog), a deep chest, and the withers.
    const wy = d.wool ? 1.14 : 1, ch = d.chest || 1.1, wa = d.waist || 0.95, sq = d.wool ? 2.15 : 2.35;
    b.loftZ([
      { z: zb - 0.03 * L, rx: 0.32 * g, ry: 0.36 * g * wy, y: H + 0.18 * g },
      { z: zb + 0.05 * L, rx: 0.76 * g, ry: 0.8 * g * wy, y: H + 0.12 * g, sq: sq },
      { z: zb + 0.18 * L, rx: 0.95 * g, ry: 0.97 * g * wy, y: H + 0.05 * g, sq: sq },
      { z: zb + 0.42 * L, rx: (0.9 + 0.08 * (1 - wa)) * g, ry: wa * g * wy, y: H + (1 - wa) * 0.35 * g, sq: sq },
      { z: zf - 0.3 * L, rx: 1.02 * g, ry: ch * g * wy, y: H - (ch - 1) * 0.6 * g, sq: sq },
      { z: zf - 0.13 * L, rx: 0.94 * g, ry: ch * 0.97 * g * wy, y: H - (ch - 1) * 0.45 * g, sq: sq },
      { z: zf - 0.02 * L, rx: 0.72 * g, ry: 0.82 * g * wy, y: H + 0.12 * g, sq: sq },
      { z: zf + 0.04 * L, rx: 0.42 * g, ry: 0.5 * g * wy, y: H + 0.28 * g },
    ], 12, R.body, col);
    b.rod(N0, N1, (d.neckW || 0.66) * g * (d.wool ? 1.1 : 1), col, R.neck, 9, Math.max(0.44 * g, d.hw * 0.95));
    // The head: skull, cheeks, and a muzzle that narrows and drops to the nose.
    const hd = d.head, hw = d.hw, y1 = N1[1], z1 = N1[2], mz = d.muzzle || face;
    b.loftZ([
      { z: z1 - 0.3 * hd, rx: 0.55 * hw, ry: 0.6 * hw, y: y1 + 0.06 * hd },
      { z: z1 - 0.12 * hd, rx: 0.93 * hw, ry: 0.98 * hw, y: y1 + 0.03 * hd },
      { z: z1 + 0.14 * hd, rx: hw, ry: 1.04 * hw, y: y1 },
      { z: z1 + 0.42 * hd, rx: 0.8 * hw, ry: 0.84 * hw, y: y1 - 0.12 * hd },
      { z: z1 + 0.68 * hd, rx: 0.64 * hw, ry: 0.7 * hw, y: y1 - 0.21 * hd, hex: mz },
      { z: z1 + 0.9 * hd, rx: 0.5 * hw, ry: 0.55 * hw, y: y1 - 0.29 * hd, hex: mz },
      { z: z1 + hd, rx: 0.32 * hw, ry: 0.38 * hw, y: y1 - 0.32 * hd, hex: mz },
    ], 10, R.head, face);
    if (d.nose) b.ball(0, y1 - 0.29 * hd, z1 + 0.99 * hd, 0.3 * hw, 0.22 * hw, 0.1 * hw, d.nose, R.head, null, true);
    for (const sx of [1, -1]) {
      b.ball(sx * hw * 0.86, y1 + 0.22 * hw, z1 + 0.28 * hd, 0.012, 0.017, 0.019, 0x120e0b, R.head, null, true);   // eye
      const e0 = [sx * hw * 0.78, y1 + hw * 0.72, z1 - 0.12 * hd], ear = rig.add(sx > 0 ? 'earL' : 'earR', 'head', e0[0], e0[1], e0[2]);
      b.rod(e0, [e0[0] + sx * d.ear[0], e0[1] + d.ear[1], e0[2] + d.ear[2]], hw * 0.4, shade(face, 0.9), ear, 6, hw * 0.12);
      if (d.horns) b.rod([sx * hw * 0.4, y1 + hw * 0.85, z1 - 0.02], [sx * hw * 1.1, y1 + hw + d.horns, z1 - 0.14], 0.02, 0xb8ad94, R.head, 5, 0.005);
      // legs: an upper and a lower bone each; the lower ends in a dark hoof or a paw
      for (const [nm, lz] of [['F', zf - g * 0.7], ['B', zb + g * 0.7]]) {
        const lx = sx * g * 0.62, top = H - g * 0.35, mid = top * 0.5, side = sx > 0 ? 'L' : 'R', back = nm === 'B';
        const up = rig.add(nm + side + 'u', 'body', lx, top, lz), lo = rig.add(nm + side + 'l', nm + side + 'u', lx, mid, lz);
        // A thick upper leg that starts inside the body; on the hind legs the knee is forward and the hock back,
        // the zigzag every hoofed animal and dog has; the front legs are nearly straight.
        const r0 = g * (back ? 0.52 : 0.42), r1 = Math.max(0.016, g * 0.2), r2 = Math.max(0.014, g * 0.15), hy = Math.min(0.06, mid * 0.2);
        const kz = back ? 0.07 * d.leg : -0.02 * d.leg, hz = back ? -0.1 * d.leg : 0.01 * d.leg, hk = back ? mid * 0.45 : mid * 0.32;
        b.rod([lx, top + g * 0.3, lz + (back ? -0.03 : 0.01) * d.leg], [lx, mid, lz + kz], r0 * (d.wool ? 1.15 : 1), d.wool ? col : legHex, up, 8, r1 * 1.25);
        b.ball(lx, mid, lz + kz, r1 * 1.2, r1 * 1.35, r1 * 1.3, legHex, lo, null, true);   // the knee, so the two parts meet when it bends
        b.rod([lx, mid, lz + kz], [lx, hk, lz + hz], r1 * 1.05, legHex, lo, 7, r2 * 1.15);
        b.ball(lx, hk, lz + hz, r2 * 1.2, r2 * 1.3, r2 * 1.3, legHex, lo, null, true);
        b.rod([lx, hk, lz + hz], [lx, hy, lz + hz * 0.3 + 0.01 * d.leg], r2 * 1.1, legHex, lo, 7, r2);
        if (d.hoof) b.rod([lx, hy, lz + hz * 0.3 + 0.01 * d.leg], [lx, 0, lz + hz * 0.3 + 0.03 * d.leg], r2 * 1.05, d.hoof, lo, 7, r2 * 1.3);
        else b.ball(lx, hy * 0.5, lz + hz * 0.3 + r2 * 0.6, r2 * 1.3, hy * 0.55, r2 * 1.7, legHex, lo, null, true);
      }
    }
    if (d.beard) b.rod([0, y1 - 0.3 * hd, z1 + 0.75 * hd], [0, y1 - 0.3 * hd - 0.09, z1 + 0.68 * hd], 0.016, shade(face, 0.85), R.head, 5, 0.004);
    if (d.mane) { const m0 = [0, N0[1] + g * 0.42, N0[2] - g * 0.2], m1 = [0, N1[1] + d.hw * 0.9, N1[2] - d.hw * 0.4]; b.rod(m0, m1, 0.035, 0x2a221c, R.neck, 6, 0.028); }
    const T0 = [0, H + g * 0.55, zb + 0.02]; R.tail = rig.add('tail', 'body', T0[0], T0[1], T0[2]);
    b.rod(T0, [T0[0] + d.tail[0], T0[1] + d.tail[1], T0[2] + d.tail[2]], g * 0.16, d.mane ? 0x2a221c : col, R.tail, 6, g * (d.mane ? 0.22 : 0.07));
    if (this.opts.pack) {
      // Pack saddle: a blanket and a basket on each side.
      b.box(0, H + g * 0.95, -0.02, g * 2.25, 0.05, 0.5, 0x9a4a3a, R.body);
      for (const sx of [1, -1]) b.loft([{ y: H - 0.12, rx: 0.13, rz: 0.17, x: sx * (g + 0.14) }, { y: H + 0.22, rx: 0.17, rz: 0.22, x: sx * (g + 0.15) }, { y: H + 0.27, rx: 0.13, rz: 0.17, x: sx * (g + 0.15), hex: 0xd9c27a }], 10, R.body, 0xb89a5a);
    }
  }

  _chicken(b, rig, r) {
    const col = pick(r, [0xb5673a, 0xe4dccb, 0x3a3028, 0xc98a4a, 0x8a5a3a]), H = this.H = 0.2, wing = shade(col, 0.82), YEL = 0xd9a93c, RED = 0xb5352a;
    const R = {}; R.root = rig.add('root', null, 0, 0, 0); R.body = rig.add('body', 'root', 0, H, 0);
    R.neck = rig.add('neck', 'body', 0, H + 0.05, 0.08); R.head = rig.add('head', 'neck', 0, H + 0.17, 0.12); R.tail = rig.add('tail', 'body', 0, H + 0.05, -0.1);
    // A plump body: full breast in front, rising to the tail behind.
    b.loftZ([{ z: -0.14, rx: 0.02, ry: 0.025, y: H + 0.07 }, { z: -0.1, rx: 0.055, ry: 0.06, y: H + 0.04 }, { z: -0.03, rx: 0.078, ry: 0.085, y: H + 0.005 }, { z: 0.04, rx: 0.076, ry: 0.088, y: H - 0.005 },
      { z: 0.1, rx: 0.058, ry: 0.07, y: H + 0.015 }, { z: 0.135, rx: 0.03, ry: 0.04, y: H + 0.045 }], 10, R.body, col);
    for (const sx of [1, -1]) b.ball(sx * 0.068, H + 0.02, -0.01, 0.022, 0.048, 0.085, wing, R.body);   // folded wings
    b.rod([0, H + 0.04, 0.08], [0, H + 0.17, 0.12], 0.036, col, R.neck, 7, 0.026);
    b.ball(0, H + 0.19, 0.125, 0.032, 0.034, 0.038, col, R.head);
    b.rod([0, H + 0.185, 0.155], [0, H + 0.175, 0.2], 0.012, YEL, R.head, 5, 0.002);
    for (let i = 0; i < 3; i++) b.ball(0, H + 0.225 + 0.006 * Math.sin(i * 1.4), 0.105 + 0.022 * i, 0.007, 0.016, 0.012, RED, R.head, null, true);   // comb
    b.ball(0, H + 0.158, 0.15, 0.007, 0.014, 0.01, RED, R.head, null, true);   // wattle
    for (const sx of [1, -1]) b.ball(sx * 0.03, H + 0.197, 0.142, 0.005, 0.007, 0.007, 0x120e0b, R.head, null, true);
    // Tail feathers: a raised fan, seen from both sides.
    const tq = (p, hex) => { for (const o of [[1, 0, 0], [-1, 0, 0]]) { b.out = o; b.quad(p[0], p[1], p[2], p[3], hex, R.tail); } b.out = null; };
    tq([[0, H + 0.04, -0.1], [0, H + 0.1, -0.08], [0, H + 0.2, -0.17], [0, H + 0.12, -0.21]], shade(col, 0.75));
    for (const sx of [0.012, -0.012]) tq([[sx, H + 0.04, -0.1], [sx, H + 0.09, -0.09], [sx, H + 0.16, -0.2], [sx, H + 0.08, -0.22]], shade(col, 0.68));
    for (const sx of [1, -1]) { const lg = rig.add(sx > 0 ? 'legL' : 'legR', 'body', sx * 0.035, H - 0.05, 0); b.rod([sx * 0.035, H - 0.03, 0], [sx * 0.035, 0.01, 0], 0.01, YEL, lg, 5, 0.008); for (const a of [-0.45, 0, 0.45]) b.rod([sx * 0.035, 0.006, 0], [sx * 0.035 + Math.sin(a) * 0.04, 0.004, Math.cos(a) * 0.04], 0.005, YEL, lg, 4, 0.003); }
  }

  // The gull, and (2026-11-19) the pigeon of the market square: the same bird in grey-blue, with a darker head, dark
  // bars across the wings and a dark beak, drawn at a little over half the size (pigeons.js scales it). And the
  // swallow: dark blue-black, with long swept-back wings and a forked tail, drawn at about a quarter (swallows.js).
  _gull(b, rig) {
    const pg = this.kind === 'pigeon', sw = this.kind === 'swallow', R = {}, W = sw ? 0x232a3c : pg ? 0x8e95a2 : 0xf0f0ec, G = sw ? 0x272e42 : pg ? 0x9ea4ae : 0xa8b0b8, K = sw ? 0x15181f : pg ? 0x3c3f48 : 0x2e2e30; this.H = 0.12;
    const q = (p, hex, bone) => { for (const o of [[0, 1, 0], [0, -1, 0]]) { b.out = o; b.quad(p[0], p[1], p[2], p[3], hex, bone); } b.out = null; };
    R.root = rig.add('root', null, 0, 0, 0); R.body = rig.add('body', 'root', 0, 0.12, 0);
    b.loftZ([{ z: -0.2, rx: 0.015, ry: 0.012, y: 0.125 }, { z: -0.08, rx: 0.055, ry: 0.05, y: 0.12 }, { z: 0.07, rx: 0.06, ry: 0.055, y: 0.12 }, { z: 0.13, rx: 0.04, ry: 0.04, y: 0.13 }], 9, R.body, W);
    b.ball(0, 0.145, 0.15, 0.034, 0.033, 0.042, sw ? 0x1e2434 : pg ? 0x6c7280 : W, R.body);   // head
    b.rod([0, 0.142, 0.185], [0, 0.135, 0.235], 0.01, sw ? 0x1a1a1a : pg ? 0x4a4240 : 0xd9a93c, R.body, 5, 0.003);
    if (sw) for (const sx of [1, -1]) q([[sx * 0.005, 0.125, -0.19], [sx * 0.05, 0.125, -0.19], [sx * 0.1, 0.125, -0.46], [sx * 0.07, 0.125, -0.46]], W, R.body);   // the fork
    else { b.out = [0, 1, 0]; b.quad([-0.06, 0.125, -0.19], [0.06, 0.125, -0.19], [0.025, 0.125, -0.3], [-0.025, 0.125, -0.3], W, R.body); b.out = null; }
    for (const sx of [1, -1]) {
      const w1 = rig.add(sx > 0 ? 'wingL' : 'wingR', 'body', sx * 0.04, 0.15, 0.03), w2 = rig.add(sx > 0 ? 'tipL' : 'tipR', sx > 0 ? 'wingL' : 'wingR', sx * 0.3, 0.15, 0.02);
      if (sw) {   // long, narrow, swept back
        q([[sx * 0.04, 0.15, 0.08], [sx * 0.28, 0.15, 0.02], [sx * 0.28, 0.15, -0.06], [sx * 0.04, 0.15, -0.05]], G, w1);
        q([[sx * 0.28, 0.15, 0.02], [sx * 0.52, 0.15, -0.12], [sx * 0.5, 0.15, -0.16], [sx * 0.28, 0.15, -0.06]], shade(G, 0.92), w2);
        q([[sx * 0.52, 0.15, -0.12], [sx * 0.68, 0.15, -0.27], [sx * 0.64, 0.15, -0.28], [sx * 0.5, 0.15, -0.16]], K, w2);
        continue;
      }
      q([[sx * 0.04, 0.15, 0.1], [sx * 0.3, 0.15, 0.08], [sx * 0.3, 0.15, -0.05], [sx * 0.04, 0.15, -0.06]], G, w1);
      q([[sx * 0.3, 0.15, 0.08], [sx * 0.5, 0.15, 0.04], [sx * 0.49, 0.15, -0.05], [sx * 0.3, 0.15, -0.05]], shade(G, 0.92), w2);
      q([[sx * 0.5, 0.15, 0.04], [sx * 0.62, 0.15, 0.0], [sx * 0.6, 0.15, -0.05], [sx * 0.49, 0.15, -0.05]], K, w2);   // black wingtips
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
    if (this.kind === 'gull' || this.kind === 'pigeon' || this.kind === 'swallow') {
      const fl = this.fl, pg = this.kind === 'pigeon', sw = this.kind === 'swallow';
      this.flap = damp(this.flap, pg || (sw ? Math.sin(t * 1.7 + this.seed) > -0.15 : Math.sin(t * 0.37 + this.seed) > -0.2) ? 1 : sw ? 0.08 : 0.12, sw ? 6 : 2, dt);   // a swallow beats in bursts and glides between
      this.phase += dt * (sw ? 26 : pg ? 17 : 11) * (0.6 + 0.4 * this.flap);
      const a = Math.sin(this.phase) * 0.6 * this.flap + 0.12, a2 = Math.sin(this.phase - 0.9) * 0.45 * this.flap - 0.1;
      for (const [sx, s] of [[1, 'L'], [-1, 'R']]) { B['wing' + s].rotation.set(0, sx * 1.35 * (1 - fl), sx * a * fl); B['tip' + s].rotation.set(0, sx * 0.3 * (1 - fl), sx * a2 * fl); }
      const u = (t * 0.55 + this.seed * 0.37) % 1, pk = pg ? gz * (1 - fl) * (u < 0.5 ? Math.abs(Math.sin(u * 12.57)) : 0) : 0;   // a pigeon nods down to peck
      B.body.rotation.set(-0.05 * fl + 0.55 * pk, 0, -this.bank * fl); this.sync(); return;
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
export const ANIMAL_KINDS = ['goat', 'kid', 'sheep', 'donkey', 'dog', 'chicken', 'gull', 'pigeon', 'swallow'], ANIMAL_STATES = STATES;
