// Realistic surfaces for the kit models: plaster, roof tile, cut stone, marble, timber, pottery,
// bronze, cloth and rock. The models keep their shapes. Each one arrives with a vertex color
// (palette color times baked ambient occlusion) and a "uv" attribute that is not a picture
// coordinate: uv.x holds the palette index of the face and uv.y the occlusion multiplier.
//
// prepare() works out, once per model, what every triangle is made of, lays picture coordinates
// over it (in meters, in the model's own space, so patterns stay fixed to the model), gives round
// things smooth normals and boxes hard edges, and stores a surface type per vertex.
// The material is one lit three.js material. Its shader reads a small stack of pattern pictures
// built here at startup (one layer per kind of surface: slopes for the lighting, tone, joints),
// plus one low-detail noise picture laid over the world for stains and weathering.
import * as THREE from 'three';
import { getNoise } from './world.js';
import { mulberry32 } from './util.js';

const N = 256;                         // pattern pictures are N by N
const LAYERS = ['plaster', 'mudbrick', 'ashlar', 'rubble', 'marble', 'fluted', 'roof', 'planks', 'timber', 'pottery', 'metal', 'cloth', 'rock', 'slabs', 'fiber', 'plain'];
const LAYER = {}; LAYERS.forEach((n, i) => { LAYER[n] = i; });
// How many meters one repeat of each picture covers: [across, up].
const LAYER_SIZE = { plaster: [2, 2], mudbrick: [2, 2], ashlar: [2.4, 2], rubble: [2, 2], marble: [2, 2], fluted: [0.4, 2], roof: [1.2, 0.9], planks: [2, 0.8], timber: [2, 0.5], pottery: [0.6, 1], metal: [0.5, 0.5], cloth: [0.25, 0.25], rock: [3, 3], slabs: [2, 2], fiber: [0.6, 0.6], plain: [1, 1] };

// The kit's palette, in the order kitlib.py numbers it.
const PAL = [['whitewash', 'e8dfcf'], ['plaster', 'd9c4a3'], ['mudbrick', 'b89b78'], ['stone', 'a89f91'], ['dstone', '6f675c'], ['marble', 'efe9dc'], ['paving', 'b9ae9c'],
  ['tile', 'ad5e44'], ['dtile', '87493a'], ['wood', '6b4a32'], ['dwood', '4a3423'], ['rope', 'c2a468'], ['bronze', 'a8733a'], ['patina', '5f8f7a'], ['dpatina', '4d7a69'], ['gold', 'd9a93c'], ['iron', '3b3835'],
  ['olive', '7d8f5a'], ['lolive', '8fa06a'], ['dolive', '6f8250'], ['cypress', '2f4f3a'], ['pine', '3f6b3f'], ['trunk', '5a4634'],
  ['red', 'a33b2e'], ['blue', '2f5f7a'], ['saffron', 'd1a23a'], ['cream', 'e6dcc0'], ['papyrus', 'e3d5a8'], ['clay', 'b86a45'], ['glaze', '2a2522'], ['wool', 'e9e2d0'], ['flame', 'ffb347'], ['core', 'fff0b0'], ['pink', 'c68f7f']];
const PAL_LIN = PAL.map(([, h]) => { const c = new THREE.Color('#' + h); return [c.r, c.g, c.b]; });
const PAL_ID = {}; PAL.forEach(([n], i) => { PAL_ID[n] = i; });

const HOUSES = new Set(['house_a', 'house_b', 'house_c', 'courtyard_house', 'warehouse', 'hut', 'school', 'workshop']);
const TEMPLES = new Set(['stoa', 'shrine']);
const PALACE = new Set(['palace_hall', 'palace_wall']);
const WALLS = new Set(['wall_seg', 'wall_tower', 'gate']);
const SHIPS = new Set(['ship_merchant', 'ship_trireme', 'boat_small']);
const ROCKS = new Set(['rock_a', 'rock_b', 'rock_c', 'cliff_a', 'cave_mouth']);
const POTS = new Set(['amphora', 'amphora_group', 'pithos', 'stall_a', 'table_low', 'stall_c', 'net_rack']);
const PLANTS = new Set(['olive_a', 'olive_b', 'cypress_a', 'cypress_b', 'pine_a', 'bush_a', 'bush_b', 'grass_tuft']);
const COLUMNED = new Set(['stoa', 'shrine', 'courtyard_house', 'column_single']);

// ---------------------------------------------------------------- surface types
// A type is a pattern layer plus the numbers the shader needs to color and light it.
//   map     how picture coordinates are laid on: box (flat sides), slope (down a roof), grain (along a piece), cyl (around a pot)
//   crease  faces that meet at less than this angle are shaded as one curved surface
//   blend   also smooth the baked colors across those faces (rocks, bronze)
//   cells   [across, up, brick bond 0 or 1, tone spread]: blocks or tiles per repeat that each get their own tone
//   nrm     strength of the relief    tex  how much the picture's tone shows    dark  how dark joints and cracks go
//   lowN    broad unevenness in the lighting    lowT  broad tone patches
//   wCol, wAmt, wK  weathering color and amount; wK = [gathers in joints, on upward faces, in sheltered corners, threshold]
//   lCol, lH, lAmt  color near the ground, how high it reaches in meters, and how strong; north = only on north faces
//   spec, shine     highlight strength and tightness    streak  dirt run-off below eaves and ledges
//   gate   1 = the mask (cracks) shows only in patches
const TYPE = {}, TYPE_LIST = [];
function def(name, o) {
  const L = LAYER_SIZE[o.layer || 'plain'];
  const t = Object.assign({ name, id: TYPE_LIST.length, layer: 'plain', map: 'box', su: L[0], sv: L[1], crease: 25, blend: false, cells: [0, 0, 0, 0], nrm: 1, tex: 0.6, dark: 0.3,
    lowN: 0.05, lowT: 0.2, wCol: 0x808080, wAmt: 0, wK: [0, 0, 0, 0.6], lCol: 0x6b5a40, lH: 0.01, lAmt: 0, north: 0, gate: 0, spec: 0.02, shine: 10, streak: 0.4 }, o);
  TYPE[name] = t; TYPE_LIST.push(t);
}
def('whitewash', { layer: 'plaster', gate: 1, tex: 0.45, dark: 0.45, lowN: 0.16, lowT: 0.16, wCol: 0xa8956f, wAmt: 0.4, wK: [0.3, 0, 0.3, 0.62], lCol: 0x8a7350, lH: 1.0, lAmt: 0.7, spec: 0.03, shine: 8, streak: 0.8 });
def('plaster', { layer: 'plaster', gate: 1, tex: 0.5, dark: 0.45, lowN: 0.16, lowT: 0.18, wCol: 0x8a7350, wAmt: 0.42, wK: [0.3, 0, 0.3, 0.58], lCol: 0x7a6344, lH: 1.0, lAmt: 0.7, spec: 0.02, shine: 8, streak: 0.8 });
def('paint', { layer: 'plaster', gate: 1, tex: 0.5, dark: 0.4, lowN: 0.07, lowT: 0.22, wCol: 0xcdbfa6, wAmt: 0.6, wK: [0.5, 0, 0.1, 0.72], lCol: 0x8a7350, lH: 0.4, lAmt: 0.4, spec: 0.04, shine: 12, streak: 0.7 });
def('mudbrick', { layer: 'mudbrick', cells: [4, 16, 1, 0.2], tex: 0.5, dark: 0.35, lowN: 0.08, lowT: 0.22, wCol: 0x9c8460, wAmt: 0.35, wK: [0, 0, 0.3, 0.6], lCol: 0x6e5a40, lH: 0.7, lAmt: 0.55, streak: 0.8 });
def('ashlar', { layer: 'ashlar', cells: [2, 4, 1, 0.3], tex: 0.85, dark: 0.55, lowN: 0.05, lowT: 0.22, wCol: 0x544e42, wAmt: 0.45, wK: [0.25, 0.1, 0.3, 0.6], lCol: 0x4c5a2c, lH: 1.4, lAmt: 0.6, north: 0.85, spec: 0.03, streak: 0.9 });
def('quay', { layer: 'ashlar', cells: [2, 4, 1, 0.26], tex: 0.6, dark: 0.55, lowT: 0.22, wCol: 0x544e42, wAmt: 0.4, wK: [0.25, 0, 0.3, 0.6], lCol: 0x2c3620, lH: 1.7, lAmt: 0.85, spec: 0.05, streak: 0.3 });
def('rubble', { layer: 'rubble', crease: 32, nrm: 0.5, tex: 1.0, dark: 0.0, lowT: 0.16, wCol: 0x6a6048, wAmt: 0.3, wK: [0.3, 0, 0.3, 0.62], lCol: 0x55552f, lH: 0.35, lAmt: 0.35, streak: 0.5 });
def('dressed', { layer: 'rock', su: 1.4, sv: 1.4, nrm: 0.3, tex: 0.5, dark: 0.15, lowT: 0.18, wCol: 0x8d8a60, wAmt: 0.3, wK: [0.2, 0.2, 0, 0.62], lCol: 0x5a5a34, lH: 0.3, lAmt: 0.35, spec: 0.04, streak: 0.6 });
def('marble', { layer: 'marble', crease: 50, blend: true, nrm: 0.6, tex: 1.0, dark: 0.15, lowN: 0.02, lowT: 0.1, wCol: 0x8a8068, wAmt: 0.35, wK: [0.2, 0, 0.6, 0.66], spec: 0.3, shine: 44, streak: 0.5 });
def('marbleBlock', { layer: 'ashlar', cells: [2, 4, 1, 0.07], nrm: 0.3, tex: 0.3, dark: 0.4, lowN: 0.02, lowT: 0.1, wCol: 0x8a8068, wAmt: 0.35, wK: [0.3, 0, 0.6, 0.66], lCol: 0x8a7350, lH: 0.25, lAmt: 0.3, spec: 0.22, shine: 36, streak: 0.6 });
def('fluted', { layer: 'fluted', map: 'cyl', crease: 50, tex: 0.8, dark: 0.35, lowN: 0, lowT: 0.1, wCol: 0x8a8068, wAmt: 0.3, wK: [0.3, 0, 0.5, 0.68], lCol: 0x8a7350, lH: 0.3, lAmt: 0.3, spec: 0.22, shine: 36, streak: 0.4 });
def('roof', { layer: 'roof', map: 'slope', crease: 12, cells: [8, 2, 0, 0.36], tex: 0.7, dark: 0.65, lowN: 0.03, lowT: 0.34, wCol: 0xa8a070, wAmt: 0.55, wK: [0.12, 0, 0, 0.64], spec: 0.05, shine: 14, streak: 0 });
def('planks', { layer: 'planks', map: 'grain', cells: [1, 4, 1, 0.24], tex: 0.9, dark: 0.65, lowN: 0.03, lowT: 0.2, wCol: 0x93856f, wAmt: 0.7, wK: [0, 0.2, -0.2, 0.36], lCol: 0x4a3c2a, lH: 0.3, lAmt: 0.35, spec: 0.05, shine: 14, streak: 0.3 });
def('timber', { layer: 'timber', map: 'grain', crease: 35, tex: 0.9, dark: 0.6, lowN: 0.03, lowT: 0.2, wCol: 0x93856f, wAmt: 0.7, wK: [0, 0.2, -0.2, 0.36], lCol: 0x4a3c2a, lH: 0.3, lAmt: 0.35, spec: 0.05, shine: 14, streak: 0.3 });
def('hull', { layer: 'planks', map: 'grain', crease: 42, cells: [1, 4, 1, 0.2], tex: 0.8, dark: 0.7, lowN: 0.04, lowT: 0.2, wCol: 0x8a8478, wAmt: 0.4, wK: [0, 0.3, -0.4, 0.56], lCol: 0x0d0b0a, lH: 0.55, lAmt: 0.92, spec: 0.14, shine: 22, streak: 0.5 });
def('paintwood', { layer: 'planks', map: 'grain', crease: 42, cells: [1, 4, 1, 0.14], tex: 0.6, dark: 0.6, lowT: 0.2, wCol: 0x5c4532, wAmt: 0.7, wK: [0.45, 0, 0, 0.6], spec: 0.1, shine: 20, streak: 0.5 });
def('deck', { layer: 'planks', map: 'grain', crease: 30, cells: [1, 4, 1, 0.22], tex: 0.9, dark: 0.7, lowT: 0.2, wCol: 0x8a8478, wAmt: 0.6, wK: [0, 0, 0, 0.42], spec: 0.04, streak: 0.3 });
def('bark', { layer: 'timber', map: 'grain', crease: 50, su: 1, sv: 0.6, nrm: 1.6, tex: 1.2, dark: 0.7, spec: 0 });
def('pottery', { layer: 'pottery', map: 'cyl', crease: 62, tex: 1.7, dark: 0, lowN: 0, lowT: 0.1, lCol: 0x6b5a40, lH: 0.12, lAmt: 0.5, spec: 0.16, shine: 28, streak: 0.3 });
def('glazed', { layer: 'pottery', map: 'cyl', crease: 62, tex: 0.5, dark: 0, lowN: 0, lowT: 0.05, spec: 0.55, shine: 60, streak: 0 });
def('bronze', { layer: 'metal', crease: 62, blend: true, tex: 0.6, dark: 0.25, lowN: 0.03, lowT: 0.2, wCol: 0x3f7f68, wAmt: 0.65, wK: [0.4, 0, 0.6, 0.86], spec: 0.55, shine: 40, streak: 0.5 });
def('patina', { layer: 'metal', crease: 62, blend: true, tex: 0.6, dark: 0.2, lowN: 0.03, lowT: 0.25, wCol: 0x7a5026, wAmt: 0.6, wK: [-0.6, 0.15, -0.6, 0.42], spec: 0.35, shine: 30, streak: 0.5 });
def('gold', { layer: 'metal', crease: 62, blend: true, tex: 0.35, dark: 0.15, lowN: 0.02, lowT: 0.1, spec: 0.85, shine: 55, streak: 0.2 });
def('iron', { layer: 'metal', crease: 50, tex: 0.6, dark: 0.3, lowT: 0.2, wCol: 0x6a3418, wAmt: 0.6, wK: [0.3, 0, 0.2, 0.52], spec: 0.25, shine: 20 });
def('cloth', { layer: 'cloth', crease: 48, blend: true, tex: 0.9, dark: 0.25, lowN: 0.12, lowT: 0.24, wCol: 0x9a8d78, wAmt: 0.3, wK: [0, 0.2, 0.2, 0.62], spec: 0, streak: 0.3 });
def('sack', { layer: 'cloth', su: 0.5, sv: 0.5, crease: 48, blend: true, tex: 1.0, dark: 0.3, lowN: 0.12, lowT: 0.24, spec: 0, streak: 0.3 });
def('rock', { layer: 'rock', crease: 56, blend: true, tex: 1.0, dark: 0.4, lowN: 0.1, lowT: 0.3, wCol: 0x9a946c, wAmt: 0.35, wK: [0, 0.25, 0, 0.6], lCol: 0x56602f, lH: 0.6, lAmt: 0.45, north: 0.5, spec: 0.02, streak: 0.5 });
// Rocks made in code (rocks.js): the same stone, with the edges between broken faces kept sharp.
def('rockcut', { layer: 'rock', crease: 30, blend: true, tex: 1.0, dark: 0.4, lowN: 0.1, lowT: 0.3, wCol: 0x9a946c, wAmt: 0.35, wK: [0, 0.25, 0, 0.6], lCol: 0x56602f, lH: 0.6, lAmt: 0.45, north: 0.5, spec: 0.02, streak: 0.5 });
// The walls of the cave: the same stone, darker, slightly damp, with no lichen or weather streaks (nothing grows in the dark).
def('caverock', { layer: 'rock', crease: 50, blend: true, tex: 1.0, dark: 0.5, lowN: 0.12, lowT: 0.3, wCol: 0x4a3a2c, wAmt: 0.2, wK: [0, 0.25, 0, 0.6], lCol: 0x2a2018, lH: 0.5, lAmt: 0.35, spec: 0.08, shine: 16, streak: 0.35 });
def('slabs', { layer: 'slabs', tex: 0.8, dark: 0.2, lowN: 0.04, lowT: 0.22, wCol: 0xa8946c, wAmt: 0.8, wK: [1.0, 0, 0.2, 0.86], spec: 0.07, shine: 22, streak: 0.3 });
def('fiber', { layer: 'fiber', map: 'grain', crease: 45, tex: 1.0, dark: 0.45, spec: 0 });
def('thatch', { layer: 'fiber', map: 'slope', crease: 45, su: 1.2, sv: 1.2, nrm: 1.4, tex: 1.0, dark: 0.5, lowT: 0.3, wCol: 0x7a7466, wAmt: 0.55, wK: [0.2, 0, 0, 0.5], spec: 0 });
def('plain', { layer: 'plain', crease: 40, tex: 0.5, dark: 0, lowN: 0.02, lowT: 0.1, spec: 0.02, streak: 0.2 });
def('leaf', { layer: 'plain', crease: 60, blend: true, tex: 0.6, dark: 0, lowN: 0, lowT: 0.2, spec: 0, streak: 0 });
def('dark', { layer: 'plain', tex: 0, dark: 0, lowN: 0, lowT: 0, spec: 0, streak: 0 });
// Inside a house (the schoolroom): limewashed walls that no rain reaches, and a floor of beaten earth.
def('inwall', { layer: 'plaster', gate: 1, tex: 0.4, dark: 0.3, lowN: 0.1, lowT: 0.14, lCol: 0x8a7350, lH: 0.5, lAmt: 0.35, spec: 0.02, shine: 8, streak: 0 });
def('earthfloor', { layer: 'plain', crease: 40, tex: 0.5, dark: 0.12, lowN: 0.1, lowT: 0.3, spec: 0, streak: 0 });
const NT = TYPE_LIST.length;

// What a palette color means on a given model. Names ending in ? are settled per connected piece.
function classify(asset, pal) {
  if (asset === 'school' || asset === 'workshop') { if (pal === 'cream' || (pal === 'plaster' && asset === 'school')) return 'inwall'; if (pal === 'mudbrick') return 'earthfloor'; }
  switch (pal) {
    case 'whitewash': return 'whitewash';
    case 'plaster': return HOUSES.has(asset) || TEMPLES.has(asset) ? 'plaster' : 'plain';
    case 'mudbrick': return PALACE.has(asset) || asset === 'warehouse' ? 'mudbrick' : SHIPS.has(asset) ? 'deck?' : asset === 'crate_stack' ? 'wood?' : asset === 'sacks' ? 'sack' : asset === 'net_rack' ? 'fiber' : 'plain';
    case 'stone': case 'dstone':
      return ROCKS.has(asset) ? 'rock' : HOUSES.has(asset) || asset === 'well' ? 'rubble' : WALLS.has(asset) || TEMPLES.has(asset) || PALACE.has(asset) || asset === 'bema' ? 'ashlar' : 'dressed';
    case 'paving':
      return ROCKS.has(asset) ? 'rock' : WALLS.has(asset) ? 'ashlar' : HOUSES.has(asset) || TEMPLES.has(asset) || PALACE.has(asset) ? 'slabs' : asset === 'statue_goddess' ? 'marble' : 'dressed';
    case 'marble': return SHIPS.has(asset) ? 'plain' : TEMPLES.has(asset) || asset === 'courtyard_house' || asset === 'column_single' ? 'marble?' : 'marble';
    case 'tile': case 'dtile': return 'roof';
    case 'wood': case 'dwood': return PLANTS.has(asset) ? 'bark' : 'wood?';
    case 'trunk': return PLANTS.has(asset) ? 'bark' : 'fiber';
    case 'rope': return asset === 'hut' ? 'thatch' : asset === 'sacks' ? 'sack' : asset === 'grass_tuft' ? 'leaf' : 'fiber';
    case 'bronze': return 'bronze';
    case 'patina': case 'dpatina': return 'patina';
    case 'gold': return 'gold';
    case 'iron': return 'iron';
    case 'red': case 'blue': case 'saffron': case 'cream':
      if (TEMPLES.has(asset) || PALACE.has(asset) || HOUSES.has(asset) || asset === 'well') return 'paint';
      if (SHIPS.has(asset)) return pal === 'cream' ? 'cloth' : 'paintwood?';
      return 'cloth';
    case 'clay': return 'pottery';
    case 'glaze': return POTS.has(asset) ? 'glazed' : 'dark';
    case 'papyrus': case 'wool': return 'plain';
    case 'olive': case 'lolive': case 'dolive': case 'cypress': case 'pine': case 'pink': return 'leaf';
    default: return 'plain';
  }
}

// ---------------------------------------------------------------- pattern pictures
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
// Each vertex's own height in its model (for the grime at the foot of a wall and the light bounced up from the ground),
// kept as its own value so that it survives when the kit merges models into one shape in world space (kit.build).
function addY(g) {
  if (g.attributes.aY) return;
  const P = g.attributes.position.array, n = g.attributes.position.count, y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = P[i * 3 + 1];
  g.setAttribute('aY', new THREE.BufferAttribute(y, 1));
}

// Builds every pattern layer. Each layer is a height field in meters, a tone (0.5 is neutral) and
// a mask (joints, cracks, gaps, paint). The height becomes two slope channels for the lighting.
function buildLayers() {
  const NN = N * N, rng = mulberry32(977), F = () => new Float32Array(NN);
  // Smooth noise that repeats, pu cells across and pv cells up, values 0 to 1.
  const X0 = new Int32Array(N), X1 = new Int32Array(N), FX = new Float32Array(N);
  const vn = (pu, pv) => {
    const L = new Float32Array(pu * pv); for (let i = 0; i < L.length; i++) L[i] = rng();
    const o = F();
    for (let i = 0; i < N; i++) { const x = i / N * pu, x0 = Math.floor(x), f = x - x0; X0[i] = x0; X1[i] = (x0 + 1) % pu; FX[i] = f * f * (3 - 2 * f); }
    for (let j = 0, k = 0; j < N; j++) {
      const y = j / N * pv, y0 = Math.floor(y), r0 = y0 * pu, r1 = ((y0 + 1) % pv) * pu; let fy = y - y0; fy = fy * fy * (3 - 2 * fy);
      for (let i = 0; i < N; i++, k++) {
        const a = L[r0 + X0[i]], c = L[r1 + X0[i]], fx = FX[i], top = a + (L[r0 + X1[i]] - a) * fx, bot = c + (L[r1 + X1[i]] - c) * fx;
        o[k] = top + (bot - top) * fy;
      }
    }
    return o;
  };
  // Several sizes of that noise added together. Each distinct kind is worked out once. A variant
  // is the same field slid sideways, which is as good as a fresh one and costs almost nothing.
  const bank = new Map();
  const fb = (pu, pv, oct, variant = 0) => {
    const key = pu + '_' + pv + '_' + oct; let base = bank.get(key);
    if (!base) {
      base = F(); let amp = 1, tot = 0, a = pu, b = pv;
      for (let k = 0; k < oct; k++) { const f = vn(Math.min(a, N / 2), Math.min(b, N / 2)); for (let i = 0; i < NN; i++) base[i] += f[i] * amp; tot += amp; amp *= 0.5; a *= 2; b *= 2; }
      for (let i = 0; i < NN; i++) base[i] /= tot;
      bank.set(key, base);
    }
    if (!variant) return base;
    const o = F(), dx = (variant * 67) % N, dy = (variant * 101) % N;
    for (let j = 0; j < N; j++) { const s = ((j + dy) % N) * N, d = j * N; o.set(base.subarray(s + dx, s + N), d); o.set(base.subarray(s, s + dx), d + N - dx); }
    return o;
  };
  const turned = (f) => { const o = F(); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) o[j * N + i] = f[i * N + j]; return o; };
  // Scattered points: distance to the nearest and second nearest, and a random number per point.
  // pu points across and pv up; with more up than across the cells come out wider than tall.
  // Distances are in units of one cell's width.
  const worley = (pu, pv) => {
    const px = new Float32Array(pu * pv), py = new Float32Array(pu * pv), pr = new Float32Array(pu * pv), sq = pu / pv;
    for (let i = 0; i < pu * pv; i++) { px[i] = rng(); py[i] = rng(); pr[i] = rng(); }
    const f1 = F(), f2 = F(), id = F();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i / N * pu, y = j / N * pv, xi = Math.floor(x), yi = Math.floor(y); let a = 9, b = 9, r = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx, cy = yi + dy, h = ((cy + pv) % pv) * pu + ((cx + pu) % pu), ex = cx + px[h] - x, ey = (cy + py[h] - y) * sq, d = ex * ex + ey * ey;
        if (d < a) { b = a; a = d; r = pr[h]; } else if (d < b) b = d;
      }
      const k = j * N + i; f1[k] = Math.sqrt(a); f2[k] = Math.sqrt(b); id[k] = r;
    }
    return { f1, f2, id };
  };
  // A thin wandering line, about `width` pixels wide, where a smooth noise crosses its middle value.
  // The gate (another noise, with two thresholds) leaves it in some places and takes it out in others.
  const lines = (f, width, gate, g0, g1) => {
    const o = F();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, gt = gate ? sstep(g0, g1, gate[k]) : 1; if (gt <= 0) continue;
      const gx = (f[j * N + ((i + 1) % N)] - f[j * N + ((i + N - 1) % N)]) * 0.5, gy = (f[((j + 1) % N) * N + i] - f[((j + N - 1) % N) * N + i]) * 0.5;
      o[k] = (1 - sstep(width * 0.45, width, Math.abs(f[k] - 0.5) / Math.max(1e-5, Math.hypot(gx, gy)))) * gt;
    }
    return o;
  };
  // Cracks: a few jagged lines that wander mostly one way (angle 0 is across, a quarter turn is up) and fork now and then.
  const cracks = (count, len, wobble, angle) => {
    const o = F();
    const plot = (x, y, a) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const k = (((yi + dy) % N + N) % N) * N + (((xi + dx) % N + N) % N); o[k] = Math.min(1, o[k] + (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * a); } };
    const walk = (x, y, ang, n, depth) => {
      for (let i = 0; i < n; i++) {
        plot(x, y, 1.5 * Math.min(1, (n - i) / 14, (i + 3) / 10));
        x += Math.cos(ang) * 0.7; y += Math.sin(ang) * 0.7; ang += (rng() - 0.5) * wobble;
        if (depth < 2 && rng() < 0.012) walk(x, y, ang + (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.6), n * 0.35, depth + 1);
      }
    };
    for (let c = 0; c < count; c++) walk(rng() * N, rng() * N, angle + (rng() - 0.5) * 0.9, len * (0.6 + 0.8 * rng()), 0);
    return o;
  };
  const each = (fn) => { const h = F(), tone = F(), mask = F(); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) fn(i / N, j / N, j * N + i, h, tone, mask); return { h, tone, mask }; };
  const rand = (n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rng(); return a; };
  const out = {};

  { // Lime plaster: trowel unevenness, lumps, grain, and a few hairline cracks.
    const a = fb(3, 3, 4), b = fb(12, 12, 3), c = fb(48, 48, 2), ck = cracks(5, 120, 0.45, 1.5708);
    out.plaster = each((u, v, k, h, tone, mask) => {
      h[k] = 0.016 * (a[k] - 0.5) + 0.005 * (b[k] - 0.5) + 0.0013 * (c[k] - 0.5) - 0.0008 * ck[k];
      tone[k] = 0.5 + 0.3 * (b[k] - 0.5) + 0.2 * (c[k] - 0.5); mask[k] = ck[k];
    });
  }
  { // Mudbrick: courses of sun-dried brick, part of the wall still under a skin of mud render.
    const n1 = fb(12, 12, 3, 1), n2 = fb(48, 48, 2, 1), cov = fb(3, 3, 4, 1), rb = rand(5 * 16);
    out.mudbrick = each((u, v, k, h, tone, mask) => {
      const v16 = v * 16, row = Math.floor(v16), fv = v16 - row, uu = u * 4 + 0.5 * (row & 1), col = Math.floor(uu), fu = uu - col;
      const d = Math.min(Math.min(fu, 1 - fu) * 0.5, Math.min(fv, 1 - fv) * 0.125), jm = 1 - sstep(0.003, 0.011, d), cover = sstep(0.5, 0.6, cov[k]);
      const brick = 0.007 * sstep(0, 0.02, d) + 0.004 * (rb[row * 5 + (col % 5)] - 0.5) + 0.007 * (n1[k] - 0.5) + 0.002 * (n2[k] - 0.5);
      h[k] = brick * (1 - cover) + (0.009 + 0.005 * (n1[k] - 0.5) + 0.0015 * (n2[k] - 0.5)) * cover;
      tone[k] = 0.5 + 0.3 * (n1[k] - 0.5) + 0.25 * (n2[k] - 0.5) + 0.06 * cover; mask[k] = jm * (1 - cover);
    });
  }
  { // Cut stone: courses of blocks with recessed joints, tooled faces, worn edges.
    const nb = fb(12, 12, 3, 2), nc = fb(48, 48, 2, 2), ne = fb(24, 24, 2), rb = rand(3 * 4);
    out.ashlar = each((u, v, k, h, tone, mask) => {
      const v4 = v * 4, row = Math.floor(v4), fv = v4 - row, uu = u * 2 + 0.5 * (row & 1), col = Math.floor(uu), fu = uu - col;
      const d = Math.min(Math.min(fu, 1 - fu) * 1.2, Math.min(fv, 1 - fv) * 0.5), d2 = Math.max(0, d + 0.02 * (ne[k] - 0.5));
      h[k] = 0.014 * sstep(0, 0.03, d2) + 0.01 * (nb[k] - 0.5) + 0.004 * (nc[k] - 0.5) + 0.006 * (rb[row * 3 + (col % 3)] - 0.5);
      tone[k] = 0.5 + 0.32 * (nb[k] - 0.5) + 0.25 * (nc[k] - 0.5); mask[k] = 1 - sstep(0.004, 0.016, d2);
    });
  }
  { // Rubble masonry: rough field stones bedded in pale mortar.
    const w = worley(7, 13), n = fb(24, 24, 2, 1), c = fb(48, 48, 2, 3), b = fb(12, 12, 3, 7);
    out.rubble = each((u, v, k, h, tone, mask) => {
      const e = w.f2[k] - w.f1[k] + 0.05 * (n[k] - 0.5), stone = sstep(0.03, 0.11, e);
      h[k] = (0.009 + 0.012 * (w.id[k] - 0.5)) * stone + 0.01 * (n[k] - 0.5) + 0.003 * (c[k] - 0.5);
      tone[k] = 0.5 + (0.4 * (w.id[k] - 0.5) + 0.3 * (n[k] - 0.5) + 0.2 * (c[k] - 0.5) + 0.2 * (b[k] - 0.5)) * stone + (0.13 + 0.2 * (c[k] - 0.5)) * (1 - stone); mask[k] = 1 - sstep(0.02, 0.09, e);
    });
  }
  { // Marble: nearly smooth, clouded, with soft grey veins.
    const a = fb(3, 3, 4, 2), wv = fb(4, 4, 3, 2), g = fb(48, 48, 2, 4), vf = fb(4, 4, 3, 3), v2 = fb(3, 3, 4, 3);
    out.marble = each((u, v, k, h, tone, mask) => {
      const r = Math.abs(vf[k] + 0.3 * (a[k] - 0.5) - 0.5), r2 = Math.abs(v2[k] - 0.5), ln = (1 - sstep(0, 0.022, r)) * (0.35 + 0.65 * wv[k]) + 0.5 * (1 - sstep(0, 0.008, r2));
      h[k] = 0.0006 * (g[k] - 0.5) - 0.0004 * ln; tone[k] = 0.5 + 0.14 * (a[k] - 0.5) - 0.2 * ln + 0.05 * (g[k] - 0.5); mask[k] = Math.min(1, ln) * 0.6;
    });
  }
  { // Fluted column shaft: four hollow flutes per repeat, a drum joint every meter.
    const g = fb(4, 4, 3, 4), f = fb(48, 48, 2, 5);
    out.fluted = each((u, v, k, h, tone, mask) => {
      const x = 2 * fract(u * 4) - 1, hollow = 1 - x * x, dj = Math.min(fract(v * 2), 1 - fract(v * 2)) * 1.0, jm = 1 - sstep(0.002, 0.008, dj);
      h[k] = -0.018 * hollow - 0.004 * jm + 0.0006 * (f[k] - 0.5);
      tone[k] = 0.56 - 0.16 * hollow + 0.12 * (g[k] - 0.5) + 0.05 * (f[k] - 0.5); mask[k] = Math.min(1, jm + 0.45 * hollow * sstep(0.45, 0.7, g[k]));
    });
  }
  { // Roof tiles: half-round cover tiles over flat pans, each row lapping the one below.
    const n = fb(24, 24, 2, 2), f = fb(48, 48, 2, 6), rc = rand(64), rp = rand(64);
    out.roof = each((u, v, k, h, tone, mask) => {
      const cu = u * 4, col = Math.floor(cu), fu = cu - col, rv = v * 2, row = Math.floor(rv), fv = rv - row, q = (row * 4 + col) * 2;
      const xc = fu - 0.25 - 0.014 * (rc[q] - 0.5), hw = 0.235 - 0.035 * fv; let hh, m = sstep(0.9, 0.985, fv) * 0.9, t = 0.5;
      if (Math.abs(xc) < hw) { const s = xc / hw; hh = 0.05 * Math.sqrt(1 - s * s) + 0.022 * (1 - fv) + 0.005 * (rc[q + 1] - 0.5); }
      else {
        let xp = fu - 0.75; if (xp < -0.5) xp += 1;
        hh = 0.016 * (xp / 0.28) * (xp / 0.28) + 0.02 * (1 - fv) + 0.005 * (rp[q + 1] - 0.5);
        m = Math.max(m, (1 - sstep(0, 0.035, Math.abs(xc) - hw)) * 0.7); t -= 0.1 * Math.exp(-(xp / 0.12) * (xp / 0.12));
      }
      h[k] = hh + 0.003 * (n[k] - 0.5); tone[k] = t + 0.3 * (n[k] - 0.5) + 0.2 * (f[k] - 0.5) - 0.07 * (1 - fv); mask[k] = m;
    });
  }
  const grain = (variant) => { const g = fb(4, 64, 3, variant), w = fb(3, 6, 2, variant), o = F(); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; o[k] = 0.6 * g[k] + 0.4 * (0.5 + 0.5 * Math.sin(6.2832 * (j / N * 30 + 2.5 * w[k]))); } return o; };
  { // Planks: four boards per repeat with grooves between them, butt joints, grain and nail heads.
    const gr = grain(0), bl = fb(2, 8, 2);
    out.planks = each((u, v, k, h, tone, mask) => {
      const v4 = v * 4, row = Math.floor(v4), fv = v4 - row, fu = fract(u + 0.5 * (row & 1)), dv = Math.min(fv, 1 - fv) * 0.2, du = Math.min(fu, 1 - fu) * 2.0;
      const jm = Math.max(1 - sstep(0.0015, 0.006, dv), 1 - sstep(0.001, 0.005, du));
      const nail = du > 0.02 && du < 0.06 ? (1 - sstep(0.0, 0.3, Math.hypot((du - 0.04) / 0.012, (Math.abs(fv - 0.5) - 0.28) / 0.07))) : 0;
      h[k] = 0.0013 * (gr[k] - 0.5) - 0.004 * jm + 0.0015 * (1 - (2 * fv - 1) * (2 * fv - 1)) - 0.001 * nail;
      tone[k] = 0.5 + 0.6 * (gr[k] - 0.5) + 0.14 * (bl[k] - 0.5) - 0.3 * nail; mask[k] = Math.max(jm, nail * 0.6);
    });
  }
  { // Timber: grain and a few drying cracks along the length, no board joints.
    const gr = grain(1), ck = lines(fb(2, 28, 2), 1.0, fb(2, 2, 2, 1), 0.52, 0.62), bl = fb(2, 8, 2, 1);
    out.timber = each((u, v, k, h, tone, mask) => {
      h[k] = 0.0016 * (gr[k] - 0.5) - 0.003 * ck[k]; tone[k] = 0.5 + 0.6 * (gr[k] - 0.5) + 0.14 * (bl[k] - 0.5); mask[k] = ck[k];
    });
  }
  { // Pottery: throwing rings and painted bands. One repeat runs from the foot to the lip.
    const n = fb(12, 12, 3, 3), r = fb(6, 40, 2);
    out.pottery = each((u, v, k, h, tone, mask) => {
      const band = (a, b) => sstep(a - 0.004, a + 0.004, v) * (1 - sstep(b - 0.004, b + 0.004, v));
      const tri = Math.abs(fract(u * 8) - 0.5) * 2, zig = 1 - sstep(0.007, 0.013, Math.abs(v - (0.545 + 0.07 * tri)));
      const paint = Math.min(1, band(0.655, 0.7) + band(0.725, 0.74) + band(0.5, 0.513) + band(0.18, 0.2) + zig);
      h[k] = 0.0004 * Math.sin(6.2832 * v * 46) + 0.0006 * (r[k] - 0.5); tone[k] = 0.5 + 0.12 * (n[k] - 0.5) - 0.42 * paint; mask[k] = paint;
    });
  }
  { // Metal: cast and hammered, with hollows where patina gathers.
    const w = worley(12, 12), a = fb(24, 24, 2, 3), b = fb(4, 4, 3, 5);
    out.metal = each((u, v, k, h, tone, mask) => {
      const dim = sstep(0, 0.5, w.f1[k]);
      h[k] = 0.0012 * dim + 0.0008 * (a[k] - 0.5); tone[k] = 0.5 + 0.3 * (b[k] - 0.5) + 0.12 * (dim - 0.5) + 0.1 * (a[k] - 0.5); mask[k] = Math.min(1, Math.max(0, 0.5 * (1 - dim) + 1.6 * (b[k] - 0.42)));
    });
  }
  { // Cloth: a plain weave, 64 threads each way, with thicker and thinner threads.
    const ta = rand(64), tb = rand(64), sl = fb(3, 40, 2), sl2 = turned(fb(3, 40, 2, 1));
    out.cloth = each((u, v, k, h, tone, mask) => {
      const a = Math.floor(u * 64), b = Math.floor(v * 64), sa = Math.sin(Math.PI * fract(u * 64)), sb = Math.sin(Math.PI * fract(v * 64)), over = (a + b) & 1;
      h[k] = 0.0009 * (over ? sa * (0.55 + 0.45 * sb) : sb * (0.55 + 0.45 * sa));
      tone[k] = 0.5 + 0.2 * ((over ? ta[a] : tb[b]) - 0.5) + 0.16 * (Math.min(sa, sb) - 0.6) + 0.16 * (sl[k] - 0.5) + 0.16 * (sl2[k] - 0.5); mask[k] = (1 - sa * sb) * 0.5;
    });
  }
  { // Rock: broken, layered, cracked.
    const a = fb(3, 3, 4, 4), b = fb(12, 12, 3, 4), s = fb(2, 14, 3), f = fb(48, 48, 2, 7);
    out.rock = each((u, v, k, h, tone, mask) => {
      const r = 1 - Math.abs(2 * a[k] - 1);
      h[k] = 0.06 * (r - 0.5) + 0.022 * (b[k] - 0.5) + 0.014 * (s[k] - 0.5) + 0.004 * (f[k] - 0.5);
      tone[k] = 0.5 + 0.4 * (b[k] - 0.5) + 0.3 * (s[k] - 0.5) + 0.22 * (f[k] - 0.5); mask[k] = sstep(0.55, 0.2, r) * 0.6;
    });
  }
  { // Paving slabs: seven worn slabs per repeat. The edge of the repeat is a joint too.
    const n = fb(12, 12, 3, 5), f = fb(48, 48, 2, 8), e = fb(24, 24, 2, 4), pit = fb(48, 48, 2, 9), ck = cracks(2, 90, 0.5, 0.6);
    const rows = [0, 0.36, 0.68, 1], cuts = [[0, 0.45, 1], [0, 0.3, 0.72, 1], [0, 0.55, 1]], rs = rand(40);
    out.slabs = each((u, v, k, h, tone, mask) => {
      let r = 0; while (r < 2 && v >= rows[r + 1]) r++;
      const cs = cuts[r]; let c = 0; while (c < cs.length - 2 && u >= cs[c + 1]) c++;
      const lu = (u - cs[c]) / (cs[c + 1] - cs[c]), lv = (v - rows[r]) / (rows[r + 1] - rows[r]), q = (r * 3 + c) * 4;
      const d = Math.min(Math.min(u - cs[c], cs[c + 1] - u), Math.min(v - rows[r], rows[r + 1] - v)) * 2.0, d2 = Math.max(0, d + 0.016 * (e[k] - 0.5));
      h[k] = 0.013 * sstep(0, 0.05, d2) + 0.008 * ((rs[q] - 0.5) * (lu - 0.5) + (rs[q + 1] - 0.5) * (lv - 0.5)) + 0.005 * (n[k] - 0.5) + 0.0015 * (f[k] - 0.5) - 0.003 * sstep(0.68, 0.8, pit[k]) - 0.002 * ck[k];
      tone[k] = 0.5 + 0.36 * (rs[q + 2] - 0.5) + 0.26 * (n[k] - 0.5) + 0.2 * (f[k] - 0.5) - 0.1 * sstep(0.68, 0.8, pit[k]) - 0.12 * ck[k]; mask[k] = 1 - sstep(0.004, 0.016, d2);
    });
  }
  { // Straw, rope, wicker: fine strands running up the picture, laid in two overlapping courses.
    const s1 = fb(80, 3, 2), s2 = fb(24, 2, 2);
    out.fiber = each((u, v, k, h, tone, mask) => {
      const fv = fract(v * 2), edge = sstep(0.9, 0.98, fv);
      h[k] = 0.004 * (s1[k] - 0.5) + 0.007 * (s2[k] - 0.5) + 0.012 * (1 - fv);
      tone[k] = 0.5 + 0.55 * (s1[k] - 0.5) + 0.35 * (s2[k] - 0.5) - 0.12 * (1 - fv); mask[k] = Math.min(1, sstep(0.42, 0.25, s2[k]) * 0.7 + edge);
    });
  }
  { // Plain: only a faint grain.
    const a = fb(24, 24, 2, 5), b = fb(12, 12, 3, 6);
    out.plain = each((u, v, k, h, tone) => { h[k] = 0.0005 * (a[k] - 0.5); tone[k] = 0.5 + 0.14 * (b[k] - 0.5) + 0.08 * (a[k] - 0.5); });
  }

  // Pack: red and green the slope of the height across and up, blue the tone, alpha the mask.
  const data = new Uint8Array(NN * 4 * LAYERS.length), range = [];
  const b8 = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  LAYERS.forEach((name, li) => {
    const L = out[name], size = LAYER_SIZE[name], ku = N / (2 * size[0]), kv = N / (2 * size[1]), sx = F(), sy = F(); let sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, l = j * N + ((i + N - 1) % N), r = j * N + ((i + 1) % N), d = ((j + N - 1) % N) * N + i, t = ((j + 1) % N) * N + i;
      sx[k] = (L.h[r] - L.h[l]) * ku; sy[k] = (L.h[t] - L.h[d]) * kv; sum += sx[k] * sx[k] + sy[k] * sy[k];
    }
    const rg = Math.max(0.03, Math.min(2.5, 3 * Math.sqrt(sum / (2 * NN)))); range.push(rg);
    const o = li * NN * 4;
    for (let k = 0; k < NN; k++) { data[o + k * 4] = b8(0.5 + 0.5 * sx[k] / rg); data[o + k * 4 + 1] = b8(0.5 + 0.5 * sy[k] / rg); data[o + k * 4 + 2] = b8(L.tone[k]); data[o + k * 4 + 3] = b8(L.mask[k]); }
  });
  const tex = new THREE.DataArrayTexture(data, N, N, LAYERS.length);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;

  // The low-detail picture laid over the world: red broad tone patches, green where weathering
  // takes hold, blue and alpha the slope of a gentle unevenness.
  const lo = new Uint8Array(NN * 4), r = fb(3, 3, 4, 6), g = fb(4, 4, 3, 7), hgt = fb(4, 4, 3, 8);
  const stretch = (f) => { let s = 0, s2 = 0; for (let i = 0; i < NN; i++) { s += f[i]; s2 += f[i] * f[i]; } const m = s / NN, sd = Math.sqrt(s2 / NN - m * m) || 1; for (let i = 0; i < NN; i++) f[i] = 0.5 + (f[i] - m) / (4.4 * sd); };
  stretch(r); stretch(g);
  let sm = 0; const lx = F(), ly = F();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; lx[k] = hgt[j * N + ((i + 1) % N)] - hgt[j * N + ((i + N - 1) % N)]; ly[k] = hgt[((j + 1) % N) * N + i] - hgt[((j + N - 1) % N) * N + i]; sm += lx[k] * lx[k] + ly[k] * ly[k];
  }
  const lr = 3 * Math.sqrt(sm / (2 * NN)) || 1;
  for (let k = 0; k < NN; k++) { lo[k * 4] = b8(r[k]); lo[k * 4 + 1] = b8(g[k]); lo[k * 4 + 2] = b8(0.5 + 0.5 * lx[k] / lr); lo[k * 4 + 3] = b8(0.5 + 0.5 * ly[k] / lr); }
  const low = new THREE.DataTexture(lo, N, N, THREE.RGBAFormat);
  low.wrapS = low.wrapT = THREE.RepeatWrapping; low.magFilter = THREE.LinearFilter; low.minFilter = THREE.LinearMipmapLinearFilter; low.generateMipmaps = true; low.needsUpdate = true;
  return { tex, low, range };
}

// The numbers for every type, eight sets of four per type, in the order the shader reads them.
function buildParams(range) {
  const p = new Float32Array(NT * 32), c = new THREE.Color();
  TYPE_LIST.forEach((t, i) => {
    const o = i * 32, li = LAYER[t.layer];
    p.set([1 / t.su, 1 / t.sv, t.lowN, t.lowT], o);
    p.set(t.cells, o + 4);
    p.set([t.nrm * 2 * range[li], t.tex, t.dark, li], o + 8);
    c.set(t.wCol); p.set([c.r, c.g, c.b, t.wAmt], o + 12);
    p.set(t.wK, o + 16);
    c.set(t.lCol); p.set([c.r, c.g, c.b, Math.max(0.01, t.lH)], o + 20);
    p.set([t.spec, t.shine, t.streak, t.lAmt], o + 24);
    p.set([t.north, t.gate, 0, 0], o + 28);
  });
  return p;
}

// ---------------------------------------------------------------- shader
const VERT_PARS = /* glsl */`
attribute vec3 aT;                         // direction along which the picture's "across" runs, in the model's space
attribute vec3 aSurf;                      // x surface type, y baked occlusion
attribute float aY;                        // the vertex's height in its own model (see addY)
varying vec2 vSUv;                        // picture coordinates in meters
varying vec4 vSLow;                        // xy coordinates of the low-detail picture, z height above the model's base, w how far the face looks north
varying vec3 vST;
varying vec3 vSA;                          // x type, y occlusion, z how far the face looks up
`;
const VERT_MAIN = /* glsl */`
#ifdef USE_INSTANCING
  mat4 sM = modelMatrix * instanceMatrix;
#else
  mat4 sM = modelMatrix;
#endif
  vec3 sWP = (sM * vec4(position, 1.0)).xyz;
  vec3 sWN = normalize(mat3(sM) * normal);
  vSUv = uv;
  // The low-detail picture is laid on at a slant so that it never runs edge-on along a wall, a floor or a roof.
  vSLow = vec4(dot(sWP, vec3(0.0786, 0.0, -0.0786)), dot(sWP, vec3(-0.0711, 0.0474, -0.0711)), aY, -sWN.z);
  vST = mat3(viewMatrix) * (mat3(sM) * aT);
  vSA = vec3(aSurf.x, aSurf.y, sWN.y);
`;
const FRAG_PARS = /* glsl */`
uniform highp sampler2DArray uSurf;
uniform sampler2D uSNoise;
uniform vec4 uSP[${NT * 8}];
uniform vec4 uSEnv;                        // x how wet everything is
uniform vec3 uSBounce;                     // sunlight bounced off the ground (irradiance on a wall facing it)
varying vec2 vSUv;
varying vec4 vSLow;
varying vec3 vST;
varying vec3 vSA;
vec2 sBump; float sSpecK; float sShine;
`;
const FRAG_COLOR = /* glsl */`
{
#if S_DBG == 3
  int sI = 0;
#else
  int sI = int(vSA.x + 0.5) * 8;
#endif
  vec4 sP0 = uSP[sI], sP1 = uSP[sI + 1], sP2 = uSP[sI + 2], sP3 = uSP[sI + 3], sP4 = uSP[sI + 4], sP5 = uSP[sI + 5], sP6 = uSP[sI + 6], sP7 = uSP[sI + 7];
  vec2 sUv = vSUv * sP0.xy;
#if S_DBG == 1 || S_DBG == 4
  vec4 sTx = vec4(0.5, 0.5, 0.5, 0.0);
#else
  vec4 sTx = texture(uSurf, vec3(sUv, sP2.w));
  // The cloth weave (64 threads to a repeat) shimmers in bands when its threads come near the size of a pixel, so
  // there it gives way to the cloth's average (2026-11-19: market awnings seen from the camera's height).
  if (abs(sP2.w - ${LAYER.cloth}.0) < 0.5) { float sThr = 64.0 * max(length(dFdx(sUv)), length(dFdy(sUv))); sTx = mix(sTx, textureLod(uSurf, vec3(sUv, sP2.w), 12.0), smoothstep(0.22, 0.55, sThr)); }
#endif
#if S_DBG == 2 || S_DBG == 4
  vec4 sLo = vec4(0.5);
#else
  vec4 sLo = texture2D(uSNoise, vSLow.xy);
#endif
  // Every block, brick or tile gets a tone of its own.
  vec2 sCc = sUv * sP1.xy; float sRow = floor(sCc.y); sCc.x += sP1.z * 0.5 * mod(sRow, 2.0);
  float sHash = fract(sin(dot(vec2(floor(sCc.x), sRow), vec2(12.9898, 78.233))) * 43758.5453);
  float sAo = vSA.y;
  vec3 sC = diffuseColor.rgb * (1.0 + (sTx.b - 0.5) * sP2.y + (sHash - 0.5) * sP1.w + (sLo.r - 0.5) * sP0.w);
  sTx.a *= mix(1.0, smoothstep(0.5, 0.66, sLo.r), sP7.y);       // cracks only here and there, so the repeat does not show
  sC *= 1.0 - sTx.a * sP2.z;
  // Weathering: lichen, grey wood, patina, stains. Then whatever gathers near the ground.
  float sW = smoothstep(sP4.w, sP4.w + 0.2, sLo.g + sP4.x * sTx.a + sP4.y * vSA.z + sP4.z * (1.0 - sAo)) * sP3.a;
  sC = mix(sC, sP3.rgb * (0.6 + 0.8 * sTx.b) * sAo, sW);
  float sLz = (1.0 - smoothstep(0.0, sP5.a, vSLow.z + (sLo.r - 0.5) * sP5.a)) * sP6.w * mix(1.0, smoothstep(-0.3, 0.5, vSLow.w), sP7.x);
  sC = mix(sC, sP5.rgb * (0.6 + 0.8 * sTx.b) * sAo, sLz);
  // Dirt that runs down from under eaves and ledges, where the baked occlusion is strong.
  sC *= 1.0 - sP6.z * clamp((1.0 - sAo) * 2.4 - 0.25, 0.0, 1.0) * (0.25 + 0.75 * sLo.g) * 0.5;
  sC *= 1.0 - 0.22 * uSEnv.x;
  diffuseColor.rgb = sC;
  float sFade = 1.0 - smoothstep(28.0, 62.0, length(vViewPosition));
  sBump = (sTx.rg - 0.5) * sP2.x * sFade + (sLo.ba - 0.5) * sP0.z;
  sSpecK = (sP6.x + uSEnv.x * 0.1) * (0.5 + sTx.b) * (1.0 - 0.7 * max(sW, sLz));
  sShine = sP6.y;
}
`;
const FRAG_NORMAL = /* glsl */`
{
  vec3 sT = vST - normal * dot(vST, normal);
  sT *= inversesqrt(max(dot(sT, sT), 1e-4));
  normal = normalize(normal - sT * sBump.x - cross(normal, sT) * sBump.y);
}
`;

function patch(sh, u) {
  Object.assign(sh.uniforms, u);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
    .replace('#include <lights_phong_fragment>', '#include <lights_phong_fragment>\n  material.specularStrength = sSpecK; material.specularShininess = sShine;')
    // Sunlight bounced off the bright ground: warm light on walls, strongest low down. It keeps walls in shade
    // from going a flat grey-blue, as whitewash does in a sunny street.
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  { vec3 wN = inverseTransformDirection(normal, viewMatrix); float side = 1.0 - abs(wN.y) * 0.85; float low = mix(1.0, 0.4, smoothstep(0.0, 7.0, vSLow.z));\n    reflectedLight.indirectDiffuse += uSBounce * side * low * BRDF_Lambert(diffuseColor.rgb) * (1.0 - max(wN.y, 0.0)); }');
}

// ---------------------------------------------------------------- geometry helpers
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// The signed axis a direction is closest to.
function axisOf(v) {
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  if (ay >= ax && ay >= az) return [0, Math.sign(v[1]) || 1, 0];
  return ax >= az ? [Math.sign(v[0]) || 1, 0, 0] : [0, 0, Math.sign(v[2]) || 1];
}
// The direction of greatest spread of a set of weighted points (cov is the six distinct entries).
function mainAxes(c) {
  const mul = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[1] * v[0] + m[3] * v[1] + m[4] * v[2], m[2] * v[0] + m[4] * v[1] + m[5] * v[2]];
  const power = (m) => { let v = [0.61, 0.53, 0.59], l = 0; for (let i = 0; i < 40; i++) { const w = mul(m, v); l = Math.hypot(w[0], w[1], w[2]); if (l < 1e-12) break; v = [w[0] / l, w[1] / l, w[2] / l]; } return [v, l]; };
  const [v1, l1] = power(c);
  const d = [c[0] - l1 * v1[0] * v1[0], c[1] - l1 * v1[0] * v1[1], c[2] - l1 * v1[0] * v1[2], c[3] - l1 * v1[1] * v1[1], c[4] - l1 * v1[1] * v1[2], c[5] - l1 * v1[2] * v1[2]];
  const [v2, l2] = power(d);
  return { v1, v2, v3: norm3(cross3(v1, v2)), l1, l2 };
}

const _bounceTint = new THREE.Color(1.0, 0.82, 0.62);
export class Surfaces {
  constructor() {
    const t0 = performance.now();
    const L = buildLayers();
    this.layers = L.tex; this.low = L.low;
    this.u = { uSurf: { value: L.tex }, uSNoise: { value: L.low }, uSP: { value: buildParams(L.range) }, uSEnv: { value: new THREE.Vector4(0, 0, 0, 0) }, uSBounce: { value: new THREE.Color(0, 0, 0) } };
    const make = (extra) => {
      const m = new THREE.MeshPhongMaterial(Object.assign({ vertexColors: true, specular: 0xffffff, shininess: 20 }, extra));
      m.onBeforeCompile = (sh) => patch(sh, this.u);
      m.defines = { S_DBG: 0 };
      m.customProgramCacheKey = () => 'surfaces-1-' + m.defines.S_DBG;
      return m;
    };
    this.material = make({});
    // The same material pulled a hair toward the eye, for flat pieces laid on the ground.
    this.flatMaterial = make({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // Streets and door paths (2026-11-19): a cheap overlay that lightens or darkens the ground already drawn under
    // it, so it needs no lighting, shadows or ground texture of its own (four texture reads). Streets: trodden earth a
    // little paler, and where wider than 3.2 m two cart ruts 1.45 m apart that wander a little and break off in
    // places, a paler lip beside each, and a darker, pitted middle where the animals walk. Door paths (world.worn):
    // darker, browner earth packed by feet. Damp patches on both, more by doors.
    // It fades out at its edges and ends and beyond 70 m. The blend multiplies the picture by twice the color written,
    // so 0.5 leaves it as it is. (Until 2026-11-19 streets were a lit copy of the ground; they were never drawn, being
    // wound face down, and drawn they cost up to 9 ms a frame at 1080p on Intel UHD 620 where they filled the view.)
    const [n1, n2] = getNoise();
    this.streetMaterial = new THREE.ShaderMaterial({
      uniforms: { uGNoise: { value: n1 }, uGNoise2: { value: n2 } },
      vertexShader: `attribute vec2 aEdge; attribute float aHalf; varying vec3 vGW; varying vec2 vEdge; varying float vHalf;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vGW = w.xyz; vEdge = aEdge; vHalf = aHalf; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uGNoise, uGNoise2; varying vec3 vGW; varying vec2 vEdge; varying float vHalf;
void main() {
  vec4 gN = texture2D(uGNoise, vGW.xz * 0.23 + 0.31);
  float a = (1.0 - smoothstep(0.45, 1.0, abs(vEdge.x) + (gN.r - 0.5) * 0.5)) * vEdge.y * (1.0 - smoothstep(45.0, 70.0, distance(cameraPosition, vGW)));
  float sW = step(1.6, vHalf), sX = vEdge.x * vHalf;
  // streets a little paler than the ground; door paths (narrower) darker, packed by feet and wet from the doorway
  vec3 F = mix(vec3(0.84, 0.79, 0.72), vec3(1.07), sW) * (1.0 + 0.08 * (gN.g - 0.5));
  float sWav = (texture2D(uGNoise2, vGW.xz * 0.013 + 0.37).a - 0.5) * 0.9;
  float sD = min(abs(sX - sWav - 0.72), abs(sX - sWav + 0.72));
  vec4 sN = texture2D(uGNoise, vGW.xz * 0.11 + 0.5);
  float sOn = smoothstep(0.4, 0.66, sN.r) * sW;
  float sRut = (1.0 - smoothstep(0.04, 0.1 + 0.1 * sN.g, sD)) * sOn;
  float sLip = (1.0 - smoothstep(0.0, 0.08, abs(sD - 0.22))) * sOn;
  float sMid = (1.0 - smoothstep(0.2, 0.45, abs(sX - sWav))) * sW;
  F *= (1.0 - 0.26 * sRut) * (1.0 + 0.08 * sLip) * (1.0 - 0.1 * sMid * gN.b);
  F *= 1.0 - mix(0.3, 0.17, sW) * smoothstep(mix(0.6, 0.76, sW), 0.86, texture2D(uGNoise, vGW.xz * 0.021 + 0.2).r) * (1.0 - sRut);
  gl_FragColor = vec4(0.5 * mix(vec3(1.0), F, a), 1.0);
}`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.buildMs = performance.now() - t0;
  }

  // Called by the kit once per model part. Returns the geometry to draw.
  prepare(geometry, assetId) {
    const t0 = performance.now(), g = geometry.index ? geometry.toNonIndexed() : geometry, out = this._dress(g, assetId, null);
    this.prepareMs = (this.prepareMs || 0) + performance.now() - t0;
    return out;
  }

  // The same for geometry made in code that is all one kind of surface (the rocks of rocks.js: type 'rock').
  prepareAs(geometry, assetId, type) { return this._dress(geometry.index ? geometry.toNonIndexed() : geometry, assetId, type); }

  // Called by the world for its own flat pieces. Changes the geometry in place and returns the material to use.
  //   pave: the paved squares    street: the earth streets    quay: quay and pier blocks    stake: small wooden posts
  flat(g, kind) {
    if (kind === 'street') return this._street(g);
    if (kind === 'pave') return this._pave(g);
    this._dress(g, '', kind === 'stake' ? 'timber' : 'quay');
    return this.material;
  }

  update(sky) {
    // Rain darkens stone and plaster and gives everything a wet shine.
    const haze = sky && sky.cur ? sky.cur.haze : 1;
    this.u.uSEnv.value.x = Math.min(1, Math.max(0, (haze - 2.2) / 1.2));
    // Ground bounce: part of the sunlit ground's light (warm earth, about 40% reflective) reaches a wall beside it.
    if (sky && sky.cur) this.u.uSBounce.value.copy(sky.cur.sun).multiplyScalar(sky.cur.sunI * Math.max(sky.sunDir.y, 0) * 0.3 * (1 - Math.min(1, sky.cur.stars * 2 + sky.cur.moon))).multiply(_bounceTint);   // none by moonlight
  }

  // The streets are strips of quads built in a fixed vertex order: left, left, right, right, left, right.
  // The world gives each street vertex aEdge (across the street from -1 to 1, and 0 at either end for the fade) and
  // aHalf (the half-width in meters, for the cart ruts); see world._strip. All vertices take the street's mean color.
  _street(g) {
    const n = g.attributes.position.count, col = g.attributes.color.array;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < n; i++) { r += col[i * 3]; gg += col[i * 3 + 1]; b += col[i * 3 + 2]; }
    for (let i = 0; i < n; i++) { col[i * 3] = r / n; col[i * 3 + 1] = gg / n; col[i * 3 + 2] = b / n; }
    return this.streetMaterial;
  }

  // The paved squares are separate square tiles. Each one becomes one repeat of the slab picture, turned a random way.
  _pave(g) {
    const P = g.attributes.position.array, n = g.attributes.position.count, col = g.attributes.color.array, id = TYPE.slabs.id, S = LAYER_SIZE.slabs[0];
    const uv = new Float32Array(n * 2), aT = new Float32Array(n * 3), aS = new Float32Array(n * 3);
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < n; i++) { r += col[i * 3]; gg += col[i * 3 + 1]; b += col[i * 3 + 2]; }
    // Corner coordinates for the six vertices of a tile, before turning: across follows x, up runs against z.
    const base = [[0, 1], [0, 0], [1, 1], [1, 1], [0, 0], [1, 0]], TS = [[1, 0, 0], [0, 0, -1], [-1, 0, 0], [0, 0, 1]];
    // The tiles were laid with a gap around each. Widen every tile a little so they meet: the joints are in the picture.
    const GX = [-1, -1, 1, 1, -1, 1], GZ = [-1, 1, -1, -1, 1, 1];
    for (let q = 0; q < n / 6; q++) {
      const h = Math.abs(Math.sin(P[q * 18] * 12.9898 + P[q * 18 + 2] * 78.233) * 43758.5453), turn = Math.floor(fract(h) * 4), tone = 0.95 + 0.1 * fract(h * 7.3);
      for (let k = 0; k < 6; k++) {
        const i = q * 6 + k; let u = base[k][0], v = base[k][1];
        for (let s = 0; s < turn; s++) { const t = u; u = v; v = 1 - t; }
        uv[i * 2] = u * S; uv[i * 2 + 1] = v * S;
        aT.set(TS[turn], i * 3); aS[i * 3] = id; aS[i * 3 + 1] = 1;
        P[i * 3] += GX[k] * 0.041; P[i * 3 + 2] += GZ[k] * 0.041;
        col[i * 3] = r / n * tone; col[i * 3 + 1] = gg / n * tone; col[i * 3 + 2] = b / n * tone;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aT', new THREE.BufferAttribute(aT, 3)); g.setAttribute('aSurf', new THREE.BufferAttribute(aS, 3));
    addY(g);
    return this.flatMaterial;
  }

  // The main work: decide what each triangle is, lay picture coordinates on it, smooth what is round.
  // g must have no index. fixed names one type for the whole geometry (used for the world's blocks).
  _dress(g, asset, fixed) {
    const P = g.attributes.position.array, n = g.attributes.position.count, nt = Math.floor(n / 3), C = g.attributes.color, U = fixed ? null : g.attributes.uv;
    const col = new Float32Array(n * 3), ao = new Float32Array(n), pal = new Int16Array(nt);
    for (let i = 0; i < n; i++) { col[i * 3] = C ? C.getX(i) : 0.6; col[i * 3 + 1] = C ? C.getY(i) : 0.6; col[i * 3 + 2] = C ? C.getZ(i) : 0.6; ao[i] = U ? Math.min(1, Math.max(0.4, U.getY(i))) : 1; }
    for (let t = 0; t < nt; t++) {
      if (U) pal[t] = Math.min(PAL.length - 1, Math.max(0, Math.floor(U.getX(t * 3) * 64)));
      else if (!fixed) {
        // No palette index in the file (an old export): take the palette color with the closest hue. Occlusion only darkens.
        const r = col[t * 9], gg = col[t * 9 + 1], b = col[t * 9 + 2], s = r + gg + b + 1e-6; let best = 0, bd = 9;
        for (let k = 0; k < PAL_LIN.length; k++) { const q = PAL_LIN[k], qs = q[0] + q[1] + q[2], d = Math.abs(r / s - q[0] / qs) + Math.abs(b / s - q[2] / qs) + 0.05 * Math.abs(Math.min(1, s / qs) - 1); if (d < bd) { bd = d; best = k; } }
        pal[t] = best;
      }
    }
    // Face normals and areas.
    const fn = new Float32Array(nt * 3), area = new Float32Array(nt);
    for (let t = 0; t < nt; t++) {
      const o = t * 9, ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2], bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx, l = Math.hypot(x, y, z) || 1e-9;
      fn[t * 3] = x / l; fn[t * 3 + 1] = y / l; fn[t * 3 + 2] = z / l; area[t] = l * 0.5;
    }
    // Corners that sit at the same point share an id.
    const vid = new Int32Array(n), seen = new Map(); let nv = 0, reach = 0;
    for (let i = 0; i < n * 3; i++) reach = Math.max(reach, Math.abs(P[i]));
    // Positions are rounded to a millimeter (4 mm for very large pieces) and packed into one number.
    const Q = reach > 60 ? 250 : 1000, cell = (v) => Math.min(131071, Math.max(0, Math.round(v * Q) + 65536));
    for (let i = 0; i < n; i++) {
      const key = cell(P[i * 3]) * 17179869184 + cell(P[i * 3 + 1]) * 131072 + cell(P[i * 3 + 2]);
      let id = seen.get(key); if (id === undefined) { id = nv++; seen.set(key, id); }
      vid[i] = id;
    }
    // A first name for each triangle, then group triangles of one name that share an edge into pieces.
    const cls = new Array(nt);
    for (let t = 0; t < nt; t++) cls[t] = fixed || classify(asset, PAL[pal[t]][0]);
    const par = new Int32Array(nt); for (let t = 0; t < nt; t++) par[t] = t;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const edges = new Map();
    for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
      const a = vid[t * 3 + e], b = vid[t * 3 + (e + 1) % 3], key = a < b ? a * nv + b : b * nv + a, o = edges.get(key);
      if (o === undefined) edges.set(key, t); else if (cls[o] === cls[t]) { const ra = find(o), rb = find(t); if (ra !== rb) par[ra] = rb; }
    }
    // Size, middle and main direction of each piece.
    const pieces = new Map();
    for (let t = 0; t < nt; t++) {
      const root = find(t); let s = pieces.get(root);
      if (!s) { s = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], w: 0, m: [0, 0, 0], q: [0, 0, 0, 0, 0, 0], tris: 0 }; pieces.set(root, s); }
      s.tris++;
      for (let k = 0; k < 3; k++) {
        const x = P[t * 9 + k * 3], y = P[t * 9 + k * 3 + 1], z = P[t * 9 + k * 3 + 2], w = area[t] + 1e-6;
        s.min[0] = Math.min(s.min[0], x); s.min[1] = Math.min(s.min[1], y); s.min[2] = Math.min(s.min[2], z); s.max[0] = Math.max(s.max[0], x); s.max[1] = Math.max(s.max[1], y); s.max[2] = Math.max(s.max[2], z);
        s.w += w; s.m[0] += w * x; s.m[1] += w * y; s.m[2] += w * z;
        s.q[0] += w * x * x; s.q[1] += w * x * y; s.q[2] += w * x * z; s.q[3] += w * y * y; s.q[4] += w * y * z; s.q[5] += w * z * z;
      }
    }
    for (const s of pieces.values()) {
      const m = s.c = [s.m[0] / s.w, s.m[1] / s.w, s.m[2] / s.w];
      s.ext = [s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2]];
      s.ax = mainAxes([s.q[0] / s.w - m[0] * m[0], s.q[1] / s.w - m[0] * m[1], s.q[2] / s.w - m[0] * m[2], s.q[3] / s.w - m[1] * m[1], s.q[4] / s.w - m[1] * m[2], s.q[5] / s.w - m[2] * m[2]]);
      const e = s.ext, long = e[0] >= e[1] && e[0] >= e[2] ? 0 : e[1] >= e[2] ? 1 : 2;
      s.sorted = e.slice().sort((a, b) => b - a);
      // Grain runs along a long thin piece whichever way it lies, otherwise along the longest side of its box.
      s.grain = s.ax.l1 > 5 * s.ax.l2 ? s.ax.v1 : AXES[long];
    }
    // Settle the names that depend on the piece.
    const type = new Array(nt), ship = SHIPS.has(asset);
    for (let t = 0; t < nt; t++) {
      const s = pieces.get(find(t)); let c = cls[t];
      if (c === 'wood?') c = ship && s.sorted[0] > 4 ? 'hull' : s.sorted[1] > 0.42 ? 'planks' : 'timber';
      else if (c === 'paintwood?') c = 'paintwood';
      else if (c === 'deck?') c = 'deck';
      else if (c === 'marble?') c = COLUMNED.has(asset) && s.tris >= 20 && s.ext[1] > 2.2 * Math.max(s.ext[0], s.ext[2]) && Math.abs(s.ext[0] - s.ext[2]) < 0.25 * s.ext[0] ? 'fluted' : 'marbleBlock';
      type[t] = TYPE[c] || TYPE.plain;
      if (ship && (c === 'hull' || c === 'paintwood' || c === 'deck') && s.sorted[0] > 4) s.grain = AXES[2];
    }
    // Take the per-face tone jitter back out of the baked colors, so that walls are not a patchwork
    // of rectangles. Faces that were darkened on purpose keep it. A few palette colors that only
    // marked "another block" or "another tile" are pulled toward the main one.
    if (U && !PLANTS.has(asset)) {
      const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      for (let t = 0; t < nt; t++) {
        const name = PAL[pal[t]][0], stone = PAL_LIN[PAL_ID.stone]; let base = PAL_LIN[pal[t]];
        if (name === 'paving' && (WALLS.has(asset) || ROCKS.has(asset))) base = stone;
        else if (name === 'dstone' && (WALLS.has(asset) || ROCKS.has(asset) || HOUSES.has(asset))) base = mixc(stone, base, WALLS.has(asset) ? 0.2 : 0.45);
        else if (name === 'dtile') base = mixc(PAL_LIN[PAL_ID.tile], base, 0.3);
        // City walls and house footings are a paler, warmer stone than the palette's grey.
        if ((name === 'stone' || name === 'paving' || name === 'dstone') && (WALLS.has(asset) || HOUSES.has(asset))) base = [base[0] * 1.3, base[1] * 1.24, base[2] * 1.1];
        // Doors, beams and furniture: the palette's wood is close to black once it is in shade.
        if (!SHIPS.has(asset) && (name === 'wood' || name === 'dwood')) { const k = name === 'dwood' ? 1.8 : 1.35; base = [base[0] * k, base[1] * k, base[2] * k]; }
        const src = PAL_LIN[pal[t]];
        for (let k = 0; k < 3; k++) {
          const i = t * 3 + k, f0 = (col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2]) / ((src[0] + src[1] + src[2]) * ao[i]), f = Math.abs(f0 - 1) < 0.24 ? 1 : f0;
          col[i * 3] = base[0] * f * ao[i]; col[i * 3 + 1] = base[1] * f * ao[i]; col[i * 3 + 2] = base[2] * f * ao[i];
        }
      }
    }
    // The average pitch of the tiled slopes that face each of the four sides, so rows of tiles line up across a roof.
    const pitch = {};
    for (let t = 0; t < nt; t++) {
      if (type[t].map !== 'slope') continue;
      const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2], hl = Math.hypot(nx, nz);
      if (ny < 0.15 || hl < 0.08) continue;
      const key = Math.abs(nx) / hl > 0.94 ? 'x' + Math.sign(nx) : Math.abs(nz) / hl > 0.94 ? 'z' + Math.sign(nz) : null;
      if (key) { const p = pitch[key] || (pitch[key] = [0, 0]); p[0] += area[t]; p[1] += area[t] * ny; }
    }

    const uv = new Float32Array(n * 2), aT = new Float32Array(n * 3);
    const put = (t, T, B) => { for (let k = 0; k < 3; k++) { const i = t * 3 + k, p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; uv[i * 2] = dot3(p, T); uv[i * 2 + 1] = dot3(p, B); aT[i * 3] = T[0]; aT[i * 3 + 1] = T[1]; aT[i * 3 + 2] = T[2]; } };
    // Flat sides: across follows the wall, up is up. Tops and undersides lie in x and z.
    const box = (t) => {
      const N3 = [fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]], a = axisOf(N3);
      if (a[1]) put(t, [1, 0, 0], [0, 0, -a[1]]); else if (a[0]) put(t, [0, 0, -a[0]], [0, 1, 0]); else put(t, [a[2], 0, 0], [0, 1, 0]);
    };
    for (let t = 0; t < nt; t++) {
      const ty = type[t], N3 = [fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]], s = pieces.get(find(t));
      if (ty.map === 'slope') {
        const hl = Math.hypot(N3[0], N3[2]);
        if (N3[1] < 0.15 || hl < 0.08) { box(t); continue; }
        let D = [N3[0] / hl, 0, N3[2] / hl], key = null;
        if (Math.abs(D[0]) > 0.94) { D = [Math.sign(D[0]), 0, 0]; key = 'x' + D[0]; } else if (Math.abs(D[2]) > 0.94) { D = [0, 0, Math.sign(D[2])]; key = 'z' + D[2]; }
        const T = [D[2], 0, -D[0]];
        // Up the slope. For roofs that face a side squarely, measured on the ground and stretched by the average pitch.
        const B = key ? [-D[0] * pitch[key][0] / pitch[key][1], 0, -D[2] * pitch[key][0] / pitch[key][1]] : [-D[0] * N3[1], hl, -D[2] * N3[1]];
        put(t, T, B);
      } else if (ty.map === 'grain') {
        // Along the piece. A long thin triangle shows the way by its longer short side.
        const e = [[1, 0], [2, 1], [0, 2]].map(([a, b]) => { const v = [P[t * 9 + a * 3] - P[t * 9 + b * 3], P[t * 9 + a * 3 + 1] - P[t * 9 + b * 3 + 1], P[t * 9 + a * 3 + 2] - P[t * 9 + b * 3 + 2]]; return { v, l: Math.hypot(v[0], v[1], v[2]) }; }).sort((a, b) => b.l - a.l);
        let G = s.grain;
        if (G !== AXES[2] || !ship) { if (e[1].l > 2.2 * e[2].l && s.sorted[1] < 0.42) G = norm3(e[1].v); }
        const ga = axisOf(G), snapped = Math.abs(dot3(G, ga)) > 0.966;
        if (snapped) G = [Math.abs(ga[0]), Math.abs(ga[1]), Math.abs(ga[2])];
        else { const big = axisOf(G); if (dot3(G, big) < 0) G = [-G[0], -G[1], -G[2]]; }
        const d = dot3(G, N3);
        if (Math.abs(d) > 0.92) { box(t); continue; }
        if (snapped) put(t, G, axisOf(cross3(N3, G)));
        else { const T = norm3([G[0] - N3[0] * d, G[1] - N3[1] * d, G[2] - N3[2] * d]); put(t, T, cross3(N3, T)); }
      } else if (ty.map === 'cyl') {
        // Around the piece's own axis: the main direction that stands most nearly upright.
        const ax = s.ax; let A = [ax.v1, ax.v2, ax.v3].reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
        if (A[1] < 0) A = [-A[0], -A[1], -A[2]];
        if (A[1] > 0.975 || ty.name === 'fluted') A = [0, 1, 0];
        const c0 = ty.name === 'fluted' ? [(s.min[0] + s.max[0]) / 2, 0, (s.min[2] + s.max[2]) / 2] : s.c;
        const E1 = norm3(Math.abs(A[0]) < 0.9 ? [1 - A[0] * A[0], -A[0] * A[1], -A[0] * A[2]] : [-A[2] * A[0], -A[2] * A[1], 1 - A[2] * A[2]]), E2 = cross3(E1, A);
        if (!s.cyl) {
          // Reach of the piece along and around its axis, worked out once.
          let h0 = 1e9, h1 = -1e9, rm = 0;
          for (let q = 0; q < nt; q++) if (find(q) === find(t)) for (let k = 0; k < 3; k++) { const d = [P[q * 9 + k * 3] - c0[0], P[q * 9 + k * 3 + 1] - c0[1], P[q * 9 + k * 3 + 2] - c0[2]], hh = dot3(d, A); h0 = Math.min(h0, hh); h1 = Math.max(h1, hh); rm = Math.max(rm, Math.hypot(dot3(d, E1), dot3(d, E2))); }
          s.cyl = { h0, h1, rm };
        }
        const cy = s.cyl, around = ty.name === 'fluted' ? 5 : Math.max(1, Math.round(6.2832 * cy.rm / ty.su));
        if (Math.abs(dot3(N3, A)) > 0.9) { const sg = Math.sign(dot3(N3, A)); put(t, E1, [-E2[0] * sg, -E2[1] * sg, -E2[2] * sg]); continue; }
        const th = [], rr = [], hh = [];
        for (let k = 0; k < 3; k++) { const i = t * 3 + k, d = [P[i * 3] - c0[0], P[i * 3 + 1] - c0[1], P[i * 3 + 2] - c0[2]], a = dot3(d, E1), b = dot3(d, E2); th.push(Math.atan2(b, a)); rr.push(Math.hypot(a, b)); hh.push(dot3(d, A)); }
        // A corner on the axis has no angle of its own. A triangle across the seam is moved to one side of it.
        const off = rr.map((r) => r > 1e-3 * (cy.rm + 0.01));
        const good = th.filter((_, k) => off[k]), mean = good.length ? Math.atan2(good.reduce((a, b) => a + Math.sin(b), 0), good.reduce((a, b) => a + Math.cos(b), 0)) : 0;
        for (let k = 0; k < 3; k++) { if (!off[k]) th[k] = mean; while (th[k] - mean > Math.PI) th[k] -= 6.2832; while (th[k] - mean < -Math.PI) th[k] += 6.2832; }
        for (let k = 0; k < 3; k++) {
          const i = t * 3 + k, cs = Math.cos(th[k]), sn = Math.sin(th[k]);
          uv[i * 2] = -th[k] / 6.2832 * around * ty.su;
          uv[i * 2 + 1] = ty.name === 'fluted' ? hh[k] : (hh[k] - cy.h0) / Math.max(1e-3, cy.h1 - cy.h0) * ty.sv;
          aT[i * 3] = sn * E1[0] - cs * E2[0]; aT[i * 3 + 1] = sn * E1[1] - cs * E2[1]; aT[i * 3 + 2] = sn * E1[2] - cs * E2[2];
        }
      } else box(t);
    }
    // Smooth normals across faces that meet at a shallow angle and are the same kind of surface. Boxes keep hard edges.
    const head = new Int32Array(nv).fill(-1), next = new Int32Array(n);
    for (let i = 0; i < n; i++) { next[i] = head[vid[i]]; head[vid[i]] = i; }
    const nrm = new Float32Array(n * 3), col2 = new Float32Array(n * 3), ao2 = new Float32Array(n), cosOf = (deg) => Math.cos(deg * Math.PI / 180);
    for (let i = 0; i < n; i++) {
      const t = Math.floor(i / 3), ty = type[t]; let x = 0, y = 0, z = 0, r = 0, gg = 0, b = 0, a = 0, w = 0;
      for (let j = head[vid[i]]; j >= 0; j = next[j]) {
        const t2 = Math.floor(j / 3), ty2 = type[t2];
        if (ty2.layer !== ty.layer) continue;
        const d = fn[t * 3] * fn[t2 * 3] + fn[t * 3 + 1] * fn[t2 * 3 + 1] + fn[t * 3 + 2] * fn[t2 * 3 + 2];
        if (j !== i && d < cosOf(Math.min(ty.crease, ty2.crease))) continue;
        const k = area[t2] + 1e-7;
        x += fn[t2 * 3] * k; y += fn[t2 * 3 + 1] * k; z += fn[t2 * 3 + 2] * k; r += col[j * 3] * k; gg += col[j * 3 + 1] * k; b += col[j * 3 + 2] * k; a += ao[j] * k; w += k;
      }
      const l = Math.hypot(x, y, z) || 1;
      nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
      if (ty.blend) { col2[i * 3] = r / w; col2[i * 3 + 1] = gg / w; col2[i * 3 + 2] = b / w; ao2[i] = a / w; }
      else { col2[i * 3] = col[i * 3]; col2[i * 3 + 1] = col[i * 3 + 1]; col2[i * 3 + 2] = col[i * 3 + 2]; ao2[i] = ao[i]; }
    }
    const aS = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { aS[i * 3] = type[Math.floor(i / 3)].id; aS[i * 3 + 1] = ao2[i]; }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col2, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 3));
    g.setAttribute('aSurf', new THREE.BufferAttribute(aS, 3));
    addY(g);
    return g;
  }
}
