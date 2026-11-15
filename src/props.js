// Small things people keep by their doors and set out at the market, so the streets look lived in:
//   water jars, pots of herbs, baskets of figs, olives, and onions, stacks of firewood; with the kit's own stools,
//   amphorae, storage jars, and herms. A herm (a square stone pillar topped by a head of Hermes) stood at many house
//   doors: Thucydides 6.27 calls them "so common in the doorways of private houses and temples" (Crawley's translation).
// The shapes are made here and dressed by the surface pass like the kit's models (pottery, wicker, bark, leaves).
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const TERRA = [0.32, 0.16, 0.085], TERRA_D = [0.24, 0.12, 0.07], WICKER = [0.42, 0.3, 0.15], BARK = [0.16, 0.1, 0.06], WOOD_END = [0.42, 0.3, 0.17], LEAF = [0.07, 0.13, 0.035];

// A turned shape (a jar or pot) from a profile of [radius, height] points, colored by height.
function lathe(profile, segs, colorAt) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs).toNonIndexed();
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const P = g.attributes.position.array, n = P.length / 3, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = colorAt(P[i * 3 + 1]); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const colored = (g, col, jitter, rng) => {
  g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.normal) g.deleteAttribute('normal');
  const n = g.attributes.position.count, c = new Float32Array(n * 3), k = 1 - jitter / 2 + jitter * (rng ? rng() : 0.5);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0] * k; c[i * 3 + 1] = col[1] * k; c[i * 3 + 2] = col[2] * k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
};

// Each prop: parts as [geometry, surface type], a size, and a round collider (or none).
export function makeProps() {
  const R = mulberry32(777), out = {};
  // A water jar (hydria), 0.5 m, with a darker band on the shoulder.
  out.hydria = { size: [0.4, 0.5, 0.4], r: 0.2, parts: [[lathe([[0, 0], [0.09, 0], [0.11, 0.03], [0.17, 0.15], [0.19, 0.25], [0.16, 0.34], [0.09, 0.41], [0.06, 0.45], [0.065, 0.49], [0.08, 0.5], [0.07, 0.5]], 16,
    (y) => (y > 0.29 && y < 0.36 ? TERRA_D : TERRA)), 'pottery']] };
  // A pot of herbs: a plain pot and a rounded clump of leaves.
  // A herb: many small leaves on a loose dome (myrtle, thyme, basil), not one smooth ball.
  const clump = (n, rad, h, seed) => { const r = mulberry32(seed), gs = []; for (let i = 0; i < n * 4; i++) { const b = new THREE.IcosahedronGeometry(rad * (0.16 + 0.14 * r()), 0); const a = r() * 6.283, d = Math.sqrt(r()) * rad, up = Math.sqrt(Math.max(0, 1 - (d / rad) ** 2)); b.scale(1, 0.55, 1.5); b.rotateY(r() * 6.283); b.rotateX((r() - 0.5) * 0.8); b.translate(Math.cos(a) * d, h + rad * (0.15 + 0.85 * up) * (0.7 + 0.3 * r()), Math.sin(a) * d); gs.push(colored(b, LEAF.map((v, k) => v * (0.7 + 0.6 * r()) * (k === 1 ? 1 + 0.2 * r() : 1)), 0.2, r)); } return mergeGeometries(gs); };
  out.pot_herb = { size: [0.36, 0.55, 0.36], r: 0.18, parts: [[lathe([[0, 0], [0.11, 0], [0.14, 0.04], [0.17, 0.26], [0.19, 0.28], [0.16, 0.28], [0.15, 0.27]], 14, () => TERRA), 'pottery'], [clump(7, 0.13, 0.22, 31), 'leaf']] };
  out.pot_herb2 = { size: [0.3, 0.45, 0.3], r: 0.15, parts: [[lathe([[0, 0], [0.09, 0], [0.12, 0.03], [0.14, 0.2], [0.155, 0.22], [0.13, 0.22], [0.12, 0.21]], 14, () => TERRA_D), 'pottery'], [clump(5, 0.1, 0.17, 57), 'leaf']] };
  // Baskets of produce: an open wicker basket heaped with figs, olives, or onions.
  const heap = (col, n, rr, top, seed) => { const r = mulberry32(seed), gs = []; for (let i = 0; i < n; i++) { const b = new THREE.IcosahedronGeometry(rr * (0.8 + 0.4 * r()), 0); const a = r() * 6.283, d = Math.sqrt(r()) * 0.16; b.translate(Math.cos(a) * d, top + rr * 0.6 + (0.16 - d) * 0.35 * r(), Math.sin(a) * d); gs.push(colored(b, col.map((v) => v * (0.85 + 0.3 * r())), 0.1, r)); } return mergeGeometries(gs); };
  const basket = () => lathe([[0, 0], [0.15, 0], [0.18, 0.02], [0.21, 0.2], [0.225, 0.22], [0.2, 0.22], [0.185, 0.2]], 16, () => WICKER);
  out.basket_figs = { size: [0.45, 0.32, 0.45], r: 0.22, parts: [[basket(), 'fiber'], [heap([0.12, 0.05, 0.08], 26, 0.035, 0.12, 5), 'plain']] };
  out.basket_olives = { size: [0.45, 0.3, 0.45], r: 0.22, parts: [[basket(), 'fiber'], [heap([0.04, 0.05, 0.02], 40, 0.02, 0.14, 9), 'plain']] };
  out.basket_onions = { size: [0.45, 0.34, 0.45], r: 0.22, parts: [[basket(), 'fiber'], [heap([0.62, 0.42, 0.24], 18, 0.045, 0.11, 13), 'plain']] };
  // Firewood stacked against a wall: split logs, about 1 m long.
  { const gs = [], ends = [], r = mulberry32(21);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6 - row; i++) {
      const rad = 0.05 + 0.02 * r(), x = (i - (5 - row) / 2) * 0.13 + (r() - 0.5) * 0.02, y = 0.06 + row * 0.11, len = 0.9 + 0.2 * r();
      const c = new THREE.CylinderGeometry(rad, rad, len, 7, 1, true); c.rotateX(Math.PI / 2); c.translate(x, y, (r() - 0.5) * 0.08); gs.push(colored(c, BARK, 0.3, r));
      for (const s of [1, -1]) { const e = new THREE.CircleGeometry(rad, 7); e.rotateY(s > 0 ? 0 : Math.PI); e.translate(x, y, s * len / 2); ends.push(colored(e, WOOD_END, 0.3, r)); }
    }
    out.firewood = { size: [0.8, 0.45, 1.1], box: [0.4, 0.55], parts: [[mergeGeometries(gs), 'bark'], [mergeGeometries(ends), 'planks']] }; }
  return out;
}

// A stack of three wooden crates for the quay (replaces the kit's crate_stack, which read as three plain cubes):
// each side is three boards with thin gaps between them, with a post at every corner and a lid of boards.
// Sized to the kit's footprint, 1.6 by 1.5 by 1.2 m, standing on y = 0.
export function makeCrateStack() {
  const r = mulberry32(4242), boards = [], posts = [];
  const WOOD = [0.4, 0.29, 0.17], POST = [0.3, 0.21, 0.12];
  const board = (w, h, t, x, y, z, ry, cx, cy, cz, rot) => {
    const g = new THREE.BoxGeometry(w, h, t); g.rotateY(ry); g.translate(x, y, z);
    g.rotateY(rot); g.translate(cx, cy, cz);
    boards.push(colored(g, WOOD.map((v) => v * (0.8 + 0.4 * r())), 0.15, r));
  };
  const crate = (W, H, D, cx, cy, cz, rot) => {
    const n = 3, gap = 0.014, bh = (H - gap * (n - 1)) / n, t = 0.022;
    for (let i = 0; i < n; i++) {
      const y = bh / 2 + i * (bh + gap);
      board(W, bh, t, 0, y, D / 2 - t / 2, 0, cx, cy, cz, rot); board(W, bh, t, 0, y, -D / 2 + t / 2, 0, cx, cy, cz, rot);
      board(D - 2 * t, bh, t, W / 2 - t / 2, y, 0, Math.PI / 2, cx, cy, cz, rot); board(D - 2 * t, bh, t, -W / 2 + t / 2, y, 0, Math.PI / 2, cx, cy, cz, rot);
    }
    const lw = (W - gap * 2) / 3;   // the lid: three boards across
    for (let i = 0; i < 3; i++) board(lw, t, D, -W / 2 + lw / 2 + i * (lw + gap), H - t / 2 + 0.004, 0, 0, cx, cy, cz, rot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // corner posts, a little proud of the boards
      const g = new THREE.BoxGeometry(0.05, H + 0.01, 0.05); g.translate(sx * (W / 2 - 0.012), (H + 0.01) / 2, sz * (D / 2 - 0.012));
      g.rotateY(rot); g.translate(cx, cy, cz); posts.push(colored(g, POST, 0.2, r));
    }
  };
  crate(0.76, 0.72, 1.1, -0.4, 0, 0.02, 0.04);
  crate(0.74, 0.7, 1.06, 0.41, 0, -0.03, -0.05);
  crate(0.7, 0.64, 0.92, 0.08, 0.725, 0.04, 0.16);
  return [[mergeGeometries(boards), 'planks'], [mergeGeometries(posts), 'timber']];
}

// Dress the doors of the houses (from the layout) and the market stalls. Uses kit.place, so it must run before kit.build().
// houses: [[id, placement], ...] where placement has x, z, rot, and anchor(name).
export function dressTown(kit, world, houses, stalls) {
  const rng = mulberry32(31415), put = (id, x, z, rot) => { if (world.walkable(x, z)) kit.place(id, x, z, rot, { zone: 'town' }); };
  const SMALL_JARS = ['hydria', 'pot_herb', 'pot_herb2', 'pot_herb', 'basket_onions'];
  for (const [id, p] of houses) {
    if (id === 'house_c') continue;   // its door is inside its own yard
    const d = p.anchor('door'), c = Math.cos(p.rot), s = Math.sin(p.rot);
    const ox = s, oz = c, tx = c, tz = -s;   // out from the wall, and along it
    const at = (along, out) => [d.x + tx * along + ox * out, d.z + tz * along + oz * out];
    const big = id === 'warehouse' || id === 'courtyard_house';
    if (!big && rng() < 0.35) { const [x, z] = at(rng() < 0.5 ? 0.95 : -0.95, 0.4); put('herm', x, z, p.rot); }
    for (const side of [1, -1]) {
      if (rng() > (big ? 0.8 : 0.6)) continue;
      let along = side * (1.25 + rng() * 0.4);
      const n = big ? 2 : 1 + (rng() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const r0 = rng();
        if (big) { const [x, z] = at(along, 0.55); put(r0 < 0.5 ? 'pithos' : 'amphora', x, z, rng() * 6.28); along += side * 1.1; continue; }
        if (r0 < 0.18) { const [x, z] = at(along + side * 0.35, 0.32); put('firewood', x, z, p.rot + Math.PI / 2); along += side * 1.2; }
        else if (r0 < 0.32) { const [x, z] = at(along, 0.45); put('stool', x, z, p.rot + (rng() - 0.5)); along += side * 0.7; }
        else if (r0 < 0.42) { const [x, z] = at(along, 0.4); put('amphora', x, z, rng() * 6.28); along += side * 0.6; }
        else { const [x, z] = at(along, 0.3); put(SMALL_JARS[Math.floor(rng() * SMALL_JARS.length)], x, z, rng() * 6.28); along += side * 0.5; }
      }
    }
  }
  // The market stalls: baskets of produce on the ground beside each, and a jar or two.
  const GOODS = ['basket_figs', 'basket_olives', 'basket_onions', 'basket_figs', 'hydria'];
  for (const p of stalls) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (const [lx, lz] of [[1.75, 0.6], [-1.75, 0.5], [1.85, -0.2], [-1.8, -0.3]]) {
      if (rng() < 0.25) continue;
      put(GOODS[Math.floor(rng() * GOODS.length)], p.x + lx * c + lz * s, p.z - lx * s + lz * c, rng() * 6.28);
    }
  }
}
