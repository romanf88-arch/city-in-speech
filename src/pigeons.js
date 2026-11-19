// Pigeons on the market square (2026-11-19, one of the first-five-minutes changes). Eleven peck about a patch of open
// paving, nodding and shuffling now and then. If the player runs within 4.5 m, or walks within 1.6 m of one, they go
// up one after another, fly up and away from the player, circle the square 6 m up, and settle again on the same
// patch once the player has gone 8 m off and they have been up at least 8 s. (Like the gulls on the quay, dock-gulls.js.)
import { Animal } from './animals.js';
import { clamp, dampAngle, mulberry32 } from './util.js';

const HOME = { x: 8, z: -4, r: 2.4 };
const smooth = (t) => t * t * (3 - 2 * t);

export class Pigeons {
  constructor(g) {
    this.g = g; this.birds = []; this.flock = 'ground'; this.upT = 0;
    const r = this.r = mulberry32(5150);
    for (let i = 0; i < 11; i++) {
      const [x, z] = this.spot(), b = new Animal('pigeon', 1201 + i, { state: 'peck', scale: 0.52 });
      b.place(x, z, r() * 6.283, g.world.standY(x, z)); b.mesh.castShadow = false; g.world.group.add(b.group);
      this.birds.push({ b, phase: 'ground', hopT: r() * 3, hop: null, wait: 0, t: 0, start: null, end: null, angle: 0, turn: r() < 0.5 ? 1 : -1 });
    }
    g.tickers.push((dt) => this.update(dt));
  }
  spot() { const a = this.r() * 6.283, d = Math.sqrt(this.r()) * HOME.r; return [HOME.x + Math.cos(a) * d, HOME.z + Math.sin(a) * d]; }
  update(dt) {
    const g = this.g, p = g.player, world = g.space === 'world', W = g.world, ps = Math.abs(p.speed || 0);
    const far = Math.hypot(p.x - HOME.x, p.z - HOME.z);
    const show = world && far < 90; for (const B of this.birds) B.b.group.visible = show;
    if (!show) return;
    if (this.flock === 'ground') {
      let near = 9; for (const B of this.birds) near = Math.min(near, Math.hypot(p.x - B.b.x, p.z - B.b.z));
      if ((ps > 3.2 && far < HOME.r + 4.5) || (ps > 0.3 && near < 1.6)) {
        this.flock = 'up'; this.upT = 0;
        for (const B of this.birds) {
          const b = B.b, ax = b.x - p.x, az = b.z - p.z, l = Math.hypot(ax, az) || 1, k = 6 + this.r() * 3, s = (this.r() - 0.5) * 0.8;
          B.phase = 'off'; B.wait = this.r() * 0.35; B.t = 0; B.start = { x: b.x, y: b.y, z: b.z };
          B.end = { x: b.x + (ax / l * Math.cos(s) - az / l * Math.sin(s)) * k, y: b.y + 4.5 + this.r() * 2, z: b.z + (az / l * Math.cos(s) + ax / l * Math.sin(s)) * k };
        }
      }
    } else {
      this.upT += dt;
      if (this.upT > 8 && far > 8 && this.birds.every((B) => B.phase === 'circle')) {
        this.flock = 'down';
        for (const B of this.birds) { const [x, z] = this.spot(); B.phase = 'land'; B.t = 0; B.wait = this.r() * 1.2; B.start = { x: B.b.x, y: B.b.y, z: B.b.z }; B.end = { x, y: W.standY(x, z), z }; }
      }
    }
    for (const B of this.birds) {
      const b = B.b, ox = b.x, oz = b.z;
      if (B.wait > 0) { B.wait -= dt; b.update(dt); continue; }
      B.t += dt;
      if (B.phase === 'ground') {
        b.state = 'peck'; b.speed = 0;
        B.hopT -= dt;
        if (B.hopT <= 0 && !B.hop) { const a = this.r() * 6.283; B.hop = { t: 0, x0: b.x, z0: b.z, x1: clamp(b.x + Math.cos(a) * 0.35, HOME.x - HOME.r, HOME.x + HOME.r), z1: clamp(b.z + Math.sin(a) * 0.35, HOME.z - HOME.r, HOME.z + HOME.r) }; B.hopT = 1.5 + this.r() * 4; }
        if (B.hop) { const h = B.hop; h.t += dt / 0.35; const s = smooth(Math.min(1, h.t)); b.x = h.x0 + (h.x1 - h.x0) * s; b.z = h.z0 + (h.z1 - h.z0) * s; b.y = W.standY(b.x, b.z); if (h.t >= 1) B.hop = null; }
      } else if (B.phase === 'off') {
        b.state = 'fly'; const t = clamp(B.t / 1.6, 0, 1), s = smooth(t);
        b.x = B.start.x + (B.end.x - B.start.x) * s; b.z = B.start.z + (B.end.z - B.start.z) * s; b.y = B.start.y + (B.end.y - B.start.y) * Math.sin(t * Math.PI / 2);
        if (t >= 1) { B.phase = 'circle'; B.angle = Math.atan2(b.z - HOME.z, b.x - HOME.x); B.R = Math.hypot(b.x - HOME.x, b.z - HOME.z); }
      } else if (B.phase === 'circle') {
        B.angle += B.turn * dt * 0.75; B.R += (8 - B.R) * Math.min(1, dt * 0.5);
        b.x = HOME.x + Math.cos(B.angle) * B.R; b.z = HOME.z + Math.sin(B.angle) * B.R; b.y += (W.standY(HOME.x, HOME.z) + 6 + 0.5 * Math.sin(B.angle * 2) - b.y) * Math.min(1, dt * 1.5);
        b.bank = B.turn * 0.3;
      } else if (B.phase === 'land') {
        const t = clamp(B.t / 2.6, 0, 1), s = smooth(t);
        b.x = B.start.x + (B.end.x - B.start.x) * s; b.z = B.start.z + (B.end.z - B.start.z) * s; b.y = B.start.y + (B.end.y - B.start.y) * (1 - Math.cos(t * Math.PI / 2));
        b.bank *= Math.exp(-dt * 4);
        if (t >= 1) { B.phase = 'ground'; b.state = 'peck'; b.bank = 0; if (this.birds.every((q) => q.phase === 'ground')) this.flock = 'ground'; }
      }
      if (B.phase !== 'ground' && Math.hypot(b.x - ox, b.z - oz) > 1e-5) b.heading = dampAngle(b.heading, Math.atan2(b.x - ox, b.z - oz), 8, dt);
      b.update(dt);
    }
  }
}
