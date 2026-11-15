// The cave: a separate place far below the map. A chamber with a wall for shadows, a low wall with a road behind it,
// a fire on a ledge above and behind, and a long tunnel up to the daylight.
import * as THREE from 'three';
import { clamp, lerp, smooth, noise2, mulberry32 } from './util.js';
import { World } from './world.js';
import { Actor } from './actors.js';
import { makeRock, noise3 } from './rocks.js';

// The made rocks are pale limestone; in the cave they take the darker brown of its stone.
const CAVE_STONE = [0.31, 0.24, 0.2];
export const CAVE = { y: -300, wallZ: -9, seatZ: -1.5, parapetZ: 4.5, roadZ: 6.2, fire: [0, 4.2, 11.8], tunnelStart: 14, mouthZ: 56, statueY: 4.25 };
const FLOOR_PATH = [[14, 0], [20, 1.6], [28, 4.6], [38, 8.6], [46, 11.5], [52, 12.8], [58, 13.0]];
// The tunnel leaves the chamber to one side of the fire ledge and bends back toward the middle as it climbs.
const tunnelX = (z) => 7.4 - 4.6 * smooth(14, 40, z) + 1.2 * Math.sin((Math.max(z, 14) - 14) / 42 * Math.PI * 1.5);
function tunnelFloor(z) {
  if (z <= FLOOR_PATH[0][0]) return 0;
  for (let i = 0; i < FLOOR_PATH.length - 1; i++) { const a = FLOOR_PATH[i], b = FLOOR_PATH[i + 1]; if (z <= b[0]) return lerp(a[1], b[1], smooth(a[0], b[0], z)); }
  return FLOOR_PATH[FLOOR_PATH.length - 1][1];
}

const SHAPES = {
  horse: [[-0.42, -0.3], [-0.36, 0.05], [-0.42, 0.1], [-0.3, 0.2], [0.12, 0.2], [0.22, 0.42], [0.34, 0.5], [0.44, 0.38], [0.38, 0.3], [0.3, 0.3], [0.3, 0.05], [0.34, -0.3], [0.24, -0.3], [0.2, 0], [-0.2, 0], [-0.26, -0.3]],
  jar: [[-0.12, -0.36], [0.12, -0.36], [0.26, -0.1], [0.28, 0.14], [0.14, 0.3], [0.1, 0.4], [0.2, 0.46], [-0.2, 0.46], [-0.1, 0.4], [-0.14, 0.3], [-0.28, 0.14], [-0.26, -0.1]],
  tree: [[-0.05, -0.4], [0.05, -0.4], [0.05, -0.16], [0.32, -0.16], [0.14, 0.08], [0.24, 0.08], [0.08, 0.28], [0.15, 0.28], [0, 0.5], [-0.15, 0.28], [-0.08, 0.28], [-0.24, 0.08], [-0.14, 0.08], [-0.32, -0.16], [-0.05, -0.16]],
  man: [[-0.08, -0.45], [-0.02, -0.1], [0.02, -0.1], [0.08, -0.45], [0.16, -0.45], [0.12, 0.2], [0.3, 0.02], [0.34, 0.1], [0.14, 0.34], [0.07, 0.36], [0.1, 0.5], [-0.1, 0.5], [-0.07, 0.36], [-0.14, 0.34], [-0.34, 0.1], [-0.3, 0.02], [-0.12, 0.2], [-0.16, -0.45]],
  bird: [[-0.45, 0.05], [-0.2, 0.12], [-0.05, 0.4], [0.05, 0.14], [0.3, 0.2], [0.45, 0.12], [0.3, 0.04], [0.1, -0.02], [0.0, -0.2], [-0.12, -0.02], [-0.3, -0.06]],
};

// Join several geometries made in code (position and color only).
function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out;
}

export class Cave {
  constructor(game) {
    this.g = game; this.group = new THREE.Group(); this.group.position.y = CAVE.y; this.group.visible = false; game.scene.add(this.group);
    this.rng = mulberry32(51);
    this.col = Object.create(World.prototype); this.col.colliders = []; this.col.hash = new Map();
    this.rock = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.BackSide });
    this.solid = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.build();
    this.t = 0; this.mode = 'show';   // 'show' = the regular procession; 'still' = carriers stopped
    this.order = ['horse', 'jar', 'tree'];
    this.space = {
      name: 'cave', ground: (x, z) => CAVE.y + this.floorY(x, z), walkable: (x, z) => this.inside(x, z, 0.5),
      resolve: (x, z, r) => this.col.resolve(x, z, r), solidAt: (x, y, z, p) => !this.inside(x, z, 0.2) || this.col.solidAt(x, y, z, p), surface: () => 'cave',
    };
  }

  floorY(x, z) {
    if (z > CAVE.tunnelStart) return tunnelFloor(z);
    const road = (1 - smooth(1.0, 1.7, Math.abs(z - CAVE.roadZ))) * (1 - smooth(10.5, 11.5, Math.abs(x)));
    return road * 0.4;
  }
  inside(x, z, pad) {
    if (z > CAVE.tunnelStart - 1.5) return z < CAVE.mouthZ + 1.5 && Math.abs(x - tunnelX(z)) < 2.5 - pad;
    if (z < CAVE.wallZ + 0.7 + pad) return false;
    const ex = x / (13.2 - pad), ez = (z - 3) / (13.4 - pad);
    return ex * ex + ez * ez < 1;
  }

  mesh(geo, mat, cast, recv) { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast; m.receiveShadow = recv !== false; this.group.add(m); return m; }
  // Give a geometry flat per-face colors around a base tone.
  tint(geo, hex, spread = 0.16) {
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, col = new Float32Array(n * 3), base = new THREE.Color(hex), c = new THREE.Color();
    for (let f = 0; f < n / 3; f++) { c.copy(base).multiplyScalar(1 - spread / 2 + spread * this.rng()); for (let k = 0; k < 3; k++) { col[(f * 3 + k) * 3] = c.r; col[(f * 3 + k) * 3 + 1] = c.g; col[(f * 3 + k) * 3 + 2] = c.b; } }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  }
  rough(geo, amt, scale = 0.35) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = noise2(x * scale + y * 0.7, z * scale - y * 0.5) - 0.5, m = noise2(x * scale * 2.1 + 9, z * scale * 2.1 + y) - 0.5; p.setXYZ(i, x + n * amt, y + m * amt * 0.6, z + (n + m) * amt * 0.5); }
    return geo;
  }

  // The chamber as rock: a finely divided shell pushed in and out by noise at three sizes (bays, bulges, knobs),
  // with faint horizontal layers, turned to face inward, colored darker in its hollows, and dressed as cave rock.
  caveDome(S) {
    const N = noise3(4711), f = (x, y, z) => N(x, y, z) * 0.55 + N(x * 2.03 + 7, y * 2.03, z * 2.03) * 0.3 + N(x * 4.1, y * 4.1 + 3, z * 4.1) * 0.15;
    let g = new THREE.SphereGeometry(1, 120, 64); g.scale(14.6, 11.5, 15.2); g.translate(0, 0.2, 3);
    g = g.toNonIndexed();
    const P = g.attributes.position.array, n = P.length / 3, dent = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], dx = x / 14.6, dy = (y - 0.2) / 11.5, dz = (z - 3) / 15.2, l = Math.hypot(dx, dy, dz) || 1;
      let d = (f(x * 0.09 + 3, y * 0.09, z * 0.09) - 0.5) * 3.2 + (f(x * 0.3, y * 0.3 + 5, z * 0.3) - 0.5) * 1.5 + (f(x * 1.1 + 9, y * 1.1, z * 1.1) - 0.5) * 0.45;
      d += Math.sin(y * 1.7 + f(x * 0.2, y * 0.2, z * 0.2) * 4) * 0.12;
      if (y < 2.5) d = Math.max(d, -0.5 * (y < 0 ? 0 : y / 2.5));   // near the floor the rock may not bulge into where people walk
      dent[i] = d;
      P[i * 3] += dx / l * d * 14.6 / 13; P[i * 3 + 1] += dy / l * d * 11.5 / 13; P[i * 3 + 2] += dz / l * d * 15.2 / 13;
    }
    // drop the triangles where the tunnel leaves and those below the floor, and turn the rest to face inward
    const keep = [], kd = [];
    for (let i = 0; i < n; i += 3) {
      const cx = (P[i * 3] + P[i * 3 + 3] + P[i * 3 + 6]) / 3, cy = (P[i * 3 + 1] + P[i * 3 + 4] + P[i * 3 + 7]) / 3, cz = (P[i * 3 + 2] + P[i * 3 + 5] + P[i * 3 + 8]) / 3;
      if (cz > 12.0 && Math.abs(cx - 7.4) < 4.4 && cy < 7.0 && cy > -1.5) continue;   // a wider opening than the old dome's: the rough rock reaches further in, and the tunnel's flared start covers the edge
      if (cy < -1.2) continue;
      for (const k of [0, 2, 1]) { keep.push(P[(i + k) * 3], P[(i + k) * 3 + 1], P[(i + k) * 3 + 2]); kd.push(dent[i + k]); }
    }
    const out = new THREE.BufferGeometry(), m = keep.length / 3, col = new Float32Array(m * 3), base = new THREE.Color(0x6f5d4c);
    out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    for (let i = 0; i < m; i++) {
      const x = keep[i * 3], y = keep[i * 3 + 1], z = keep[i * 3 + 2];
      // hollows (pushed outward, away from the light) darker; soot over the fire; smooth patches of tone
      const hollow = Math.min(1, Math.max(0, kd[i] / 1.4)), soot = Math.exp(-((x * x) / 30 + ((z - CAVE.fire[2]) ** 2) / 26)) * Math.min(1, Math.max(0, (y - 5) / 4));
      const k = (0.8 + 0.4 * f(x * 0.15 + 20, y * 0.15, z * 0.15)) * (1 - 0.45 * hollow) * (1 - 0.6 * soot);
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
    }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return S.prepareAs(out, 'cave_dome', 'caverock');
  }

  build() {
    // chamber dome, with a gap where the tunnel leaves it
    const S = this.g.surface;   // the shared stone surface (surfaces.js): with it the cave is real rock, without it the old faceted dome
    if (S) this.mesh(this.caveDome(S), S.material, false, true);
    else {
    let dome = new THREE.SphereGeometry(1, 18, 11); dome.scale(14.6, 11.5, 15.2); dome.translate(0, 0.2, 3);
    this.rough(dome, 1.3, 0.22); dome = dome.toNonIndexed();
    { const p = dome.attributes.position.array, keep = [];
      for (let i = 0; i < p.length; i += 9) { const cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3; if (cz > 12.4 && Math.abs(cx - 7.4) < 3.3 && cy < 5.4 && cy > -1.5) continue; for (let k = 0; k < 9; k++) keep.push(p[i + k]); }
      dome = new THREE.BufferGeometry(); dome.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); }
    this.mesh(this.tint(dome, 0x6f5d4c), this.rock, false, true);
    }
    // floor
    const floor = new THREE.PlaneGeometry(34, 34, 24, 24); floor.rotateX(-Math.PI / 2); floor.translate(0, 0, 3);
    { const p = floor.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, (noise2(p.getX(i) * 0.5, p.getZ(i) * 0.5) - 0.5) * 0.12); }
    this.mesh(this.tint(floor, 0x5b4c3f, 0.12), this.solid, false, true);
    // the wall the shadows fall on: nearly flat so they read clearly
    const wall = new THREE.PlaneGeometry(34, 14, 30, 12); wall.translate(0, 6.2, CAVE.wallZ);
    { const p = wall.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, CAVE.wallZ + (noise2(p.getX(i) * 0.3, p.getY(i) * 0.3) - 0.5) * 0.35); }
    this.wall = this.mesh(this.tint(wall, 0x9a836c, 0.07), this.solid, false, true);
    // the raised road and the low wall in front of it
    const road = new THREE.BoxGeometry(23, 0.4, 2.6); road.translate(0, 0.2, CAVE.roadZ);
    this.mesh(this.tint(road, 0x514438), this.solid, false, true);
    if (S) {
      // A low wall of rough fitted stones, two courses high, with no gaps, so its top reads against the firelight.
      const parts = [];
      for (let i = 0; i < 11; i++) { const g = makeRock(900 + i, [1.9, 0.95, 0.7], 4, CAVE_STONE); g.rotateY((this.rng() - 0.5) * 0.12); g.translate(-7.0 + i * 1.4, 0, CAVE.parapetZ + (this.rng() - 0.5) * 0.06); parts.push(g); }
      for (let i = 0; i < 10; i++) { const g = makeRock(950 + i, [1.85, 0.62, 0.62], 4, CAVE_STONE); g.rotateY((this.rng() - 0.5) * 0.12); g.translate(-6.3 + i * 1.4 + (this.rng() - 0.5) * 0.2, 0.86, CAVE.parapetZ + (this.rng() - 0.5) * 0.06); parts.push(g); }
      this.mesh(S.prepareAs(mergeAll(parts), 'cave_wall', 'caverock'), S.material, true, true);
      const seats = [];
      for (let i = 0; i < 7; i++) { const st = this.seat(i), g = makeRock(980 + i, [0.8, 0.12, 0.62], 4, CAVE_STONE); g.rotateY((this.rng() - 0.5) * 0.4); g.translate(st.x, 0, st.z - 0.08); seats.push(g); }
      this.mesh(S.prepareAs(mergeAll(seats), 'cave_seats', 'caverock'), S.material, false, true);
    } else for (let i = 0; i < 15; i++) {
      const w = 0.95 + this.rng() * 0.2, h = 1.42 + this.rng() * 0.12, b = new THREE.BoxGeometry(w, h, 0.6 + this.rng() * 0.12);
      b.rotateY((this.rng() - 0.5) * 0.08); b.translate(-7.3 + i * 1.04, h / 2, CAVE.parapetZ + (this.rng() - 0.5) * 0.08);
      this.mesh(this.tint(b, 0x6a5c50), this.solid, true, true);
    }
    this.col.addBox(0, CAVE.parapetZ, 7.9, 0.42, 0, 1.5);
    // the fire, on a ledge above and behind
    if (S) { const g = makeRock(977, [6.8, 3.45, 6.6], 6, [0.25, 0.19, 0.155]); g.translate(0, 0, CAVE.fire[2] + 0.2); this.mesh(S.prepareAs(g, 'cave_ledge', 'caverock'), S.material, false, true); }
    else { const ledge = new THREE.CylinderGeometry(2.6, 3.6, 3.4, 9); ledge.translate(0, 1.7, CAVE.fire[2] + 0.2); this.rough(ledge, 0.5, 0.6);
    this.mesh(this.tint(ledge, 0x5d5046), this.solid, false, true); }
    this.col.addCircle(0, CAVE.fire[2] + 0.2, 3.3, 4);
    for (let i = 0; i < 6; i++) { const l = new THREE.CylinderGeometry(0.1, 0.12, 1.4, 5); l.rotateZ(0.9); l.rotateY(i * 1.05); l.translate(Math.cos(i * 1.05) * 0.3, 3.75, CAVE.fire[2] + Math.sin(i * 1.05) * 0.3); this.mesh(this.tint(l, 0x3a2a1c), this.solid, false, false); }
    this.flames = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.42 - i * 0.05, 1.5 - i * 0.14, 6), new THREE.MeshBasicMaterial({ color: [0xff5a14, 0xff7a1c, 0xff9a2a, 0xffc04a, 0xffe08a][i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set((this.rng() - 0.5) * 0.5, 4.4, CAVE.fire[2] + (this.rng() - 0.5) * 0.5); this.group.add(m); this.flames.push(m);
    }
    // The moving flames come from the shared fire module; the old cone shapes stay only to drive the flicker.
    if (this.g.fires) { this.g.fires.add(0, CAVE.y + 3.7, CAVE.fire[2], { w: 2.5, h: 3.0, smoke: 0.5, sparks: 1.5 }); for (const m of this.flames) m.visible = false; }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.sky.glowTex, color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    glow.scale.setScalar(9); glow.position.set(0, 4.6, CAVE.fire[2]); this.group.add(glow); this.glow = glow;
    this.light = new THREE.PointLight(0xffc48a, 620, 90, 1.45); this.light.position.set(...CAVE.fire);
    this.light.castShadow = true; this.light.shadow.mapSize.set(2048, 2048); this.light.shadow.radius = 3; this.light.shadow.camera.near = 0.6; this.light.shadow.camera.far = 46; this.light.shadow.bias = -0.004;
    this.group.add(this.light);
    // the tunnel: with the stone surface, rock like the chamber's (finely divided, uneven, facing inward)
    const pos = [], N = S ? 40 : 10, STEP = S ? 1 : 2, zs = [], Nn = noise3(5150);
    for (let z = CAVE.tunnelStart - 2; z <= CAVE.mouthZ + 2; z += STEP) zs.push(z);
    const ring = (z, k) => {
      const a = k / N * Math.PI * 2;
      let r = 3.5 + (noise2(z * 0.4 + k * 10 / N, k * 17 / N) - 0.5) * 1.4 + (z < 17 ? (17 - z) * 0.75 : 0);   // it widens where it meets the chamber, covering the edge of the dome's opening
      if (S) r = Math.max(2.9, r + (Nn(Math.cos(a) * 1.3 + 4, Math.sin(a) * 1.3, z * 0.3) - 0.5) * 1.2 + (Nn(Math.cos(a) * 4, Math.sin(a) * 4 + 7, z * 0.9) - 0.5) * 0.35);
      return [tunnelX(z) + Math.cos(a) * r, tunnelFloor(z) + 2.2 + Math.sin(a) * r * 0.88, z];
    };
    for (let i = 0; i < zs.length - 1; i++) for (let k = 0; k < N; k++) {
      const a = ring(zs[i], k), b = ring(zs[i], k + 1), c = ring(zs[i + 1], k + 1), d = ring(zs[i + 1], k);
      if (S) pos.push(...a, ...c, ...b, ...a, ...d, ...c); else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (S) {
      const m = pos.length / 3, col = new Float32Array(m * 3), base = new THREE.Color(0x6a594a);
      for (let i = 0; i < m; i++) { const k = 0.75 + 0.5 * Nn(pos[i * 3] * 0.2 + 30, pos[i * 3 + 1] * 0.2, pos[i * 3 + 2] * 0.2); col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k; }
      tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.mesh(S.prepareAs(tg, 'cave_tunnel', 'caverock'), S.material, false, true);
    } else this.mesh(this.tint(tg, 0x6a594a, 0.2), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), false, true);
    const fp = [];
    for (let z = CAVE.tunnelStart - 1; z < CAVE.mouthZ + 1; z += 1.5) { const z2 = z + 1.5, x1 = tunnelX(z), x2 = tunnelX(z2), y1 = tunnelFloor(z) + 0.02, y2 = tunnelFloor(z2) + 0.02; fp.push(x1 - 2.6, y1, z, x1 + 2.6, y1, z, x2 + 2.6, y2, z2, x1 - 2.6, y1, z, x2 + 2.6, y2, z2, x2 - 2.6, y2, z2); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    this.mesh(this.tint(fg, 0x54463a, 0.14), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), false, true);
    // the mouth: daylight seen from below
    this.mouth = new THREE.Mesh(new THREE.CircleGeometry(4.6, 18), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, fog: false, side: THREE.DoubleSide }));
    this.mouth.position.set(tunnelX(CAVE.mouthZ + 2), tunnelFloor(CAVE.mouthZ) + 2.4, CAVE.mouthZ + 2.2); this.group.add(this.mouth);
    this.day = new THREE.PointLight(0xcfe0ff, 120, 34, 1.6); this.day.position.set(this.mouth.position.x, this.mouth.position.y, CAVE.mouthZ - 2); this.group.add(this.day);
    // statues, each carried on a pole behind the low wall
    this.carriers = []; this.statues = {};
    const smat = new THREE.MeshLambertMaterial({ color: 0xb09a7c, flatShading: true }), pmat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
    for (const kind in SHAPES) {
      const sh = new THREE.Shape(); SHAPES[kind].forEach((p, j) => (j ? sh.lineTo(p[0] * 1.5, p[1] * 1.5) : sh.moveTo(p[0] * 1.5, p[1] * 1.5)));
      const s = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false }), smat); s.castShadow = true; s.visible = false; this.group.add(s);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.6, 0.05), pmat); pole.castShadow = true; pole.visible = false; this.group.add(pole);
      this.statues[kind] = { mesh: s, pole };
    }
    const looks = [{ robe: 0x5d4a3a, hair: 0x2a221c, beard: 'short', length: 'short' }, { robe: 0x4a4f43, hair: 0x4a3a2a, hairStyle: 'bald', beard: 'full', length: 'short' }, { robe: 0x614038, hair: 0x1c1612, length: 'short', hat: 'hood', robe2: 0x4b4352 }, { robe: 0x57503a, hair: 0x5a4a3a, beard: 'short', length: 'short' }];
    looks.forEach((look, i) => {
      const a = new Actor(Object.assign({ skin: ['tan', 'olive', 'dark', 'tan'][i] }, look), 40 + i); a.pose = 'carry'; this.group.add(a.group);
      this.carriers.push({ actor: a, kind: null, phase: i / looks.length });
    });
    this.period = 28;      // seconds for one carrier to go round
  }

  // Which statue each carrier holds, in the order they cross. Pass null to lower one out of sight.
  setOrder(order) { this.order = order; }
  // When (in seconds from now) the next statue reaches the middle of the wall, and which it is.
  nextCrossing() {
    let best = null;
    this.carriers.forEach((c, i) => {
      const u = ((this.t / this.period + c.phase) % 1 + 1) % 1, kind = this.order[i % this.order.length];
      if (!kind) return;
      const dt = ((0.25 - u + 1) % 1) * this.period;     // u = 0.25 is the middle of the outward walk
      if (!best || dt < best.dt) best = { dt, kind, i };
    });
    return best;
  }

  update(dt) {
    if (!this.group.visible) return;
    if (this.mode !== 'still') this.t += dt;
    const fl = 0.86 + 0.14 * Math.sin(this.t * 9.1) * Math.sin(this.t * 5.3 + 1);
    this.light.intensity = (this.fireLevel != null ? this.fireLevel : 1) * 620 * fl;
    this.flames.forEach((m, i) => { m.scale.y = 0.85 + 0.3 * Math.sin(this.t * (7 + i * 1.7) + i); m.rotation.y += dt * (1 + i * 0.4); });
    this.glow.material.opacity = 0.75 * fl;
    for (const k in this.statues) { this.statues[k].mesh.visible = false; this.statues[k].pole.visible = false; }
    this.carriers.forEach((c, i) => {
      const u = ((this.t / this.period + c.phase) % 1 + 1) % 1, a = c.actor, out = u < 0.5;
      // Outward: left to right along the road with the statue up. Back: right to left along the far edge with it down.
      const x = out ? lerp(-10.6, 10.6, u / 0.5) : lerp(10.6, -10.6, (u - 0.5) / 0.5), z = out ? CAVE.roadZ : CAVE.roadZ + 0.9;
      a.x = x; a.z = z; a.y = this.floorY(x, z); a.heading = out ? Math.PI / 2 : -Math.PI / 2; a.speed = this.mode === 'still' ? 0 : 1.5; a.pose = out ? 'carry' : 'stand';
      a.update(dt);
      const kind = this.order[i % this.order.length], st = kind && this.statues[kind];
      if (st && out) {
        const bob = Math.sin(a.phase * 2) * 0.03;
        st.mesh.visible = true; st.pole.visible = true;
        st.mesh.position.set(x + 0.22, CAVE.statueY + bob, z - 0.035); st.pole.position.set(x + 0.22, CAVE.statueY - 1.45 + bob, z);
      }
    });
  }

  // Seats along the row of prisoners (world coordinates). Seat 3 is the player's.
  seat(i) { return { x: -3.9 + i * 1.3, z: CAVE.seatZ, y: CAVE.y }; }
  mouthPoint() { return { x: tunnelX(CAVE.mouthZ), z: CAVE.mouthZ }; }
  tunnelX(z) { return tunnelX(z); }
}
