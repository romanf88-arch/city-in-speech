// Swallows (2026-11-19, one of the first-five-minutes changes): two small flocks darting over the open market square
// and the quay in the afternoon. Each bird picks a new point to make for every 1 to 3 s and steers toward it at 8 to
// 12 m/s, turning no faster than a swallow can, so it swoops and banks; it beats its wings in bursts and glides
// between (animals.js). They keep between 3.2 m (above the stall awnings) and 13 m, inside their open area, and are
// gone at night. Drawn within 120 m; no shadows (they are tiny).
import * as THREE from 'three';
import { Animal } from './animals.js';
import { clamp, mulberry32 } from './util.js';

const AREAS = [{ x0: -24, x1: 24, z0: -20, z1: 12, n: 8 }, { x0: -40, x1: 40, z0: 40, z1: 57, n: 6 }];

export class Swallows {
  constructor(g) {
    this.g = g; this.birds = []; const r = this.r = mulberry32(8821);
    AREAS.forEach((A, ai) => {
      for (let i = 0; i < A.n; i++) {
        const b = new Animal('swallow', 1401 + ai * 20 + i, { state: 'fly', scale: 0.27 });
        b.mesh.castShadow = false; g.world.group.add(b.group);
        const x = A.x0 + r() * (A.x1 - A.x0), z = A.z0 + r() * (A.z1 - A.z0), y = g.world.standY(x, z) + 4 + r() * 8, h = r() * 6.283, v = 8 + r() * 4;
        b.place(x, z, h, y);
        this.birds.push({ b, A, vel: new THREE.Vector3(Math.sin(h) * v, 0, Math.cos(h) * v), goal: new THREE.Vector3(x, y, z), goalT: 0, speed: v });
      }
    });
    this._d = new THREE.Vector3();
    g.tickers.push((dt) => this.update(dt));
  }
  update(dt) {
    const g = this.g, p = g.player, day = g.space === 'world' && g.sky.cur.stars < 0.4, r = this.r, W = g.world;
    for (const B of this.birds) {
      const b = B.b, A = B.A, cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2;
      b.group.visible = day && Math.hypot(cx - p.x, cz - p.z) < 120;
      if (!b.group.visible) continue;
      B.goalT -= dt;
      if (B.goalT <= 0) {
        B.goalT = 1 + r() * 2;
        const gx = A.x0 + r() * (A.x1 - A.x0), gz = A.z0 + r() * (A.z1 - A.z0), low = r() < 0.3;
        B.goal.set(gx, W.standY(gx, gz) + (low ? 3.4 + r() * 1.2 : 5 + r() * 8), gz); B.speed = 8 + r() * 4;
      }
      // Steer: turn the velocity toward the goal at up to 2.6 rad/s, and keep the speed.
      const d = this._d.copy(B.goal).sub(b.group.position).normalize().multiplyScalar(B.speed);
      const before = Math.atan2(B.vel.x, B.vel.z);
      B.vel.lerp(d, Math.min(1, dt * 2.6)).setLength(B.speed);
      let nx = b.x + B.vel.x * dt, nz = b.z + B.vel.z * dt, ny = b.y + B.vel.y * dt;
      // Stay in the area and above the awnings: bounce off its edges.
      if (nx < A.x0 || nx > A.x1) { B.vel.x = -B.vel.x; nx = clamp(nx, A.x0, A.x1); }
      if (nz < A.z0 || nz > A.z1) { B.vel.z = -B.vel.z; nz = clamp(nz, A.z0, A.z1); }
      const ground = W.standY(nx, nz);
      if (ny < ground + 3.2) { ny = ground + 3.2; B.vel.y = Math.abs(B.vel.y) * 0.5; } else if (ny > ground + 13) { ny = ground + 13; B.vel.y = -Math.abs(B.vel.y) * 0.5; }
      const after = Math.atan2(B.vel.x, B.vel.z), turn = Math.atan2(Math.sin(after - before), Math.cos(after - before)) / Math.max(dt, 1e-3);
      b.x = nx; b.z = nz; b.y = ny; b.heading = after; b.bank = clamp(-turn * 0.35, -0.9, 0.9); b.state = 'fly';
      b.update(dt);
    }
  }
}
