// Vignettes: small self-contained scenes of people at work, with their props and animals.
// const v = makeVignette(name, seed, opts) gives { group, update(dt), radius, colliders, people, animals, note }.
// Everything is built around the local origin, and +z is the side the scene faces.
// All static props of a vignette are one mesh. Fires and coals are a second, unlit mesh.
// Positions of the people and animals in a vignette (x, z, heading, lookAt) are local to v.group.
import * as THREE from 'three';
import { clamp, dampAngle, mulberry32 } from './util.js';
import { Actor, Builder, propMaterial } from './actors.js';
import { Animal } from './animals.js';

const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const CLAY = 0xb5673a, WOOD = 0x6b4a32, PALE = 0x9a7a52, STONE = 0x9a958a, IRON = 0x4a4a4e, STRAW = 0xc9b06a, ROPE = 0xa89468, SOIL = 0x5a4634, GOLD = 0xd9b04a, FISH = 0xa9b4bc, CLOTHW = 0xe6dcc0;
const PI = Math.PI;

// ---- looks ------------------------------------------------------------------------------------
const SKINS = ['fair', 'tan', 'olive', 'dark', 'tan', 'olive', 'pale', 'tan'];
const HAIRS = [0x2a221c, 0x15110e, 0x4a3a2a, 0x3a2a1c, 0x5a4a3a, 0x6a4a2a];
const PLAIN = [0xe6dcc0, 0xd9c4a3, 0xcfc0a0, 0xb9a57a, 0x9a8a68, 0xa89878, 0x8a7a5a, 0xc4b08a];
const DYED = [0xd9a93c, 0x9a4a3a, 0x6a8a9a, 0xe6dcc0, 0xc98a5a, 0x7a8256, 0xb86a4a, 0xefe9dc, 0x6f7f8a, 0x8a5a7a];
const TRIM = [0x8a3b2e, 0x2f5f7a, 0x5a4a3a, 0x3f5a3a, 0x6a2f6a];
function look(kind, r, more) {
  const p = (a) => a[Math.floor(r() * a.length) % a.length];
  const s = { skin: p(SKINS), hair: p(HAIRS), nose: p(['straight', 'straight', 'snub', 'hook', 'broad']), build: 0.95 + 0.13 * r() };
  if (kind === 'worker' || kind === 'smith') Object.assign(s, { dress: r() < 0.55 ? 'exomis' : 'chiton', length: 'short', robe: p(PLAIN), beard: p(['none', 'short', 'short', 'full']), hairStyle: p(['full', 'full', 'receding', 'bald', 'curls']), shoes: r() < 0.5 ? false : undefined, height: 0.96 + 0.08 * r(), hat: r() < 0.25 ? 'pilos' : 'none' });
  if (kind === 'smith') Object.assign(s, { dress: 'exomis', apron: true, build: 1.1, beard: 'full', hat: 'none' });
  if (kind === 'woman') Object.assign(s, { dress: r() < 0.6 ? 'peplos' : 'mantle', robe: p(DYED), trim: p(TRIM), hairStyle: null, height: 0.9 + 0.06 * r(), build: 0.88 + 0.08 * r(), shoes: r() < 0.4 ? false : undefined });
  if (kind === 'woman' && s.dress === 'mantle') { s.robe2 = p(DYED); if (r() < 0.5) s.hairStyle = 'bun'; }
  if (kind === 'citizen') Object.assign(s, { robe: p(PLAIN), robe2: p(DYED), beard: p(['short', 'full', 'none', 'full']), hairStyle: p(['full', 'curls', 'receding', 'full']), height: 0.97 + 0.07 * r() });
  if (kind === 'old') Object.assign(s, { age: 'old', hair: p([0xcfcac0, 0xb8b2a6, 0xdcd8d0]), robe: p(PLAIN), robe2: p(PLAIN), beard: p(['full', 'long']), hairStyle: p(['receding', 'bald']), height: 0.95 });
  if (kind === 'child' || kind === 'girl') Object.assign(s, { age: 'child', robe: p(DYED), height: 0.56 + 0.12 * r(), shoes: false, hairStyle: kind === 'girl' ? 'bun' : p(['full', 'curls']), build: 1 });
  if (kind === 'girl') { s.woman = true; s.length = 'long'; }
  return Object.assign(s, more);
}

// ---- prop pieces ------------------------------------------------------------------------------
const lath = (b, x, y, z, prof, hex, n = 7, s = 1) => b.loft(prof.map((p) => ({ y: y + p[0] * s, rx: p[1] * s, rz: p[1] * s, x, z, hex: p[2] })), n, 0, hex);
const bx = (b, x, y, z, sx, sy, sz, hex) => b.box(x, y + sy / 2, z, sx, sy, sz, hex, 0);      // y is the underside
const JAR = {
  amphora: [[0, 0.03], [0.08, 0.06], [0.3, 0.16], [0.5, 0.15], [0.62, 0.06], [0.74, 0.05], [0.78, 0.07]],
  hydria: [[0, 0.08], [0.04, 0.07], [0.2, 0.17], [0.34, 0.16], [0.42, 0.06], [0.5, 0.085]],
  krater: [[0, 0.1], [0.05, 0.06], [0.12, 0.07], [0.3, 0.2], [0.5, 0.22], [0.55, 0.25]],
  pithos: [[0, 0.15], [0.3, 0.36], [0.7, 0.4], [0.95, 0.3], [1.05, 0.22], [1.1, 0.26]],
  bowl: [[0, 0.07], [0.03, 0.1], [0.1, 0.16]], cup: [[0, 0.04], [0.02, 0.015], [0.05, 0.02], [0.09, 0.07]],
  pot: [[0, 0.06], [0.1, 0.13], [0.22, 0.12], [0.3, 0.07], [0.32, 0.085]], jug: [[0, 0.05], [0.08, 0.09], [0.16, 0.07], [0.22, 0.035], [0.26, 0.05]],
  basket: [[0, 0.16], [0.22, 0.22]], pail: [[0, 0.1], [0.2, 0.13]], sack: [[0, 0.2], [0.25, 0.24], [0.45, 0.16], [0.5, 0.06]], drum: [[0, 0.3], [0.4, 0.3]],
};
const jar = (b, kind, x, z, y = 0, s = 1, hex = CLAY) => lath(b, x, y, z, JAR[kind], hex, 7, s);
const basket = (b, x, z, y, fill, s = 1) => { lath(b, x, y, z, JAR.basket, 0xb89a5a, 7, s); if (fill != null) lath(b, x, y + 0.2 * s, z, [[0, 0.2], [0.07, 0.1]], fill, 6, s); };
const table = (b, x, z, w, d, h, hex = PALE) => { bx(b, x, h - 0.05, z, w, 0.05, d, hex); for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bx(b, x + sx * (w / 2 - 0.06), 0, z + sz * (d / 2 - 0.06), 0.06, h - 0.05, 0.06, WOOD); };
const stool = (b, x, z, h = 0.44, s = 0.36) => table(b, x, z, s, s, h, WOOD);
const fire = (g, x, y, z, s = 1) => { for (const [dx, dz, hh, hex] of [[0, 0, 0.34, 0xffb030], [0.08, 0.04, 0.24, 0xff7a1a], [-0.07, 0.05, 0.2, 0xff5a10], [0.02, -0.08, 0.27, 0xffd060]]) g.rod([x + dx * s, y, z + dz * s], [x + dx * s * 0.4, y + hh * s, z + dz * s * 0.4], 0.075 * s, hex, 0, 4, 0.01); };
const logs = (b, x, y, z, s = 1) => { b.rod([x - 0.26 * s, y + 0.04, z - 0.1 * s], [x + 0.26 * s, y + 0.04, z + 0.1 * s], 0.045 * s, 0x4a3423, 0, 4); b.rod([x - 0.2 * s, y + 0.05, z + 0.17 * s], [x + 0.2 * s, y + 0.05, z - 0.17 * s], 0.045 * s, 0x3a2a1c, 0, 4); };
const fishOn = (b, x, y, z, a = 0, s = 1) => { const dx = Math.cos(a) * 0.16 * s, dz = Math.sin(a) * 0.16 * s; b.rod([x - dx, y + 0.025, z - dz], [x + dx * 0.4, y + 0.03, z + dz * 0.4], 0.012 * s, FISH, 0, 4, 0.04 * s); b.rod([x + dx * 0.4, y + 0.03, z + dz * 0.4], [x + dx, y + 0.025, z + dz], 0.04 * s, 0x8f9aa4, 0, 4, 0.008); };
const post = (b, x, z, h, r = 0.04, hex = WOOD, y = 0) => b.rod([x, y, z], [x, y + h, z], r, hex, 0, 4);

// ---- movement helpers --------------------------------------------------------------------------
// Walk a person or animal along a line of points. Ends: turn round and come back (default), or opts.loop.
function follow(c, obj, path, speed, o = {}) {
  const segs = []; let total = 0;
  for (let i = 0; i < path.length - 1; i++) { const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) || 0.001; segs.push([path[i], path[i + 1], len, total]); total += len; }
  const st = { s: (o.start || 0) * total, dir: 1, wait: o.wait0 || 0, moving: false, total };
  const side = o.side || 0;
  const put = () => {
    let sg = segs[segs.length - 1]; for (const q of segs) if (st.s <= q[3] + q[2]) { sg = q; break; }
    const k = clamp((st.s - sg[3]) / sg[2], 0, 1), dx = (sg[1][0] - sg[0][0]) / sg[2], dz = (sg[1][1] - sg[0][1]) / sg[2];
    obj.x = sg[0][0] + (sg[1][0] - sg[0][0]) * k + dz * side; obj.z = sg[0][1] + (sg[1][1] - sg[0][1]) * k - dx * side; obj.y = c.hAt(obj.x, obj.z);
    return Math.atan2(dx * st.dir, dz * st.dir);
  };
  obj.heading = put();
  c.tick((dt) => {
    if (st.wait > 0) { st.wait -= dt; obj.speed = 0; st.moving = false; if (o.onWait) o.onWait(st); return; }
    st.s += st.dir * speed * dt; st.moving = true;
    if (o.loop) st.s = (st.s + total) % total;
    else if (st.s >= total || st.s <= 0) { st.s = clamp(st.s, 0, total); st.dir = -st.dir; st.wait = o.pause != null ? o.pause : 1.5; }
    obj.heading = dampAngle(obj.heading, put(), 6, dt); obj.speed = speed;
  });
  return st;
}
// Wander inside a circle, stopping now and then in one of the given states.
function roam(c, an, cx, cz, R, speed, states = ['idle', 'graze']) {
  let tx = an.x, tz = an.z, wait = 0.5 + c.r() * 4;
  c.tick((dt) => {
    if (wait > 0) { wait -= dt; an.speed = 0; if (wait <= 0) { const a = c.r() * 6.283, d = R * Math.sqrt(c.r()); tx = cx + Math.cos(a) * d; tz = cz + Math.sin(a) * d; an.state = 'walk'; } return; }
    const dx = tx - an.x, dz = tz - an.z, d = Math.hypot(dx, dz);
    if (d < 0.12) { wait = 2 + c.r() * 5; an.state = states[Math.floor(c.r() * states.length) % states.length]; an.speed = 0; return; }
    an.heading = dampAngle(an.heading, Math.atan2(dx, dz), 6, dt); an.speed = speed; an.x += Math.sin(an.heading) * speed * dt; an.z += Math.cos(an.heading) * speed * dt; an.y = c.hAt(an.x, an.z);
  });
}
// Two people take turns speaking and look at each other.
function chat(c, A, B, per = 3.5, moods = ['neutral', 'happy']) {
  A.lookAt = { x: B.x, y: B.y + B.height * 0.93, z: B.z }; B.lookAt = { x: A.x, y: A.y + A.height * 0.93, z: A.z };
  A.mood = moods[0]; B.mood = moods[1] || moods[0];
  c.tick((dt, t) => { const k = Math.floor(t / per) % 3; A.speaking = k === 0; B.speaking = k === 1; });
}

export function makeVignette(name, seed = 1, opts = {}) {
  const fn = V[name]; if (!fn) throw new Error('Unknown vignette: ' + name);
  const r = mulberry32(seed * 7919 + 101), P = new Builder(seed * 13 + 5), Gl = new Builder(seed + 2);
  const v = { name, group: new THREE.Group(), people: [], animals: [], colliders: [], radius: 2, note: '', ticks: [], t: 0 };
  const c = {
    r, opts, P, Gl, v, hAt: opts.heightAt || (() => 0),
    person(role, kind, x, z, h, act, ao, more) { const a = new Actor(look(kind, r, more), Math.floor(r() * 9000) + 1); a.place(x, z, h, c.hAt(x, z)); if (act) a.setActivity(act, ao || {}); v.group.add(a.group); v.people.push({ actor: a, role }); return a; },
    animal(kind, x, z, h, state, ao) { const an = new Animal(kind, Math.floor(r() * 9000) + 1, ao || {}); an.state = state || 'idle'; an.place(x, z, h, c.hAt(x, z)); v.group.add(an.group); v.animals.push(an); return an; },
    hit(x, z, rr) { v.colliders.push({ x, z, r: rr }); },
    tick(f) { v.ticks.push(f); },
    // Build props in their own frame, then set them down turned by `rot` at (x, z).
    sub(x, z, rot, f, into) { const b = new Builder(Math.floor(r() * 999) + 1); f(b); const T = into || P, cs = Math.cos(rot), sn = Math.sin(rot); for (let i = 0; i < b.pos.length; i += 3) { const px = b.pos[i], pz = b.pos[i + 2]; T.pos.push(px * cs + pz * sn + x, b.pos[i + 1], -px * sn + pz * cs + z); T.col.push(b.col[i], b.col[i + 1], b.col[i + 2]); T.bone.push(0); } },
  };
  fn(c, v);
  if (P.tris) { v.props = new THREE.Mesh(P.geometry(false), propMaterial); v.props.castShadow = true; v.props.receiveShadow = true; v.group.add(v.props); }
  if (Gl.tris) { v.glow = new THREE.Mesh(Gl.geometry(false), glowMat.clone()); v.group.add(v.glow); c.tick((dt, t) => v.glow.material.color.setScalar(0.82 + 0.12 * Math.sin(t * 11 + seed) + 0.06 * Math.sin(t * 23))); }
  // now: pose the people at once instead of queueing them for the next drawn frame (see poseQueued in actors.js)
  v.update = (dt, now) => { v.t += dt; for (const f of v.ticks) f(dt, v.t); for (const p of v.people) { if (now) p.actor.update(dt); else p.actor.queue(dt); } for (const a of v.animals) a.update(dt); };
  for (let i = 0; i < 24; i++) v.update(0.05, true);      // start already settled into the work
  return v;
}

// ---- the scenes ---------------------------------------------------------------------------------
const V = {
  smithy(c, v) {
    v.radius = 2.6; v.note = 'Under a lean-to or in an open workshop front; the forge side (+x) can stand against a wall.';
    const { P, Gl } = c;
    lath(P, 0, 0, 0.72, [[0, 0.2], [0.5, 0.17]], 0x5a4030, 6); bx(P, 0, 0.5, 0.72, 0.36, 0.1, 0.14, IRON); bx(P, 0, 0.6, 0.72, 0.46, 0.14, 0.17, IRON); P.rod([0.23, 0.68, 0.72], [0.4, 0.7, 0.72], 0.06, IRON, 0, 4, 0.01);   // anvil on a stump
    bx(P, 0.02, 0.74, 0.72, 0.2, 0.02, 0.04, 0xff7a2a);                                                                              // the hot bar
    bx(P, 1.5, 0, -0.5, 1.0, 0.75, 0.9, STONE); bx(P, 1.5, 0.75, -0.93, 1.0, 0.7, 0.12, STONE); Gl.box(1.5, 0.78, -0.45, 0.6, 0.07, 0.5, 0xff5a14, 0); fire(Gl, 1.5, 0.8, -0.5, 0.7);   // forge
    c.sub(1.5, 0.45, 0, (b) => { b.loftZ([{ z: -0.45, rx: 0.04, ry: 0.04, y: 0.5 }, { z: -0.15, rx: 0.22, ry: 0.1, y: 0.5 }, { z: 0.3, rx: 0.26, ry: 0.14, y: 0.5 }, { z: 0.36, rx: 0.2, ry: 0.03, y: 0.5 }], 6, 0, 0x7a5a3a); b.rod([-0.1, 0.62, 0.3], [-0.1, 0.62, 0.52], 0.02, WOOD, 0, 3); b.rod([0.1, 0.62, 0.3], [0.1, 0.62, 0.52], 0.02, WOOD, 0, 3); bx(b, 0, 0, 0.05, 0.3, 0.38, 0.5, WOOD); });   // bellows
    lath(P, -0.95, 0, 0.5, JAR.pail, 0x6b5a48, 7, 1.3); bx(P, -1.3, 0, -0.5, 0.5, 0.5, 0.5, 0x5a4030); P.rod([-1.3, 0.5, -0.5], [-1.2, 0.9, -0.6], 0.015, IRON, 0, 3); P.rod([-1.4, 0.5, -0.45], [-1.45, 0.95, -0.5], 0.015, IRON, 0, 3);
    c.person('smith', 'smith', 0, 0, 0, 'hammer');
    c.person('bellows boy', 'child', 1.5, 1.42, PI, 'bellows', {}, { height: 0.74 });
    c.hit(0, 0.72, 0.4); c.hit(1.5, -0.5, 0.75); c.hit(1.5, 0.5, 0.4);
  },
  potter(c, v) {
    v.radius = 2.1; v.note = 'In a yard or shop front; the drying rack (-x) can stand against a wall.';
    const { P } = c;
    lath(P, 0, 0, 0.5, [[0, 0.12], [0.3, 0.08], [0.36, 0.34], [0.42, 0.34]], 0x7a6a58, 9); jar(P, 'pot', 0, 0.5, 0.42, 0.9, 0x9a6a4a); bx(P, 0, 0, -0.02, 0.36, 0.27, 0.34, WOOD);
    bx(P, -1.3, 0.35, 0.1, 0.5, 0.05, 1.5, PALE); bx(P, -1.3, 0, -0.55, 0.4, 0.35, 0.1, WOOD); bx(P, -1.3, 0, 0.75, 0.4, 0.35, 0.1, WOOD);
    const kinds = ['amphora', 'hydria', 'pot', 'jug', 'krater']; for (let i = 0; i < 5; i++) jar(P, kinds[i], -1.3, -0.5 + i * 0.3, 0.4, i === 0 ? 0.6 : 0.75, i % 2 ? 0x9a6a4a : CLAY);
    jar(P, 'pithos', 1.25, -0.5, 0, 0.8); lath(P, 0.75, 0, 0.35, [[0, 0.2], [0.12, 0.14], [0.17, 0.04]], 0x8a6248, 6); jar(P, 'bowl', 0.6, 0.85, 0, 1, 0x7a6a58);
    c.person('potter', 'worker', 0, 0, 0, 'pot');
    c.hit(0, 0.5, 0.4); c.hit(-1.3, 0.1, 0.8); c.hit(1.25, -0.5, 0.4);
  },
  weaver(c, v) {
    v.radius = 1.9; v.note = 'In a courtyard or doorway; the loom leans toward a wall on the -x side.';
    const rot = -0.9;
    c.sub(0, 0, rot, (b) => {
      const z = 0.66; post(b, -0.75, z, 1.95, 0.04); post(b, 0.75, z, 1.95, 0.04); b.rod([-0.85, 1.9, z], [0.85, 1.9, z], 0.045, PALE, 0, 5); b.rod([-0.78, 1.15, z + 0.03], [0.78, 1.15, z + 0.03], 0.02, PALE, 0, 3);
      bx(b, 0, 1.45, z, 1.3, 0.42, 0.015, 0xb86a4a); bx(b, 0, 1.42, z, 1.3, 0.04, 0.02, 0xe6dcc0);                                    // the finished cloth at the top
      for (let i = 0; i < 11; i++) { const x = -0.6 + i * 0.12; b.rod([x, 0.42, z], [x, 1.45, z], 0.006, 0xe6dcc0, 0, 3); bx(b, x, 0.3, z, 0.06, 0.12, 0.05, CLAY); }   // warp threads and clay weights
    });
    c.sub(0.9 * Math.cos(rot) + 0.2, -0.9 * -Math.sin(rot) + 0.8, 0, (b) => basket(b, 0, 0, 0, 0xe8e2d2, 1.1));
    c.person('weaver', 'woman', 0, 0, rot, 'weave');
    c.hit(Math.sin(rot) * 0.66, Math.cos(rot) * 0.66, 0.8);
  },
  spinners(c, v) {
    v.radius = 1.6; v.note = 'Anywhere in the shade: a doorway, a courtyard, the edge of the square.';
    const A = c.person('spinner', 'woman', -0.55, 0, 0.9, 'spin'), B = c.person('spinner', 'woman', 0.55, 0.1, -1.0, 'spin', { phase: 2 });
    basket(c.P, 0, 0.55, 0, 0xe8e2d2); chat(c, A, B, 4, ['happy', 'neutral']);
  },
  miller(c, v) {
    v.radius = 1.6; v.note = 'In a courtyard or beside a house door.';
    const { P } = c;
    c.sub(0, 0.55, 0, (b) => { b.out = null; b.loftZ([{ z: -0.3, rx: 0.22, ry: 0.06, y: 0.14 }, { z: 0.3, rx: 0.24, ry: 0.05, y: 0.09 }], 4, 0, 0x8f8a80); bx(b, 0, 0, 0, 0.5, 0.06, 0.7, 0x7f7a70); bx(b, 0, 0.13, 0.28, 0.3, 0.03, 0.14, 0xe8dcc0); });
    lath(P, 0.75, 0, 0.3, JAR.sack, 0xb9a57a, 6); jar(P, 'bowl', -0.65, 0.75, 0, 1.3, 0x9a6a4a); lath(P, -0.65, 0.1, 0.75, [[0, 0.17], [0.05, 0.05]], 0xe8dcc0, 6); jar(P, 'pithos', -0.9, -0.3, 0, 0.6);
    c.person('miller', 'woman', 0, 0, 0, 'grind');
    c.hit(0, 0.55, 0.4);
  },
  cook(c, v) {
    v.radius = 2; v.note = 'In a courtyard or at the back of a food stall, open to the sky for the smoke.';
    const { P, Gl } = c;
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; P.rod([Math.sin(a) * 0.42, 0, 0.62 + Math.cos(a) * 0.42], [Math.sin(a) * 0.2, 0.5, 0.62 + Math.cos(a) * 0.2], 0.025, IRON, 0, 3); }
    lath(P, 0, 0.36, 0.62, [[0, 0.1], [0.08, 0.26], [0.3, 0.3], [0.37, 0.25], [0.39, 0.28]], 0x3a342e, 8); lath(P, 0, 0.7, 0.62, [[0, 0.23], [0.02, 0.05]], 0xb89a5a, 6);
    logs(P, 0, 0, 0.62, 1.1); fire(Gl, 0, 0.06, 0.62, 0.9);
    table(P, -1.25, 0.2, 0.7, 1.2, 0.72); jar(P, 'bowl', -1.25, -0.1, 0.72, 1); jar(P, 'jug', -1.2, 0.5, 0.72, 1); lath(P, -1.3, 0.72, 0.2, [[0, 0.1], [0.06, 0.04]], 0x7a8256, 5);
    jar(P, 'amphora', 1.05, -0.2, 0, 1); for (let i = 0; i < 3; i++) jar(P, 'bowl', 0.95, 0.6, i * 0.05, 0.8);
    c.person('cook', c.r() < 0.5 ? 'woman' : 'worker', 0, 0, 0, 'stir');
    const kid = c.person('child waiting', 'child', 1.1, 1.3, -2.2); kid.pose = 'ground'; kid.lookAt = { x: 0, y: 0.8, z: 0.62 };
    c.hit(0, 0.62, 0.5); c.hit(-1.25, 0.2, 0.7);
  },
  griller(c, v) {
    v.radius = 1.8; v.note = 'At a street corner or the edge of the market; the buyer stands on the +z side.';
    const { P, Gl } = c;
    table(P, 0, 0.62, 0.9, 0.42, 0.62, STONE); bx(P, 0, 0.62, 0.62, 0.9, 0.13, 0.42, 0x8a5a3a); Gl.box(0, 0.76, 0.62, 0.78, 0.03, 0.3, 0xff5a14, 0);
    for (let i = 0; i < 5; i++) { const x = -0.3 + i * 0.15; P.rod([x, 0.8, 0.38], [x, 0.8, 0.86], 0.006, 0x9a9aa0, 0, 3); for (let j = 0; j < 3; j++) bx(P, x, 0.78, 0.5 + j * 0.11, 0.045, 0.04, 0.07, j % 2 ? 0x8a4a2a : 0x6a3a22); }
    jar(P, 'bowl', -0.85, 0.5, 0, 1.2); basket(P, 0.85, 0.3, 0, 0x3a2a1c, 0.8); jar(P, 'jug', 0.8, 0.8, 0, 1.1);
    const g = c.person('griller', 'worker', 0, 0, 0, 'grill'), b = c.person('buyer', c.r() < 0.5 ? 'citizen' : 'worker', 0.35, 1.75, PI + 0.2);
    chat(c, b, g, 5, ['happy', 'neutral']);
    c.hit(0, 0.62, 0.55);
  },
  baker(c, v) {
    v.radius = 2.3; v.note = 'The oven (-x, back) against a wall; the table faces the street.';
    const { P, Gl } = c;
    bx(P, -1.2, 0, -0.5, 1.3, 0.4, 1.3, STONE); P.ball(-1.2, 0.4, -0.5, 0.62, 0.6, 0.62, 0xb08a68, 0, (x, y) => y > 0); bx(P, -1.2, 0.4, 0.1, 0.36, 0.3, 0.06, 0x2a1c14); Gl.box(-1.2, 0.5, 0.115, 0.26, 0.14, 0.05, 0xff6a1a, 0);
    table(P, 0.35, 0.52, 1.5, 0.6, 0.82); P.ball(0.35, 0.86, 0.5, 0.16, 0.06, 0.13, 0xe8dcc0, 0, null, true);
    for (let i = 0; i < 5; i++) P.ball(0.75 + (i % 2) * 0.2, 0.86, 0.38 + Math.floor(i / 2) * 0.15, 0.085, 0.045, 0.085, 0xc9965a, 0, null, true);
    basket(P, 1.35, 0.9, 0, 0xc9965a); lath(P, -0.45, 0, 0.9, JAR.sack, 0xd8cdb0, 6); P.rod([-0.55, 0, -0.1], [-0.4, 1.6, -0.3], 0.02, PALE, 0, 3); bx(P, -0.4, 1.55, -0.3, 0.26, 0.03, 0.3, PALE);
    c.person('baker', c.r() < 0.5 ? 'woman' : 'worker', 0.3, 0, 0, 'knead', {}, { apron: 0xd8cdb0 });
    c.hit(-1.2, -0.5, 0.9); c.hit(0.35, 0.52, 0.75);
  },
  gardener(c, v) {
    v.radius = 3; v.note = 'On open ground beside a house or outside the wall; needs about 5 by 4 m of earth.';
    const { P, r } = c;
    for (let i = 0; i < 5; i++) {
      const z = -1.6 + i * 0.8; bx(P, 0.3, 0, z, 4.2, 0.09, 0.42, i % 2 ? SOIL : 0x66503a);
      for (let j = 0; j < 9; j++) { const x = -1.6 + j * 0.47 + 0.1 * r(), k = (i + (j > 4 ? 1 : 0)) % 3; if (i === 2 && j > 5) continue;
        if (k === 0) P.ball(x, 0.15, z, 0.11, 0.1, 0.11, 0x6a8a3a, 0, null, true); else if (k === 1) for (let q = 0; q < 2; q++) P.rod([x, 0.08, z], [x + 0.07 * (q ? 1 : -1), 0.42, z + 0.04], 0.015, 0x7a9a4a, 0, 3, 0.004); else lath(P, x, 0.08, z, [[0, 0.02], [0.1, 0.1], [0.22, 0.03]], 0x4f7a3a, 4); }
    }
    jar(P, 'hydria', 2.75, 1.5, 0, 1); basket(P, 2.7, 0.7, 0, 0x6a8a3a);
    c.person('gardener', 'worker', 2.6, -0.02, -PI / 2, 'hoe');
    if (r() < 0.7) { const w = c.person('helper', 'woman', -1.2, 2.25, PI, 'basket'); w.lookAt = { x: 2.6, y: 1.2, z: 0 }; }
  },
  reapers(c, v) {
    v.radius = 3.6; v.note = 'A barley field outside the wall or on a terrace; about 7 by 5 m.';
    const { P, r } = c;
    // Standing barley: thin crossed blades with a paler ear at the top, set close together.
    for (let i = 0; i < 96; i++) { const x = -3.3 + (i % 12) * 0.31 + 0.14 * r(), z = -2.1 + Math.floor(i / 12) * 0.56 + 0.2 * r(); if (x > 0.25) continue; const h = 0.78 + 0.22 * r(), w = 0.3 + 0.1 * r(); bx(P, x, 0, z, w, h, 0.02, 0xc9aa50); bx(P, x + 0.05, 0, z, 0.02, h * 0.95, w, 0xbf9f46); bx(P, x, h * 0.78, z + 0.03, w * 0.9, h * 0.24, 0.04, 0xe0c878); }
    for (let i = 0; i < 16; i++) bx(P, 0.7 + 2.4 * r(), 0, -2 + 4 * r(), 0.12, 0.08, 0.12, 0xb89a4a);
    for (const [x, z, a] of [[1.6, 1.2, 0.2], [2.3, -0.6, -0.3], [1.9, 1.5, 0.1]]) { lath(P, x, 0, z, [[0, 0.2], [0.42, 0.09], [0.47, 0.1], [0.75, 0.24]], 0xd2b45a, 6); }
    P.rod([1.2, 0.08, -1.4], [2.0, 0.08, -1.5], 0.1, 0xd2b45a, 0, 5); jar(P, 'jug', 2.9, 0.3, 0, 1.2);
    c.person('reaper', 'worker', 0.75, -0.9, -PI / 2, 'reap', {}, { hat: 'pilos' });
    c.person('reaper', 'worker', 0.8, 0.9, -PI / 2 + 0.2, 'reap', { phase: 0.8 });
  },
  thresher(c, v) {
    v.radius = 3.8; v.note = 'A round paved threshing floor on open, breezy ground; 7.5 m across.';
    const { P, r } = c;
    lath(P, 0, 0, 0, [[0, 3.5], [0.06, 3.4]], 0xb8ab90, 14); post(P, 0, 0, 1.1, 0.05);
    for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = 1.2 + 1.6 * r(); bx(P, Math.cos(a) * d, 0.06, Math.sin(a) * d, 0.5, 0.05, 0.3, i % 2 ? 0xd2b45a : 0xc9a84a); }
    lath(P, 2.9, 0.06, 2.0, [[0, 0.55], [0.3, 0.08]], 0xd8c078, 7); lath(P, -2.6, 0.06, -1.9, [[0, 0.7], [0.5, 0.1]], 0xd2b45a, 7);
    const d = c.animal('donkey', 2, 0, 0, 'walk'); let a = 0;
    c.tick((dt) => { a += dt * 0.42; d.x = Math.sin(a) * 2.1; d.z = Math.cos(a) * 2.1; d.heading = a + PI / 2; d.speed = 0.9; });
    c.person('thresher', 'worker', 2.3, 2.5, PI + 0.75, 'fork');
    c.hit(0, 0, 0.2);
  },
  milker(c, v) {
    v.radius = 2.4; v.note = 'A small pen against a wall or at the edge of a yard; the open side faces +z.';
    const { P } = c;
    for (const [x0, z0, x1, z1] of [[-1.6, -1.2, 1.6, -1.2], [-1.6, -1.2, -1.6, 1.0], [1.6, -1.2, 1.6, 1.0]]) { const n = 4; for (let i = 0; i <= n; i++) post(P, x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0.85, 0.035); P.rod([x0, 0.75, z0], [x1, 0.75, z1], 0.025, PALE, 0, 3); P.rod([x0, 0.4, z0], [x1, 0.4, z1], 0.025, PALE, 0, 3); }
    lath(P, 0.05, 0, 0.4, JAR.pail, 0x8a6a4a, 7, 0.9); bx(P, 0, 0, -0.02, 0.32, 0.27, 0.3, WOOD); lath(P, -1.1, 0, -0.8, [[0, 0.4], [0.25, 0.1]], 0xc9b06a, 6);
    c.person('milker', 'woman', 0, 0, 0, 'milk');
    c.animal('goat', 0.12, 0.62, PI / 2, 'idle');
    const k = c.animal('kid', 1.0, 0.2, 2, 'idle'); roam(c, k, 0.9, -0.3, 0.6, 0.5, ['idle', 'graze', 'idle']);
    c.hit(0, 0.5, 0.6); c.hit(-1.6, -0.1, 0.3); c.hit(1.6, -0.1, 0.3); c.hit(0, -1.2, 0.3); c.hit(-0.9, -1.2, 0.3); c.hit(0.9, -1.2, 0.3);
  },
  chicken_yard(c, v) {
    v.radius = 2.6; v.note = 'A house yard or a back lane; the coop (-x, back) can stand against a wall.';
    const { P, r } = c;
    bx(P, -1.6, 0, -1.3, 1.0, 0.6, 0.8, PALE); P.out = null; bx(P, -1.6, 0.6, -1.3, 1.15, 0.06, 0.95, 0x8a5a3a); bx(P, -1.45, 0, -0.89, 0.3, 0.35, 0.02, 0x2a1c14); jar(P, 'bowl', 1.3, -0.9, 0, 1.3, STONE);
    for (let i = 0; i < 30; i++) bx(P, -0.9 + 2.2 * r(), 0, 0.2 + 1.6 * r(), 0.03, 0.012, 0.03, 0xd9c27a);
    const w = c.person('feeding the hens', r() < 0.6 ? 'woman' : 'girl', 0, 0, 0, 'sow');
    for (let i = 0; i < 5; i++) { const h = c.animal('chicken', -0.8 + 0.5 * i + 0.3 * r(), 0.6 + 1.0 * r(), r() * 6, 'peck'); roam(c, h, 0.1, 1.0, 1.2, 0.5, ['peck', 'peck', 'idle']); }
    c.hit(-1.6, -1.3, 0.7);
  },
  well_drawers(c, v) {
    v.radius = 2.8; v.note = 'Centered on a round well (radius 1.1 m) at the origin. opts.withWell builds a plain well. One woman walks opts.path (default: 6 m out to +z and back).';
    const { P } = c;
    if (c.opts.withWell) { lath(P, 0, 0, 0, [[0, 1.1], [0.8, 1.05], [0.8, 0.85], [0.66, 0.85, 0x1c2a30]], STONE, 12); c.hit(0, 0, 1.1); }
    P.rod([0, 0.7, 0.93], [0, 1.5, 1.0], 0.012, ROPE, 0, 3); jar(P, 'hydria', 0.75, 1.55, 0, 1); jar(P, 'hydria', -1.2, 1.15, 0, 1, 0x9a6a4a); lath(P, -0.5, 0, 1.75, [[0, 0.16], [0.05, 0.17], [0.1, 0.12]], ROPE, 7);
    c.person('hauling water', 'woman', 0, 1.5, PI, 'well');
    const w = c.person('carrying water', 'woman', 1.6, 1.6, 0, 'hydria');
    follow(c, w, c.opts.path || [[1.5, 1.7], [2.2, 4], [1.8, 7.5]], 0.95, { pause: 4 });
    const wt = c.person('waiting her turn', 'woman', -1.25, 1.75, 2.4); wt.lookAt = { x: 0, y: 1.2, z: 1.5 }; wt.mood = 'neutral';
  },
  washers(c, v) {
    v.radius = 2.5; v.note = 'Beside a fountain, a stream, or a cistern; the clothes line runs along the back (-z).';
    const { P } = c;
    bx(P, 0, 0, 0.62, 1.7, 0.42, 0.6, STONE); bx(P, 0, 0.42, 0.62, 1.5, 0.02, 0.42, 0x5f8a9a);
    post(P, -1.7, -1.1, 1.7, 0.04); post(P, 1.7, -1.1, 1.7, 0.04); P.rod([-1.7, 1.62, -1.1], [1.7, 1.62, -1.1], 0.01, ROPE, 0, 3);
    for (const [x, w, h, hex] of [[-1.1, 0.6, 0.9, 0xe6dcc0], [-0.3, 0.5, 0.7, 0xd9a93c], [0.4, 0.7, 1.0, 0x9a4a3a], [1.2, 0.5, 0.8, 0xefe9dc]]) bx(P, x, 1.62 - h, -1.1, w, h, 0.02, hex);
    basket(P, 1.25, 0.35, 0, 0xe6dcc0); jar(P, 'hydria', -1.2, 0.2, 0, 1);
    const A = c.person('washing', 'woman', -0.4, 0.05, 0, 'wash'), B = c.person('washing', 'woman', 0.45, 1.22, PI, 'wash', { phase: 1 });
    chat(c, A, B, 4.5, ['neutral', 'happy']);
    c.hit(0, 0.62, 0.9); c.hit(-1.7, -1.1, 0.2); c.hit(1.7, -1.1, 0.2);
  },
  fishmonger(c, v) {
    v.radius = 2.1; v.note = 'On the quay or in the fish market; buyers stand on the +z side.';
    const { P, r } = c;
    table(P, 0, 0.55, 1.9, 0.7, 0.8); bx(P, 0, 0.8, 0.55, 1.8, 0.015, 0.62, 0x8a8478);
    for (let i = 0; i < 9; i++) fishOn(P, -0.7 + (i % 5) * 0.32 + 0.05 * r(), 0.81, 0.4 + Math.floor(i / 5) * 0.26 + 0.05 * r(), r() * 0.8 - 0.4, 0.8 + 0.5 * r());
    basket(P, 1.3, 0.2, 0, FISH, 1.1); basket(P, -1.35, 0.4, 0, null); jar(P, 'pail', -1.2, -0.3, 0, 1.2, 0x6b5a48);
    c.person('gutting fish', 'worker', -0.45, 0, 0, 'gut', {}, { apron: 0x8a7a5a });
    c.person('calling the catch', 'worker', 0.55, 0.02, 0.15, 'hawk');
    c.hit(0, 0.55, 1.0);
  },
  net_menders(c, v) {
    v.radius = 2.2; v.note = 'On the quay or the beach, near the boats.';
    const { P, r } = c;
    c.sub(0, 0.75, 0, (b) => { for (let i = 0; i < 9; i++) { const x = -1 + (i % 3) * 0.75 + 0.3 * r(), z = -0.4 + Math.floor(i / 3) * 0.45; b.ball(x, 0.03, z, 0.5, 0.07 + 0.08 * r(), 0.35, i % 2 ? 0x7a6a4a : 0x6a5a40, 0, (nx, ny) => ny > 0, true); } for (let i = 0; i < 7; i++) b.ball(-1.2 + i * 0.4, 0.1, 0.55 + 0.1 * r(), 0.045, 0.03, 0.045, 0xc9a26a, 0, null, true); });
    basket(P, 1.5, -0.2, 0, 0x7a6a4a, 0.9); P.rod([-1.6, 0.04, -0.6], [-0.6, 0.04, -0.9], 0.03, PALE, 0, 4);
    const A = c.person('mending a net', 'worker', -0.75, 0, 0.5, 'mend'), B = c.person('mending a net', r() < 0.5 ? 'old' : 'worker', 0.8, 0.1, -0.6, 'mend', { phase: 1.3 }, { length: 'short', dress: 'exomis', robe2: null });
    chat(c, A, B, 5);
  },
};
const pathRadius = (path, pad = 1) => path.reduce((m, p) => Math.max(m, Math.hypot(p[0], p[1])), 0) + pad;
const trestle = (b, x, z, h, w = 0.5) => { b.rod([x, h, z - w / 2], [x, h, z + w / 2], 0.035, WOOD, 0, 4); for (const s of [-1, 1]) { b.rod([x - 0.18, 0, z + s * w * 0.45], [x, h, z + s * w * 0.4], 0.025, WOOD, 0, 3); b.rod([x + 0.18, 0, z + s * w * 0.45], [x, h, z + s * w * 0.4], 0.025, WOOD, 0, 3); } };
Object.assign(V, {
  porters(c, v) {
    const path = c.opts.path || [[-5, 0], [5, 0]], a = path[0], z = path[path.length - 1];
    v.radius = pathRadius(path); v.note = 'Two men carry amphorae back and forth along opts.path (default 10 m along x); jars are stacked 0.9 m to the -z side of each end. Put it between a ship and a warehouse.';
    for (const [e, n] of [[a, 5], [z, 3]]) for (let i = 0; i < n; i++) jar(c.P, 'amphora', e[0] - 0.5 + (i % 3) * 0.36, e[1] - 0.9 - Math.floor(i / 3) * 0.34, 0, 1, i % 2 ? 0x9a6a4a : CLAY);
    const p1 = c.person('porter', 'worker', 0, 0, 0, 'amphora'), p2 = c.person('porter', 'worker', 0, 0, 0, 'amphora');
    follow(c, p1, path, 1.15, { start: 0.1, side: 0.35, pause: 2.5 }); follow(c, p2, path, 1.05, { start: 0.65, side: -0.35, pause: 3 });
    c.hit(a[0], a[1] - 1, 0.7); c.hit(z[0], z[1] - 1, 0.6);
  },
  shipwright(c, v) {
    v.radius = 3; v.note = 'On the shore or in a boat yard; the half-built hull is at the back (-z).';
    const { P } = c;
    trestle(P, -0.9, 0.5, 0.54); trestle(P, 0.9, 0.5, 0.54); bx(P, 0, 0.54, 0.5, 2.7, 0.06, 0.3, 0xc9a26a);
    trestle(P, 1.9, 0.45, 0.64, 0.4); trestle(P, 2.8, 0.45, 0.64, 0.4); bx(P, 2.35, 0.64, 0.45, 1.5, 0.06, 0.24, 0xc9a26a);
    for (let i = 0; i < 10; i++) bx(P, -0.8 + c.r() * 1.8, 0, 0.2 + c.r() * 0.8, 0.12, 0.015, 0.05, 0xd9bc86);
    // The hull: a keel with ribs.
    P.rod([-2.2, 0.25, -1.7], [2.2, 0.25, -1.7], 0.07, WOOD, 0, 4); P.rod([2.2, 0.25, -1.7], [2.7, 1.0, -1.7], 0.06, WOOD, 0, 4); P.rod([-2.2, 0.25, -1.7], [-2.6, 0.8, -1.7], 0.06, WOOD, 0, 4);
    for (let i = 0; i < 6; i++) { const x = -1.8 + i * 0.72, w = 0.75 - 0.08 * Math.abs(i - 2.5); for (const s of [-1, 1]) { P.rod([x, 0.25, -1.7], [x, 0.5, -1.7 + s * w * 0.75], 0.035, PALE, 0, 3); P.rod([x, 0.5, -1.7 + s * w * 0.75], [x, 1.0, -1.7 + s * w], 0.03, PALE, 0, 3); } }
    for (const s of [-1, 1]) P.rod([-2.3, 0.2, -1.7 + s * 0.5], [-2.0, 0.6, -1.7 + s * 0.2], 0.03, WOOD, 0, 3);
    bx(P, -1.9, 0, 0.9, 0.5, 0.25, 0.3, WOOD); for (let i = 0; i < 3; i++) bx(P, -2.2, i * 0.06, -0.3, 0.3, 0.05, 1.8, 0xc9a26a);
    c.person('shipwright', 'worker', 0, 0, 0, 'adze'); c.person('sawing a plank', 'worker', 2.35, 0, 0, 'saw');
    c.hit(0, 0.5, 0.6); c.hit(-1, 0.5, 0.5); c.hit(1, 0.5, 0.5); c.hit(2.35, 0.45, 0.6); c.hit(0, -1.7, 1.0); c.hit(-1.6, -1.7, 1.0); c.hit(1.6, -1.7, 1.0);
  },
  stonemason(c, v) {
    v.radius = 2.2; v.note = 'In a mason\'s yard or beside a building site.';
    const { P, r } = c;
    bx(P, 0, 0, 0.95, 0.85, 1.15, 0.5, 0xd8d2c4); bx(P, 0, 0, 0.95, 1.0, 0.1, 0.65, WOOD);
    for (let i = 0; i < 12; i++) bx(P, -0.6 + 1.2 * r(), 0, 0.2 + 0.5 * r(), 0.05 + 0.05 * r(), 0.03, 0.05, 0xd8d2c4);
    lath(P, -1.35, 0, 0.2, JAR.drum, 0xd0cabc, 10); lath(P, -1.35, 0.4, 0.2, JAR.drum, 0xd8d2c4, 10, 0.97);
    bx(P, 1.35, 0, -0.3, 0.7, 0.12, 0.3, 0xc8c2b4); bx(P, 1.35, 0.12, -0.3, 0.5, 1.25, 0.14, 0xd8d2c4); bx(P, 1.35, 1.37, -0.3, 0.58, 0.1, 0.18, 0xd0cabc);
    c.person('stonemason', 'worker', 0, 0, 0, 'chisel', {}, { apron: true });
    c.hit(0, 0.95, 0.6); c.hit(-1.35, 0.2, 0.4); c.hit(1.35, -0.3, 0.4);
  },
  moneychanger(c, v) {
    v.radius = 1.8; v.note = 'In the market or by the harbor gate, in the shade; the customer stands on the +z side.';
    const { P } = c;
    table(P, 0, 0.52, 1.1, 0.55, 0.62); stool(P, 0, -0.03);
    post(P, 0.34, 0.6, 0.38, 0.012, 0x8a7a4a, 0.62); P.rod([0.14, 1.0, 0.6], [0.54, 1.0, 0.6], 0.01, 0x8a7a4a, 0, 3);
    for (const s of [-1, 1]) { P.rod([0.34 + s * 0.2, 1.0, 0.6], [0.34 + s * 0.2, 0.8, 0.6], 0.003, ROPE, 0, 3); lath(P, 0.34 + s * 0.2, 0.77, 0.6, [[0, 0.03], [0.03, 0.07]], 0xa8733a, 6); }
    for (let i = 0; i < 7; i++) lath(P, -0.4 + (i % 4) * 0.11, 0.62, 0.42 + Math.floor(i / 4) * 0.12, [[0, 0.028], [0.02 + 0.015 * (i % 3), 0.028]], GOLD, 6);
    bx(P, -0.75, 0, 0.1, 0.4, 0.3, 0.3, 0x5a4030); bx(P, -0.75, 0.3, 0.1, 0.42, 0.04, 0.32, IRON);
    const m = c.person('moneychanger', 'citizen', 0, 0, 0, 'count', { pose: 'sit' }), cu = c.person('customer', 'citizen', 0.15, 1.45, PI, 'haggle');
    chat(c, cu, m, 4, ['angry', 'scorn']);
    c.hit(0, 0.45, 0.65);
  },
  barber(c, v) {
    v.radius = 1.7; v.note = 'In a shop front or under an awning; barbers\' shops were places to talk.';
    const { P } = c;
    stool(P, 0.5, -0.03); table(P, -0.55, 0.65, 0.4, 0.4, 0.7, WOOD); jar(P, 'bowl', -0.55, 0.65, 0.7, 1.1, 0xa8733a); bx(P, -0.55, 0.72, 0.5, 0.2, 0.02, 0.1, CLOTHW); stool(P, 1.5, 0.4, 0.44, 0.4);
    const b = c.person('barber', 'worker', -0.02, 0, PI / 2, 'shave'), cu = c.person('customer', 'citizen', 0.5, 0, 0); cu.pose = 'sit';
    c.tick((dt, t) => { const k = Math.floor(t / 4) % 3; b.speaking = k === 0; cu.speaking = k === 2; }); b.mood = 'happy';
    c.hit(0.5, 0, 0.35);
  },
  knucklebones(c, v) {
    v.radius = 1.3; v.note = 'On a doorstep, in a courtyard, or in a quiet corner of the square.';
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4, k = c.person('child playing', i === 1 ? 'girl' : 'child', Math.sin(a) * 0.62, Math.cos(a) * 0.62, a + PI, 'knuckle', { phase: i * 0.7 }); k.mood = i === 0 ? 'happy' : 'neutral'; k.lookAt = { x: 0, y: 0.1, z: 0 }; }
    for (let i = 0; i < 5; i++) bx(c.P, -0.12 + 0.3 * c.r(), 0, -0.12 + 0.3 * c.r(), 0.035, 0.025, 0.025, 0xe8e0cc);
  },
  children_chasing(c, v) {
    v.radius = 3.8; v.note = 'Open ground: the square, a wide street, the shore. The children run an oval 6 by 4 m.';
    const path = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * 6.283; path.push([Math.sin(a) * 3, Math.cos(a) * 2]); }
    const A = c.person('child running', 'child', 0, 0, 0), B = c.person('child chasing', c.r() < 0.5 ? 'girl' : 'child', 0, 0, 0, null, null, { length: 'short' });
    A.mood = 'laugh'; B.mood = 'happy'; follow(c, A, path, 2.7, { loop: true, start: 0.1 }); follow(c, B, path, 2.7, { loop: true, start: 0.0 });
    c.tick((dt, t) => { if (Math.floor(t / 5) !== Math.floor((t - dt) / 5)) B.play('armsUp'); });
  },
  musicians(c, v) {
    v.radius = 2.1; v.note = 'At a street corner, a tavern door, or near a shrine during the festival.';
    const pl = c.person('aulos player', 'citizen', -0.7, 0, 0.5, 'aulos', {}, { hat: 'wreath' }), d = c.person('dancer', c.r() < 0.6 ? 'woman' : 'worker', 0.75, 0.3, -0.7, 'dance'), l = c.person('listener', 'worker', 0.2, 1.7, PI);
    d.mood = 'happy'; l.pose = 'ground'; l.mood = 'happy'; l.lookAt = { x: 0.75, y: 1.3, z: 0.3 };
    c.tick((dt, t) => { if (Math.floor(t / 4.5) !== Math.floor((t - dt) / 4.5)) l.play('clap'); });
  },
  drinkers(c, v) {
    v.radius = 1.7; v.note = 'Outside a tavern or under an awning.';
    const { P } = c;
    table(P, 0, 0.1, 0.7, 0.55, 0.45); jar(P, 'jug', 0.1, 0.0, 0.45, 0.9, 0x3a2a22); jar(P, 'cup', -0.15, 0.25, 0.45, 1, 0x2a2522); jar(P, 'krater', 0.1, -0.85, 0, 1, 0x3a2a22);
    stool(P, -0.82, 0.07); stool(P, 0.82, 0.07);
    const A = c.person('drinker', 'citizen', -0.8, 0.1, PI / 2, 'drink', { pose: 'sit' }), B = c.person('drinker', 'worker', 0.8, 0.1, -PI / 2, 'drink', { pose: 'sit', phase: 2.6 });
    chat(c, A, B, 4, ['laugh', 'happy']);
    c.hit(0, 0.1, 0.5);
  },
  dozer(c, v) {
    v.radius = 1.5; v.note = 'Against a wall: the wall runs along -z and the old man\'s back rests on it at z = -0.15.';
    c.person('old man asleep', 'old', 0, 0, 0, 'doze');
    c.animal('dog', 0.8, 0.35, -1.2, 'sleep');
    c.P.rod([-0.45, 0.03, -0.1], [-0.6, 0.03, 1.25], 0.02, WOOD, 0, 4); jar(c.P, 'cup', -0.4, 0.5, 0, 1, 0x2a2522);
  },
  worshippers(c, v) {
    v.radius = 1.6; v.note = 'Facing an altar or shrine 1.5 m in front (+z). No altar is built.';
    c.person('praying', 'citizen', -0.45, 0, 0.05, 'pray', {}, { hat: 'wreath' }); c.person('praying', 'woman', 0.5, -0.25, -0.05, 'pray', { phase: 1.5 });
    basket(c.P, 0.1, 0.75, 0, 0x7a8256, 0.8); jar(c.P, 'jug', -0.25, 0.8, 0, 0.9);
  },
  stall_seller(c, v) {
    v.radius = 1.2; v.note = 'Behind a stall counter that stands 0.8 m in front (+z). No stall is built.';
    const s = c.person('seller', c.r() < 0.4 ? 'woman' : 'worker', 0, 0, 0, 'hawk', { props: { R: c.r() < 0.5 ? 'goods' : 'fish' } }); s.mood = 'happy';
  },
  shoppers(c, v) {
    v.radius = 1.4; v.note = 'In front of a stall counter that stands 0.8 m ahead (+z); the seller is beyond it.';
    const A = c.person('shopper bargaining', 'citizen', -0.4, 0, 0.12, 'haggle'), B = c.person('shopper with a basket', 'woman', 0.5, -0.2, -0.2, 'basket');
    A.lookAt = B.lookAt = { x: 0, y: 1.5, z: 1.6 }; A.mood = 'scorn';
  },
  stall(c, v) {
    v.radius = 2; v.note = 'Seller and two shoppers together, for a stall whose counter runs along z = 0.8.';
    const s = c.person('seller', 'worker', 0, 0, 0, 'hawk', { props: { R: 'goods' } }), A = c.person('shopper bargaining', 'citizen', 0.4, 1.65, PI + 0.1, 'haggle'), B = c.person('shopper with a basket', 'woman', -0.5, 1.8, PI - 0.2, 'basket');
    chat(c, s, A, 4, ['happy', 'scorn']); B.lookAt = { x: 0, y: 1.0, z: 0.8 };
  },
  goatherd(c, v) {
    const path = c.opts.path || [[-6, 0], [-2, 0.8], [2, -0.6], [6, 0]];
    v.radius = pathRadius(path, 1.5); v.note = 'A herder and three goats walk opts.path and back, stopping to graze at each end. For lanes, the wall road, or the hills.';
    const h = c.person('goatherd', 'worker', 0, 0, 0, 'herd', {}, { hat: 'petasos', length: 'short' });
    follow(c, h, path, 0.8, { start: 0.14, pause: 7, side: -0.5 });
    for (let i = 0; i < 3; i++) { const g = c.animal(i === 2 ? 'kid' : 'goat', 0, 0, 0, 'walk'); follow(c, g, path, 0.8, { start: 0.03 + i * 0.035, pause: 7, side: [0.45, -0.2, 0.9][i], onWait: () => { g.state = 'graze'; } }); c.tick(() => { if (g.speed > 0) g.state = 'walk'; }); }
  },
  // Someone going about the street (2026-11-19): one person walking opts.path and back, carrying something
  // (opts.act: hydria on the head, amphora on the shoulder, basket, sack, or herd for a staff), or with
  // opts.kind 'children', two children running it. opts.speed in m/s, opts.start 0..1 along the path.
  walker(c, v) {
    const path = c.opts.path || [[0, 0], [0, 12]];
    v.radius = pathRadius(path, 1.2); v.note = 'Someone walking opts.path and back, carrying opts.act; or two children running it (opts.kind children). For streets.';
    if (c.opts.kind === 'children') {
      const a = c.person('child', 'child', 0, 0, 0), b = c.person('child', c.r() < 0.5 ? 'girl' : 'child', 0, 0, 0);
      follow(c, a, path, 2.4, { start: (c.opts.start || 0) + 0.04, pause: 1.0 }); follow(c, b, path, 2.25, { start: c.opts.start || 0, pause: 1.6, side: 0.7 });
    } else {
      const p = c.person('walker', c.opts.kind || 'citizen', 0, 0, 0, c.opts.act);
      follow(c, p, path, c.opts.speed || 1.0, { start: c.opts.start || 0, pause: c.opts.pause != null ? c.opts.pause : 3 });
    }
  },
  donkey_driver(c, v) {
    const path = c.opts.path || [[-6, 0], [6, 0]];
    v.radius = pathRadius(path, 1.5); v.note = 'A man leads a loaded donkey along opts.path and back. For streets and the harbor road.';
    const m = c.person('donkey driver', 'worker', 0, 0, 0, 'lead'), d = c.animal('donkey', 0, 0, 0, 'walk', { pack: true });
    const total = path.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0), lag = 1.9 / total;
    const sm = follow(c, m, path, 0.95, { start: lag + 0.02, pause: 3 }), sd = follow(c, d, path, 0.95, { start: 0.02, pause: 3 });
    // Keep the man ahead of the donkey in both directions.
    c.tick(() => { if (sm.dir < 0 && sd.s < sm.s + 1.9 && sd.dir < 0 && !sd.fixed) { sd.s = Math.min(total, sm.s + 1.9); sd.fixed = true; } if (sm.dir > 0) sd.fixed = false; });
    // The lead rope, redrawn each frame from the hand to the donkey's head.
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const rope = new THREE.Line(g, new THREE.LineBasicMaterial({ color: ROPE })); rope.frustumCulled = false; v.group.add(rope);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    c.tick(() => { v.group.updateWorldMatrix(true, false); m.bones.handR.getWorldPosition(a); d.bones.head.getWorldPosition(b); v.group.worldToLocal(a); v.group.worldToLocal(b); const p = g.attributes.position; p.setXYZ(0, a.x, a.y - 0.05, a.z); p.setXYZ(1, (a.x + b.x) / 2, (a.y + b.y) / 2 - 0.12, (a.z + b.z) / 2); p.setXYZ(2, b.x, b.y - 0.08, b.z); p.needsUpdate = true; });
  },
  dog(c, v) {
    v.radius = 3; v.note = 'A dog that wanders within 2.5 m, or sleeps if opts.asleep. Anywhere.';
    const asleep = c.opts.asleep != null ? c.opts.asleep : c.r() < 0.3, d = c.animal('dog', 0, 0, c.r() * 6, asleep ? 'sleep' : 'idle');
    if (!asleep) roam(c, d, 0, 0, 2.5, 1.1, ['idle', 'sit', 'idle', 'sleep']);
  },
  gulls(c, v) {
    v.radius = 14; v.note = 'Over the harbor. Five gulls circle 12 to 25 m up; nothing touches the ground.';
    for (let i = 0; i < 5; i++) {
      const g = c.animal('gull', 0, 0, 0, 'fly', { scale: 1.5 }), R = 5 + 8 * c.r(), h = 12 + 13 * c.r(), w = (0.22 + 0.16 * c.r()) * (i % 2 ? 1 : -1), cx = -3 + 6 * c.r(), cz = -3 + 6 * c.r(); let a = c.r() * 6.283;
      c.tick((dt, t) => { a += w * dt; g.x = cx + Math.sin(a) * R; g.z = cz + Math.cos(a) * R; g.y = h + 1.2 * Math.sin(t * 0.3 + i); g.heading = a + (w > 0 ? PI / 2 : -PI / 2); g.bank = w > 0 ? 0.35 : -0.35; });
    }
  },
});
export const VIGNETTES = Object.keys(V);
