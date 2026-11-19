// Terrain, ground queries, collision, roads, sea, sky, and light.
import * as THREE from 'three';
import { clamp, lerp, smooth, fbm, noise2, nearestOnPath, mulberry32 } from './util.js';

export const BOUNDS = { x0: -320, x1: 320, z0: -320, z1: 128, cell: 3.2 };
const NX = 200, NZ = 140;

// Named places used by the layout and the story.
export const PLACES = {
  gate: [0, -80],
  exedra: [-30, -206],
  caveMouth: [-40, -227],
  citySite: [130, -160],
  lydia: [235, -245],
  chasm: [262, -268],
  palace: [212, -232],
  pond: [-58, -203],
};
export const POND_LEVEL = 12.4;

export const ROAD_N = [[0, -80], [0, -108], [-8, -138], [-20, -168], [-27, -192], [-30, -206]];
export const PATH_CAVE = [[-30, -206], [-36, -216], [-40, -227]];
export const ROAD_E = [[0, -108], [40, -118], [84, -136], [118, -152]];

const boxMask = (x, z, x0, x1, z0, z1, soft) =>
  smooth(x0 - soft, x0, x) * (1 - smooth(x1, x1 + soft, x)) * smooth(z0 - soft, z0, z) * (1 - smooth(z1, z1 + soft, z));

// Parameters that change during play (the chasm opens in the ring story).
export const terrainParams = { chasm: 0 };

function shoreZ(x) {
  const natural = 62 + 7 * Math.sin(x * 0.017 + 0.4) + 4 * Math.sin(x * 0.041 + 1.3);
  const inHarbor = 1 - smooth(92, 112, Math.abs(x));
  return lerp(natural, 56.5, inHarbor);
}

function rawHeight(x, z) {
  let h = 1.5 + Math.max(0, 40 - z) * 0.011;
  const town = boxMask(x, z, -114, 114, -88, 64, 30);
  // Rolling hills outside the town.
  const hills = Math.max(-1, (fbm(x * 0.0085 + 3.1, z * 0.0085 - 1.7, 4) - 0.36) * 52);
  h += hills * (1 - town);
  // Mountains at the edge of the world so there is never a visible end.
  const edge = Math.max(smooth(250, 318, Math.abs(x)), smooth(-262, -318, z));
  h += edge * 30 * (0.55 + fbm(x * 0.02, z * 0.02, 3));
  // The hill that holds the cave.
  const cr = Math.hypot(x + 40, z + 268);
  h += 31 * Math.exp(-(cr * cr) / (38 * 38));
  h += 9 * smooth(-229, -237, z) * Math.exp(-((x + 40) * (x + 40)) / (17 * 17)) * (1 - smooth(-262, -290, z));
  // Roads level the ground along a rising profile.
  const rn = nearestOnPath(ROAD_N, x, z);
  h = lerp(h, lerp(2.9, 12.2, rn.t), 1 - smooth(7, 36, rn.d));
  const re = nearestOnPath(ROAD_E, x, z);
  h = lerp(h, lerp(3.8, 13, re.t), 1 - smooth(7, 36, re.d));
  const rc = nearestOnPath(PATH_CAVE, x, z);
  h = lerp(h, lerp(12.2, 17.5, rc.t), 1 - smooth(4, 15, rc.d));
  // The plateau where the city in speech will be founded.
  const pr = Math.hypot(x - PLACES.citySite[0], z - PLACES.citySite[1]);
  h = lerp(h, 13, 1 - smooth(34, 68, pr));
  // Lydia: a closed valley ringed by hills.
  const lr = Math.hypot(x - PLACES.lydia[0], z - PLACES.lydia[1]);
  const ring = smooth(52, 76, lr) * (1 - smooth(88, 116, lr));
  h = lerp(h, 22 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 1.6, 1 - smooth(48, 66, lr));
  h += ring * 17 * (0.7 + 0.6 * noise2(x * 0.05, z * 0.05));
  const kr = Math.hypot(x - PLACES.chasm[0], z - PLACES.chasm[1]);
  h -= terrainParams.chasm * 5.5 * (1 - smooth(4.5, 13, kr));
  // A still pond on a shelf below the cave hill.
  const pd = Math.hypot(x - PLACES.pond[0], z - PLACES.pond[1]);
  h = lerp(h, POND_LEVEL + 0.25, 1 - smooth(8, 15, pd));
  h -= 0.95 * (1 - smooth(4.5, 7.6, pd));
  // The sea.
  const sz = shoreZ(x);
  const inHarbor = 1 - smooth(92, 112, Math.abs(x));
  const s = lerp(smooth(sz - 4, sz + 16, z), smooth(sz, sz + 2.6, z), inHarbor);
  h = lerp(h, -4.2, s);
  return h;
}

const PAL = {
  sand: 0xd9c9a0, wetSand: 0xb8ab86, town: 0xc4b08a, townB: 0xb9a57f,
  grassA: 0x9aa066, grassB: 0x8d9658, grassC: 0xa9a66f, dry: 0xb5a878,
  lydA: 0x8fae5e, lydB: 0x7ea052, rockA: 0x9a8f7f, rockB: 0x877c6d, pit: 0x5d554b,
};
const _c = new THREE.Color();

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();          // everything above ground
    scene.add(this.group);
    this.H = new Float32Array((NX + 1) * (NZ + 1));
    this.floors = [];
    this.colliders = [];
    this.hash = new Map();
    this.chunks = [];
    this.rng = mulberry32(20261111);
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.computeHeights(0, NX, 0, NZ);
    this.buildTerrain();
  }

  computeHeights(i0, i1, j0, j1) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      this.H[j * (NX + 1) + i] = rawHeight(BOUNDS.x0 + i * BOUNDS.cell, BOUNDS.z0 + j * BOUNDS.cell);
    }
  }

  terrainY(x, z) {
    const fx = clamp((x - BOUNDS.x0) / BOUNDS.cell, 0, NX - 0.001), fz = clamp((z - BOUNDS.z0) / BOUNDS.cell, 0, NZ - 0.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, w = NX + 1;
    const h00 = this.H[j * w + i], h10 = this.H[j * w + i + 1], h01 = this.H[(j + 1) * w + i], h11 = this.H[(j + 1) * w + i + 1];
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  // Ground height including raised floors (platforms, piers).
  groundY(x, z) {
    let y = this.terrainY(x, z);
    const fl = this.floors;
    for (let k = 0; k < fl.length; k++) {
      const f = fl[k];
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx) > f.reach || Math.abs(dz) > f.reach) continue;
      const lx = dx * f.cos - dz * f.sin, lz = dx * f.sin + dz * f.cos;
      const d = Math.max(Math.abs(lx) - f.hx, Math.abs(lz) - f.hz, 0);
      if (d <= 0) { if (f.y > y) y = f.y; }
      else if (d < f.ramp) { const yy = lerp(f.y, y, d / f.ramp); if (yy > y) y = yy; }
    }
    return y;
  }

  addFloor(x, z, hx, hz, rot, y, ramp = 0.9) {
    this.floors.push({ x, z, hx, hz, y, ramp, cos: Math.cos(rot), sin: Math.sin(rot), reach: Math.hypot(hx, hz) + ramp + 0.5 });
  }

  // ----- collision -----
  addCircle(x, z, r, h = 3) { this._insert({ t: 0, x, z, r, h, reach: r }); }
  addBox(x, z, hx, hz, rot = 0, h = 4) {
    this._insert({ t: 1, x, z, hx, hz, h, cos: Math.cos(rot), sin: Math.sin(rot), reach: Math.hypot(hx, hz) });
  }
  _insert(c) {
    this.colliders.push(c);
    const S = 10;
    for (let gx = Math.floor((c.x - c.reach) / S); gx <= Math.floor((c.x + c.reach) / S); gx++)
      for (let gz = Math.floor((c.z - c.reach) / S); gz <= Math.floor((c.z + c.reach) / S); gz++) {
        const k = gx + ',' + gz;
        let a = this.hash.get(k); if (!a) { a = []; this.hash.set(k, a); }
        a.push(c);
      }
  }
  removeCollider(c) {
    const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1);
    for (const a of this.hash.values()) { const j = a.indexOf(c); if (j >= 0) a.splice(j, 1); }
  }
  _near(x, z) { return this.hash.get(Math.floor(x / 10) + ',' + Math.floor(z / 10)); }

  // Push a circle out of everything solid. Returns [x, z].
  resolve(x, z, r) {
    for (let pass = 0; pass < 3; pass++) {
      const list = this._near(x, z); if (!list) break;
      let moved = false;
      for (let k = 0; k < list.length; k++) {
        const c = list[k];
        if (c.off) continue;
        if (c.t === 0) {
          const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
          if (d < m) { const n = d > 1e-4 ? 1 / d : 0; x = c.x + (n ? dx * n : 1) * m; z = c.z + (n ? dz * n : 0) * m; moved = true; }
        } else {
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz);
          let ox = lx - qx, oz = lz - qz, d = Math.hypot(ox, oz);
          if (d < r) {
            if (d < 1e-4) { // center is inside the box: leave by the nearest face
              const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
              if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; d = -px; } else { ox = 0; oz = Math.sign(lz) || 1; d = -pz; }
              const push = r - d; const nlx = lx + ox * push, nlz = lz + oz * push;
              x = c.x + nlx * c.cos + nlz * c.sin; z = c.z - nlx * c.sin + nlz * c.cos;
            } else {
              const push = (r - d) / d; const nlx = lx + ox * push, nlz = lz + oz * push;
              x = c.x + nlx * c.cos + nlz * c.sin; z = c.z - nlx * c.sin + nlz * c.cos;
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return [x, z];
  }

  // Is a point inside something solid and tall enough to hide the camera?
  solidAt(x, y, z, pad = 0.25) {
    const list = this._near(x, z); if (!list) return false;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (c.off || c.h < 1.6) continue;
      if (c.t === 0) { if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true; }
      else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad) return true;
      }
    }
    return false;
  }

  walkable(x, z) {
    if (x < BOUNDS.x0 + 8 || x > BOUNDS.x1 - 8 || z < BOUNDS.z0 + 8 || z > BOUNDS.z1 - 6) return false;
    return this.groundY(x, z) > 0.18;
  }

  // ----- terrain mesh -----
  faceColor(cx, cy, cz, ny, out) {
    const n = noise2(cx * 0.11, cz * 0.11), n2 = noise2(cx * 0.031 + 9, cz * 0.031);
    const town = boxMask(cx, cz, -112, 112, -84, 58, 6);
    const lr = Math.hypot(cx - PLACES.lydia[0], cz - PLACES.lydia[1]);
    const kr = Math.hypot(cx - PLACES.chasm[0], cz - PLACES.chasm[1]);
    let hex;
    if (cy < 0.05) hex = PAL.wetSand;
    else if (cy < 1.25 && town < 0.5) hex = PAL.sand;
    else if (terrainParams.chasm > 0.5 && kr < 12.5) hex = n > 0.5 ? PAL.pit : PAL.rockB;
    else if (ny < 0.8) hex = n > 0.5 ? PAL.rockA : PAL.rockB;
    else if (town > 0.5) hex = n > 0.55 ? PAL.townB : PAL.town;
    else if (lr < 70) hex = n2 > 0.5 ? PAL.lydA : PAL.lydB;
    else if (ny < 0.9 && n > 0.6) hex = PAL.rockA;
    else hex = n2 > 0.62 ? PAL.dry : n > 0.5 ? PAL.grassA : n > 0.25 ? PAL.grassB : PAL.grassC;
    out.set(hex);
    const j = 0.93 + 0.14 * noise2(cx * 0.9 + 4, cz * 0.9);
    out.multiplyScalar(j);
  }

  buildChunk(ci, cj, CW, CH) {
    const i0 = ci * CW, j0 = cj * CH, i1 = Math.min(NX, i0 + CW), j1 = Math.min(NZ, j0 + CH);
    const cells = (i1 - i0) * (j1 - j0), pos = new Float32Array(cells * 18), col = new Float32Array(cells * 18);
    const w = NX + 1, H = this.H, S = BOUNDS.cell;
    let p = 0;
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
      this.faceColor((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, ny / nl, _c);
      pos[p] = ax; pos[p + 1] = ay; pos[p + 2] = az; pos[p + 3] = bx; pos[p + 4] = by; pos[p + 5] = bz; pos[p + 6] = cx; pos[p + 7] = cy; pos[p + 8] = cz;
      for (let k = 0; k < 9; k += 3) { col[p + k] = _c.r; col[p + k + 1] = _c.g; col[p + k + 2] = _c.b; }
      p += 9;
    };
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x0 = BOUNDS.x0 + i * S, x1 = x0 + S, z0 = BOUNDS.z0 + j * S, z1 = z0 + S;
      const h00 = H[j * w + i], h10 = H[j * w + i + 1], h01 = H[(j + 1) * w + i], h11 = H[(j + 1) * w + i + 1];
      tri(x0, h00, z0, x0, h01, z1, x1, h10, z0);
      tri(x1, h10, z0, x0, h01, z1, x1, h11, z1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  buildTerrain() {
    const CW = 40, CH = 35;
    for (let cj = 0; cj < Math.ceil(NZ / CH); cj++) for (let ci = 0; ci < Math.ceil(NX / CW); ci++) {
      const m = new THREE.Mesh(this.buildChunk(ci, cj, CW, CH), this.terrainMat);
      m.receiveShadow = true; m.userData = { ci, cj, CW, CH };
      this.group.add(m); this.chunks.push(m);
    }
  }

  // Recompute heights around a point (used when the chasm opens).
  reshape(x, z, radius) {
    const S = BOUNDS.cell;
    const i0 = clamp(Math.floor((x - radius - BOUNDS.x0) / S), 0, NX), i1 = clamp(Math.ceil((x + radius - BOUNDS.x0) / S), 0, NX);
    const j0 = clamp(Math.floor((z - radius - BOUNDS.z0) / S), 0, NZ), j1 = clamp(Math.ceil((z + radius - BOUNDS.z0) / S), 0, NZ);
    this.computeHeights(i0, i1, j0, j1);
    for (const m of this.chunks) {
      const { ci, cj, CW, CH } = m.userData;
      if (ci * CW > i1 || (ci + 1) * CW < i0 || cj * CH > j1 || (cj + 1) * CH < j0) continue;
      m.geometry.dispose(); m.geometry = this.buildChunk(ci, cj, CW, CH);
    }
  }

  // A strip laid on the ground along a path.
  ribbon(path, width, hexA, hexB, lift = 0.06) {
    const pts = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    pts.push(path[path.length - 1]);
    const pos = [], col = [], ca = new THREE.Color(hexA), cb = new THREE.Color(hexB);
    const side = (i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const wob = width * (0.5 + 0.07 * Math.sin(i * 1.7));
      return [-dz / l * wob, dx / l * wob];
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = side(i), s1 = side(i + 1), a = pts[i], b = pts[i + 1];
      const q = [[a[0] - s0[0], a[1] - s0[1]], [a[0] + s0[0], a[1] + s0[1]], [b[0] - s1[0], b[1] - s1[1]], [b[0] + s1[0], b[1] + s1[1]]]
        .map(([x, z]) => [x, this.terrainY(x, z) + lift, z]);
      _c.copy(i % 2 ? ca : cb).multiplyScalar(0.95 + 0.1 * noise2(i * 0.7, 3));
      for (const v of [q[0], q[2], q[1], q[1], q[2], q[3]]) { pos.push(v[0], v[1], v[2]); col.push(_c.r, _c.g, _c.b); }
    }
    return this._flatMesh(pos, col, true);
  }

  // A tiled pavement over a rectangle.
  pave(x0, x1, z0, z1, tile, hexA, hexB, lift = 0.05) {
    const pos = [], col = [], ca = new THREE.Color(hexA), cb = new THREE.Color(hexB);
    for (let x = x0; x < x1 - 0.01; x += tile) for (let z = z0; z < z1 - 0.01; z += tile) {
      const xa = x + 0.04, xb = Math.min(x + tile, x1) - 0.04, za = z + 0.04, zb = Math.min(z + tile, z1) - 0.04;
      const y = Math.max(this.terrainY(xa, za), this.terrainY(xb, za), this.terrainY(xa, zb), this.terrainY(xb, zb)) + lift;
      _c.copy(noise2(x * 1.3, z * 1.3) > 0.5 ? ca : cb).multiplyScalar(0.93 + 0.14 * noise2(x * 0.77 + 2, z * 0.77));
      for (const v of [[xa, za], [xa, zb], [xb, za], [xb, za], [xa, zb], [xb, zb]]) { pos.push(v[0], y, v[1]); col.push(_c.r, _c.g, _c.b); }
    }
    return this._flatMesh(pos, col, true);
  }

  _flatMesh(pos, col, offset) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: !!offset, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  // A plain colored box with per-face tone variation, for quays and piers.
  block(x, y, z, sx, sy, sz, hex, collide = false) {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    const n = g.attributes.position.count, col = new Float32Array(n * 3), base = new THREE.Color(hex);
    for (let f = 0; f < n / 6; f++) {
      _c.copy(base).multiplyScalar(0.86 + 0.2 * this.rng());
      for (let k = 0; k < 6; k++) { col[(f * 6 + k) * 3] = _c.r; col[(f * 6 + k) * 3 + 1] = _c.g; col[(f * 6 + k) * 3 + 2] = _c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, this.terrainMat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (collide) this.addBox(x, z, sx / 2, sz / 2, 0, sy);
    return m;
  }
}

// ---------------------------------------------------------------- sea
export class Sea {
  constructor(scene) {
    const g = new THREE.PlaneGeometry(1400, 620, 70, 31);
    g.rotateX(-Math.PI / 2);
    this.base = g.attributes.position.array.slice();
    this.mat = new THREE.MeshPhongMaterial({ color: 0x2f6f8f, flatShading: true, shininess: 60, specular: 0x8fb4c4, transparent: true, opacity: 0.9 });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.set(0, 0, 330);
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const a = this.mesh.geometry.attributes.position.array, b = this.base, t = this.t;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], z = b[i + 2];
      a[i + 1] = Math.sin(x * 0.045 + t * 0.9) * 0.16 + Math.sin(z * 0.07 - t * 0.7) * 0.12 + Math.sin((x + z) * 0.021 + t * 0.4) * 0.14;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- sky and light
// Each profile is a full description of the light at one time of day.
export const ENV = {
  afternoon: { top: 0x3f7fc4, bot: 0xbfd9ea, glow: 0xfff0c8, sunEl: 0.92, sunAz: 2.3, sun: 0xfff1d6, sunI: 2.5, hemiSky: 0xbcd7f2, hemiGnd: 0x8a7a5c, hemiI: 1.15, fog: 0xbcd3e2, fogN: 90, fogF: 430, stars: 0, exp: 1.0, sea: 0x2f7391 },
  dusk: { top: 0x2c3f7a, bot: 0xf2a65e, glow: 0xffb066, sunEl: 0.09, sunAz: 2.75, sun: 0xffa055, sunI: 1.9, hemiSky: 0x8f8fc8, hemiGnd: 0x7a5a48, hemiI: 0.95, fog: 0xd9a078, fogN: 70, fogF: 380, stars: 0.15, exp: 1.0, sea: 0x3a5f84 },
  night: { top: 0x070b1e, bot: 0x1b2748, glow: 0x9fb4e8, sunEl: 0.7, sunAz: 0.9, sun: 0x9db4e6, sunI: 0.75, hemiSky: 0x4a5c94, hemiGnd: 0x24222c, hemiI: 1.25, fog: 0x141c36, fogN: 45, fogF: 300, stars: 1, exp: 1.15, sea: 0x10203c },
  dawn: { top: 0x4a78c0, bot: 0xffd9a6, glow: 0xfff2c0, sunEl: 0.16, sunAz: -2.2, sun: 0xffd9a0, sunI: 2.2, hemiSky: 0xb9c9ea, hemiGnd: 0x8c7658, hemiI: 1.05, fog: 0xf0d6b4, fogN: 80, fogF: 420, stars: 0.05, exp: 1.05, sea: 0x4a7a98 },
  lydia: { top: 0x3a86c8, bot: 0xcfe6ee, glow: 0xfff6d8, sunEl: 0.85, sunAz: 1.2, sun: 0xfff6e0, sunI: 2.6, hemiSky: 0xc4def2, hemiGnd: 0x7f8a56, hemiI: 1.2, fog: 0xcfe2ea, fogN: 80, fogF: 330, stars: 0, exp: 1.0, sea: 0x2f7391 },
  storm: { top: 0x1c222c, bot: 0x4a5058, glow: 0x8a94a0, sunEl: 0.7, sunAz: 1.2, sun: 0x9aa4b4, sunI: 0.9, hemiSky: 0x5a6470, hemiGnd: 0x3a3c36, hemiI: 0.9, fog: 0x3c434c, fogN: 25, fogF: 170, stars: 0, exp: 0.95, sea: 0x2a3a48 },
  cave: { top: 0x020202, bot: 0x020202, glow: 0x000000, sunEl: 0.9, sunAz: 0, sun: 0x000000, sunI: 0, hemiSky: 0x6a5442, hemiGnd: 0x2e2118, hemiI: 1.0, fog: 0x0a0806, fogN: 18, fogF: 95, stars: 0, exp: 1.05, sea: 0x10203c },
};
const COLOR_KEYS = ['top', 'bot', 'glow', 'sun', 'hemiSky', 'hemiGnd', 'fog', 'sea'];
const NUM_KEYS = ['sunEl', 'sunAz', 'sunI', 'hemiI', 'fogN', 'fogF', 'stars', 'exp'];

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.cur = {}; this.from = {}; this.to = {}; this.t = 1; this.dur = 1; this.name = 'afternoon';
    for (const k of COLOR_KEYS) { this.cur[k] = new THREE.Color(ENV.afternoon[k]); this.from[k] = new THREE.Color(); this.to[k] = new THREE.Color(); }
    for (const k of NUM_KEYS) this.cur[k] = ENV.afternoon[k];
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 bot; uniform vec3 glow; uniform vec3 sunDir;
        void main(){ float h = clamp(vDir.y*1.25+0.08, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, 0.6));
          float s = max(dot(normalize(vDir), sunDir), 0.0); c += glow * (pow(s, 6.0)*0.35 + pow(s, 90.0)*0.6);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    scene.add(this.dome);
    // The sun or moon as a soft disc.
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(cv);
    this.disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    this.disc.scale.set(260, 260, 1); scene.add(this.disc);
    // Stars.
    const rng = mulberry32(7), sp = [];
    for (let i = 0; i < 900; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      if (u < -0.05) continue;
      sp.push(r * Math.cos(th) * 1400, u * 1400, r * Math.sin(th) * 1400);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; scene.add(this.stars);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 20; sc.far = 260;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05; this.sun.shadow.radius = 2.5;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xbcd3e2, 90, 430);
    this.sunDir = new THREE.Vector3();
    this.apply();
  }
  set(name, seconds = 0) {
    const p = ENV[name]; if (!p) return;
    this.name = name;
    for (const k of COLOR_KEYS) { this.from[k].copy(this.cur[k]); this.to[k].set(p[k]); }
    for (const k of NUM_KEYS) { this.from[k] = this.cur[k]; this.to[k] = p[k]; }
    this.dur = Math.max(0.001, seconds); this.t = seconds > 0 ? 0 : 1;
    if (seconds <= 0) { for (const k of COLOR_KEYS) this.cur[k].copy(this.to[k]); for (const k of NUM_KEYS) this.cur[k] = this.to[k]; this.apply(); }
  }
  update(dt, focus, sea) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = this.t * this.t * (3 - 2 * this.t);
      for (const k of COLOR_KEYS) this.cur[k].copy(this.from[k]).lerp(this.to[k], e);
      for (const k of NUM_KEYS) this.cur[k] = lerp(this.from[k], this.to[k], e);
      this.apply();
    }
    // Keep the dome and the shadow box centered on the player.
    this.dome.position.copy(focus); this.stars.position.copy(focus);
    this.disc.position.copy(focus).addScaledVector(this.sunDir, 1300);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 130);
    if (sea) sea.mat.color.copy(this.cur.sea);
  }
  apply() {
    const c = this.cur, u = this.dome.material.uniforms;
    u.top.value.copy(c.top); u.bot.value.copy(c.bot); u.glow.value.copy(c.glow);
    const el = c.sunEl, az = c.sunAz;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    u.sunDir.value.copy(this.sunDir);
    this.sun.color.copy(c.sun); this.sun.intensity = c.sunI; this.sun.castShadow = c.sunI > 0.05;
    this.hemi.color.copy(c.hemiSky); this.hemi.groundColor.copy(c.hemiGnd); this.hemi.intensity = c.hemiI;
    this.scene.fog.color.copy(c.fog); this.scene.fog.near = c.fogN; this.scene.fog.far = c.fogF;
    this.stars.material.opacity = c.stars;
    this.disc.material.color.copy(c.glow); this.disc.material.opacity = c.sunI > 0.05 ? 1 : 0;
    this.renderer.toneMappingExposure = c.exp;
  }
}
