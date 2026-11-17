// The three nights of the ring story: the shepherds with no rule, under a rule, and with the ring.
//
// Roman, 2026-11-15: "even the gyges parable doesn't work because there is no actual game. you are told where to
// walk and that's it." This file is the trial he approved: the player does what Glaucon's argument describes, and
// Glaucon judges what the player did.
//
// What comes from Plato (Reeve's translation, my notes in research/notes-passages.md, sections 6 and 7):
//   358e-359b  doing wrong is good and suffering it bad, but suffering it outweighs doing it; those who cannot do
//              the one and escape the other agree to neither; that agreement is law, and what it commands is called
//              just; people honor it only because they are too weak to do wrong and get away with it; a man with
//              the power would be mad to agree.
//   359e       the shepherds meet every month to report to the king on the flocks.
//   360c       no one is just willingly, but only when compelled.
// Everything else here is invented to make that playable: the four folds, six sheep to a fold, the raids at night,
// the torch and the watch, the fine of three sheep, losing a flock for a short count.
import * as THREE from 'three';
import { clamp, dampAngle, wrapPi, mulberry32 } from './util.js';
import { PLACES } from './world.js';
import { Animal } from './animals.js';

// Every number of the night game.
export const NIGHT = {
  start: 6,          // sheep in each fold at the beginning, and what the king expects at the month's end
  length: 100,       // seconds of play in a night
  sit: 8,            // how much faster the night passes while you sit by your fire
  lead: 0.8,         // your speed with a sheep on the rope (and you cannot run)
  range: 11,         // how far a waking man sees by his torch, in meters
  half: 0.6,         // and how far to each side, in radians (34 degrees)
  sleeper: 2.4,      // a sleeping man wakes if you come this close
  hear: 7,           // running is heard this far all round
  notice: 0.8,       // seconds in plain view before you are caught
  zone: 6,           // this close to another man's fold counts as being at it
  home: 12,          // this close to your own fold counts as guarding it
  fine: [1, 3, 3],   // sheep you pay when caught: before the pact, under it, under it
  slots: 8,          // sheep shown in a pen (the count on screen is the true number)
  pen: 3.2,          // radius of a pen
};
const C = NIGHT, PI = Math.PI;

export function setupNights(g, hooks) {
  const L = PLACES.lydia, w = g.world, told = hooks.told, rng = mulberry32(4107);
  const rec = () => { const l = hooks.log(); return l.nights || (l.nights = { took: [0, 0, 0], back: [0, 0, 0], caught: [0, 0, 0], unseen: 0, guarded: false, robbed: false, vote: null, final: null, loot: 0, gaveOpen: 0, gaveUnseen: 0, gifts: {}, thanked: {} }); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---- the four folds. Each gate faces the middle of the pasture; the owner's fire is beside the gate.
  const F = {}, FOLDS = [];
  const fold = (id, who, label, dx, dz) => {
    const x = L[0] + dx, z = L[1] + dz, ga = Math.atan2(L[0] + 6 - x, L[1] - 14 - z), fa = ga + 1.05;
    const f = { id, who, label, x, z, ga, gx: x + Math.sin(ga) * (C.pen + 1.1), gz: z + Math.cos(ga) * (C.pen + 1.1), fx: x + Math.sin(fa) * (C.pen + 2.6), fz: z + Math.cos(fa) * (C.pen + 2.6), count: C.start, sheep: [] };
    F[id] = f; FOLDS.push(f); return f;
  };
  fold('you', null, 'your fold', -6, -34);
  fold('old', 'shep3', 'the old shepherd’s fold', 10, -42);
  fold('young', 'shep2', 'the young shepherd’s fold', -30, -10);
  fold('big', 'shep0', 'the big shepherd’s fold', 22, 6);
  const total = () => FOLDS.reduce((s, f) => s + f.count, 0);

  // ---- the three neighbors
  const M = {}, MEN = [];
  for (const [id, f] of [['old', F.old], ['young', F.young], ['big', F.big]]) {
    const n = g.npc(f.who), m = { id, n, fold: f, mode: 'day', goal: null, v: 0, then: null, base: 0, ph: MEN.length * 2.1, wake: 0, carry: null, pays: 0, was: { x: n.home.x, z: n.home.z, h: n.home.h } };
    M[id] = m; MEN.push(m);
  }
  g.npc('shep3').name = 'The old shepherd'; g.npc('shep2').name = 'The young shepherd'; g.npc('shep0').name = 'The big shepherd';

  // ---- things made the first time the story is entered
  let built = false, pens = null, hud = null, rope = null, bolt = null, N = null, sitting = false, gen = 0, storyOn = false;
  const led = [];   // sheep led by the neighbors
  function build() {
    if (built) return; built = true;
    const zone = g.kit.zone('lydia');
    // The pens: posts and two rails of wattle, one drawing for all four.
    const box = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshLambertMaterial({ color: 0x5b4632 }), parts = [];
    const K = 18;
    for (const f of FOLDS) {
      const open = (a) => Math.abs(wrapPi(a - f.ga)) < 0.4;
      for (let k = 0; k < K; k++) {
        const a = k / K * PI * 2, b = (k + 1) / K * PI * 2;
        const px = f.x + Math.sin(a) * C.pen, pz = f.z + Math.cos(a) * C.pen, qx = f.x + Math.sin(b) * C.pen, qz = f.z + Math.cos(b) * C.pen;
        const py = w.terrainY(px, pz), qy = w.terrainY(qx, qz);
        if (!open(a)) parts.push([px, py + 0.55, pz, 0.09, 1.1, 0.09, 0]);
        if (!open(a) && !open(b) && !open((a + b) / 2)) for (const h of [0.42, 0.82]) parts.push([(px + qx) / 2, (py + qy) / 2 + h, (pz + qz) / 2, 0.06, 0.07, Math.hypot(qx - px, qz - pz) + 0.06, Math.atan2(qx - px, qz - pz)]);
      }
      w.addCircle(f.x, f.z, C.pen - 0.15, 1.2);
      g.addFlame(f.fx, w.terrainY(f.fx, f.fz) + 0.5, f.fz, { power: 24, size: 3.2, base: w.terrainY(f.fx, f.fz) + 0.04 });
      // sheep, lying in the pen
      for (let i = 0; i < C.slots; i++) {
        const a = rng() * PI * 2, r = 0.5 + rng() * (C.pen - 1.3), x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a) * r, s = new Animal('sheep', 60 + FOLDS.indexOf(f) * 10 + i);
        s.state = 'sleep'; zone.add(s.group); s.place(x, z, rng() * 6.28, w.terrainY(x, z)); for (let k2 = 0; k2 < 14; k2++) s.update(0.1);
        f.sheep.push(s);
      }
    }
    pens = new THREE.InstancedMesh(box, mat, parts.length); pens.castShadow = true; pens.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    parts.forEach((p, i) => { e.set(0, p[6], 0); q.setFromEuler(e); m4.compose(v.set(p[0], p[1], p[2]), q, sc.set(p[3], p[4], p[5])); pens.setMatrixAt(i, m4); });
    pens.instanceMatrix.needsUpdate = true; pens.computeBoundingSphere(); zone.add(pens);
    // sheep on ropes, and the one that bolts
    const extra = (seed) => { const s = new Animal('sheep', seed); zone.add(s.group); s.group.visible = false; return s; };
    rope = extra(151); bolt = extra(152); for (const m of MEN) { m.led = extra(153 + led.length); led.push(m.led); }
    // each neighbor's torch and the ground his torchlight reaches
    for (const m of MEN) {
      const t = new THREE.Group(), stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.6, 6), mat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.sky.glowTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      stick.position.y = 0.2; glow.position.y = 0.55; glow.scale.setScalar(0.9); t.add(stick, glow); t.visible = false; m.n.actor.attach('handR', t); m.torch = t;
      const SEG = 10, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 2) * 3), 3));
      const idx = []; for (let i = 0; i < SEG; i++) idx.push(0, i + 1, i + 2); geo.setIndex(idx);
      // brightest at his feet, fading toward the edge of what he can see
      const col = new Float32Array((SEG + 2) * 3).fill(0.22); col[0] = col[1] = col[2] = 1; geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m.cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffa040, vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      m.cone.frustumCulled = false; m.cone.visible = false; m.cone.renderOrder = 3; zone.add(m.cone); m.seg = SEG;
    }
    // the panel at the top of the screen
    hud = document.createElement('div'); hud.className = 'hidden';
    hud.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);min-width:170px;background:var(--shade);color:#f6ecd8;padding:8px 16px 10px;border-radius:6px;font-family:var(--serif);font-size:16px;line-height:1.35;text-align:center;pointer-events:none';
    hud.innerHTML = '<div data-k="title" style="font-family:var(--sans);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#d8c69c"></div>'
      + '<div data-k="barBox" style="height:4px;background:rgba(255,255,255,.18);border-radius:2px;margin:5px 0 6px"><div data-k="bar" style="height:4px;width:0;background:#d8c69c;border-radius:2px"></div></div>'
      + '<div data-k="taken" style="font-size:22px;transition:transform .2s"></div><div data-k="count" style="font-size:13px;color:#d8c69c"></div><div data-k="rope" style="font-size:13px;color:#ffd27a"></div>'
      + '<div data-k="seenBox" style="margin-top:6px;display:none"><div style="font-family:var(--sans);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#ff9a7a">You are being noticed</div><div style="height:6px;background:rgba(255,255,255,.18);border-radius:3px;margin-top:3px"><div data-k="seen" style="height:6px;width:0;background:#ff6a4a;border-radius:3px"></div></div></div>';
    const host = document.getElementById('objective'); (host && host.parentElement ? host.parentElement : document.body).appendChild(hud);
  }
  const part = (k) => hud.querySelector('[data-k="' + k + '"]');
  const shown = {};
  const put = (k, text) => { if (shown[k] !== text) { shown[k] = text; part(k).textContent = text; } };
  // Roman, 2026-11-16: the game "should be introduced vaguely, and there should be a counter for how much money the
  // player can manage to steal, with no specific indication that the goal is actually to maximize money, but just
  // the psychology of a counter." So the panel shows one number, "Taken", and nothing says what to do with it.
  function refresh() {
    if (!hud) return;
    for (const f of FOLDS) f.sheep.forEach((sh, i) => { sh.group.visible = !!N && i < Math.min(f.count, C.slots); });
    if (!storyOn) { hud.classList.add('hidden'); return; }
    hud.classList.remove('hidden');
    for (const k of ['title', 'barBox', 'count', 'rope']) part(k).style.display = N ? '' : 'none';
    put('taken', 'Taken: ' + rec().loot);
    if (!N) { part('seenBox').style.display = 'none'; return; }
    put('title', ['First night', 'Second night', 'Third night'][N.k - 1] + (sitting ? ' (sitting by your fire)' : ''));
    put('count', 'Your flock: ' + F.you.count);
    put('rope', N.lead ? 'A sheep on your rope' : '');
  }

  // ---- moving the neighbors (by hand, so that the night can pass faster while the player sits)
  const go = (m, x, z, v, then) => { m.n.actor.pose = m.torch.visible ? 'guard' : 'stand'; m.goal = { x, z }; m.v = v; m.then = then || null; };
  function settle(m, mode, x, z, h) {
    const a = m.n.actor; m.goal = null; m.then = null; m.mode = mode;
    if (x != null) m.n.put(x, z, h, 'stand');
    m.torch.visible = mode === 'watch' || mode === 'patrol';
    a.setActivity(mode === 'sleep' ? 'doze' : null); a.pose = m.torch.visible ? 'guard' : 'stand';
    if (mode === 'watch') m.base = Math.atan2(m.fold.gx - a.x, m.fold.gz - a.z);
  }
  const atFire = (m, mode) => settle(m, mode, m.fold.fx, m.fold.fz, Math.atan2(m.fold.gx - m.fold.fx, m.fold.gz - m.fold.fz));
  function moveMen(dt) {
    for (const m of MEN) {
      const a = m.n.actor; m.n.behavior = 'ignore';
      if (m.goal) {
        const dx = m.goal.x - a.x, dz = m.goal.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.35) { const f = m.then; m.goal = null; m.then = null; if (f) f(); continue; }
        a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 8, dt); const st = Math.min(d, m.v * dt); a.x += dx / d * st; a.z += dz / d * st; a.speed = m.v;
        if (m.mode === 'patrol') m.base = a.heading;
      } else if (m.mode === 'watch') {
        if (m.wake > 0) { m.wake -= dt; a.heading = dampAngle(a.heading, Math.atan2(g.player.x - a.x, g.player.z - a.z), 3, dt); }
        else a.heading = dampAngle(a.heading, m.base + 0.9 * Math.sin(N.T * 0.36 + m.ph), 2.5, dt);
      } else if (m.mode === 'patrol') {
        m.pause -= dt; a.heading = dampAngle(a.heading, m.base + 0.8 * Math.sin(N.T * 0.9 + m.ph), 2.5, dt);
        if (m.pause <= 0) patrolNext(m);
      }
      // a sheep on his rope walks behind him
      if (m.carry) follow(m.led, a, dt);
    }
  }
  function follow(s, a, dt) {
    const tx = a.x - Math.sin(a.heading) * 1.3, tz = a.z - Math.cos(a.heading) * 1.3, dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    const v = Math.min(d * 3, 4.5); if (d > 0.05) { s.x += dx / d * v * dt; s.z += dz / d * v * dt; s.heading = dampAngle(s.heading, Math.atan2(dx, dz), 6, dt); }
    s.speed = v; s.state = v > 0.25 ? 'walk' : 'idle'; s.place(s.x, s.z, s.heading, w.terrainY(s.x, s.z)); s.update(dt);
  }
  const startLed = (s, x, z) => { s.group.visible = true; s.state = 'walk'; s.place(x, z, 0, w.terrainY(x, z)); };
  // The watch walks from gate to gate and stops at each to look round.
  const ROUND = ['you', 'young', 'big', 'old'];
  function patrolNext(m) {
    m.at = ((m.at == null ? -1 : m.at) + 1) % ROUND.length; const f = F[ROUND[m.at]];
    go(m, f.gx + Math.sin(f.ga) * 2.2, f.gz + Math.cos(f.ga) * 2.2, 1.45, () => { m.pause = 4.5; m.base = Math.atan2(f.x - m.n.x, f.z - m.n.z); });
    m.pause = 1e9;
  }
  function drawCones() {
    for (const m of MEN) {
      const on = !!N && (m.mode === 'watch' || m.mode === 'patrol') && !m.n.hidden; m.cone.visible = on; if (!on) continue;
      const a = m.n.actor, P = m.cone.geometry.attributes.position, arr = P.array, h = a.heading;
      arr[0] = a.x; arr[1] = w.terrainY(a.x, a.z) + 0.14; arr[2] = a.z;
      for (let i = 0; i <= m.seg; i++) { const t = h - C.half + 2 * C.half * i / m.seg, x = a.x + Math.sin(t) * C.range, z = a.z + Math.cos(t) * C.range, o = (i + 1) * 3; arr[o] = x; arr[o + 1] = w.terrainY(x, z) + 0.14; arr[o + 2] = z; }
      P.needsUpdate = true;
      m.cone.material.opacity = 0.5 + 0.08 * Math.sin(g.time * 9 + m.ph);
    }
  }

  // ---- being seen
  const wrong = () => (N.lead ? N.lead.from !== 'you' : FOLDS.some((f) => f !== F.you && dist(g.player, f) < C.zone));
  function sense(dt) {
    const p = g.player, running = Math.abs(p.speed) > 4.2; let rate = 0, who = null;
    if (!g.invisible) for (const m of MEN) {
      const dx = p.x - m.n.x, dz = p.z - m.n.z, d = Math.hypot(dx, dz); let r = 0;
      if ((m.mode === 'watch' || m.mode === 'patrol')) {
        const off = Math.abs(wrapPi(Math.atan2(dx, dz) - m.n.actor.heading));
        if (d < C.range && off < C.half) r = (1.7 - d / C.range) / C.notice; else if (d < 1.5) r = 2;
      } else if (m.mode === 'sleep' && d < C.sleeper) r = 2.5;
      if (running && d < C.hear && (m.mode === 'sleep' || m.mode === 'watch' || m.mode === 'patrol')) { r = Math.max(r, 1.6); if (m.mode === 'sleep') { settle(m, 'watch'); m.wake = 7; } else m.wake = 3; }
      if (r > rate) { rate = r; who = m; }
    }
    const before = N.meter; N.cool = Math.max(0, N.cool - dt);
    N.meter = clamp(N.meter + (rate > 0 && N.cool <= 0 ? rate : -0.9) * dt, 0, 1); if (rate > 0) N.by = who;
    if (before < 0.3 && N.meter >= 0.3) g.audio.tone(760, 0.09, 'triangle', 0.06);
    part('seenBox').style.display = N.meter > 0.02 ? 'block' : 'none'; part('seen').style.width = Math.round(N.meter * 100) + '%';
    if (N.meter >= 1) { N.meter = 0; if (wrong()) caught(N.by); else { N.cool = 6; g.ui.hint(N.by.n.name + ' lifts his torch, looks at you, and turns away.'); } }
  }
  function caught(m) {
    const k = N.k, fine = Math.min(C.fine[k - 1], F.you.count), r = rec(); r.caught[k - 1]++;
    g.run(async (gg) => {
      gg.audio.blip('bad'); part('seen').style.width = '0%'; part('seenBox').style.display = 'none';
      if (N && N.lead) { F[N.lead.from].count++; drop(); loot(-1); }
      const victim = FOLDS.filter((f) => f !== F.you).sort((a, b) => dist(gg.player, a) - dist(gg.player, b))[0];
      F.you.count -= fine; victim.count += fine; refresh();
      if (k === 1) {
        await gg.say(m.n.id, 'Thief! Get away from those sheep!', { mood: 'angry' });
        await gg.say('', 'There is no rule yet, so there is no trial. He walks you home by the arm and takes ' + (fine ? 'one of your sheep' : 'nothing, because you have nothing left') + ' for his trouble.');
      } else {
        await gg.say(m.n.id, 'Stop there. We made a rule, and you were the ' + (r.vote === 0 ? 'first to agree to it.' : 'only one against it.'), { mood: 'angry' });
        await gg.say('', 'Under the pact the fine is three sheep. ' + (fine ? 'He takes ' + (fine === 1 ? 'one' : fine === 2 ? 'two' : 'three') + ' from your fold before he lets you sit down.' : 'You have none left to pay it with.'));
      }
      await gg.ui.fade(1, 0.5); home(gg); await gg.ui.fade(0, 0.5);
      if (N) { N.meter = 0; N.cool = 3; }
    });
  }
  const home = (gg) => { gg.teleport('lydia', F.you.gx + Math.sin(F.you.ga) * 1.2, F.you.gz + Math.cos(F.you.ga) * 1.2, F.you.ga); };

  // ---- taking, leading, giving, and putting back
  function hold(from, x, z) {
    N.lead = { from }; startLed(rope, x, z); g.speedScale = C.lead; g.noRun = true; g.player.setActivity('lead'); g.audio.baa(); refresh();
  }
  function drop() { if (N) N.lead = null; rope.group.visible = false; g.speedScale = 1; g.noRun = false; g.player.setActivity('herd'); refresh(); }
  // The count in the corner: what the player holds that was another man's (a sheep is 1, a handful of gold 10).
  function loot(n) {
    const r = rec(); r.loot = Math.max(0, r.loot + n); refresh();
    if (n > 0 && hud) { g.audio.blip('card'); const e = part('taken'); e.style.transform = 'scale(1.35)'; setTimeout(() => { e.style.transform = ''; }, 240); }
  }
  for (const f of FOLDS) {
    if (f === F.you) continue;
    g.addSpot({ space: 'lydia', x: f.gx, z: f.gz, r: 2.2, label: 'Take a sheep from ' + f.label, when: () => N && !N.over && !N.lead && f.count > 0, run: async (gg) => {
      const r = rec(), lost = Math.min(f.count, 2); f.count -= lost; r.took[N.k - 1]++; if (gg.invisible) r.unseen++;
      hold(f.id, f.gx, f.gz); loot(1);
      if (lost > 1) { bolt.group.visible = true; bolt.state = 'walk'; bolt.place(f.gx, f.gz, f.ga + 2.2, w.terrainY(f.gx, f.gz)); bolt.run = 5; }
      if (!r.toldTake) { r.toldTake = true; await gg.say('', 'You get your rope on one. Before you can shut the gate a second one bolts through it and is gone into the dark.'); }
    } });
    g.addSpot({ space: 'lydia', x: f.gx, z: f.gz, r: 2.2, label: 'Put the sheep back', when: () => N && !N.over && N.lead && N.lead.from === f.id, run: async () => {
      rec().back[N.k - 1]++; f.count++; drop(); loot(-1);
    } });
    // A sheep can also go into a fold it did not come from: one of your own, or one taken somewhere else. With the
    // ring turned in nobody ever learns who did it; otherwise the owner knows your mark in the morning.
    g.addSpot({ space: 'lydia', x: f.gx, z: f.gz, r: 2.2, label: 'Put the sheep in ' + f.label, when: () => N && !N.over && N.lead && N.lead.from !== f.id, run: async (gg) => {
      const r = rec(), stolen = N.lead.from !== 'you', gft = r.gifts[f.id] || (r.gifts[f.id] = { open: 0, unseen: 0 });
      f.count++; if (gg.invisible) { gft.unseen++; r.gaveUnseen++; } else { gft.open++; r.gaveOpen++; }
      drop(); if (stolen) loot(-1); gg.audio.blip('pick');
    } });
  }
  g.addSpot({ space: 'lydia', x: F.you.gx, z: F.you.gz, r: 2.4, label: 'Put the sheep in your fold', when: () => N && !N.over && N.lead, run: async () => { F.you.count++; drop(); } });
  g.addSpot({ space: 'lydia', x: F.you.gx, z: F.you.gz, r: 2.4, label: 'Put a rope on one of your own sheep', when: () => N && !N.over && !N.lead && F.you.count > 0 && !sitting, run: async () => { F.you.count--; hold('you', F.you.gx, F.you.gz); } });
  g.addSpot({ space: 'lydia', x: F.you.fx, z: F.you.fz, r: 2.2, label: 'Sit by your fire and let the night pass', when: () => N && !N.over && !N.lead && !sitting, run: async (gg) => {
    sitting = true; gg.frozen = true; gg.player.setActivity(null); gg.player.pose = 'ground'; refresh();
    gg.ui.hint('You sit by your fire, and the night passes. Press E to get up.');
  } });
  function stand() { if (!sitting) return; sitting = false; g.frozen = false; g.player.pose = 'stand'; g.player.setActivity('herd'); g.ui.hint(null); refresh(); }

  // ---- the first night's raids
  function raid(m, tf, v = 1.6) {
    settle(m, 'walk'); m.raiding = true;
    go(m, tf.gx, tf.gz, v, () => {
      m.raiding = false;
      const owner = MEN.find((o) => o.fold === tf), r = rec(), flee = () => go(m, m.fold.fx, m.fold.fz, 3.3, () => atFire(m, 'watch'));
      if (tf === F.you && dist(g.player, tf) < C.home) {
        r.guarded = true; m.pays = 1; flee();
        g.run(async (gg) => { const was = sitting; await gg.say(m.n.id, 'I thought you’d be asleep.', { mood: 'afraid' }); await gg.say('', 'He backs away from your gate and runs for his own fold. In the morning he will owe you a sheep for trying.'); if (was) gg.ui.hint('You are still sitting by your fire. Press E to get up.'); });
        return;
      }
      if ((owner && owner.mode === 'watch' && dist(owner.n, tf) < 10) || tf.count < 1) { flee(); return; }
      tf.count -= Math.min(tf.count, 2); m.carry = tf; startLed(m.led, tf.gx, tf.gz);
      if (tf === F.you) { r.robbed = true; N.robber = m; g.audio.blip('bad'); g.ui.hint('Someone has been at your fold while you were away. Two of your sheep are gone.'); }
      refresh();
      go(m, m.fold.gx, m.fold.gz, 1.35, () => { m.fold.count++; m.carry = null; m.led.group.visible = false; if (N && N.robber === m) N.robber = null; refresh(); go(m, m.fold.fx, m.fold.fz, 1.4, () => atFire(m, 'watch')); });
    });
  }

  // ---- one night
  function start(k) {
    build(); stand(); gen++;
    N = { k, T: 0, over: false, lead: null, meter: 0, cool: 2, by: null, robber: null, events: [] };
    for (const m of MEN) { m.n.show(true); m.carry = null; m.led.group.visible = false; m.pays = 0; m.at = null; }
    g.npc('shep1').show(false);   // the fourth shepherd keeps no fold in this valley; he comes to the meetings
    if (k === 1) {
      atFire(M.old, 'watch'); atFire(M.young, 'watch'); atFire(M.big, 'watch');
      N.events.push({ t: 22, fn: () => raid(M.big, F.young) });
    } else {
      atFire(M.young, 'sleep'); atFire(M.big, 'sleep'); settle(M.old, 'patrol', F.old.fx, F.old.fz, 0); M.old.pause = 1.5; M.old.at = null;
    }
    N.events.sort((a, b) => a.t - b.t);
    hooks.daySheep(false); g.player.setActivity('herd'); refresh();
  }
  function tick(dt) {
    if (bolt && bolt.group.visible) { bolt.run -= dt; const v = 4.2; bolt.x += Math.sin(bolt.heading) * v * dt; bolt.z += Math.cos(bolt.heading) * v * dt; bolt.speed = v; bolt.place(bolt.x, bolt.z, bolt.heading, w.terrainY(bolt.x, bolt.z)); bolt.update(dt); if (bolt.run <= 0) bolt.group.visible = false; }
    if (!N || g.space !== 'lydia') return;
    drawCones();
    if (N.lead) follow(rope, g.player, dt);
    if (N.over || g.busy) return;
    if (sitting && (g.pressed.has('KeyE') || g.pressed.has('Enter') || g.keys.has('KeyW') || g.keys.has('ArrowUp'))) { g.pressed.clear(); stand(); }
    const rate = sitting ? C.sit : 1, step = dt * rate; N.T += step;
    while (N.events.length && N.events[0].t <= N.T) N.events.shift().fn();
    moveMen(step);
    // The thief leading your sheep away lets go of it if you come up to him.
    if (N.robber && N.robber.carry === F.you && !g.invisible && dist(g.player, N.robber.n) < 4.5) {
      const m = N.robber; N.robber = null; m.carry = null; m.led.group.visible = false; F.you.count++; rec().chased = true; refresh();
      go(m, m.fold.fx, m.fold.fz, 3.3, () => atFire(m, 'watch')); g.ui.hint('He lets go of the rope and runs. One of your two sheep is back. The one that bolted is gone.');
    }
    if (N.k === 1) {
      if (!N.youngLeft) {
        // He watches your fire. Two seconds after you are 10 m from your fold he sets out for it, and he is quick,
        // so you cannot raid his fold and be back in time to guard your own.
        if (N.awayAt == null && dist(g.player, F.you) > 10) N.awayAt = N.T;
        if ((N.awayAt != null && N.T > N.awayAt + 2) || N.T >= 30) { N.youngLeft = true; raid(M.young, F.you, 2.4); }
      } else if (!N.passed && M.young.raiding && dist(g.player, M.young.n) < 7 && dist(g.player, F.you) > C.home) {
        N.passed = true; g.ui.hint('The young shepherd passes you in the dark, going the other way, toward your fold.');
      }
    }
    sense(dt);
    part('bar').style.width = Math.round(clamp(N.T / C.length, 0, 1) * 100) + '%';
    if (N.T >= C.length) end();
  }
  g.tickers.push(tick);

  function end() {
    N.over = true; stand();
    if (N.lead) { F.you.count++; drop(); }                                             // dawn finds it at your gate
    for (const m of MEN) { if (m.carry) { m.fold.count++; m.carry = null; m.led.group.visible = false; } if (m.pays && m.fold.count > 0) { m.fold.count -= m.pays; F.you.count += m.pays; } m.goal = null; m.then = null; }
    const k = N.k; g.run((gg) => (k === 1 ? dawn1(gg) : k === 2 ? dawn2(gg) : dawn3(gg)));
  }
  const counts = () => 'Your fold has ' + F.you.count + '. The old shepherd has ' + F.old.count + ', the young one ' + F.young.count + ', and the big one ' + F.big.count + '.';
  function toMeeting(gg) {
    for (const m of MEN) { settle(m, 'day', m.was.x, m.was.z, m.was.h); m.n.actor.pose = 'ground'; m.n.behavior = 'idle'; m.cone.visible = false; }
    gg.npc('shep1').show(true);
    const S = gg.sites.meeting; gg.teleport('lydia', S.x + 0.4, S.z - 3.6, 0);
  }
  const off = () => { const k = N ? N.k : 0; N = null; refresh(); for (const m of MEN) m.cone.visible = false; return k; };

  async function dawn1(gg) {
    const r = rec(), paid = MEN.some((m) => m.pays);
    await gg.ui.fade(1, 0.8); off(); toMeeting(gg); gg.env('dawn', 0); await gg.ui.fade(0, 0.8);
    await gg.say('', 'Morning. The shepherds meet at the fire and count. ' + counts());
    if (paid) await gg.say('', 'The young shepherd has handed you one of his sheep without looking at you.');
    if (F.young.count < C.start && !paid) await gg.say('shep2', 'Somebody was in my fold last night. One sheep was taken, and another ran out through the gate and I never found it.', { mood: 'angry' });
    if (F.big.count > C.start) await gg.say('shep0', 'There’s no rule against it. I took what I could get, the same as anyone would.', { mood: 'scorn' });
    if (total() < 4 * C.start) await gg.say('shep3', 'We had twenty-four between us yesterday. Today we have ' + total() + '. Every raid costs the man who is robbed more than it gets the thief.', { mood: 'think' });
    else await gg.say('shep3', 'Nobody lost a sheep last night, and nobody slept either. I can’t sit up with a torch every night and herd all day.', { mood: 'think' });
    await thanks(gg);
    await gg.say('shep3', 'And the king counts at the month’s end. He takes the flock from any man who is short.');
    await gg.say('shep3', 'I’m too old to rob anyone, and I’m tired of being robbed. I say we make a rule.');
    r.vote = await gg.choose(['“Make the rule. Nobody takes from anybody.”', '“No rule. Let each man guard his own.”'], { prompt: 'The old shepherd looks at you.', name: 'The old shepherd' });
    if (r.vote === 1) { await gg.say('shep3', 'You say that because you’re quick on your feet. Wait until two of them come for your fold on the same night.'); await gg.say('', 'The others agree with him. You are outvoted.'); }
    await gg.say('shep3', 'Then it’s settled. Nobody takes from another man’s fold. One of us walks the folds every night with a torch. Whoever he catches pays three sheep.');
    await gg.say('glaucon', 'That, people say, is where law comes from. And keeping the deal is all they mean by “doing right”.', told);
    await gg.say('glaucon', 'Look at who wanted it. The ones who can’t rob and get away with it. They don’t think the rule is good. They put up with it because being robbed is worse.', told);
    await gg.say('glaucon', 'A man who could take what he liked and never pay for it would be mad to agree. That is what people say.', told);
    hooks.api.giveCards(gg, ['compact']);
    await gg.ui.fade(1, 0.8); gg.env('night', 0); start(2); home(gg); await gg.ui.fade(0, 0.8);
    await gg.say('glaucon', 'So that night the old man walked the folds with his torch, and the others slept.', told);
    gg.objective('Night. The old shepherd is walking the folds with his torch.', null);
  }
  async function dawn2(gg) {
    await gg.ui.fade(1, 0.8); off(); toMeeting(gg); home(gg); gg.env('dawn', 0); await gg.ui.fade(0, 0.8);
    await gg.say('', 'Morning. ' + counts());
    await thanks(gg);
    await gg.ui.fade(1, 0.6); await hooks.onDay(gg);
  }
  // A man who finds one of your sheep in his fold knows your mark, unless the ring hid you when you put it there.
  async function thanks(gg, skip) {
    const r = rec();
    for (const m of MEN) {
      const gft = r.gifts[m.id], n = gft ? gft.open - (r.thanked[m.id] || 0) : 0; if (n <= 0) continue;
      r.thanked[m.id] = gft.open; if (m.id === skip) continue;
      await gg.say(m.n.id, 'There' + (n > 1 ? ' are sheep' : '’s a sheep') + ' of yours in my fold this morning. I know your mark. I won’t forget it.', { mood: 'happy' });
    }
  }
  async function dawn3(gg) {
    const r = rec(), who = { old: 'old', young: 'young', big: 'big' }; r.final = F.you.count; r.lost = []; r.saved = [];
    await gg.ui.fade(1, 0.8); off(); toMeeting(gg); gg.env('dawn', 0); await gg.ui.fade(0, 0.8);
    await gg.say('', 'The end of the month. The shepherds count for the king. ' + counts());
    if (r.unseen > 0) await gg.say('shep3', 'Sheep went from the folds last night. I walked every hour of it and I never saw anyone.', { mood: 'think' });
    for (const m of MEN) {
      const f = m.fold, gft = r.gifts[m.id] || { open: 0, unseen: 0 };
      if (f.count < C.start) {
        // short at the count: he loses his flock
        r.lost.push(m.id);
        await gg.say('', 'The ' + who[m.id] + ' shepherd has ' + f.count + '. The king takes the flock from a man who is short.');
        await gg.say(m.n.id, 'Then I’m finished here.', { mood: 'sad' });
      } else if (gft.unseen > 0) {
        const short = f.count - gft.unseen < C.start; if (short) r.saved.push(m.id);
        await gg.say(m.n.id, (short ? 'I was short at dusk. This morning I have ' + f.count + '.' : 'There are more sheep in my fold than I put there.') + ' I don’t know who to thank.', { mood: 'surprised' });
      }
    }
    await thanks(gg);
    if (F.you.count < C.start) await gg.say('shep3', 'And you are ' + (C.start - F.you.count) + ' short yourself. The king will hear of it.', { mood: 'sad' });
    else if (F.you.count > C.start) await gg.say('shep3', 'You have ' + F.you.count + '. The king wants his six. The rest are yours.');
    await hooks.onMonthEnd(gg);
  }

  // ---- what the story calls from outside
  return {
    folds: F, loot,
    // The story begins at night beside the player's fold.
    async begin(gg) {
      build(); for (const f of FOLDS) f.count = C.start; hooks.log().nights = null; rec(); storyOn = true;
      gg.env('night', 0); start(1); home(gg);
    },
    // Almost nothing is explained. The prompts at the gates and the count in the corner are all the player gets.
    async intro(gg) {
      await gg.say('glaucon', 'I’ll put you in his place for a few nights before the ring comes into it. Each shepherd kept a fold of the king’s sheep, with a fire beside it.', told);
      await gg.say('glaucon', 'At first, they say, there was no rule among them about anything.', told);
      await gg.say('', 'It is night. Your fold is beside you. Three more fires burn across the pasture.');
      gg.objective('Night. Your fold is beside you.', null);
    },
    async third(gg) {
      await gg.ui.fade(1, 0.8); gg.env('night', 0); start(3); home(gg); await gg.ui.fade(0, 0.8);
      await gg.say('glaucon', 'That night the old man walked the folds as he did every night. And the shepherd sat by his fire, turning the ring on his finger.', told);
      gg.objective('Night. R turns the ring.', null);
    },
    active: () => !!N,
    stop() { stand(); if (N && N.lead) drop(); off(); storyOn = false; refresh(); g.speedScale = 1; g.noRun = false; if (built) for (const m of MEN) { settle(m, 'day', m.was.x, m.was.z, m.was.h); m.n.actor.pose = 'ground'; m.torch.visible = false; } },
    // Glaucon goes over the three nights before he says anything about the hall. Returns how many sheep were taken
    // with the ring.
    async verdict(gg) {
      const r = hooks.log().nights; if (!r) return 0;
      const n1 = r.took[0] - r.back[0], n2 = r.took[1] - r.back[1], n3 = r.took[2] - r.back[2], num = (n) => (n === 1 ? 'one sheep' : n + ' sheep');
      await gg.say('', r.loot > 0 ? 'The number in the corner reached ' + r.loot + '. Nobody told you to raise it.' : 'The number in the corner stayed at nothing. Nobody told you to keep it there.');
      await gg.say('glaucon', 'Go back over the three nights first.', { mood: 'think' });
      await gg.say('glaucon', (n1 > 0 ? 'With no rule, you took ' + num(n1) + '.' : 'With no rule, you took nothing.') + ' ' + (n2 > 0 ? 'Under the pact, with the torch going round, you took ' + num(n2) + (r.caught[1] ? ' and were caught.' : '.') : 'Under the pact you took nothing.') + ' ' + (n3 > 0 ? 'With the ring, you took ' + num(n3) + '.' : 'With the ring, you took nothing from the folds.'));
      if (n3 > 0 && n2 <= 0) await gg.say('glaucon', 'So you kept the rule while you could be caught, and you dropped it when you couldn’t. That is exactly what people say everyone does.');
      else if (n3 > 0) await gg.say('glaucon', 'You didn’t wait for the ring. The people who tell this story would say you are like everyone else, only less careful.');
      else if (n2 > 0) await gg.say('glaucon', 'You broke the pact when you could be caught, and kept it when you couldn’t. I don’t know what the story makes of that.', { mood: 'think' });
      else if (n1 > 0) await gg.say('glaucon', 'You took when there was no rule and stopped when there was one, even on the night nobody could have seen you. The people who tell this story say nobody is like that.', { mood: 'think' });
      else await gg.say('glaucon', 'You never touched another man’s fold, not even with the ring. The people who tell this story say nobody is like that.', { mood: 'think' });
      // the ring used to give
      if (r.gaveUnseen > 0) await gg.say('glaucon', 'And with the ring on you put ' + num(r.gaveUnseen) + ' into another man’s fold. Nobody saw it, and nobody can ever thank you for it. The people who tell this story have no place for that.', { mood: 'think' });
      else if (r.gaveOpen > 0) await gg.say('glaucon', 'You gave ' + num(r.gaveOpen) + ' away with your face showing. The people who tell this story would say that buys a good name, and a good name is worth more than a sheep.');
      if (r.lost && r.lost.length) await gg.say('glaucon', (r.lost.length > 1 ? 'Two of the others lost their flocks' : 'The ' + r.lost[0] + ' shepherd lost his flock') + ' at the month’s end. You had the ring on your hand the night before.', { mood: 'sad' });
      return n3;
    },
  };
}
