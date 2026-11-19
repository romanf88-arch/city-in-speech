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

// Level patches of farmland north of the town wall, where people work the fields: [x, z, radius].
export const FIELDS = [[24, -98, 9], [50, -101, 12], [80, -105, 11], [-36, -101, 10]];
const fieldY = [];

export function rawHeight(x, z) {
  let h = baseHeight(x, z);
  for (let i = 0; i < FIELDS.length; i++) {
    const f = FIELDS[i], d = Math.hypot(x - f[0], z - f[1]);
    if (d < f[2] + 12) { if (fieldY[i] === undefined) fieldY[i] = baseHeight(f[0], f[1]); h = lerp(h, fieldY[i], 1 - smooth(f[2], f[2] + 12, d)); }
  }
  return shapeHeight(x, z, h);
}

// The lie of the land before any special places are cut into it.
function baseHeight(x, z) {
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
  return h;
}

// Special places: the city site, the valley of Lydia, the pond, and the sea.
function shapeHeight(x, z, h) {
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
  lydA: 0x96a763, lydB: 0x88995a, rockA: 0x9a8f7f, rockB: 0x877c6d, pit: 0x5d554b,
};
const _c = new THREE.Color(), _c2 = new THREE.Color(), _n = new THREE.Vector3();
const PALC = {};
for (const k in PAL) PALC[k] = new THREE.Color(PAL[k]);

// Fine ground detail, shared by the playable ground and the near part of the far landscape
// (backdrop.js), so the two look the same where they meet. It turns the broad tint that comes
// from the mesh into ground: tufts and patches, bare earth, pale rock on steep slopes, sand at
// the shore. bump returns a small tilt of the surface so the ground catches the light.
export const GROUND_GLSL = /* glsl */`
uniform sampler2D uGNoise, uGNoise2;
// The color, from the four detail samples: fine (nf), coarse (nc), grit (nd). rock returns how rocky it is.
vec3 groundMix(vec3 base, vec3 wp, float ny, vec4 nf, vec4 nc, vec4 nd, out float rock) {
  vec3 c = base * (0.62 + 0.34 * nf.g + 0.16 * nc.r + 0.22 * nd.g + 0.12 * (nd.a - 0.5));
  c = mix(c, c * vec3(1.12, 1.04, 0.80), smoothstep(0.45, 0.8, nf.r) * 0.5);      // straw-colored tufts
  float earth = smoothstep(0.62, 0.74, nc.b * 0.65 + nf.g * 0.25 + nc.g * 0.2);
  c = mix(c, vec3(0.23, 0.16, 0.095) * (0.75 + 0.5 * nf.g), earth * 0.4);
  vec4 nm = texture2D(uGNoise, wp.xz * 0.013 + vec2(0.27, 0.61));       // large patches, 20 to 60 m across
  c *= 0.86 + 0.28 * nm.g;
  c = mix(c, c * vec3(0.84, 0.78, 0.72), smoothstep(0.55, 0.75, nm.b) * 0.55);   // trodden: darker, browner
  c = mix(c, c * vec3(1.08, 1.05, 0.97), smoothstep(0.6, 0.8, nm.r) * 0.5);     // pale dust
  rock = smoothstep(0.15, 0.28, (1.0 - ny) + (nc.g - 0.5) * 0.10 + (nf.r - 0.5) * 0.05);
  vec3 rc = mix(vec3(0.25, 0.225, 0.19), vec3(0.50, 0.47, 0.41), nf.r * 0.4 + nc.r * 0.6) * (0.74 + 0.3 * nf.g + 0.24 * nd.g);
  rc = mix(rc, base * 0.8, smoothstep(0.55, 0.8, nc.b) * 0.45);          // tufts holding on between the rocks
  c = mix(c, rc, rock);
  float sand = 1.0 - smoothstep(0.85, 1.75, wp.y + (nc.g - 0.5) * 0.6);
  vec3 sc = vec3(0.66, 0.56, 0.36) * (0.88 + 0.24 * nf.g) * mix(0.6, 1.0, smoothstep(-0.15, 0.4, wp.y));
  c = mix(c, sc, sand * (1.0 - rock * 0.6));
  return c;
}
vec3 groundColor(vec3 base, vec3 wp, float ny, out vec2 bump) {
  vec4 nf = texture2D(uGNoise, wp.xz * 0.31);
  vec4 nc = texture2D(uGNoise, wp.xz * 0.045 + 0.4);
  vec4 nd = texture2D(uGNoise, wp.xz * 1.37);                  // grit, only seen close up
  bump = texture2D(uGNoise2, wp.xz * 0.45).rg - 0.5;
  float rock; vec3 c = groundMix(base, wp, ny, nf, nc, nd, rock);
  bump *= mix(0.5, 1.4, rock);
  return c;
}
// The same for the playable ground, where the slope is known: on steep ground the detail is also laid on the
// two upright planes and blended by how much the ground faces each way, so it is not smeared down the slope
// (the samples for the upright planes are only taken where they count).
vec3 groundColorN(vec3 base, vec3 wp, vec3 N, out vec2 bump) {
  vec3 w = pow(abs(N), vec3(4.0)); w /= w.x + w.y + w.z;
  vec4 nf = texture2D(uGNoise, wp.xz * 0.31) * w.y, nc = texture2D(uGNoise, wp.xz * 0.045 + 0.4) * w.y, nd = texture2D(uGNoise, wp.xz * 1.37) * w.y;
  vec2 b = (texture2D(uGNoise2, wp.xz * 0.45).rg - 0.5) * w.y;
  if (w.x > 0.02) { vec2 p = wp.zy; nf += texture2D(uGNoise, p * 0.31) * w.x; nc += texture2D(uGNoise, p * 0.045 + 0.4) * w.x; nd += texture2D(uGNoise, p * 1.37) * w.x; b += (texture2D(uGNoise2, p * 0.45).rg - 0.5) * w.x; }
  if (w.z > 0.02) { vec2 p = wp.xy; nf += texture2D(uGNoise, p * 0.31) * w.z; nc += texture2D(uGNoise, p * 0.045 + 0.4) * w.z; nd += texture2D(uGNoise, p * 1.37) * w.z; b += (texture2D(uGNoise2, p * 0.45).rg - 0.5) * w.z; }
  float rock; vec3 c = groundMix(base, wp, N.y, nf, nc, nd, rock);
  bump = b * mix(0.5, 1.4, rock);
  return c;
}`;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();          // everything above ground
    scene.add(this.group);
    this.H = new Float32Array((NX + 1) * (NZ + 1));
    this.floors = [];
    this.paved = new Map();                  // height of paving and streets by half-meter cell (see standY)
    this.groundKinds = new Map();            // same cells, for footsteps and dust
    this.colliders = [];
    this.hash = new Map();
    this.chunks = [];
    this.rng = mulberry32(20261111);
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });   // plain, for quay and pier blocks
    this.surface = null;                     // set by the game: realistic materials for paving, streets, quay and piers
    // The ground itself: the same lit material, with the fine ground detail added to its shader.
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.groundMat.onBeforeCompile = (sh) => {
      const [n1, n2] = getNoise();
      sh.uniforms.uGNoise = { value: n1 }; sh.uniforms.uGNoise2 = { value: n2 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;\n' + GROUND_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n  vec2 gBump; diffuseColor.rgb = groundColorN(diffuseColor.rgb, vGW, normalize(vGN), gBump);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + (viewMatrix * vec4(gBump.x, 0.0, gBump.y, 0.0)).xyz * 0.85);');
    };
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
  // Paving and streets are drawn a few centimeters above the ground under them, so that the ground never shows
  // through. People have to stand on what is drawn, or their feet are buried: these cells remember its height.
  _mark(x, z, y, kind = 'stone') { const k = (Math.floor(x * 2) + 4096) * 8192 + Math.floor(z * 2) + 4096, o = this.paved.get(k); if (o === undefined || y > o) { this.paved.set(k, y); this.groundKinds.set(k, kind); } }
  surfaceAt(x, z) {
    if (this.indoor(x, z)) return 'stone';
    const key = (Math.floor(x * 2) + 4096) * 8192 + Math.floor(z * 2) + 4096;
    if (this.groundKinds.has(key)) return this.groundKinds.get(key);
    // The actual quay and two piers are stone, not timber.
    for (const f of this.floors) {
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx * f.cos - dz * f.sin) <= f.hx && Math.abs(dx * f.sin + dz * f.cos) <= f.hz) return f.surface || 'stone';
    }
    return 'earth';
  }
  // The height a person stands at: the paving where there is some, otherwise the ground or a raised floor.
  standY(x, z) { const y = this.groundY(x, z), p = this.paved.get((Math.floor(x * 2) + 4096) * 8192 + Math.floor(z * 2) + 4096); return p !== undefined && p > y && p < y + 0.4 ? p : y; }
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

  // Rooms the player can walk into: [{ name, inside(x, z, pad), roofY(x, z) }] (layout.js adds them).
  indoor(x, z, pad = 0) { if (this.rooms) for (const r of this.rooms) if (r.inside(x, z, pad)) return r; return null; }

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

  // The camera's version of solidAt: would something here hide the person the camera is looking at? Things lower
  // than a person do not, and neither do thin posts (the colonnade in the courtyard, torch posts): the camera
  // sees past them. Pulling in for those made the view jump close and back as it turned (Roman saw it in the
  // night scenes, 2026-11-15).
  blocksView(x, y, z, pad = 0.25) {
    const list = this._near(x, z); if (!list) return false;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (c.off || c.h < 1.6) continue;
      if (c.t === 0) { if (c.r >= 0.3 && Math.hypot(x - c.x, z - c.z) < c.r + pad) return true; }
      else {
        const dx = x - c.x, dz = z - c.z, lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
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

  // Broad ground tint at a point: grass, dry grass, the town's packed earth, the green of Lydia.
  // The material adds rock, sand and fine detail on top of it.
  tint(x, y, z, out) {
    const n = noise2(x * 0.11, z * 0.11), n2 = noise2(x * 0.031 + 9, z * 0.031);
    out.copy(PALC.grassB).lerp(PALC.grassA, smooth(0.3, 0.7, n)).lerp(PALC.grassC, smooth(0.55, 0.9, noise2(x * 0.07 + 3, z * 0.07 + 5)) * 0.6);
    out.lerp(PALC.dry, smooth(0.42, 0.72, n2));
    const lr = Math.hypot(x - PLACES.lydia[0], z - PLACES.lydia[1]);
    if (lr < 80) out.lerp(_c2.copy(PALC.lydB).lerp(PALC.lydA, smooth(0.35, 0.65, n2)), 1 - smooth(60, 78, lr));
    const town = boxMask(x, z, -112, 112, -84, 58, 6);
    if (town > 0) out.lerp(_c2.copy(PALC.town).lerp(PALC.townB, smooth(0.4, 0.7, n)), town);
    if (terrainParams.chasm > 0.5) {
      const kr = Math.hypot(x - PLACES.chasm[0], z - PLACES.chasm[1]);
      if (kr < 13) out.lerp(_c2.copy(PALC.pit).lerp(PALC.rockB, n), 1 - smooth(8, 13, kr));
    }
    return out;
  }

  // Smooth surface normal at a grid point, from the heights around it. Past the edge it uses the
  // height formula, so the far landscape can carry the surface on without a crease.
  gridNormal(i, j, out) {
    const w = NX + 1, H = this.H, S = BOUNDS.cell, x = BOUNDS.x0 + i * S, z = BOUNDS.z0 + j * S;
    const hl = i > 0 ? H[j * w + i - 1] : rawHeight(x - S, z), hr = i < NX ? H[j * w + i + 1] : rawHeight(x + S, z);
    const hu = j > 0 ? H[(j - 1) * w + i] : rawHeight(x, z - S), hd = j < NZ ? H[(j + 1) * w + i] : rawHeight(x, z + S);
    return out.set(hl - hr, 2 * S, hu - hd).normalize();
  }

  buildChunk(ci, cj, CW, CH) {
    const i0 = ci * CW, j0 = cj * CH, i1 = Math.min(NX, i0 + CW), j1 = Math.min(NZ, j0 + CH);
    const cells = (i1 - i0) * (j1 - j0), pos = new Float32Array(cells * 18), col = new Float32Array(cells * 18), nrm = new Float32Array(cells * 18);
    const w = NX + 1, H = this.H, S = BOUNDS.cell, gw = i1 - i0 + 1;
    // Tint and smooth normal at each grid point of the chunk.
    const vc = new Float32Array(gw * (j1 - j0 + 1) * 3), vn = new Float32Array(gw * (j1 - j0 + 1) * 3);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = ((j - j0) * gw + (i - i0)) * 3;
      this.tint(BOUNDS.x0 + i * S, H[j * w + i], BOUNDS.z0 + j * S, _c);
      vc[k] = _c.r; vc[k + 1] = _c.g; vc[k + 2] = _c.b;
      this.gridNormal(i, j, _n);
      vn[k] = _n.x; vn[k + 1] = _n.y; vn[k + 2] = _n.z;
    }
    let p = 0;
    const put = (i, j) => {
      const k = ((j - j0) * gw + (i - i0)) * 3;
      pos[p] = BOUNDS.x0 + i * S; pos[p + 1] = H[j * w + i]; pos[p + 2] = BOUNDS.z0 + j * S;
      col[p] = vc[k]; col[p + 1] = vc[k + 1]; col[p + 2] = vc[k + 2];
      nrm[p] = vn[k]; nrm[p + 1] = vn[k + 1]; nrm[p + 2] = vn[k + 2];
      p += 3;
    };
    // The same two triangles per cell as before, so terrainY still matches the drawn surface.
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      put(i, j); put(i, j + 1); put(i + 1, j);
      put(i + 1, j); put(i, j + 1); put(i + 1, j + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    return g;
  }

  buildTerrain() {
    const CW = 40, CH = 35;
    for (let cj = 0; cj < Math.ceil(NZ / CH); cj++) for (let ci = 0; ci < Math.ceil(NX / CW); ci++) {
      const m = new THREE.Mesh(this.buildChunk(ci, cj, CW, CH), this.groundMat);
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
    const pos = [], col = [], extra = { edge: [], half: [] };
    this._strip(pos, col, extra, path, width, hexA, hexB, lift);
    return this._flatMesh(pos, col, true, 'street', extra);
  }

  // Short worn earth paths, all in one mesh: where people go in and out of doors (layout.js). Each path fades out at
  // both ends, like a street.
  worn(paths, width, hexA, hexB, lift = 0.06) {
    const pos = [], col = [], extra = { edge: [], half: [] };
    for (const path of paths) this._strip(pos, col, extra, path, width, hexA, hexB, lift);
    return pos.length ? this._flatMesh(pos, col, true, 'street', extra) : null;
  }

  // The strip is cut into pieces about a meter across and 1.6 m along, each corner at its own ground height plus
  // `lift`. (Until 2026-11-19 each piece spanned the whole width, up to 9 m, with only its two edges on the ground,
  // so where the ground rose between them it covered the middle of the street.) `extra` collects, for each vertex,
  // where it is across the strip (-1 to 1) and whether it is at either end (0, for the fade), and the half-width.
  _strip(pos, col, extra, path, width, hexA, hexB, lift) {
    const pts = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    pts.push(path[path.length - 1]);
    const ca = new THREE.Color(hexA), cb = new THREE.Color(hexB);
    const side = (i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const wob = width * (0.5 + 0.07 * Math.sin(i * 1.7));
      return [-dz / l * wob, dx / l * wob];
    };
    const across = Math.max(1, Math.ceil(width / 1.0)), last = pts.length - 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = side(i), s1 = side(i + 1), a = pts[i], b = pts[i + 1], hA = Math.hypot(s0[0], s0[1]), hB = Math.hypot(s1[0], s1[1]);
      const q = [[a[0] - s0[0], a[1] - s0[1]], [a[0] + s0[0], a[1] + s0[1]], [b[0] - s1[0], b[1] - s1[1]], [b[0] + s1[0], b[1] + s1[1]]];
      const at = (u, t) => { const x = lerp(lerp(q[0][0], q[1][0], u), lerp(q[2][0], q[3][0], u), t), z = lerp(lerp(q[0][1], q[1][1], u), lerp(q[2][1], q[3][1], u), t); return [x, this.terrainY(x, z) + lift, z]; };
      for (let t = 0; t <= 1.001; t += 0.25) for (let u = 0.04; u <= 0.97; u += 0.4 / Math.max(0.5, width)) { const m = at(u, t); this._mark(m[0], m[2], m[1], 'earth'); }
      _c.copy(i % 2 ? ca : cb).multiplyScalar(0.95 + 0.1 * noise2(i * 0.7, 3));
      for (let k = 0; k < across; k++) {
        const u0 = k / across, u1 = (k + 1) / across;
        // Wound to face up. (Until 2026-11-19 the order was u0-start, u0-end, u1-start, which faces down; the street
        // material draws front faces only, so no street or door path was ever drawn.)
        for (const [u, t] of [[u0, 0], [u1, 0], [u0, 1], [u1, 0], [u1, 1], [u0, 1]]) {
          const v = at(u, t); pos.push(v[0], v[1], v[2]); col.push(_c.r, _c.g, _c.b);
          extra.edge.push(u * 2 - 1, (i === 0 && t === 0) || (i === last && t === 1) ? 0 : 1); extra.half.push(t ? hB : hA);
        }
      }
    }
  }

  // A tiled pavement over a rectangle.
  pave(x0, x1, z0, z1, tile, hexA, hexB, lift = 0.05) {
    const pos = [], col = [], ca = new THREE.Color(hexA), cb = new THREE.Color(hexB);
    for (let x = x0; x < x1 - 0.01; x += tile) for (let z = z0; z < z1 - 0.01; z += tile) {
      const xa = x + 0.04, xb = Math.min(x + tile, x1) - 0.04, za = z + 0.04, zb = Math.min(z + tile, z1) - 0.04;
      const y = Math.max(this.terrainY(xa, za), this.terrainY(xb, za), this.terrainY(xa, zb), this.terrainY(xb, zb)) + lift;
      _c.copy(noise2(x * 1.3, z * 1.3) > 0.5 ? ca : cb).multiplyScalar(0.93 + 0.14 * noise2(x * 0.77 + 2, z * 0.77));
      for (const v of [[xa, za], [xa, zb], [xb, za], [xb, za], [xa, zb], [xb, zb]]) { pos.push(v[0], y, v[1]); col.push(_c.r, _c.g, _c.b); }
      for (let cx = Math.floor(x * 2) / 2 + 0.25; cx < Math.min(x + tile, x1); cx += 0.5) for (let cz = Math.floor(z * 2) / 2 + 0.25; cz < Math.min(z + tile, z1); cz += 0.5) this._mark(cx, cz, y + 0.02);      // the stone's surface is drawn about 2 cm above the tile's own height
    }
    return this._flatMesh(pos, col, true, 'pave');
  }

  // kind is 'pave' or 'street'. If the game has attached realistic surfaces (this.surface, see
  // surfaces.js) they supply the material: stone slabs for paving, packed earth for streets.
  _flatMesh(pos, col, offset, kind, extra) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    if (extra) { g.setAttribute('aEdge', new THREE.Float32BufferAttribute(extra.edge, 2)); g.setAttribute('aHalf', new THREE.Float32BufferAttribute(extra.half, 1)); }   // streets: see _strip
    const mat = (this.surface && kind && this.surface.flat(g, kind)) || new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: !!offset, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
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
    // Quay and pier blocks become coursed stone, thin posts timber, when realistic surfaces are attached.
    const m = new THREE.Mesh(g, (this.surface && this.surface.flat(g, sx > 1 ? 'quay' : 'stake')) || this.terrainMat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (collide) this.addBox(x, z, sx / 2, sz / 2, 0, sy);
    return m;
  }
}

// ---------------------------------------------------------------- sea
// The water near the town: one flat sheet with moving ripples, sky reflection, a glitter path
// under the sun or moon, clear turquoise over the shallows, and a soft line of foam where it
// meets the shore. Beyond this sheet the sky dome draws the same water with the same shader
// code out to the horizon, so there is no seam and no far edge.
const SHORE = { x0: -352, z0: 36, w: 704, h: 100, cell: 2 };
export class Sea {
  constructor(scene) {
    const [noise, noise2] = getNoise();
    const col = (hex) => ({ value: new THREE.Color(hex) });
    this.u = {
      uTop: col(0x2f6fc4), uBot: col(0xc2daec), uAnti: col(0xb6d3ee), uGlow: col(0xfff0c8), uSea: col(0x2f7391), uLight: col(0xffffff), uHemi: col(0xbcd7f2),
      uFog: col(0xbcd3e2), uHzSun: col(0xbcd3e2), uHzAnti: col(0xbcd3e2), uSunDir: { value: new THREE.Vector3(0.45, 0.8, -0.4).normalize() }, uFogP: { value: new THREE.Vector3(90, 430, 1) },
      uMisc: { value: new THREE.Vector4(0, 0, 1, 0) }, uNoise: { value: noise }, uNoise2: { value: noise2 },
      uShore: { value: null }, uShoreBox: { value: new THREE.Vector4(SHORE.x0, SHORE.z0, 1 / SHORE.w, 1 / SHORE.h) },
      // the clouds it mirrors (shared with the sky by link())
      uCloud: { value: new THREE.Vector4(0.3, 0.3, 0, 0) }, uOff: { value: new THREE.Vector4() }, uCl: col(0xfff0da), uCs: col(0x8c96b2),
    };
    // Drawn after the solid things and before the sky, and blended, so the seabed shows through the shallows.
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: false,
      transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mat.color = this.u.uSea.value;        // the game writes the light profile's sea color here
    // A grid with 1.8 m cells near the harbor, growing to 25 m far out, so the waves (SEA_VERT) can move it.
    const axis = (a, b, inner, from) => { const out = []; for (let v = a; v < b; ) { out.push(v); const o = Math.max(0, Math.abs(v - from) - inner); v += 1.8 + o * 0.0418; } out.push(b); return out; };
    const xs = axis(-700, 700, 130, 0), zs = axis(20, 640, 150, 20), pos = [], idx = [];
    for (const z of zs) for (const x of xs) pos.push(x, 0, z);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 330), 800);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 800;
    scene.add(this.mesh);
    this.t = 0; this.sky = null;
    this.shore(null);
  }
  // Work out how deep the water is near the shore. Pass the world once the quay and piers are
  // built and the foam line will follow them too. Without it only the natural shore and the quay
  // wall are known.
  shore(world) {
    const nx = SHORE.w / SHORE.cell, nz = SHORE.h / SHORE.cell, data = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = SHORE.x0 + (i + 0.5) * SHORE.cell, z = SHORE.z0 + (j + 0.5) * SHORE.cell;
      const inside = x > BOUNDS.x0 && x < BOUNDS.x1 && z < BOUNDS.z1;
      const h = world && inside ? world.groundY(x, z) : rawHeight(x, z);
      data[j * nx + i] = clamp(Math.round((h + 6) / 8 * 255), 0, 255);
    }
    if (this.u.uShore.value) this.u.uShore.value.dispose();
    const t = new THREE.DataTexture(data, nx, nz, THREE.RedFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    this.u.uShore.value = t;
  }
  // Share the sky's light and color values, so this sheet and the far water always agree.
  link(sky) {
    this.sky = sky;
    for (const k of ['uTop', 'uBot', 'uAnti', 'uGlow', 'uLight', 'uHemi', 'uFog', 'uHzSun', 'uHzAnti', 'uSunDir', 'uFogP', 'uMisc', 'uCloud', 'uOff', 'uCl', 'uCs']) this.u[k] = sky.u[k];
  }
  update(dt) { this.t += dt; if (!this.sky) this.u.uMisc.value.w = this.t; }
  // A dark, wet band on the stone where the water meets the quay and pier walls: dark and greenish at the
  // waterline, fading out half a meter above it. lines: [x0, z0, x1, z1, outward x, outward z].
  wetBand(scene, lines) {
    const pos = [], col = [], idx = [], rows = [[-0.45, 0.13, 0.12, 0.09, 0.9], [0.16, 0.15, 0.16, 0.10, 0.8], [0.34, 0.2, 0.19, 0.15, 0.45], [0.62, 0.24, 0.22, 0.18, 0.0]];
    for (const [x0, z0, x1, z1, nx, nz] of lines) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t + nx * 0.03, z = z0 + (z1 - z0) * t + nz * 0.03, wob = Math.sin(i * 1.7) * 0.06 + Math.sin(i * 0.41) * 0.08;
        for (const [y, r, g, b, al] of rows) { pos.push(x, y + (y > 0 ? wob : 0), z); col.push(r, g, b, al); }
      }
      const base = pos.length / 3 - (n + 1) * rows.length;
      for (let i = 0; i < n; i++) for (let k = 0; k < rows.length - 1; k++) { const a = base + i * rows.length + k, b2 = a + rows.length; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.renderOrder = 790; m.receiveShadow = true; scene.add(m); this.wet = m; return m;
  }
}

// ---------------------------------------------------------------- sky and light
// Each profile is a full description of the light at one time of day.
//   top, bot, anti   sky color overhead, at the horizon on the sun's side, at the horizon opposite the sun
//   fog              scene fog color. hzSun and hzAnti are the far haze toward and away from the sun.
//   cl, cs, clK      cloud color in the light and in shade, and how bright the lit side is
//   cov, cir, wind   low cloud cover and high cloud cover (0 to 1), and how fast the clouds drift
//   haze             how thick the far haze is (1 is a clear summer day)
//   moon             1 when the light in the sky is the moon
export const ENV = {
  // Late afternoon (the new look): the sun low in the west-southwest, warm light, cooler shade. The old midday
  // light, with the sun high in the north-east, was: sunEl 0.92, sunAz 2.3, sun 0xfff1d6, sunI 2.5, hemiSky 0xbcd7f2, hemiI 1.15.
  afternoon: { top: 0x5480b6, bot: 0xf0d3a6, anti: 0xc6c6cc, glow: 0xffcc8a, sunEl: 0.45, sunAz: -1.2, sun: 0xffc68a, sunI: 2.7, hemiSky: 0xa2bade, hemiGnd: 0x8e7656, hemiI: 0.9, fog: 0xcdc6b8, hzSun: 0xe8cfa4, hzAnti: 0xb6bfcc, fogN: 90, fogF: 430, stars: 0, exp: 1.0, sea: 0x2f6a86, cl: 0xfff0da, cs: 0x8c96b2, clK: 1.5, cov: 0.32, cir: 0.3, wind: 1, haze: 0.75, moon: 0 },
  dusk: { top: 0x26356e, bot: 0xff9a4e, anti: 0x5c5f9c, glow: 0xffb066, sunEl: 0.09, sunAz: 2.75, sun: 0xffa055, sunI: 1.9, hemiSky: 0x8f8fc8, hemiGnd: 0x7a5a48, hemiI: 0.95, fog: 0xd9a078, hzSun: 0xf0a868, hzAnti: 0xb298a4, fogN: 70, fogF: 380, stars: 0.15, exp: 1.0, sea: 0x3a5f84, cl: 0xffb884, cs: 0x4c4666, clK: 1.5, cov: 0.2, cir: 0.62, wind: 0.8, haze: 1.3, moon: 0 },
  night: { top: 0x050916, bot: 0x1a2748, anti: 0x101a36, glow: 0x9fb4e8, sunEl: 0.7, sunAz: 0.9, sun: 0x9db4e6, sunI: 0.75, hemiSky: 0x4a5c94, hemiGnd: 0x24222c, hemiI: 1.25, fog: 0x141c36, hzSun: 0x1b2646, hzAnti: 0x121a33, fogN: 45, fogF: 300, stars: 1, exp: 1.15, sea: 0x10203c, cl: 0x93a6cc, cs: 0x0d1424, clK: 0.5, cov: 0.24, cir: 0.3, wind: 0.7, haze: 1.2, moon: 1 },
  dawn: { top: 0x4a78c0, bot: 0xffd9a6, anti: 0xa3b4da, glow: 0xfff2c0, sunEl: 0.16, sunAz: -2.2, sun: 0xffd9a0, sunI: 2.2, hemiSky: 0xb9c9ea, hemiGnd: 0x8c7658, hemiI: 1.05, fog: 0xf0d6b4, hzSun: 0xf8dcb0, hzAnti: 0xdccfc6, fogN: 80, fogF: 420, stars: 0.05, exp: 1.05, sea: 0x4a7a98, cl: 0xffe8cc, cs: 0x8e8eac, clK: 1.4, cov: 0.15, cir: 0.3, wind: 0.6, haze: 1.9, moon: 0 },
  lydia: { top: 0x2c7acc, bot: 0xcfe6ee, anti: 0xc0dcee, glow: 0xfff6d8, sunEl: 0.85, sunAz: 1.2, sun: 0xfff6e0, sunI: 2.6, hemiSky: 0xc4def2, hemiGnd: 0x7f8a56, hemiI: 1.2, fog: 0xcfe2ea, hzSun: 0xd6e6ea, hzAnti: 0xc8deea, fogN: 80, fogF: 330, stars: 0, exp: 1.0, sea: 0x2f7391, cl: 0xffffff, cs: 0x9ab0c8, clK: 1.5, cov: 0.07, cir: 0.1, wind: 0.8, haze: 0.7, moon: 0 },
  storm: { top: 0x1c222c, bot: 0x4a5058, anti: 0x42484f, glow: 0x8a94a0, sunEl: 0.7, sunAz: 1.2, sun: 0x9aa4b4, sunI: 0.9, hemiSky: 0x5a6470, hemiGnd: 0x3a3c36, hemiI: 0.9, fog: 0x3c434c, hzSun: 0x40474f, hzAnti: 0x3a4149, fogN: 25, fogF: 170, stars: 0, exp: 0.95, sea: 0x2a3a48, cl: 0x8e969e, cs: 0x2a3037, clK: 0.8, cov: 1.0, cir: 0, wind: 4.5, haze: 3.5, moon: 0 },
  cave: { top: 0x020202, bot: 0x020202, anti: 0x020202, glow: 0x000000, sunEl: 0.9, sunAz: 0, sun: 0x000000, sunI: 0, hemiSky: 0x64493a, hemiGnd: 0x30211a, hemiI: 0.6, fog: 0x0a0806, hzSun: 0x0a0806, hzAnti: 0x0a0806, fogN: 18, fogF: 95, stars: 0, exp: 0.92, sea: 0x10203c, cl: 0x000000, cs: 0x000000, clK: 0, cov: 0, cir: 0, wind: 0, haze: 0, moon: 0 },
};
const COLOR_KEYS = ['top', 'bot', 'anti', 'glow', 'sun', 'hemiSky', 'hemiGnd', 'fog', 'hzSun', 'hzAnti', 'sea', 'cl', 'cs'];
const NUM_KEYS = ['sunEl', 'sunAz', 'sunI', 'hemiI', 'fogN', 'fogF', 'stars', 'exp', 'clK', 'cov', 'cir', 'wind', 'haze', 'moon'];

// Far haze, shared by the sky dome and the backdrop (backdrop.js) so that they agree.
// The colors are mixed after tone mapping, the way three.js mixes scene fog, so that ground
// that is fully fogged and haze that is fully thick come out as exactly the same color.
export const HAZE_GLSL = /* glsl */`
uniform vec3 uFog, uHzSun, uHzAnti, uSunDir;
// A color as it goes on screen. When the finishing pass (post.js) draws the scene it signals with a negative
// exposure, and the color is screen-encoded here because three.js does not do it when drawing into a picture.
vec3 lookOut(vec3 c) {
#ifndef TONE_MAPPING
  if (toneMappingExposure < 0.0) return lookSRGB(c);
#endif
  return linearToOutputTexel(vec4(c, 1.0)).rgb;
}
uniform vec3 uFogP;                       // x fog near, y fog far, z haze thickness
vec3 hazeColor(vec3 dir) {
  vec2 h = normalize(dir.xz + vec2(1e-5, 0.0)), s = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float a = dot(h, s), w = abs(a); w = w * w * (3.0 - 2.0 * w);
  vec3 c = mix(uFog, a > 0.0 ? uHzSun : uHzAnti, w);
  return lookOut(c);
}
// d distance from the eye, vz depth along the view, y0 eye height, y1 height of the point.
// cap is how much of the thick ground mist far ground gets. nearK = 1 gives exactly the scene fog.
float hazeAmount(float d, float vz, float y0, float y1, float cap, float nearK) {
  float A = smoothstep(uFogP.x, uFogP.y, vz);
  float e = (y1 - y0) / max(d, 1.0);
  float mist = A * mix(cap * (1.0 - smoothstep(0.02, 0.34, e)), 1.0, nearK);
  float a0 = exp(-max(y0, 0.0) / 260.0), a1 = exp(-max(y1, 0.0) / 260.0), dy = (y1 - y0) / 260.0;
  float avg = abs(dy) > 0.02 ? (a0 - a1) / dy : a0;
  float tau = uFogP.z * 0.0003 * d * avg * (1.0 - nearK);
  return 1.0 - (1.0 - mist) * exp(-tau);
}`;

// Cloud cover for a view direction. Used by the dome and by the stars (which hide behind clouds).
const CLOUD_GLSL = /* glsl */`
uniform sampler2D uNoise;
uniform vec4 uCloud;                      // x low cloud cover, y high cloud cover
uniform vec4 uOff;                        // drift of the low layer (xy) and the high layer (zw)
// Returns x low cloud amount, y high cloud amount, z low cloud shape value, w the low cloud threshold.
vec4 cloudField(vec3 d, out float rbase, out vec2 q) {
  float y = max(d.y, 0.0);
  vec2 p = d.xz / (y + 0.10);
  q = p * 0.42 + uOff.xy;
  float big = texture2D(uNoise, p * 0.055 + uOff.zw * 0.7 + 0.13).r;
  rbase = texture2D(uNoise, q).r;
  float shape = rbase * 0.74 + big * 0.42 - 0.08 + (texture2D(uNoise, q * 4.3 + uOff.yx * 2.1).g - 0.5) * 0.13;
  float thr = mix(0.88, 0.16, uCloud.x);
  float low = smoothstep(thr, thr + 0.2, shape) * smoothstep(0.0, 0.11, y);
  vec2 p2 = d.xz / (y + 0.22);
  vec2 q2 = vec2(p2.x * 0.11 + p2.y * 0.05, p2.y * 0.30 - p2.x * 0.02) + uOff.zw;
  float ci = texture2D(uNoise, q2).b * 0.62 + big * 0.5 - 0.06;
  float t2 = mix(1.02, 0.30, uCloud.y);
  float high = smoothstep(t2, t2 + 0.34, ci) * smoothstep(0.0, 0.16, y) * 0.8;
  return vec4(low, high, shape, thr);
}`;

// Clear sky color: deep overhead, pale at the horizon, warm around the sun.
const ATMOS_GLSL = /* glsl */`
vec3 atmosphere(vec3 d, float mu) {
  float y = max(d.y, 0.0);
  vec2 hd = normalize(d.xz + vec2(1e-5, 0.0)), hs = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float side = dot(hd, hs) * 0.5 + 0.5; side = side * side * (3.0 - 2.0 * side);
  vec3 hor = mix(uAnti, uBot, side);
  float k = 1.0 - y, k2 = k * k;
  float t = k2 * k2 * k * 0.8 + k2 * 0.2;
  vec3 c = mix(uTop, hor, t);
  float m = max(mu, 0.0);
  c += uGlow * uMisc.z * (pow(m, 6.0) * 0.10 + pow(m, 40.0) * 0.20 + pow(m, 300.0) * 0.5) * (0.4 + 0.6 * t);
  return c;
}`;

// Water color at a point P on the sea, seen along the direction d. depth is the water depth in
// metres. Used by the sea sheet near the town and by the sky dome for the far water.
const SEA_GLSL = /* glsl */`
vec3 seaColorN(vec3 P, vec3 d, float depth, vec3 nG) {
  float tm = uMisc.w;
  // Three layers of ripples moving different ways. The fine one fades by itself with distance.
  vec2 w = (texture2D(uNoise2, P.xz * 0.07 + vec2(0.023, 0.014) * tm).rg - 0.5) * 0.8
         + (texture2D(uNoise2, P.xz * 0.011 + vec2(0.013, 0.008) * tm).rg - 0.5)
         + (texture2D(uNoise2, P.xz * 0.0027 - vec2(0.004, -0.006) * tm).rg - 0.5);
  vec3 n = normalize(vec3(w.x * 0.48 + nG.x / max(nG.y, 0.2), 1.0, w.y * 0.48 + nG.z / max(nG.y, 0.2)));
  // The flatter you look across the water, the more sky it mirrors.
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
  F = min(F, 0.72) * 0.9;
  vec3 r = reflect(d, n); r.y = abs(r.y) * 0.8 + 0.06; r = normalize(r);
  vec3 lightIn = (uLight * max(uSunDir.y, 0.0) + uHemi) * 0.3183;
  vec3 deep = uSea * lightIn * 0.78;
  vec3 shallow = (uSea * 0.5 + vec3(0.07, 0.29, 0.27)) * lightIn * 1.15;
  // The sky it mirrors, clouds and all: the same cloud pattern as the sky dome along the reflected direction,
  // lit a little more simply (added 2026-11-15; before, the water mirrored only the clear sky).
  vec3 sky = atmosphere(r, dot(r, uSunDir));
  // The clouds are looked up through a smoother surface (the swell and a fifth of the ripples), so a cloud is
  // smeared into soft streaks the way rippled water smears it, not broken into spots, and they blend in gently.
  { vec3 ns = normalize(vec3(w.x * 0.1 + nG.x / max(nG.y, 0.2), 1.0, w.y * 0.1 + nG.z / max(nG.y, 0.2)));
    vec3 rc = reflect(d, ns); rc.y = abs(rc.y) * 0.8 + 0.06; rc = normalize(rc);
    // The low clouds only, read the same way as cloudField (world.js) but from two pictures instead of four:
    // the thin high cloud hardly shows in water, and the sea covers much of the screen at the harbor.
    vec2 cp = rc.xz / (rc.y + 0.10);
    float rb = texture2D(uNoise, cp * 0.42 + uOff.xy).r, big = texture2D(uNoise, cp * 0.055 + uOff.zw * 0.7 + 0.13).r;
    float thr = mix(0.88, 0.16, uCloud.x);
    float low = smoothstep(thr, thr + 0.2, rb * 0.74 + big * 0.42 - 0.08) * smoothstep(0.0, 0.11, rc.y);
    sky = mix(sky, mix(uCs, uCl, clamp(0.55 + (rb - 0.35) * 1.2, 0.0, 1.0)), low * 0.6); }
  vec3 col = mix(mix(shallow, deep, 1.0 - exp(-depth * 1.1)), sky, F);
  // Glitter: a tall narrow streak of broken light under the sun or moon.
  vec3 rs = normalize(vec3(d.x, mix(-d.y, uSunDir.y, 0.8), d.z) + vec3(w.x, 0.0, w.y) * 0.16);
  // Under the shadow of a low cloud the glitter goes and the water is a little darker (cloudshade.js, 2026-11-19).
  float cT = max(1600.0 - P.y, 0.0) / max(uSunDir.y, 0.08); vec2 cP = (P.xz + uSunDir.xz * cT) / 1600.0;
  float cThr = mix(0.88, 0.16, uCloud.x);
  float cSh = smoothstep(cThr - 0.06, cThr + 0.26, texture2D(uNoise, cP * 0.42 + uOff.xy).r * 0.74 + texture2D(uNoise, cP * 0.055 + uOff.zw * 0.7 + 0.13).r * 0.42 - 0.08) * (1.0 - smoothstep(0.6, 0.9, uCloud.x));
  col *= 1.0 - 0.12 * cSh * uMisc.z;
  col += uGlow * uMisc.z * pow(max(dot(rs, uSunDir), 0.0), 260.0) * 2.5 * (1.0 - 0.9 * cSh);
  return col;
}
vec3 seaColor(vec3 P, vec3 d, float depth) { return seaColorN(P, d, depth, vec3(0.0, 1.0, 0.0)); }`;

// Harbor swell: four Gerstner waves (each point moves in a small circle, so crests sharpen and troughs flatten),
// strongest in the harbor, gone by 300 m out so the sheet meets the flat far water drawn by the sky dome.
const SEA_VERT = /* glsl */`
uniform vec4 uMisc;
varying vec3 vW; varying vec3 vN; varying float vCrest;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float t = uMisc.w, fade = 1.0 - smoothstep(160.0, 300.0, length(wp.xz - vec2(0.0, 70.0)));
  vec3 p = wp.xyz, n = vec3(0.0, 1.0, 0.0);
  // direction x, direction z, wavelength (m), height (m)
  // (Heights were 4.5 to 8.5 cm until 2026-11-15, which read as ripples rather than waves; now about 1.8 times
  // that, with a fifth, longer swell from the open gulf.)
  vec4 W[5]; W[0] = vec4(0.8, 0.6, 7.0, 0.12); W[1] = vec4(-0.28, 0.96, 5.5, 0.08); W[2] = vec4(0.95, -0.31, 11.0, 0.15); W[3] = vec4(0.45, 0.89, 17.0, 0.11); W[4] = vec4(0.2, 0.98, 27.0, 0.13);
  float h = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 D = normalize(W[i].xy); float k = 6.2832 / W[i].z, c = sqrt(9.8 / k), a = W[i].w * fade, Q = 0.55;
    float f = k * (dot(D, wp.xz) - c * t * 0.8) + float(i) * 1.7;
    p.xz += Q * a * D * cos(f); p.y += a * sin(f); h += a * sin(f);
    n.xz -= D * k * a * cos(f); n.y -= Q * k * a * sin(f);
  }
  vW = p; vN = normalize(n); vCrest = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SEA_FRAG = /* glsl */`
varying vec3 vW; varying vec3 vN; varying float vCrest;
uniform vec3 uTop, uBot, uAnti, uGlow, uSea, uLight, uHemi, uCl, uCs;
uniform vec4 uMisc, uShoreBox;
uniform sampler2D uNoise2, uShore;
${CLOUD_GLSL}
${HAZE_GLSL}
${ATMOS_GLSL}
${SEA_GLSL}
void main() {
  vec3 V = vW - cameraPosition; float t = length(V); vec3 d = V / t;
  float bed = texture2D(uShore, (vW.xz - uShoreBox.xy) * uShoreBox.zw).r * 8.0 - 6.0;
  float depth = max(-bed, 0.0);
  vec3 col = seaColorN(vW, d, depth, vN);
  // Near the quay and the piers the water mirrors the stone, not the sky.
  vec2 sb = (vW.xz - uShoreBox.xy) * uShoreBox.zw, so = vec2(2.6) * uShoreBox.zw;
  float wall = max(max(texture2D(uShore, sb + vec2(so.x, 0.0)).r, texture2D(uShore, sb - vec2(so.x, 0.0)).r),
                   max(texture2D(uShore, sb + vec2(0.0, so.y)).r, texture2D(uShore, sb - vec2(0.0, so.y)).r)) * 8.0 - 6.0;
  float nearWall = smoothstep(-0.5, 1.2, wall) * smoothstep(-0.3, -1.5, bed);
  vec3 lightIn0 = (uLight * max(uSunDir.y, 0.0) + uHemi) * 0.3183;
  float Fw = 0.03 + 0.97 * pow(1.0 - max(dot(-d, vN), 0.0), 5.0);
  col = mix(col, vec3(0.30, 0.27, 0.22) * lightIn0, nearWall * clamp(Fw * 1.6 + 0.25, 0.0, 0.75));
  // Light through the crests, toward the sun: green-blue where the wave is thin.
  col += vec3(0.05, 0.17, 0.14) * lightIn0 * smoothstep(0.05, 0.3, vCrest) * pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 2.0) * 1.4;
  // Foam where the water is very shallow, lapping in and out.
  float fn = texture2D(uNoise, vW.xz * 0.09 + vec2(0.017, -0.012) * uMisc.w).g;
  float lap = 0.5 + 0.5 * sin(depth * 6.0 - uMisc.w * 1.2 + fn * 5.0);
  float foam = smoothstep(1.1, 0.1, depth + (fn - 0.5) * 0.7) * (0.45 + 0.55 * lap);
  // Froth along the quay and pier walls, in patches that drift and come and go as the swell slaps the stone.
  // Two finer layers multiplied, so the froth breaks into thin threads rather than blotches, and only within
  // about a meter of the stone.
  if (wall > 0.3) {   // only within a few meters of stone; the open water skips all of this
    float fw = texture2D(uNoise, vW.xz * 0.62 + vec2(-0.05, 0.035) * uMisc.w).g * texture2D(uNoise, vW.zx * 0.37 - vec2(0.02, 0.04) * uMisc.w).g;
    float slap = 0.5 + 0.5 * sin(uMisc.w * 1.6 + vW.x * 0.35 + vW.z * 0.21);
    vec2 s1 = vec2(1.1) * uShoreBox.zw;   // stone within about a meter
    float wall1 = max(max(texture2D(uShore, sb + vec2(s1.x, 0.0)).r, texture2D(uShore, sb - vec2(s1.x, 0.0)).r),
                      max(texture2D(uShore, sb + vec2(0.0, s1.y)).r, texture2D(uShore, sb - vec2(0.0, s1.y)).r)) * 8.0 - 6.0;
    foam = max(foam, smoothstep(0.6, 1.6, wall1) * smoothstep(-0.3, -1.5, bed) * smoothstep(0.24, 0.44, fw + slap * 0.12) * 0.35);
  }
  // A few whitecaps where the highest crests meet, out in the open water.
  float cap = smoothstep(0.32, 0.48, vCrest) * smoothstep(0.55, 0.8, texture2D(uNoise, vW.xz * 0.05 + vec2(0.01, 0.02) * uMisc.w).g);
  foam = max(foam, cap * 0.6);
  col = mix(col, vec3(0.92, 0.95, 0.95) * (uLight * max(uSunDir.y, 0.0) + uHemi) * 0.3183, foam * 0.6);
  float alpha = max(1.0 - 0.92 * exp(-depth * 1.5), foam * 0.9);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float hz = hazeAmount(t, dot(d, fwd) * t, cameraPosition.y, 0.0, 0.8, 0.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(d), hz);
}`;

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  // Turn with the camera but never move with it, and sit at the far end of the depth range.
  vec4 mv = viewMatrix * vec4(position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
  gl_Position.z = gl_Position.w;
}`;

const DOME_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop, uBot, uAnti, uGlow, uCl, uCs, uSea, uLight, uHemi;
uniform vec4 uMisc;                       // x stars, y moon, z strength of the sun or moon, w time
uniform sampler2D uNoise2;
${CLOUD_GLSL}
${HAZE_GLSL}
${ATMOS_GLSL}
${SEA_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float mu = dot(d, uSunDir), m = max(mu, 0.0);
  vec3 col; float hz;
  if (d.y >= 0.0 || cameraPosition.y < 0.3) {
    vec3 du = normalize(vec3(d.x, max(d.y, 0.0), d.z));
    col = atmosphere(du, mu);
    // The Milky Way, only at night.
    if (uMisc.x > 0.01) {
      float bd = dot(du, vec3(0.5145, 0.3274, -0.7925));
      vec2 uvm = vec2(dot(du, vec3(0.8575, -0.1964, 0.4756)), dot(du, vec3(0.0, 0.9243, 0.3818)));
      float n = texture2D(uNoise, uvm * 0.9 + 0.2).g * texture2D(uNoise, uvm * 0.33).r;
      col += vec3(0.50, 0.58, 0.85) * exp(-bd * bd * 9.0) * (0.3 + 2.2 * n) * 0.032 * uMisc.x * smoothstep(0.0, 0.25, du.y);
    }
    float rb; vec2 q;
    vec4 cf = cloudField(du, rb, q);
    // The sun is a small bright disc. The moon is larger and has dark seas on it.
    if (mu > 0.9990) {
      float sunW = clamp(1.0 - 2.0 * uMisc.y, 0.0, 1.0) * uMisc.z, moonW = clamp(2.0 * uMisc.y - 1.0, 0.0, 1.0) * uMisc.z;
      vec3 disc = uGlow * sunW * (smoothstep(0.99982, 0.99990, mu) * 30.0 + pow(m, 4000.0) * 6.0);
      if (moonW > 0.0) {
        vec3 r = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0))), u = cross(r, uSunDir);
        vec2 mq = vec2(dot(d, r), dot(d, u)) / 0.030;
        float rr = dot(mq, mq);
        if (rr < 1.0) {
          float maria = texture2D(uNoise2, mq * 0.13 + 0.31).a;
          float face = mix(1.0, 0.5, smoothstep(0.40, 0.62, maria)) * (0.7 + 0.3 * sqrt(1.0 - rr));
          disc += vec3(1.0, 0.98, 0.92) * face * 2.2 * moonW * smoothstep(1.0, 0.9, rr);
        }
      }
      float open = (1.0 - cf.x) * (1.0 - cf.y * 0.6);
      col += disc * open * open;
    }
    // High thin cloud.
    vec3 cirCol = mix(uCs, uCl, 0.78) + uGlow * uMisc.z * pow(m, 5.0) * 0.3;
    col = mix(col, cirCol, cf.y);
    // Low heaped cloud: bright on the side that faces the sun, grey underneath.
    if (cf.x > 0.002) {
      vec2 p = du.xz / (du.y + 0.10), sp = uSunDir.xz / (max(uSunDir.y, 0.0) + 0.10);
      vec2 ld = sp - p; ld /= (length(ld) + 1e-3);
      float r2 = texture2D(uNoise, q + ld * 0.02).r;
      float lit = clamp(0.5 + (rb - r2) * 5.5 * mix(1.0, 0.45, uCloud.x), 0.0, 1.0);
      float thick = smoothstep(0.0, 0.42, cf.z - cf.w);
      float light = clamp(0.30 + lit * 0.85 - thick * 0.45, 0.0, 1.0);
      vec3 cc = mix(uCs, uCl, light) + uGlow * uMisc.z * pow(m, 12.0) * (1.0 - thick) * 0.5;
      cc = mix(cc, col, smoothstep(0.35, 0.0, du.y) * 0.45);      // far clouds take on the sky color
      col = mix(col, cc, cf.x);
    }
    hz = exp(-max(d.y, 0.0) * 18.0) * 0.9;
  } else {
    // Far water: the sea out to the horizon, the same water as the sheet near the town.
    float t = min(cameraPosition.y / max(-d.y, 1e-4), 60000.0);
    col = seaColor(cameraPosition + d * t, d, 30.0);
    vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    hz = hazeAmount(t, dot(d, fwd) * t, cameraPosition.y, 0.0, 0.8, 0.0);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(d), hz);
  gl_FragColor.rgb += (texture2D(uNoise, gl_FragCoord.xy / 256.0).a - 0.5) * 0.006;
}`;

const STAR_VERT = /* glsl */`
attribute vec4 aStar;                     // x size, y phase, z twinkle speed, w brightness
attribute vec3 color;
uniform vec4 uMisc;
uniform float uScale;
varying vec3 vCol;
${CLOUD_GLSL}
void main() {
  vec4 mv = viewMatrix * vec4(position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
  gl_Position.z = gl_Position.w;
  float rb; vec2 q;
  vec4 cf = cloudField(position, rb, q);
  float tw = 0.76 + 0.24 * sin(uMisc.w * aStar.z + aStar.y);
  vCol = color * aStar.w * tw * uMisc.x * (1.0 - cf.x) * (1.0 - cf.y * 0.8) * smoothstep(0.02, 0.2, position.y);
  gl_PointSize = aStar.x * uScale;
}`;
const STAR_FRAG = /* glsl */`
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vCol * smoothstep(0.5, 0.12, r), 1.0);
  #include <colorspace_fragment>
}`;

// Two small tiling noise pictures, built once. The shaders sample these instead of computing noise.
//   first:  red heaped cloud shapes, green fine detail, blue wisps, alpha random grain
//   second: red and green the slope of small waves, blue unused, alpha blotches (the moon's seas)
let _noise = null;
export function getNoise() { return _noise || (_noise = makeNoise()); }
function makeNoise() {
  const N = 256, rng = mulberry32(4242);
  const perm = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256), jx = new Float32Array(256), jy = new Float32Array(256);
  const p0 = []; for (let i = 0; i < 256; i++) p0.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p0[i]; p0[i] = p0[j]; p0[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p0[i & 255];
  for (let i = 0; i < 256; i++) { const a = rng() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); jx[i] = rng(); jy[i] = rng(); }
  const wrap = (v, per) => ((v % per) + per) % per;
  // Smooth noise that repeats every `per` cells.
  const pn = (x, y, per) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = wrap(x0, per), xb = (xa + 1) % per, ya = wrap(y0, per), yb = (ya + 1) % per;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const h00 = perm[perm[xa] + ya], h10 = perm[perm[xb] + ya], h01 = perm[perm[xa] + yb], h11 = perm[perm[xb] + yb];
    const a = gx[h00] * fx + gy[h00] * fy, b = gx[h10] * (fx - 1) + gy[h10] * fy;
    const c = gx[h01] * fx + gy[h01] * (fy - 1), d = gx[h11] * (fx - 1) + gy[h11] * (fy - 1);
    const t = a + u * (b - a);
    return t + v * (c + u * (d - c) - t);
  };
  const pfbm = (x, y, per, oct) => { let s = 0, a = 1, n = 0; for (let o = 0; o < oct; o++) { s += pn(x * per + o * 5.3, y * per + o * 2.9, per) * a; n += a; a *= 0.5; per *= 2; } return s / n; };
  // Distance to the nearest of a set of scattered points, repeating every `per` cells. Gives round puffs.
  const pw = (x, y, per) => {
    x *= per; y *= per; const xi = Math.floor(x), yi = Math.floor(y); let best = 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, h = perm[perm[wrap(cx, per)] + wrap(cy, per)];
      const ex = cx + jx[h] - x, ey = cy + jy[h] - y, dd = ex * ex + ey * ey;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };
  const A = new Float32Array(N * N * 3), hgt = new Float32Array(N * N), a8 = new Uint8Array(N * N * 4), b8 = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, y = j / N, k = j * N + i;
    A[k * 3] = 0.62 * (pfbm(x, y, 4, 5) * 1.1 + 0.5) + 0.26 * (1 - pw(x, y, 6) * 1.25) + 0.12 * (1 - pw(x, y, 13));
    A[k * 3 + 1] = 0.6 * (1 - pw(x, y, 16)) + 0.4 * (pfbm(x, y, 16, 3) + 0.5);
    const wx = pfbm(x + 0.3, y + 0.1, 4, 3) * 0.16;
    A[k * 3 + 2] = 0.55 * (1 - Math.min(1, Math.abs(pfbm(x + wx, y + wx * 0.5, 8, 4)) * 3.2)) + 0.45 * (pfbm(x, y, 6, 4) + 0.5);
    hgt[k] = pfbm(x, y, 6, 4);
    a8[k * 4 + 3] = Math.floor(rng() * 256);
    b8[k * 4 + 2] = 128;
    b8[k * 4 + 3] = clamp(Math.round((pfbm(x, y, 3, 4) * 1.2 + 0.5) * 255), 0, 255);
  }
  // Stretch each channel so its values fill the range from 0 to 1.
  for (let c = 0; c < 3; c++) {
    let s = 0, s2 = 0;
    for (let k = 0; k < N * N; k++) { s += A[k * 3 + c]; s2 += A[k * 3 + c] * A[k * 3 + c]; }
    const mean = s / (N * N), sd = Math.sqrt(s2 / (N * N) - mean * mean) || 1;
    for (let k = 0; k < N * N; k++) a8[k * 4 + c] = clamp(Math.round((0.5 + (A[k * 3 + c] - mean) / (4.6 * sd)) * 255), 0, 255);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, l = j * N + ((i + N - 1) % N), r = j * N + ((i + 1) % N), u = ((j + N - 1) % N) * N + i, d = ((j + 1) % N) * N + i;
    b8[k * 4] = clamp(Math.round(128 + (hgt[r] - hgt[l]) * 1400), 0, 255);
    b8[k * 4 + 1] = clamp(Math.round(128 + (hgt[d] - hgt[u]) * 1400), 0, 255);
  }
  const tex = (data) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;   // sharp at a slant, so the ground ahead is not a smear
    return t;
  };
  return [tex(a8), tex(b8)];
}

const _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sf = new THREE.Vector3();
export class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.cur = {}; this.from = {}; this.to = {}; this.t = 1; this.dur = 1; this.name = 'afternoon'; this.time = 0;
    for (const k of COLOR_KEYS) { this.cur[k] = new THREE.Color(ENV.afternoon[k]); this.from[k] = new THREE.Color(); this.to[k] = new THREE.Color(); }
    for (const k of NUM_KEYS) this.cur[k] = ENV.afternoon[k];
    const [noise, noise2] = getNoise();
    const col = () => ({ value: new THREE.Color() });
    // Values the shaders read. The backdrop reads the same objects, so the two always agree.
    this.u = {
      uTop: col(), uBot: col(), uAnti: col(), uGlow: col(), uCl: col(), uCs: col(), uSea: col(), uLight: col(), uHemi: col(), uHemiGnd: col(),
      uFog: col(), uHzSun: col(), uHzAnti: col(), uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFogP: { value: new THREE.Vector3(90, 430, 1) },
      uMisc: { value: new THREE.Vector4() }, uCloud: { value: new THREE.Vector4() }, uOff: { value: new THREE.Vector4(0.37, 0.11, 0.62, 0.48) },
      uNoise: { value: noise }, uNoise2: { value: noise2 }, uScale: { value: 1 },
    };
    // The dome is a box around the camera, drawn after everything solid, wherever nothing else was drawn.
    // Above the horizon it is sky and cloud. Below the horizon it is the far sea.
    this.dome = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.u, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
    }));
    this.dome.frustumCulled = false; this.dome.renderOrder = 900;
    scene.add(this.dome);
    // A soft round glow, kept for lamps and fires elsewhere in the game.
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(cv);
    // Stars: mostly faint, a few bright, a few colored, thicker along the Milky Way.
    const rng = mulberry32(7), sp = [], sa = [], sc = [];
    const mw = new THREE.Vector3(0.5145, 0.3274, -0.7925), v = new THREE.Vector3();
    for (let i = 0; i < 3400; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      v.set(r * Math.cos(th), u, r * Math.sin(th));
      if (i > 2000) v.addScaledVector(mw, -v.dot(mw) * (0.6 + 0.35 * rng())).normalize();   // pull toward the band
      if (v.y < 0.01) continue;
      const b = Math.pow(rng(), 7), tint = rng();
      sp.push(v.x, v.y, v.z);
      sa.push(1.5 + 2.6 * b + (i > 2000 ? -0.3 : 0), rng() * 6.28, 1.2 + rng() * 3.5, (i > 2000 ? 0.3 : 0.42) + 0.75 * b);
      if (tint < 0.09) sc.push(1.0, 0.72, 0.5); else if (tint < 0.16) sc.push(1.0, 0.9, 0.68); else if (tint < 0.3) sc.push(0.7, 0.8, 1.0); else sc.push(0.9, 0.93, 1.0);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('aStar', new THREE.Float32BufferAttribute(sa, 4));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -10; scene.add(this.stars);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc2 = this.sun.shadow.camera; sc2.left = -34; sc2.right = 34; sc2.top = 34; sc2.bottom = -34; sc2.near = 20; sc2.far = 260;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05; this.sun.shadow.radius = 2.5;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xbcd3e2, 90, 430);
    this.sunDir = new THREE.Vector3();
    this._size = new THREE.Vector2();
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
    // Clouds drift with the wind. The offsets only ever grow by small steps, so a change of wind never makes them jump.
    this.time += dt;
    const w = this.cur.wind * dt, o = this.u.uOff.value;
    o.x += w * 0.0046; o.y += w * 0.0017; o.z += w * 0.0011; o.w += w * 0.0004;
    this.u.uMisc.value.w = this.time;
    this.u.uScale.value = this.renderer.getDrawingBufferSize(this._size).y / 720;
    // Keep the shadow box centered on the player. The dome and stars follow the camera by themselves.
    // The shadow box moves only in whole shadow-map pixels, seen from the sun, so shadow edges stay put while
    // the player walks instead of crawling.
    const sc = this.sun.shadow.camera, texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x, z = this.sunDir;
    _sx.set(0, 1, 0).cross(z); if (_sx.lengthSq() < 1e-6) _sx.set(1, 0, 0); _sx.normalize(); _sy.copy(z).cross(_sx);
    const a = Math.round(focus.dot(_sx) / texel) * texel, b = Math.round(focus.dot(_sy) / texel) * texel, c = focus.dot(z);
    _sf.copy(_sx).multiplyScalar(a).addScaledVector(_sy, b).addScaledVector(z, c);
    this.sun.target.position.copy(_sf);
    this.sun.position.copy(_sf).addScaledVector(this.sunDir, 130);
    if (sea) { sea.mat.color.copy(this.cur.sea); if (sea.link && sea.sky !== this) sea.link(this); }
  }
  apply() {
    const c = this.cur, u = this.u;
    u.uTop.value.copy(c.top); u.uBot.value.copy(c.bot); u.uAnti.value.copy(c.anti); u.uGlow.value.copy(c.glow);
    u.uCl.value.copy(c.cl).multiplyScalar(c.clK); u.uCs.value.copy(c.cs); u.uSea.value.copy(c.sea);
    u.uLight.value.copy(c.sun).multiplyScalar(c.sunI); u.uHemi.value.copy(c.hemiSky).multiplyScalar(c.hemiI); u.uHemiGnd.value.copy(c.hemiGnd).multiplyScalar(c.hemiI);
    u.uFog.value.copy(c.fog); u.uHzSun.value.copy(c.hzSun); u.uHzAnti.value.copy(c.hzAnti);
    u.uFogP.value.set(c.fogN, c.fogF, c.haze);
    const el = c.sunEl, az = c.sunAz;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    u.uMisc.value.set(c.stars, c.moon, clamp(c.sunI, 0, 1), this.time);
    u.uCloud.value.set(c.cov, c.cir, 0, 0);
    this.stars.visible = c.stars > 0.01;
    this.sun.color.copy(c.sun); this.sun.intensity = c.sunI; this.sun.castShadow = c.sunI > 0.05;
    // Indoors (this.indoor, 0 to 1, set by the game) less of the sky's light reaches anything, and the eye opens up:
    // the room stays readable and the street seen through the door goes bright.
    const ind = this.indoor || 0;
    this.hemi.color.copy(c.hemiSky); this.hemi.groundColor.copy(c.hemiGnd); this.hemi.intensity = c.hemiI * (1 - 0.5 * ind);
    this.scene.fog.color.copy(c.fog); this.scene.fog.near = c.fogN; this.scene.fog.far = c.fogF;
    this.renderer.toneMappingExposure = c.exp * (1 + 0.3 * ind) * (1 + (this.flash || 0));   // flash: lightning (game.lightning)
  }
}
