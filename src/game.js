// The running game: loop, input, player, camera, other people, interaction, saving.
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, wrapPi, mulberry32, store, $ } from './util.js';
import { World, Sea, Sky, BOUNDS } from './world.js';
import { Backdrop } from './backdrop.js';
import { Fires } from './fire.js';
import { Flora } from './flora.js';
import { Surfaces } from './surfaces.js';
import { Kit } from './kit.js';
import { Actor, makeProp, poseQueued } from './actors.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { Music } from './music.js';

export const CONFIG = {
  walk: 2.8, run: 6.2, back: 2.0, turn: 2.5, radius: 0.36,   // walk was 4.2 and run 7.6: a jogging pace no walking stride can match
  accel: 9, brake: 16, turnIn: 14,   // speed builds at 9 m/s each second and falls at 16; turning reaches its full rate in about 0.2 s
  camDist: 4.6, camMin: 1.6, camMax: 9, camPitch: 0.26, talkRange: 3.1, step: 1 / 60, saveKey: 'city-in-speech-v2',
};
// The frame-rate guard's ladder (see govern). samples: anti-aliasing samples in the town; scale: the share of the
// screen the scene is drawn at; glow: light spreading round bright things; shadow: the sun's shadow detail.
// samples 0 means FXAA, a smoothing of edges done on the finished picture (post.js).
// Measured 2026-11-15 on Intel UHD 620 at 1920x1080 in the market (ms a frame, frames drawn back to back) and for
// shimmer while turning (against a picture drawn at twice the size; player / the rest):
//   4 samples, full size   49 ms   1.7 / 1.5
//   2 samples, full size   42 ms   2.1 / 1.7
//   FXAA, full size        30 ms   2.5 / 2.2
//   FXAA, 85%              28 ms   3.1 / 3.1
//   2 samples, 70%         35 ms   3.3 / 3.4   (the old ladder's last step)
// Edge samples cost far more on that chip than their share of the picture, so FXAA comes before any shrinking.
const RUNGS = [
  { samples: 4, scale: 1, glow: true, shadow: 2048 },
  { samples: 2, scale: 1, glow: true, shadow: 2048 },
  { samples: 0, scale: 1, glow: true, shadow: 2048 },
  { samples: 0, scale: 1, glow: true, shadow: 1024 },
  { samples: 0, scale: 0.85, glow: true, shadow: 1024 },
  { samples: 0, scale: 0.7, glow: true, shadow: 1024 },
  { samples: 0, scale: 0.7, glow: false, shadow: 1024 },
];
const RUNG_KEY = 'city-in-speech-rung';   // the last step, so the next visit starts there instead of stuttering first
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'Enter']);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _lodEye = new THREE.Vector3();

export class NPC {
  constructor(game, def) {
    Object.assign(this, { id: def.id, name: def.name, role: def.role || '', color: def.color || '#888', space: def.space || 'world', talk: def.talk || null, label: def.label || null, behavior: def.behavior || 'idle', radius: def.radius || 3, speed: def.speed || 1.15 });
    this.g = game; this.ghost = !!def.ghost; this.baseMood = def.mood || 'neutral';
    this.actor = new Actor(def.look || {}, def.seed || (game.npcs.size + 3));
    this.actor.mood = this.baseMood;
    if (def.prop) {
      const prop = makeProp(def.prop);
      // A seated person's staff stands on the ground beside them, leaning back toward the shoulder. Held in a hand
      // resting on the lap it went straight through the legs.
      if (def.pose === 'sit' && (def.prop === 'staff' || def.prop === 'crook')) {
        const side = def.propHand === 'handR' ? -1 : 1;
        prop.position.set(side * 0.3, 0.3, 0.2); prop.rotation.set(-0.25, 0, side * 0.04); this.actor.group.add(prop);
      } else this.actor.attach(def.propHand || 'handR', prop);
    }
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
    if (near) a.queue(dt, quality); else a.sync();
  }
}

export class Game {
  constructor() {
    this.canvas = $('view');
    this.mode = 'loading'; this.busy = 0; this.time = 0; this.acc = 0; this.last = 0; this.timeScale = 1;
    this.flags = {}; this.cards = []; this.disputeState = {}; this.log = []; this.stats = { asked: 0, objections: 0, hits: 0, misses: 0 };
    this.keys = new Set(); this.pressed = new Set();
    this.npcs = new Map(); this.spots = []; this.triggers = []; this.chatter = []; this.flames = []; this.waits = []; this.tickers = []; this.presenters = [];
    this.spaces = {}; this.space = 'world';
    this.reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cam = { dYaw: 0, dPitch: 0, yaw: Math.PI, pitch: CONFIG.camPitch, dist: CONFIG.camDist, want: CONFIG.camDist, cur: CONFIG.camDist, t: new THREE.Vector3(), mode: 'follow', drag: false, fpYaw: 0, fpPitch: 0, fpLimit: null };
    this.focus = null; this.objectiveData = null; this.scale = 1; this.frameMs = []; this.cardsById = {}; this.content = null;
    this.ui = new UI(this); this.audio = new Audio(); this.music = new Music(this.audio);   // quiet background music (music.js)
  }

  async init(progress) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });   // anti-aliasing is done in the finishing pass's own picture (post.js)
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping;
    this.post = new Post(r, this);   // the finishing pass (post.js); ?look=off or F9 shows the old look
    if (/[?&]look=off/.test(location.search)) this.post.neutral = true;
    const fq = /[?&]fps=(30|60)/.exec(location.search);   // ?fps=30 or ?fps=60 fixes the pace instead of choosing it
    if (fq) { this.fpsForced = true; this.pace30 = fq[1] === '30'; }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.12, 2200);
    this.people = new THREE.Group(); this.scene.add(this.people);
    progress(0.15);
    this.world = new World(this.scene);
    this.sea = new Sea(this.scene);
    this.sky = new Sky(this.scene, r);
    if (this.post.enabled) { let k = 0; try { k = +localStorage.getItem(RUNG_KEY) || 0; } catch (e) { /* no storage: start at the top */ } if (k > 0 && k < RUNGS.length) this.setRung(k); }
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
    this.spaces.world = { name: 'world', ground: (x, z) => w.standY(x, z), walkable: (x, z) => w.walkable(x, z), resolve: (x, z, rr) => w.resolve(x, z, rr), solidAt: (x, y, z, p) => w.solidAt(x, y, z, p), blocksView: (x, y, z, p) => w.blocksView(x, y, z, p), surface: (x, z) => w.surfaceAt(x, z) };
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
    // A new canvas size takes effect at the start of the next frame, before it is drawn. Resizing the canvas wipes
    // it, so resizing after a frame was drawn put a black frame on screen.
    this.resize(); window.addEventListener('resize', () => { this.needResize = true; });
    // If the graphics driver drops the drawing context (the screen goes black until it comes back), count it, so a
    // blink that is the computer's rather than the game's shows up in game.snapshot().lostContext.
    this.lostContext = 0;
    this.canvas.addEventListener('webglcontextlost', () => { this.lostContext++; console.warn('The graphics context was lost (' + this.lostContext + ')'); });
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
      if (e.code === 'F9' && !e.repeat && this.post.ok) { e.preventDefault(); this.post.neutral = !this.post.neutral; }
      if (e.code === 'F8' && !e.repeat) { e.preventDefault(); this.showStats = !this.showStats; this.drawStats(); }
      if (e.code === 'F7' && !e.repeat && this.post.ok) { e.preventDefault(); this.post.blur = !this.post.blur; this.ui.hint(this.post.blur ? 'Motion blur on' : 'Motion blur off'); setTimeout(() => this.ui.hint(null), 1500); this.drawStats(); }
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
      } else { this.cam.dYaw -= dx * 0.0048; this.cam.dPitch += dy * 0.0036; }   // taken up over a few steps in updateCamera
    });
    const up = () => { this.cam.drag = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.want = clamp(this.cam.want + Math.sign(e.deltaY) * 0.6, CONFIG.camMin, CONFIG.camMax); }, { passive: false });
    $('btnJournal').onclick = () => this.toggle('journal'); $('btnMap').onclick = () => this.toggle('map');
    $('btnJournalClose').onclick = () => this.toggle('journal'); $('btnMapClose').onclick = () => this.toggle('map');
    $('btnPause').onclick = () => this.pause(true); $('btnResume').onclick = () => this.pause(false);
    $('btnMusic').onclick = () => { const on = !this.music.on; this.audio.unlock(); this.music.setOn(on); $('btnMusic').textContent = on ? 'Music on' : 'Music off'; $('btnMusic').setAttribute('aria-pressed', String(on)); };
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
    if (open) { this.audio.paper(); e.classList.remove('hidden'); if (id === 'journal' && this.renderJournal) this.renderJournal(); if (id === 'map') this.drawMap(); e.querySelector('button').focus(); }
  }
  pause(on) {
    if (on && this.mode === 'play') { this.mode = 'paused'; $('pause').classList.remove('hidden'); $('restartAsk').classList.add('hidden'); $('btnResume').focus(); }
    else if (!on && this.mode === 'paused') { this.mode = 'play'; $('pause').classList.add('hidden'); this.canvas.focus(); this.last = performance.now(); }
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // With the finishing pass the canvas always matches the window, and the frame-rate guard lowers the drawing
    // size inside the pass instead (post.scale), which needs no new canvas.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * (this.post && this.post.enabled ? 1 : this.scale));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------- story helpers ----------
  flag(name, value) { if (value === undefined) return this.flags[name]; this.flags[name] = value; return value; }
  npc(id) { return this.npcs.get(id); }
  addNPC(def) { const n = new NPC(this, def); this.npcs.set(def.id, n); n.snapY(); return n; }
  addSpot(s) { this.spots.push(s); return s; }
  addTrigger(t) { this.triggers.push(t); return t; }
  // Lightning: the sky flashes twice, and the thunder follows a moment later. With reduced motion, the sound only.
  lightning(delay = 0.4) {
    if (!this.reduceMotion) { this.sky.flash = 1.7; this.wait(0.13).then(() => { this.sky.flash = Math.max(this.sky.flash || 0, 0.8); }); }
    this.wait(delay).then(() => this.audio.thunder());
  }
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
  // Put the conversation camera on a person at once, with no swing. For use while the picture is faded out, so that
  // the view is already in place when it fades back in.
  frameOn(target) {
    this.setFocus(target); if (!this.focus) return;
    const p = this.player; this.cam.fYaw = Math.atan2(target.x - p.x, target.z - p.z) + 0.58; this.snapCam = true;
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
    const p = this.player; p.x = x; p.z = z; this.cam.dYaw = this.cam.dPitch = 0; if (heading != null) { p.heading = heading; this.cam.yaw = heading; }
    p.y = this.spaces[space].ground(x, z); p.vel = 0; p.turnV = 0; p.sync();
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
    requestAnimationFrame((t) => this.frame(t));
    // When 60 frames a second is out of reach the game draws on every other display refresh, so every frame lasts
    // the same time. A rate that wanders between 25 and 40 looks jerkier than a steady 30.
    if (this.pace30 && now - this.last < 28) return;
    const t0 = performance.now();
    let dt = Math.min(0.25, (now - this.last) / 1000); this.last = now;
    const raw = dt;
    // Round to whole simulation steps when close, so each drawn frame moves the world on by the same amount
    // (one step at 60 a second, two at 30) instead of one, then two, then one.
    const ns = dt / CONFIG.step, nr = Math.round(ns);
    if (nr >= 1 && nr <= 4 && Math.abs(ns - nr) < 0.25) dt = nr * CONFIG.step;
    if (this.needResize) { this.needResize = false; this.resize(); }
    if (this.mode === 'play') {
      this.acc += dt * this.timeScale; let n = 0;
      while (this.acc >= CONFIG.step - 1e-6 && n < 5) { try { this.step(CONFIG.step); } catch (e) { if (!this.lastError) console.error(e); this.lastError = String(e && e.stack || e); } this.acc -= CONFIG.step; n++; }
      if (n === 5) this.acc = 0;
    }
    this.render(dt);
    this.govern(raw, performance.now() - t0);
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
    // Turning eases in and out over about a fifth of a second, and is a little slower at a run.
    const runK = clamp((Math.abs(p.vel || 0) - CONFIG.walk) / (CONFIG.run - CONFIG.walk), 0, 1);
    p.turnV = damp(p.turnV || 0, turn * CONFIG.turn * (1 - 0.2 * runK), CONFIG.turnIn, dt);
    p.heading += p.turnV * dt;
    if (this.cam.mode === 'follow' && this.cam.drag && fwd > 0) p.heading = dampAngle(p.heading, this.cam.yaw, 10, dt);
    if (this.cam.mode === 'first' && !this.cam.fpLimit && fwd !== 0) { p.heading += this.cam.fpYaw * Math.min(1, 6 * dt); this.cam.fpYaw *= 1 - Math.min(1, 6 * dt); }
    const run = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.noRun;   // noRun: leading a sheep on a rope
    const want = (fwd > 0 ? (run ? CONFIG.run : CONFIG.walk) : fwd < 0 ? -CONFIG.back : 0) * (this.speedScale || 1);
    // Speed builds up and falls off over a few tenths of a second instead of jumping, so starting and stopping have
    // some weight. Stopping is quicker than starting, so the player never feels the character slide.
    const v0 = p.vel || 0, gaining = Math.abs(want) > Math.abs(v0) && want * v0 >= 0;
    p.vel = want > v0 ? Math.min(want, v0 + (gaining ? CONFIG.accel : CONFIG.brake) * dt) : Math.max(want, v0 - (gaining ? CONFIG.accel : CONFIG.brake) * dt);
    const speed = p.vel;
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
    // Mouse movement arrives in uneven bursts, several to a frame or none. The camera takes it up over about 50 ms
    // instead of all at once, so each drawn frame turns by an even amount and nothing the mouse did is lost.
    if (c.dYaw || c.dPitch) {
      const kk = 1 - Math.exp(-20 * dt), ay = c.dYaw * kk, ap = c.dPitch * kk;
      c.yaw += ay; c.dYaw -= ay; c.pitch = clamp(c.pitch + ap, -0.35, 1.15); c.dPitch -= ap;
      if (Math.abs(c.dYaw) < 1e-5) c.dYaw = 0; if (Math.abs(c.dPitch) < 1e-5) c.dPitch = 0;
    }
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
      // Look a little ahead of the player in the direction of travel (up to 1.2 m at a run), with the camera moved
      // back by the same amount so the player stays the same size on screen.
      c.ahead = damp(c.ahead || 0, clamp((p.vel || 0) * 0.2, -0.3, 1.2), 2.2, dt);
      tx += Math.sin(p.heading) * c.ahead; tz += Math.cos(p.heading) * c.ahead; dist += Math.max(0, c.ahead) * 0.9;
    }
    // A slightly wider view at a run, for a sense of speed.
    const runK = this.focus ? 0 : clamp((Math.abs(p.vel || 0) - CONFIG.walk) / (CONFIG.run - CONFIG.walk), 0, 1);
    c.fov = damp(c.fov || 58, 58 + 4 * runK, 3, dt);
    if (Math.abs(this.camera.fov - c.fov) > 0.02) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    const k = this.snapCam ? 1 : 1 - Math.exp(-7 * dt);
    c.t.x = lerp(c.t.x, tx, k); c.t.y = lerp(c.t.y, ty, k); c.t.z = lerp(c.t.z, tz, k);
    // Pull the camera in when something solid is between it and its subject.
    const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    let ok = dist;
    const room = this.space === 'world' ? this.world.indoor(p.x, p.z) : null;   // under a roof: the camera may not rise through it
    this.sky.indoor = damp(this.sky.indoor || 0, room ? 1 : 0, 3, dt);
    this.post.unseen = damp(this.post.unseen || 0, this.invisible ? 1 : 0, 6, dt);
    if (this.sky.flash) this.sky.flash = this.sky.flash < 0.03 ? 0 : damp(this.sky.flash, 0, 11, dt);   // lightning fades in about a quarter of a second   // the ring: the world loses color while nobody can see you
    for (let s = 0.4; s <= dist + 0.01; s += 0.35) {
      const x = c.t.x + dx * s, y = c.t.y + dy * s, z = c.t.z + dz * s;
      if ((sp.blocksView ? sp.blocksView(x, y, z, 0.3) : sp.solidAt(x, y, z, 0.3)) || y < sp.ground(x, z) + 0.35 || (room && room.inside(x, z, 0.3) && y > room.roofY(x, z))) { ok = Math.max(0.6, s - 0.45); break; }
    }
    // The camera comes in fast only when something is in the way. When the wanted distance itself changes (a new speaker is nearer or farther), it eases at the same gentle rate in both directions.
    c.cur = ok < dist - 0.01 && ok < c.cur ? damp(c.cur, ok, 18, dt) : damp(c.cur, ok, 3, dt);
    if (this.snapCam) c.cur = ok;
    this.camera.position.set(c.t.x + dx * c.cur, c.t.y + dy * c.cur, c.t.z + dz * c.cur);
    // Backed against a wall indoors, the camera ends up inside the player's head: stop drawing the player then.
    if (room) p.group.visible = c.cur > 0.95;
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
    poseQueued(this.camera);   // people pose once per drawn frame, the far ones less often (see actors.js)
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) { this.cullT = 0.3; this.kit.cull(_p.x, _p.z, this.sky.cur.fogF + 20); }
    this.sky.update(dt, this.space === 'cave' ? _p : _v.set(p.x, p.y, p.z), this.sea);
    if (this.backdrop && this.space !== 'cave') this.backdrop.update(this.sky, this.camera, dt);
    // While the camera follows the player, trees choose their level by distance from the player, not the camera:
    // the camera swings round the player in a circle about 9 m across when turning, and trees near the switching
    // distance changed level back and forth (23 switches in a half turn in the fields, measured 2026-11-15).
    this.flora.lodEye = this.mode === 'play' && this.cam.mode === 'follow' ? _lodEye.set(p.x, p.y + 1.5, p.z) : null;
    this.flora.update(this.sky, this.camera, dt);
    if (this.scatter) this.scatter.update(this.camera.position, dt);
    this.surface.update(this.sky, this.camera, dt);
    this.updateFlames(dt);
    for (const present of this.presenters) present(dt);   // visual accents that follow the sky (harbor-detail.js)
    if (this.music) { const p0 = this.player, where = this.space === 'cave' ? 'cave' : this.space === 'lydia' || this.envName === 'lydia' ? 'lydia' : p0.z < -84 ? 'fields' : 'town'; this.music.update(this.mode === 'play' || this.mode === 'paused' ? where : 'town', this.sky.cur.stars > 0.5, this.busy ? 1 : 0); }
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
    try { if (this.post.enabled) this.post.render(this.scene, this.camera); else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); } } catch (e) { if (!this.lastError) console.error(e); this.lastError = String(e && e.stack || e); }
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
    // By day inside a room, one of those lights stands in for the daylight thrown back off the floor where the sun
    // comes in at the door. Without it everything indoors is lit only by the flat light of the sky.
    const pp = this.player, room = this.space === 'world' ? this.world.indoor(pp.x, pp.z, 1.5) : null, L2 = this.fireLights[2], sunI = this.sky.cur.sunI;
    if (room && room.bounce && sunI > 0.3 && night < 0.5) { L2.position.set(room.bounce[0], room.bounce[1], room.bounce[2]); L2.color.copy(this.sky.cur.sun); L2.intensity = 5 * sunI; this.bounceOn = true; }
    else if (this.bounceOn) { L2.color.set(0xff9a4a); this.bounceOn = false; }
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

  // F8: a small readout of how the game is running, for reporting stutters and blinks.
  drawStats() {
    let el = document.getElementById('runStats');
    if (!this.showStats) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'runStats'; el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:12px/1.4 system-ui,sans-serif;color:#f4ecdc;background:rgba(20,16,12,.72);padding:6px 9px;border-radius:6px;pointer-events:none;white-space:pre'; document.body.appendChild(el); }
    const P = this.post, gpu = P && P.gpuMs ? P.gpuMs() : null;
    el.textContent = (this.fps ? this.fps + ' frames a second' : 'measuring...') + (this.pace30 ? ', held at a steady 30' : '') +
      '\nscene drawn at ' + Math.round((P && P.enabled ? P.scale : this.scale) * 100) + '% of full size' + (P && P.enabled ? (P.samples ? ', ' + P.samples + ' edge samples' : ', FXAA edges') : '') + (P && !P.glow ? ', glow off' : '') + (this.sky.sun.shadow.mapSize.x < 2048 ? ', coarser shadows' : '') +
      (P && P.enabled ? '\nmotion blur (F7): ' + (!P.blur ? 'off' : P.samples ? 'on, but not drawn while there are edge samples' : 'on') : '') +
      '\nscreen ' + this.canvas.width + ' by ' + this.canvas.height + ' pixels, step ' + (this.rung || 0) + ' of ' + (RUNGS.length - 1) + (this.lateShare != null ? ', ' + Math.round(this.lateShare * 100) + '% of frames late' : '') +
      '\ngraphics chip: ' + (gpu != null ? gpu.toFixed(1) + ' ms a frame' : P && P.timer && P.timer.ext ? 'measuring...' : 'not reported by this browser') +
      '\ndrawing context lost: ' + (this.lostContext || 0) + ' times';
  }

  // The frame-rate guard, checked about once a second while playing.
  //   1. If 60 frames a second is out of reach, draw a steady 30 (see frame()).
  //   2. Hold the frame inside its time by stepping down a ladder of settings (RUNGS), one rung a check, and back
  //      up when there is room. The rungs are in the order of time saved for shimmer added while the camera moves
  //      (see RUNGS). A scene drawn smaller than the screen shimmers on cloth and walls when turning, so the size
  //      goes late and never below 70%. Nothing changes on the canvas, so there is no black frame.
  // Late frames decide a step down; the graphics chip's own timer, where the browser reports it, can only stop one
  // (when it shows the chip has time to spare) or allow an early step up.
  govern(iv, cpu) {
    if (this.mode !== 'play' || document.hidden) return;
    const P = this.post;
    this.frameMs.push(iv * 1000); (this.cpuMs || (this.cpuMs = [])).push(cpu);
    if (this.frameMs.length < (this.pace30 ? 30 : 60)) return;
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const frame = med(this.frameMs), cpuMs = med(this.cpuMs), lateAt = (this.pace30 ? 1000 / 30 : 1000 / 60) * 1.25;
    this.lateShare = this.frameMs.filter((ms) => ms > lateAt).length / this.frameMs.length;   // frames that missed the pace
    this.frameMs = []; this.cpuMs = [];
    this.fps = Math.round(1000 / frame);
    if (this.showStats) this.drawStats();
    if (!P.enabled) {   // the old way, for browsers without the finishing pass: a smaller canvas
      if (frame > 42 && this.scale > 0.55) { this.scale = Math.max(0.55, this.scale - 0.15); this.needResize = true; }
      else if (frame < 20 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.1); this.needResize = true; }
      return;
    }
    const forced = this.fpsForced;
    // 1. pace
    if (!this.pace30 && !forced) {
      this.slowChecks = frame > 19 ? (this.slowChecks || 0) + 1 : 0;
      if (this.slowChecks >= 2) {
        this.pace30 = true; this.slowChecks = 0;
        if (this.leftPace != null && this.time - this.leftPace < 15) this.paceKept = true;   // it went back to 30 soon after trying 60: stay at 30
      }
      if (this.slowChecks || this.pace30) return;   // no size change while the pace is being decided
    }
    const gpu = P.gpuMs(), budget = this.pace30 ? 27 : 14.5, work = gpu == null ? null : Math.max(gpu, cpuMs);
    if (this.pace30 && !forced && !this.paceKept && work != null) { this.fastChecks = !this.rung && work < 11 ? (this.fastChecks || 0) + 1 : 0; if (this.fastChecks >= 4) { this.pace30 = false; this.fastChecks = 0; this.leftPace = this.time; return; } }
    // 2. the ladder. A step down needs frames that actually came late (more than one in six past the pace), and the chip
    // not shown to have time to spare: when the page's own work is what makes frames late, a plainer picture would not
    // help. (Until 2026-11-15 the chip's timer alone decided. On Intel UHD 620 it reads high when the chip idles between
    // frames, and the guard went to the bottom of the ladder while frames were on time.) A step up comes when the chip
    // shows room, or after eight calm checks in a row; the hold in setRung keeps a failed step up from repeating soon.
    const late = this.lateShare > 1 / 6;
    if (this.upAt != null && this.rung === this.upRung && this.time - this.upAt > 12) { this.failUps = 0; this.upRung = null; }   // the last step up held
    this.calm = late ? 0 : (this.calm || 0) + 1;
    const over = late && (gpu == null || gpu > budget * 0.9);
    let room = !late && gpu != null && gpu < budget * 0.8;
    if (!late && this.calm >= 8) { room = true; this.calm = 0; }
    this.rungHold = Math.max(0, (this.rungHold || 0) - 1);
    if (over && (this.rung || 0) < RUNGS.length - 1) this.setRung((this.rung || 0) + 1);
    else if (room && this.rung > 0 && !this.rungHold) this.setRung(this.rung - 1);
  }
  setRung(i) {
    const P = this.post, R = RUNGS[i], sun = this.sky.sun;
    // After a step down, wait before stepping up again, so nothing switches on and off every second; much longer if the
    // last step up was undone within 12 seconds, and twice as long again for each such failure in a row (45, 90, 180,
    // 360 checks), so a machine that cannot hold the higher step does not stutter while trying it every minute. A step
    // up that lasts 12 seconds clears the count (see govern).
    if (i > (this.rung || 0)) {
      const undone = this.upAt != null && this.time - this.upAt < 12;
      if (undone) this.failUps = (this.failUps || 0) + 1;
      this.rungHold = undone ? 45 * 2 ** Math.min(3, this.failUps - 1) : 8;
    } else { this.upAt = this.time; this.upRung = i; }
    this.rung = i;
    try { localStorage.setItem(RUNG_KEY, String(i)); } catch (e) { /* no storage: start at the top next time */ }
    P.setSamples(R.samples); P.scale = R.scale; P.glow = R.glow;
    if (sun.shadow.mapSize.x !== R.shadow) { sun.shadow.mapSize.set(R.shadow, R.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
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
    return { mode: this.mode, space: this.space, busy: this.busy, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), h: +p.heading.toFixed(2), flags: Object.assign({}, this.flags), cards: this.cards.length, objective: this.objectiveData && this.objectiveData.text, fps: this.fps, scale: this.post && this.post.enabled ? +this.post.scale.toFixed(2) : this.scale, rung: this.rung || 0, pace30: !!this.pace30, lostContext: this.lostContext || 0, gpu: this.post && this.post.gpuMs ? this.post.gpuMs() : null, npcs: this.npcs.size, missing: this.kit.missing, error: this.lastError || null };
  }
}
