// The running game: loop, input, player, camera, other people, interaction, saving.
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, wrapPi, mulberry32, store, $ } from './util.js';
import { World, Sea, Sky, BOUNDS } from './world.js';
import { Backdrop } from './backdrop.js';
import { Fires } from './fire.js';
import { Flora } from './flora.js';
import { Surfaces } from './surfaces.js';
import { Kit } from './kit.js';
import { Actor, makeProp } from './actors.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';

export const CONFIG = {
  walk: 4.2, run: 7.6, back: 2.4, turn: 2.5, radius: 0.36,
  camDist: 4.6, camMin: 1.6, camMax: 9, camPitch: 0.26, talkRange: 3.1, step: 1 / 60, saveKey: 'city-in-speech-v2',
};
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'Enter']);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3();

export class NPC {
  constructor(game, def) {
    Object.assign(this, { id: def.id, name: def.name, role: def.role || '', color: def.color || '#888', space: def.space || 'world', talk: def.talk || null, label: def.label || null, behavior: def.behavior || 'idle', radius: def.radius || 3, speed: def.speed || 1.15 });
    this.g = game; this.ghost = !!def.ghost; this.baseMood = def.mood || 'neutral';
    this.actor = new Actor(def.look || {}, def.seed || (game.npcs.size + 3));
    this.actor.mood = this.baseMood;
    if (def.prop) this.actor.attach(def.propHand || 'handR', makeProp(def.prop));
    if (def.pose) this.actor.pose = def.pose;
    this.home = { x: def.x || 0, z: def.z || 0, h: def.h || 0 };
    this.actor.place(this.home.x, this.home.z, this.home.h, 0);
    this.yFix = def.y != null ? def.y : null;
    this.state = 'wait'; this.timer = 1 + (this.actor.seed % 5); this.target = null; this.move = null; this.hidden = !!def.hidden;
    this.rng = mulberry32(977 + this.actor.seed * 13);
    game.people.add(this.actor.group);
    this.actor.group.visible = !this.hidden;
  }
  get x() { return this.actor.x; } get z() { return this.actor.z; }
  show(v = true) { this.hidden = !v; this.actor.group.visible = v; }
  put(x, z, h, pose) { this.actor.place(x, z, h); this.home.x = x; this.home.z = z; if (h != null) this.home.h = h; if (pose) this.actor.pose = pose; this.move = null; this.state = 'wait'; this.snapY(); }
  snapY() { this.actor.y = this.yFix != null ? this.yFix : this.g.spaces[this.space].ground(this.actor.x, this.actor.z); this.actor.sync(); }
  // Walk in a straight line to a point. Resolves on arrival.
  moveTo(x, z, speed = 1.6, face) {
    if (this.g.ui.auto) { this.put(x, z, face != null ? face : this.actor.heading); return Promise.resolve(); }
    return new Promise((res) => { this.move = { x, z, speed, res, face, t: 0 }; });
  }
  update(dt, player, near, quality = 1) {
    const a = this.actor, sp = this.g.spaces[this.space];
    a.speed = 0;
    if (this.move) {
      const m = this.move, dx = m.x - a.x, dz = m.z - a.z, d = Math.hypot(dx, dz); m.t += dt;
      if (d < 0.25 || m.t > 30) { if (m.t > 30) { a.x = m.x; a.z = m.z; } if (m.face != null) a.heading = m.face; this.home.x = a.x; this.home.z = a.z; this.home.h = a.heading; this.move = null; m.res(); }
      else { a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 8, dt); const st = Math.min(d, m.speed * dt); a.x += dx / d * st; a.z += dz / d * st; a.speed = m.speed; }
    } else if (this.behavior === 'wander' && !this.busy) {
      this.timer -= dt;
      if (this.state === 'wait' && this.timer <= 0) {
        for (let tries = 0; tries < 6; tries++) {
          const ang = this.rng() * Math.PI * 2, r = this.radius * (0.3 + 0.7 * this.rng()), tx = this.home.x + Math.sin(ang) * r, tz = this.home.z + Math.cos(ang) * r;
          if (sp.walkable(tx, tz) && !sp.solidAt(tx, 1, tz, 0.5)) { this.target = [tx, tz]; this.state = 'go'; this.timer = 14; break; }
        }
        if (this.state === 'wait') this.timer = 2;
      } else if (this.state === 'go') {
        const dx = this.target[0] - a.x, dz = this.target[1] - a.z, d = Math.hypot(dx, dz);
        if (d < 0.3 || this.timer <= 0) { this.state = 'wait'; this.timer = 2 + this.rng() * 6; }
        else {
          a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 6, dt);
          const st = this.speed * dt; let nx = a.x + Math.sin(a.heading) * st, nz = a.z + Math.cos(a.heading) * st;
          [nx, nz] = sp.resolve(nx, nz, 0.3);
          if (sp.walkable(nx, nz)) { a.x = nx; a.z = nz; a.speed = this.speed; } else { this.state = 'wait'; this.timer = 1; }
        }
      }
    } else if (this.behavior === 'follow' && !this.busy) {
      // A companion: keep a little behind and beside the player, and catch up out of sight if left far behind.
      const ph = player.heading, sn = Math.sin(ph), cs = Math.cos(ph), hx = player.x - sn * 1.3 + cs * 1.0, hz = player.z - cs * 1.3 - sn * 1.0;
      const dx = hx - a.x, dz = hz - a.z, d = Math.hypot(dx, dz), pd = Math.hypot(player.x - a.x, player.z - a.z);
      if (pd > 24 || (this.stuck || 0) > 2.5) {
        let ok = false;
        for (const [bx, bz] of [[hx, hz], [player.x - sn * 1.4, player.z - cs * 1.4], [player.x + cs * 1.2, player.z - sn * 1.2], [player.x - cs * 1.2, player.z + sn * 1.2]]) if (sp.walkable(bx, bz) && !sp.solidAt(bx, 1, bz, 0.3)) { a.x = bx; a.z = bz; ok = true; break; }
        if (!ok) { a.x = player.x; a.z = player.z; }
        a.heading = ph; a.y = sp.ground(a.x, a.z); this.stuck = 0; this.moving = false;
      } else if (d > (this.moving ? 0.3 : 1.1)) {
        this.moving = true;
        const v = Math.min(pd > 7 ? 8.4 : pd > 3.2 ? 5.4 : 3.4, d * 2.5 + 0.8);
        a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 9, dt);
        let nx = a.x + dx / d * v * dt, nz = a.z + dz / d * v * dt;
        // A companion walks through walls it cannot path around, but it should step around people.
        for (const o of this.g.npcs.values()) { if (o === this || o.hidden || o.space !== this.space) continue; const ex = nx - o.actor.x, ez = nz - o.actor.z, e = Math.hypot(ex, ez); if (e < 0.75 && e > 0.001) { nx += ex / e * (0.75 - e); nz += ez / e * (0.75 - e); } }
        [nx, nz] = sp.resolve(nx, nz, 0.28);
        if (sp.walkable(nx, nz) && Math.hypot(nx - a.x, nz - a.z) > v * dt * 0.25) { a.x = nx; a.z = nz; a.speed = v; this.stuck = 0; } else this.stuck = (this.stuck || 0) + dt;
      } else { this.moving = false; this.stuck = 0; if (Math.abs(player.speed) < 0.3) a.heading = dampAngle(a.heading, Math.atan2(player.x - a.x, player.z - a.z), 2.5, dt); }
    }
    // Notice the player.
    const pd = Math.hypot(player.x - a.x, player.z - a.z);
    if (this.lookTarget) a.lookAt = this.lookTarget;
    else if (pd < 7 && this.behavior !== 'ignore') a.lookAt = { x: player.x, y: player.y + 1.55, z: player.z };
    else a.lookAt = null;
    a.y = this.yFix != null ? this.yFix : damp(a.y, sp.ground(a.x, a.z), 14, dt);
    if (near) a.update(dt, quality); else a.sync();
  }
}

export class Game {
  constructor() {
    this.canvas = $('view');
    this.mode = 'loading'; this.busy = 0; this.time = 0; this.acc = 0; this.last = 0; this.timeScale = 1;
    this.flags = {}; this.cards = []; this.disputeState = {}; this.log = []; this.stats = { asked: 0, objections: 0, hits: 0, misses: 0 };
    this.keys = new Set(); this.pressed = new Set();
    this.npcs = new Map(); this.spots = []; this.triggers = []; this.chatter = []; this.flames = []; this.waits = []; this.tickers = [];
    this.spaces = {}; this.space = 'world';
    this.reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cam = { yaw: Math.PI, pitch: CONFIG.camPitch, dist: CONFIG.camDist, want: CONFIG.camDist, cur: CONFIG.camDist, t: new THREE.Vector3(), mode: 'follow', drag: false, fpYaw: 0, fpPitch: 0, fpLimit: null };
    this.focus = null; this.objectiveData = null; this.scale = 1; this.frameMs = []; this.cardsById = {}; this.content = null;
    this.ui = new UI(this); this.audio = new Audio();
  }

  async init(progress) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.12, 2200);
    this.people = new THREE.Group(); this.scene.add(this.people);
    progress(0.15);
    this.world = new World(this.scene);
    this.sea = new Sea(this.scene);
    this.sky = new Sky(this.scene, r);
    this.backdrop = new Backdrop(this.scene, this.world);   // the far plain, mountains, and islands
    this.kit = new Kit(this.world);
    this.flora = this.kit.flora = new Flora(this.kit, this.world);   // trees, shrubs, and grass
    this.surface = this.kit.surface = this.world.surface = new Surfaces();   // plaster, tile, stone, wood, and the rest
    this.fires = new Fires(this.scene);            // moving flames, sparks, and smoke
    this.kit.glowMat.visible = false;              // the kit's own flame shapes are replaced by those
    progress(0.3);
    await this.kit.load('./assets/kit/');
    progress(0.6);
    const w = this.world;
    this.spaces.world = { name: 'world', ground: (x, z) => w.groundY(x, z), walkable: (x, z) => w.walkable(x, z), resolve: (x, z, rr) => w.resolve(x, z, rr), solidAt: (x, y, z, p) => w.solidAt(x, y, z, p), surface: () => 'earth' };
    this.spaces.lydia = this.spaces.world;
    // The player.
    this.player = new Actor({ skin: 'tan', hair: 0x3a2a1c, beard: 'short', robe: 0xd8cdb0, robe2: 0x6f7f8a, hat: 'petasos', ownMaterial: true }, 99);
    this.people.add(this.player.group);
    this.player.material.transparent = false;
    // Objective beam.
    // A small gold marker that floats over the place to go next.
    this.beam = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0xf2c14e, fog: false, transparent: true, opacity: 0.95 }));
    this.beam.visible = false; this.scene.add(this.beam);
    // Warm lights that follow the nearest flames at night.
    this.fireLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff9a4a, 0, 26, 1.6); this.scene.add(l); return l; });
    this.bindInput();
    this.resize(); window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.pause(true); this.last = performance.now(); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  start() { this.last = performance.now(); requestAnimationFrame((t) => this.frame(t)); }

  // ---------- input ----------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'play' && !this.overlayOpen() && MOVE_KEYS.has(e.code)) e.preventDefault();
      this.audio.unlock();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') { if (this.closeOverlays()) return; if (this.mode === 'play' && !this.ui.waiting) this.pause(true); else if (this.mode === 'paused') this.pause(false); }
      if (this.mode === 'play' && !this.ui.waiting && !this.ui.pickRes) {
        if (e.code === 'KeyJ') this.toggle('journal'); if (e.code === 'KeyM') this.toggle('map');
        if (e.code === 'KeyH' && this.onGuide && !this.busy && !this.overlayOpen()) this.onGuide();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { this.audio.unlock(); c.focus({ preventScroll: true }); this.cam.drag = true; this.dragX = e.clientX; this.dragY = e.clientY; try { c.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
    c.addEventListener('pointermove', (e) => {
      if (!this.cam.drag) return;
      const dx = e.clientX - this.dragX, dy = e.clientY - this.dragY; this.dragX = e.clientX; this.dragY = e.clientY;
      if (this.cam.mode === 'first') {
        this.cam.fpYaw -= dx * 0.004; this.cam.fpPitch = clamp(this.cam.fpPitch + dy * 0.0035, -1.1, 1.1);
        const L = this.cam.fpLimit; if (L) { this.cam.fpYaw = clamp(this.cam.fpYaw, -L[0], L[0]); this.cam.fpPitch = clamp(this.cam.fpPitch, -L[1], L[1]); }
        if (L && (Math.abs(this.cam.fpYaw) >= L[0] - 0.001) && this.onStrain) this.onStrain();
      } else { this.cam.yaw -= dx * 0.0048; this.cam.pitch = clamp(this.cam.pitch + dy * 0.0036, -0.35, 1.15); }
    });
    const up = () => { this.cam.drag = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.want = clamp(this.cam.want + Math.sign(e.deltaY) * 0.6, CONFIG.camMin, CONFIG.camMax); }, { passive: false });
    $('btnJournal').onclick = () => this.toggle('journal'); $('btnMap').onclick = () => this.toggle('map');
    $('btnJournalClose').onclick = () => this.toggle('journal'); $('btnMapClose').onclick = () => this.toggle('map');
    $('btnPause').onclick = () => this.pause(true); $('btnResume').onclick = () => this.pause(false);
    $('btnSound').onclick = () => { const on = !this.audio.on; this.audio.unlock(); this.audio.setOn(on); $('btnSound').textContent = on ? 'Sound on' : 'Sound off'; $('btnSound').setAttribute('aria-pressed', String(on)); };
    $('btnMotion').onclick = () => { this.reduceMotion = !this.reduceMotion; $('btnMotion').textContent = 'Reduce motion: ' + (this.reduceMotion ? 'on' : 'off'); $('btnMotion').setAttribute('aria-pressed', String(this.reduceMotion)); };
    $('btnRestart').onclick = () => $('restartAsk').classList.remove('hidden');
    $('btnRestartNo').onclick = () => $('restartAsk').classList.add('hidden');
    $('btnRestartYes').onclick = () => { store.del(CONFIG.saveKey); if (this.onRestart) this.onRestart(); };
  }
  overlayOpen() { return !$('journal').classList.contains('hidden') || !$('map').classList.contains('hidden') || !$('picker').classList.contains('hidden') || !$('debrief').classList.contains('hidden'); }
  closeOverlays() { let any = false; for (const id of ['journal', 'map']) if (!$(id).classList.contains('hidden')) { $(id).classList.add('hidden'); any = true; } if (any) this.canvas.focus(); return any; }
  toggle(id) {
    const e = $(id), open = e.classList.contains('hidden');
    this.closeOverlays();
    if (open) { e.classList.remove('hidden'); if (id === 'journal' && this.renderJournal) this.renderJournal(); if (id === 'map') this.drawMap(); e.querySelector('button').focus(); }
  }
  pause(on) {
    if (on && this.mode === 'play') { this.mode = 'paused'; $('pause').classList.remove('hidden'); $('restartAsk').classList.add('hidden'); $('btnResume').focus(); }
    else if (!on && this.mode === 'paused') { this.mode = 'play'; $('pause').classList.add('hidden'); this.canvas.focus(); this.last = performance.now(); }
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * this.scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------- story helpers ----------
  flag(name, value) { if (value === undefined) return this.flags[name]; this.flags[name] = value; return value; }
  npc(id) { return this.npcs.get(id); }
  addNPC(def) { const n = new NPC(this, def); this.npcs.set(def.id, n); n.snapY(); return n; }
  addSpot(s) { this.spots.push(s); return s; }
  addTrigger(t) { this.triggers.push(t); return t; }
  wait(seconds) { if (this.ui.auto) return Promise.resolve(); return new Promise((res) => this.waits.push({ t: this.time + seconds, res })); }
  // Run a scripted exchange. The player cannot walk while it runs.
  async run(fn) {
    this.busy++; this.ui.prompt(null);
    try { await fn(this); } catch (e) { console.error(e); this.lastError = String(e && e.stack || e); }
    finally { this.busy--; if (!this.busy) { this.ui.closeDialogue(); this.setFocus(null); for (const n of this.npcs.values()) { n.actor.speaking = false; n.actor.mood = n.baseMood; if (n.talkLook) { n.lookTarget = null; n.talkLook = false; } } this.player.speaking = false; this.player.mood = 'neutral'; this.save(); } }
  }
  // Say several lines in a row. Each item is [who, text, mood, gesture] or [who, text, options].
  async lines(arr) { for (const l of arr) await this.say(l[0], l[1], l[2] && typeof l[2] === 'object' ? l[2] : { mood: l[2], play: l[3] }); }
  setFocus(target) { // a person or point the camera should frame together with the player
    if (target && this.cam.mode === 'follow') { this.focus = target; }
    else if (!target && this.focus) { this.focus = null; }
  }
  async say(who, text, opts = {}) {
    let name = who, role = opts.role || '';
    for (const n of this.npcs.values()) n.actor.speaking = false; this.player.speaking = false;
    if (who === 'you') { name = 'You'; this.player.speaking = true; this.player.mood = opts.mood || 'neutral'; }
    else if (who === '' || who == null) { name = ''; }
    else if (this.npcs.has(who)) {
      const n = this.npcs.get(who), a = n.actor; name = n.name; role = role || n.role; a.speaking = true;
      a.mood = opts.mood || n.baseMood;
      if (opts.play && a.play) a.play(opts.play);
      if (!n.hidden && n.space === this.space) {
        // The speaker turns to the person addressed (the player unless `to` names someone else).
        const to = opts.to && this.npcs.get(opts.to), tx = to ? to.x : this.player.x, tz = to ? to.z : this.player.z;
        if (to) { n.lookTarget = { x: tx, y: to.actor.y + 1.5, z: tz }; n.talkLook = true; } else if (n.talkLook) { n.lookTarget = null; n.talkLook = false; }
        if (!opts.noFocus) this.setFocus(a);
        if (!opts.noTurn && n.behavior !== 'ignore' && (a.pose === 'stand' || a.pose === 'staff')) a.face(tx, tz);
        // People standing close turn their heads to whoever is speaking.
        for (const m of this.npcs.values()) if (m !== n && !m.hidden && m.space === this.space && m.behavior !== 'ignore' && (!m.lookTarget || m.talkLook) && Math.hypot(m.x - n.x, m.z - n.z) < 9) { m.lookTarget = { x: a.x, y: a.y + 1.5 * (a.spec.height || 1), z: a.z }; m.talkLook = true; }
      }
    }
    await this.ui.say(name, text, { role, note: opts.note });
  }
  choose(options, opts) { for (const n of this.npcs.values()) n.actor.speaking = false; this.player.speaking = false; return this.ui.choose(options, opts); }
  giveCard(id) {
    if (this.cards.includes(id)) return false;
    const c = this.cardsById[id]; if (!c) { console.warn('unknown card', id); return false; }
    this.cards.push(id); this.audio.blip('card'); this.ui.toast(c.title, (/^[0-9]/.test(c.ref) ? 'Republic ' : '') + c.ref, 'New passage in your journal');
    return true;
  }
  objective(text, target) {
    this.objectiveData = text ? { text, x: target ? target.x : null, z: target ? target.z : null, label: (target && target.label) || '' } : null;
    this.ui.objective(text);
    if (target && target.x != null && (target.space || 'world') === this.space) { this.beam.visible = true; this.beamBase = this.spaces[this.space].ground(target.x, target.z) + 3.4; this.beam.position.set(target.x, this.beamBase, target.z); } else this.beam.visible = false;
  }
  env(name, seconds = 3) { this.envName = name; this.sky.set(name, this.ui.auto ? 0 : seconds); }
  teleport(space, x, z, heading) {
    this.space = space;
    const p = this.player; p.x = x; p.z = z; if (heading != null) { p.heading = heading; this.cam.yaw = heading; }
    p.y = this.spaces[space].ground(x, z); p.sync();
    this.cam.cur = this.cam.want; this.snapCam = true;
    if (this.onSpace) this.onSpace(space);
    if (this.objectiveData) this.objective(this.objectiveData.text, this.objectiveData.x != null ? this.objectiveData : null);
  }

  // ---------- saving ----------
  save() {
    if (this.noSave) return;
    const p = this.player;
    store.set(CONFIG.saveKey, { v: 1, flags: this.flags, cards: this.cards, disputes: this.disputeState, stats: this.stats, pos: { space: this.space, x: p.x, z: p.z, h: p.heading }, env: this.envName, t: Date.now() });
  }
  loadSave() { const s = store.get(CONFIG.saveKey); return s && s.v === 1 ? s : null; }

  // ---------- main loop ----------
  frame(now) {
    const dt = Math.min(0.25, (now - this.last) / 1000); this.last = now;
    if (this.mode === 'play') {
      this.acc += dt * this.timeScale; let n = 0;
      while (this.acc >= CONFIG.step && n < 5) { try { this.step(CONFIG.step); } catch (e) { if (!this.lastError) console.error(e); this.lastError = String(e && e.stack || e); } this.acc -= CONFIG.step; n++; }
      if (n === 5) this.acc = 0;
    }
    this.render(dt);
    this.govern(dt);
    requestAnimationFrame((t) => this.frame(t));
  }
  tick(n = 60) { for (let i = 0; i < n; i++) this.step(CONFIG.step); }

  step(dt) {
    this.time += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) if (this.time >= this.waits[i].t) { const w = this.waits[i]; this.waits.splice(i, 1); w.res(); }
    const p = this.player, sp = this.spaces[this.space], free = !this.busy && !this.overlayOpen() && !this.frozen;
    // movement
    let fwd = 0, turn = 0;
    if (free) {
      const k = this.keys;
      fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      turn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    }
    if (this.cam.mode === 'first' && this.cam.fpLimit) { turn = 0; fwd = 0; }
    if (this.pull && free) { fwd = fwd < 0 ? 0 : Math.max(fwd, this.pull); }
    p.heading += turn * CONFIG.turn * dt;
    if (this.cam.mode === 'follow' && this.cam.drag && fwd > 0) p.heading = dampAngle(p.heading, this.cam.yaw, 10, dt);
    if (this.cam.mode === 'first' && !this.cam.fpLimit && fwd !== 0) { p.heading += this.cam.fpYaw * Math.min(1, 6 * dt); this.cam.fpYaw *= 1 - Math.min(1, 6 * dt); }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = (fwd > 0 ? (run ? CONFIG.run : CONFIG.walk) : fwd < 0 ? -CONFIG.back : 0) * (this.speedScale || 1);
    const ox = p.x, oz = p.z;
    if (speed !== 0) {
      let nx = p.x + Math.sin(p.heading) * speed * dt, nz = p.z + Math.cos(p.heading) * speed * dt;
      [nx, nz] = sp.resolve(nx, nz, CONFIG.radius);
      for (const n of this.npcs.values()) { // do not walk through people
        if (n.hidden || n.space !== this.space || n.ghost) continue;
        const dx = nx - n.actor.x, dz = nz - n.actor.z, d = Math.hypot(dx, dz);
        if (d < 0.62 && d > 1e-4) { nx = n.actor.x + dx / d * 0.62; nz = n.actor.z + dz / d * 0.62; }
      }
      if (sp.walkable(nx, nz)) { p.x = nx; p.z = nz; }
      else if (sp.walkable(nx, p.z)) p.x = nx; else if (sp.walkable(p.x, nz)) p.z = nz;
    }
    const moved = Math.hypot(p.x - ox, p.z - oz) / dt;
    p.speed = moved; p.y = damp(p.y, sp.ground(p.x, p.z), 16, dt);
    const before = Math.floor(p.phase / Math.PI);
    p.update(dt);
    if (moved > 0.5 && Math.floor(p.phase / Math.PI) !== before) this.audio.step(sp.surface(p.x, p.z));
    if (moved > 0.5) this.idle = 0; else this.idle = (this.idle || 0) + dt;
    // people
    for (const n of this.npcs.values()) {
      if (n.hidden || n.space !== this.space) { continue; }
      const d = Math.hypot(n.actor.x - p.x, n.actor.z - p.z);
      n.actor.group.visible = d < 150; n.actor.shadows(d < 28); n.actor.setDistance(d);
      if (d < 150) n.update(dt, p, d < 60, d < 22 ? 1 : 0.4);
    }
    for (const t of this.tickers) t(dt);
    this.updateChatter(dt);
    // triggers and prompts
    if (free) {
      for (const t of this.triggers) {
        if (t.done || (t.space || 'world') !== this.space || (t.when && !t.when(this))) continue;
        const inside = Math.hypot(p.x - t.x, p.z - t.z) < t.r;
        if (inside && !t.inside) { t.inside = true; if (t.once) t.done = true; this.run(t.run); break; }
        if (!inside) t.inside = false;
      }
      const it = this.nearestInteract();
      this.ui.prompt(it ? it.label : null);
      if (it && (this.pressed.has('KeyE') || this.pressed.has('Enter'))) { this.pressed.clear(); this.run(it.run); }
    } else this.ui.prompt(null);
    this.pressed.clear();
    this.updateCamera(dt);
    this.sea.update(dt);
    if (this.idle > 6 && !this.busy && !this.hinted && this.time < 40) { this.ui.hint('W and S walk. A and D turn. Drag the mouse to look around.'); this.hinted = true; setTimeout(() => this.ui.hint(null), 7000); }
  }

  nearestInteract() {
    const p = this.player; let best = null, bd = 1e9;
    for (const n of this.npcs.values()) {
      if (n.hidden || n.space !== this.space || !n.talk) continue;
      // The person the story is waiting for is easier to pick out of a group.
      const want = n.id === this.wantTalk, d = Math.hypot(n.actor.x - p.x, n.actor.z - p.z) - (want ? 1.6 : 0);
      if (d < CONFIG.talkRange - (want ? 0.4 : 0) && d < bd) { bd = d; best = { label: n.label || 'Talk to ' + n.name, run: (g) => n.talk(g, n) }; }
    }
    for (const s of this.spots) {
      if ((s.space || 'world') !== this.space || (s.when && !s.when(this))) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < (s.r || 2.4) && d - 0.5 < bd) { bd = d - 0.5; best = { label: typeof s.label === 'function' ? s.label(this) : s.label, run: s.run }; }
    }
    return best;
  }

  // Groups of people who talk among themselves when the player is near.
  updateChatter(dt) {
    const p = this.player;
    for (const c of this.chatter) {
      if ((c.space || 'world') !== this.space || (c.when && !c.when(this))) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d > (c.r || 13) || this.busy) { c.timer = Math.min(c.timer || 0, 1); continue; }
      c.timer = (c.timer || 0) - dt;
      if (c.timer <= 0) {
        c.i = c.i || 0; const line = c.lines[c.i % c.lines.length]; c.i++;
        const n = this.npcs.get(line[0]);
        if (n && !n.hidden) {
          this.ui.bubble(n.id, n.name, line[1], 2.6 + line[1].length * 0.055);
          for (const id of c.members) { const m = this.npcs.get(id); if (m) { m.actor.speaking = m === n; m.lookTarget = m === n ? null : { x: n.actor.x, y: n.actor.y + 1.6, z: n.actor.z }; } }
          setTimeout(() => { n.actor.speaking = false; }, 2400);
        }
        c.timer = 3.2 + line[1].length * 0.06;
      }
    }
  }

  // ---------- camera ----------
  updateCamera(dt) {
    const c = this.cam, p = this.player, sp = this.spaces[this.space];
    if (c.mode === 'first') {
      p.group.visible = false;
      const yaw = p.heading + c.fpYaw, pitch = c.fpPitch;
      this.camera.position.set(p.x, p.y + (c.fpHeight || 1.62), p.z);
      _v.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      this.camera.lookAt(_p.copy(this.camera.position).add(_v));
      return;
    }
    p.group.visible = true;
    let tx = p.x, ty = p.y + 1.5, tz = p.z, yaw = c.yaw, pitch = c.pitch, dist = c.want;
    if (c.mode === 'fixed' && c.fixed) {
      const f = c.fixed, k = this.snapCam ? 1 : 1 - Math.exp(-2.2 * dt);
      this.camera.position.lerp(f.pos, k); c.t.lerp(f.look, k); this.camera.lookAt(c.t); this.snapCam = false; return;
    }
    if (this.focus) {
      // Frame the speaker over the player's shoulder, close enough to read a face.
      const f = this.focus, fx = f.x, fz = f.z;
      let fy = (f.y || 0) + (f.height ? f.height * 0.86 : 1.5);
      if (f.headWorld) fy = f.headWorld(_v2).y - 0.08;
      const d = Math.hypot(fx - p.x, fz - p.z), near = clamp(0.5 + d * 0.04, 0.5, 0.68);
      tx = lerp(p.x, fx, near); tz = lerp(p.z, fz, near); ty = lerp(p.y + 1.5, fy, 0.72);
      yaw = Math.atan2(fx - p.x, fz - p.z) + 0.58; pitch = 0.1; dist = clamp(d * 0.8 + 1.5, 2.5, 7);
      c.fYaw = c.fYaw == null ? c.yaw : dampAngle(c.fYaw, yaw, 3, dt); yaw = c.fYaw;
    } else {
      const moving = Math.abs(p.speed) > 0.3 || this.keys.has('KeyA') || this.keys.has('KeyD') || this.keys.has('ArrowLeft') || this.keys.has('ArrowRight');
      if (c.fYaw != null) { c.yaw = c.fYaw; c.fYaw = null; }
      if (moving && !c.drag && !this.busy) c.yaw = dampAngle(c.yaw, p.heading, 3.2, dt);
      yaw = c.yaw;
    }
    const k = this.snapCam ? 1 : 1 - Math.exp(-7 * dt);
    c.t.x = lerp(c.t.x, tx, k); c.t.y = lerp(c.t.y, ty, k); c.t.z = lerp(c.t.z, tz, k);
    // Pull the camera in when something solid is between it and its subject.
    const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    let ok = dist;
    for (let s = 0.4; s <= dist + 0.01; s += 0.35) {
      const x = c.t.x + dx * s, y = c.t.y + dy * s, z = c.t.z + dz * s;
      if (sp.solidAt(x, y, z, 0.3) || y < sp.ground(x, z) + 0.35) { ok = Math.max(0.6, s - 0.45); break; }
    }
    c.cur = ok < c.cur ? damp(c.cur, ok, 18, dt) : damp(c.cur, ok, 3, dt);
    if (this.snapCam) c.cur = ok;
    this.camera.position.set(c.t.x + dx * c.cur, c.t.y + dy * c.cur, c.t.z + dz * c.cur);
    if (this.shake > 0) { if (!this.reduceMotion) { this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.35; } this.shake = Math.max(0, this.shake - dt * 0.55); }
    this.camera.lookAt(c.t.x, c.t.y + 0.15, c.t.z);
    this.snapCam = false;
  }

  render(dt) {
    const p = this.player;
    if (this.mode === 'menu' || this.mode === 'loading') {
      this.menuT = (this.menuT || 0) + dt * 0.035;
      const a = 2.5 + Math.sin(this.menuT) * 0.5;
      this.camera.position.set(Math.sin(a) * 78, 21, 46 + Math.cos(a) * 60); this.camera.lookAt(0, 4, 4);
      this.sea.update(dt);
    }
    _p.copy(this.camera.position);
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) { this.cullT = 0.3; this.kit.cull(_p.x, _p.z, this.sky.cur.fogF + 20); }
    this.sky.update(dt, this.space === 'cave' ? _p : _v.set(p.x, p.y, p.z), this.sea);
    if (this.backdrop && this.space !== 'cave') this.backdrop.update(this.sky, this.camera, dt);
    this.flora.update(this.sky, this.camera, dt);
    this.surface.update(this.sky, this.camera, dt);
    this.updateFlames(dt);
    if (this.objectiveData && this.objectiveData.x != null && this.mode === 'play') {
      const o = this.objectiveData, dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      this.beam.material.opacity = 0.95 * clamp((d - 3) / 6, 0, 1); this.beam.rotation.y += dt * 1.5; this.beam.position.y = (this.beamBase || 0) + Math.sin(this.time * 2) * 0.18; this.beam.scale.setScalar(clamp(d / 30, 1, 5));
      if (d > 5 && this.beam.visible) {
        this.camera.getWorldDirection(_v); const camYaw = Math.atan2(_v.x, _v.z);
        this.ui.compass(-wrapPi(Math.atan2(dx, dz) - camYaw), d, o.label || 'This way');
      } else this.ui.compass(null);
    } else this.ui.compass(null);
    // bubbles
    const w = window.innerWidth, h = window.innerHeight;
    for (const id of Array.from(this.ui.bubbles.keys())) {
      const n = this.npcs.get(id); if (!n) continue;
      n.actor.headWorld(_v2); _v2.y += 0.25; const dist = _v2.distanceTo(this.camera.position); _v2.project(this.camera);
      this.ui.placeBubble(id, (_v2.x * 0.5 + 0.5) * w, (-_v2.y * 0.5 + 0.5) * h, _v2.z < 1 && dist < 26 && !n.hidden && n.space === this.space && !this.busy);
    }
    try { this.renderer.render(this.scene, this.camera); } catch (e) { if (!this.lastError) console.error(e); this.lastError = String(e && e.stack || e); }
  }

  updateFlames(dt) {
    this.flameT = (this.flameT || 0) + dt;
    const night = clamp(1.4 - this.sky.cur.sunI * 0.7, 0, 1) * (this.space === 'cave' ? 0 : 1);
    this.fires.update(dt, this.space === 'cave' ? 1 : night, this.sky, this.renderer);
    if (!this.flames.length) return;
    this.flameScan = (this.flameScan || 0) - dt;
    if (this.flameScan <= 0) {
      this.flameScan = 0.5; const p = this.player;
      this.nearFlames = this.flames.filter((f) => f.space === this.space || (!f.space && this.space !== 'cave')).map((f) => [f, (f.x - p.x) ** 2 + (f.z - p.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 3);
    }
    this.fireLights.forEach((l, i) => {
      const nf = this.nearFlames && this.nearFlames[i];
      if (!nf || nf[1] > 60 * 60) { l.intensity = 0; return; }
      const f = nf[0]; l.position.set(f.x, f.y + 0.4, f.z);
      l.intensity = (f.power || 30) * (f.always ? 1 : night) * (0.85 + 0.15 * Math.sin(this.flameT * 9 + i * 2.1) * Math.sin(this.flameT * 5.3 + i));
    });
    for (const f of this.flames) if (f.sprite) { f.sprite.material.opacity = (f.always ? 0.9 : 0.25 + 0.65 * night) * (0.8 + 0.2 * Math.sin(this.flameT * 11 + f.x)); }
  }
  addFlame(x, y, z, opts = {}) {
    const f = Object.assign({ x, y, z }, opts);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sky.glowTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.scale.setScalar(opts.size || 2.2); s.position.set(x, y + 0.15, z); (opts.parent || this.world.group).add(s); f.sprite = s;
    // The flame itself. Its base sits at the rim of the bowl or the head of the torch.
    const pw = opts.power || 30;
    this.fires.add(x, opts.base != null ? opts.base : y - 0.38, z, { w: opts.w || 0.017 * pw, h: opts.h || 0.028 * pw, smoke: opts.smoke, sparks: opts.sparks });
    this.flames.push(f); return f;
  }

  // Lower the drawing resolution if the frame rate is poor; raise it again if there is room.
  govern(dt) {
    if (this.mode !== 'play' || document.hidden) return;
    this.frameMs.push(dt * 1000);
    if (this.frameMs.length < 90) return;
    const sorted = this.frameMs.slice().sort((a, b) => a - b), med = sorted[45]; this.frameMs = [];
    // Only step down below about 24 frames a second. A steady 30 (a capped display or a background tab) is left alone.
    if (med > 42 && this.scale > 0.55) { this.scale = Math.max(0.55, this.scale - 0.15); this.resize(); }
    else if (med > 42 && this.scale <= 0.55 && this.sky.sun.shadow.mapSize.x > 1024) { this.sky.sun.shadow.mapSize.set(1024, 1024); if (this.sky.sun.shadow.map) { this.sky.sun.shadow.map.dispose(); this.sky.sun.shadow.map = null; } }
    else if (med < 20 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.1); this.resize(); }
    this.fps = Math.round(1000 / med);
  }

  // ---------- map ----------
  drawMap() {
    const cv = $('mapCanvas'), c = cv.getContext('2d'), W = cv.width, H = cv.height, wd = this.world;
    const lyd = this.space === 'lydia';
    const view = lyd ? { x0: 150, x1: 320, z0: -320, z1: -200 } : { x0: -200, x1: 200, z0: -300, z1: 110 };
    const sx = W / (view.x1 - view.x0), sz = H / (view.z1 - view.z0), s = Math.min(sx, sz);
    const X = (x) => (x - view.x0) * s + (W - (view.x1 - view.x0) * s) / 2, Z = (z) => (z - view.z0) * s + (H - (view.z1 - view.z0) * s) / 2;
    c.fillStyle = '#9fc2cf'; c.fillRect(0, 0, W, H);
    const step = 4;
    for (let x = view.x0; x < view.x1; x += step) for (let z = view.z0; z < view.z1; z += step) {
      const y = wd.terrainY(x + step / 2, z + step / 2); if (y < 0.1) continue;
      const v = clamp(y / 45, 0, 1);
      c.fillStyle = y < 1.25 ? '#e1d4ad' : `rgb(${Math.round(196 - v * 70)},${Math.round(200 - v * 60)},${Math.round(150 - v * 60)})`;
      c.fillRect(X(x), Z(z), step * s + 1, step * s + 1);
    }
    c.fillStyle = '#7a5f48';
    for (const k of wd.colliders) {
      if (k.t !== 1 || k.h < 2.4 || k.hx * k.hz < 3) continue;
      c.save(); c.translate(X(k.x), Z(k.z)); c.rotate(-Math.atan2(k.sin, k.cos)); c.fillRect(-k.hx * s, -k.hz * s, k.hx * 2 * s, k.hz * 2 * s); c.restore();
    }
    c.font = '15px Palatino Linotype, Georgia, serif'; c.fillStyle = '#2a2118'; c.textAlign = 'center';
    for (const m of (this.mapLabels || [])) if (!!m.lydia === lyd) c.fillText(m.text, X(m.x), Z(m.z));
    if (this.objectiveData && this.objectiveData.x != null) { c.strokeStyle = '#a8452e'; c.lineWidth = 3; c.beginPath(); c.arc(X(this.objectiveData.x), Z(this.objectiveData.z), 11, 0, 7); c.stroke(); }
    const p = this.player; c.save(); c.translate(X(p.x), Z(p.z)); c.rotate(-p.heading); c.fillStyle = '#a8452e'; c.beginPath(); c.moveTo(0, 12); c.lineTo(7, -8); c.lineTo(0, -3); c.lineTo(-7, -8); c.closePath(); c.fill(); c.restore();
  }

  // ---------- test seam ----------
  // Draw one frame and save it as shots/<name>.jpg. Works only when the server runs with --dev.
  shot(name) { this.render(0); const url = this.canvas.toDataURL('image/jpeg', 0.86); return fetch('/__shot/' + name, { method: 'POST', body: url }).then((r) => (r.ok ? name : 'failed ' + r.status)); }
  // Put the camera anywhere and look at a point, then save the picture. For checking scenery.
  shotFrom(name, pos, look) { const c = this.camera; const keep = this.mode; this.mode = 'shot'; c.position.set(pos[0], pos[1], pos[2]); c.lookAt(look[0], look[1], look[2]); const r = this.shot(name); this.mode = keep; return r; }
  snapshot() {
    const p = this.player;
    return { mode: this.mode, space: this.space, busy: this.busy, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), h: +p.heading.toFixed(2), flags: Object.assign({}, this.flags), cards: this.cards.length, objective: this.objectiveData && this.objectiveData.text, fps: this.fps, scale: this.scale, npcs: this.npcs.size, missing: this.kit.missing, error: this.lastError || null };
  }
}
