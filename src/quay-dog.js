// A dog on the quay that takes up with the stranger for a while (2026-11-19, one of the first-five-minutes changes).
// It lies, sits, or sniffs about near its bollard. When the player comes within 8 m it trots up and follows a step
// behind and to the right, keeping pace (running when the player runs), and sits or sniffs when the player stops,
// and lies down in a long conversation. After 45 to 80 s, or as soon as the player leaves the quay, it trots home,
// and it will not follow again for about two minutes. It stays on the quay and out of the water.
import { Animal } from './animals.js';
import { clamp, dampAngle } from './util.js';

const HOME = { x: -9, z: 52.2 }, REGION = { x0: -70, x1: 70, z0: 37.5, z1: 56.6 };   // the quay's paving; its edge is at z 58.3

export class QuayDog {
  constructor(g) {
    this.g = g;
    // Its spot, moved clear of anything solid (the first one was partly inside the fishmonger's stall).
    const q = g.world.resolve(HOME.x, HOME.z, 0.45); this.home = { x: q[0], z: q[1] };
    const a = this.a = new Animal('dog', 7319, { state: 'sit' });
    a.place(this.home.x, this.home.z, 2.6, g.world.standY(this.home.x, this.home.z)); a.mesh.castShadow = true; g.world.group.add(a.group);
    this.mode = 'home'; this.t = 0; this.cool = 1.5; this.still = 0; this.homeT = 3; this.goal = null; this.until = 0; this.stuck = 0;
    g.tickers.push((dt) => this.update(dt));
  }
  onQuay(x, z) { return x > REGION.x0 && x < REGION.x1 && z > REGION.z0 && z < REGION.z1; }
  // Step toward a point at up to `speed` m/s, kept out of walls and on the quay. Returns the distance left.
  toward(tx, tz, speed, dt) {
    const a = this.a, dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.06) { a.speed = 0; this.stuck = 0; return d; }
    const s = Math.min(speed, d / Math.max(dt, 1e-3));
    let nx = a.x + dx / d * s * dt, nz = a.z + dz / d * s * dt;
    const q = this.g.world.resolve(nx, nz, 0.28); nx = clamp(q[0], REGION.x0, REGION.x1); nz = clamp(q[1], REGION.z0, REGION.z1);
    a.speed = Math.hypot(nx - a.x, nz - a.z) / Math.max(dt, 1e-3);
    this.stuck = a.speed < 0.1 * Math.min(speed, 1) ? this.stuck + dt : 0;   // blocked: something solid is in the way
    a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 7, dt);
    a.x = nx; a.z = nz; a.y = this.g.world.standY(nx, nz);
    return d;
  }
  update(dt) {
    const g = this.g, a = this.a, p = g.player, world = g.space === 'world';
    const pd = Math.hypot(p.x - a.x, p.z - a.z);
    a.group.visible = world && pd < 90;
    if (!a.group.visible && this.mode === 'home') return;
    this.t += dt; this.cool = Math.max(0, this.cool - dt);
    const here = world && this.onQuay(p.x, p.z), ps = Math.abs(p.speed || 0);
    if (this.mode === 'home') {
      this.homeT -= dt;
      if (this.homeT <= 0) {
        this.homeT = 6 + Math.random() * 10; const r = Math.random();
        if (r < 0.35) { a.state = 'sleep'; this.goal = null; } else if (r < 0.65) { a.state = 'sit'; this.goal = null; }
        else { a.state = 'walk'; this.goal = { x: this.home.x + (Math.random() - 0.5) * 6, z: this.home.z + (Math.random() - 0.5) * 3 }; }
      }
      if (this.goal) { if (this.toward(this.goal.x, this.goal.z, 0.8, dt) < 0.2 || this.stuck > 1.5) { this.goal = null; a.state = 'graze'; a.speed = 0; } } else a.speed = 0;
      if (here && pd < 8 && !this.cool) { this.mode = 'greet'; a.state = 'walk'; this.goal = null; }
    } else if (this.mode === 'greet') {
      if (!here) { this.mode = 'leave'; }
      else if (this.toward(p.x, p.z, Math.max(2.4, ps * 1.3 + 0.6), dt) < 1.9) { this.mode = 'follow'; this.until = this.t + 45 + Math.random() * 35; }
    } else if (this.mode === 'follow') {
      if (!here || this.t > this.until) { this.mode = 'leave'; a.state = 'walk'; }
      else {
        this.still = g.busy || ps < 0.2 ? this.still + dt : 0;
        if (this.still > 2.5) {
          a.speed = 0; a.state = this.still > 25 ? 'sleep' : Math.sin(this.t * 0.31 + 1) > 0.55 ? 'graze' : 'sit';
          a.heading = dampAngle(a.heading, Math.atan2(p.x - a.x, p.z - a.z), 4, dt);
        } else {
          const f = p.heading, bx = p.x - Math.sin(f) * 1.6 + Math.cos(f) * 0.7, bz = p.z - Math.cos(f) * 1.6 - Math.sin(f) * 0.7;
          a.state = 'walk'; this.toward(bx, bz, Math.max(1.2, Math.min(7, ps * 1.15 + Math.hypot(bx - a.x, bz - a.z) * 0.8)), dt);
        }
      }
    } else {   // leave: trot home
      a.state = 'walk';
      if (this.toward(this.home.x, this.home.z, 1.3, dt) < 0.3 || this.stuck > 2) { this.mode = 'home'; this.cool = 100 + Math.random() * 60; a.state = 'sit'; a.speed = 0; this.homeT = 8; }
    }
    a.update(dt);
  }
}
