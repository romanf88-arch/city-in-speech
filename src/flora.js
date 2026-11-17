// Trees, shrubs, and grass, drawn in place of the low-poly kit models.
//
// Every plant is one of a few variants that are built in code when the game starts:
//   olives (5), cypresses (3), pines (3), shrubs (5 kinds on 2 forms), grass tufts (4 pictures on 1 form).
// A tree is a real trunk with branches plus many leaf cards. The leaf pictures and the bark are
// painted on a canvas at startup. Each tree has three levels: full detail near the camera, a
// reduced version in the middle distance (the same model with only its big limbs and a third of
// its leaf cards, enlarged), and far away a flat picture that turns to face the camera.
//
// All plants of one variant and level are drawn in a single call. The lists are refilled when the
// camera moves. They live under one group inside world.group, and a plant is only listed while
// kit.zone(its zone) is visible, so hiding a zone hides its plants.
//
// Use: kit.flora = new Flora(kit, world) before the layout runs, then flora.update(sky, camera, dt)
// every frame, after sky.update. The far pictures are drawn on the first update, which needs sky.renderer.
// Switches: flora.motion (0 stops the wind sway), flora.farShadows, flora.forceLod (testing).
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './util.js';

const V3 = THREE.Vector3;
const _fTint = new THREE.Color(0.95, 0.85, 0.62);
const CELL = 56;                       // map cells, the same size as kit.js uses
const NEAR = 46, FAR = 150;            // distances at which a tree changes level
const SMALL_NEAR = 92, SMALL_FAR = 240; // shrubs and grass: full form up to the first, shrub pictures up to the second
const AT_W = 2048, AT_H = 768, TILE = 256, LEAF_X0 = 512, BARK_W = 128, ACOLS = 6;   // layout of the leaf and bark picture
const TILES = ACOLS * AT_H / TILE;       // leaf squares in the sheet
const IMP_COLS = 8, IMP_ROWS = 4, IMP_FILL = 0.9, IMP_BASE = 0.05;                     // layout of the far pictures
const MID_CARD = 1.55;                 // how much the remaining leaf cards grow in the reduced level
const WIND_X = 0.94, WIND_Z = 0.34;    // the wind blows this way (the same way the clouds drift)

// Leaf pictures, by place in the sheet.
const T = { olive1: 0, olive2: 1, olive3: 2, pine1: 3, pine2: 4, cyp1: 5, cyp2: 6, lentisk: 7, myrtle: 8, broom: 9, oleander: 10, thorn: 11, grassDry: 12, grassGreen: 13, grassSeed: 14, thistle: 15 };

const hash = (x, z, k = 0) => {
  let h = Math.imul(Math.round(x * 13.7) + k * 7919, 374761393) ^ Math.imul(Math.round(z * 13.7) - k * 104729, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = (r, a) => a[Math.floor(r() * a.length)];

// ------------------------------------------------------------------------------------------------
// The picture sheet: four strips of bark on the left, then 256 pixel squares of leaves.
// ------------------------------------------------------------------------------------------------

function paintBark(ctx, strip, r, o) {
  const x0 = strip * BARK_W, H = AT_H;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, BARK_W, H); ctx.clip();
  ctx.fillStyle = o.base; ctx.fillRect(x0, 0, BARK_W, H);
  for (let i = 0; i < o.blotch; i++) {
    const x = x0 + r() * BARK_W, y = r() * H, w = 6 + r() * 16, h = w * (1.5 + r() * 3);
    ctx.fillStyle = pick(r, o.tones); ctx.globalAlpha = 0.25 + r() * 0.3;
    for (const dy of y < 50 ? [0, H] : y > H - 50 ? [0, -H] : [0]) { ctx.beginPath(); ctx.ellipse(x, y + dy, w / 2, h / 2, 0, 0, 6.3); ctx.fill(); }
  }
  // Furrows run along the trunk: a dark line with a pale edge beside it. One that runs off the end is drawn again at the start, so the strip repeats cleanly.
  for (let i = 0; i < o.furrows; i++) {
    let x = x0 + r() * BARK_W; const y = r() * H, len = o.flen[0] + r() * (o.flen[1] - o.flen[0]), w = o.fw[0] + r() * (o.fw[1] - o.fw[0]);
    const pts = [[x, y]]; for (let d = 12; d < len; d += 12) { x += (r() - 0.5) * o.wander * 1.4; pts.push([x, y + d]); }
    for (const dy of y + len > H ? [0, -H] : [0]) {
      ctx.globalAlpha = 0.75; ctx.strokeStyle = o.dark; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1] + dy) : ctx.moveTo(p[0], p[1] + dy))); ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.strokeStyle = o.light; ctx.lineWidth = Math.max(1, w * 0.6); ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0] + w, p[1] + dy) : ctx.moveTo(p[0] + w, p[1] + dy))); ctx.stroke();
    }
  }
  // Short cracks across, which break pine bark into plates.
  for (let i = 0; i < (o.cracks || 0); i++) {
    const x = x0 + r() * BARK_W, y = r() * H, l = 8 + r() * 18;
    ctx.globalAlpha = 0.7; ctx.strokeStyle = o.dark; ctx.lineWidth = 1.5 + r() * 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + (r() - 0.5) * 6); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();
}

// One leaf: a pointed oval that starts at (x, y) and runs along the angle.
function leafShape(ctx, ox, oy, x, y, ang, len, wid, fill, rib) {
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.setTransform(c, s, -s, c, ox + x, oy + y);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.4, -wid, len, 0); ctx.quadraticCurveTo(len * 0.4, wid, 0, 0);
  ctx.fillStyle = fill; ctx.fill();
  if (rib) { ctx.strokeStyle = rib; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke(); }
}

function dots(ctx, ox, oy, x, y, r, n, spread, rad, cols, center) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * spread, py = y + (r() - 0.5) * spread, rr = rad * (0.7 + r() * 0.5);
    ctx.fillStyle = pick(r, cols); ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.3); ctx.fill();
    if (center) { ctx.fillStyle = center; ctx.beginPath(); ctx.arc(px, py, rr * 0.3, 0, 6.3); ctx.fill(); }
  }
}

// A spray of leafy twigs that fan out from the bottom middle of the square. Used for olive, lentisk, myrtle, and oleander.
function paintSpray(ctx, ox, oy, r, o) {
  for (let pass = 0; pass < 2; pass++) {
    const stems = pass ? o.stems : Math.max(3, o.stems - 2), cols = pass ? o.cols : o.back;
    for (let s = 0; s < stems; s++) {
      let x = 128 + (r() - 0.5) * o.root, y = 252, a = -Math.PI / 2 + ((s + 0.5) / stems - 0.5) * o.fan + (r() - 0.5) * 0.2;
      const curl = (r() - 0.5) * o.curl, n = Math.floor(o.reach / o.step * (0.8 + r() * 0.3));
      for (let i = 0; i < n; i++) {
        const nx = x + Math.cos(a) * o.step, ny = y + Math.sin(a) * o.step;
        ctx.setTransform(1, 0, 0, 1, ox, oy);
        ctx.strokeStyle = o.stem; ctx.lineWidth = Math.max(1, o.stemW * (1 - i / n)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        if (i >= o.bare) for (let side = -1; side <= 1; side += 2) {
          const la = a + side * (o.ang[0] + r() * (o.ang[1] - o.ang[0])), len = o.len[0] + r() * (o.len[1] - o.len[0]), wid = o.wid[0] + r() * (o.wid[1] - o.wid[0]);
          leafShape(ctx, ox, oy, nx, ny, la, len, wid, pick(r, pass && r() < o.altP ? o.alt : cols), pass ? o.rib : null);
        }
        x = nx; y = ny; a += curl + (r() - 0.5) * o.wob;
        if (y < 16 || x < 16 || x > 240 || y > 253) break;
      }
      if (pass && o.tip) o.tip(ctx, ox, oy, x, y, r);
    }
  }
}

// Tufts of long needles on short twigs.
function paintPine(ctx, ox, oy, r) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  const fans = [];
  for (let f = 0; f < 9; f++) { const a = -Math.PI / 2 + ((f + 0.5) / 9 - 0.5) * 2.6 + (r() - 0.5) * 0.3, d = 60 + r() * 105; fans.push([128 + Math.cos(a) * d * 0.95, 236 + Math.sin(a) * d, a]); }
  for (const [x, y] of fans) { ctx.strokeStyle = '#6a4a37'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(128, 251); ctx.quadraticCurveTo(128 + (x - 128) * 0.3, y + (250 - y) * 0.35, x, y); ctx.stroke(); }
  // A dark core behind each tuft keeps it solid when it is seen small.
  for (const [x, y, a] of fans) {
    const cx = x + Math.cos(a) * 14, cy = y + Math.sin(a) * 14, g = ctx.createRadialGradient(cx, cy, 3, cx, cy, 27);
    g.addColorStop(0, 'rgba(44,68,38,1)'); g.addColorStop(0.55, 'rgba(50,78,42,0.95)'); g.addColorStop(1, 'rgba(56,86,46,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 27, 0, 6.3); ctx.fill();
  }
  for (const [x, y, a] of fans) for (let i = 0; i < 64; i++) {
    const na = a + (r() - 0.5) * 2.9, len = 36 + r() * 34, t = r();
    ctx.strokeStyle = t < 0.4 ? '#2f4a2c' : t < 0.75 ? '#3f6034' : t < 0.94 ? '#55783c' : '#7d8f4a'; ctx.lineWidth = 1.5 + r() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(na) * len, y + Math.sin(na) * len); ctx.stroke();
  }
}

// A flame-shaped frond of dense scale leaves.
function paintCypress(ctx, ox, oy, r, loose) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  const cols = ['#1a2917', '#253a20', '#33502b', '#4c6c3c'];
  const br = (x, y, a, len, w, d) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    ctx.strokeStyle = cols[Math.min(3, 3 - d + (r() < 0.3 ? 1 : 0))]; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    if (d <= 0) return;
    const n = d >= 2 ? 7 : 5;
    for (let i = 1; i <= n; i++) { const t = i / (n + 0.6), side = i % 2 ? 1 : -1; br(lerp(x, ex, t), lerp(y, ey, t), a + side * (0.3 + r() * 0.3), len * (0.42 * (1 - t) + 0.12), w * 0.74, d - 1); }
  };
  const n = loose ? 4 : 6;
  for (let s = 0; s < n; s++) { const f = (s + 0.5) / n - 0.5; br(128 + f * 120, 253, -Math.PI / 2 + f * (loose ? 0.9 : 0.5) + (r() - 0.5) * 0.12, 215 - Math.abs(f) * 150 + r() * 20, 9, 3); }
}

// Thin green stems with yellow flowers along the upper parts.
function paintBroom(ctx, ox, oy, r) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  for (let s = 0; s < 30; s++) {
    let x = 128 + (r() - 0.5) * 26, y = 253, a = -Math.PI / 2 + (r() - 0.5) * 1.5; const bend = (r() - 0.5) * 0.05, n = 14 + Math.floor(r() * 9);
    const col = pick(r, ['#566f33', '#64803a', '#4c632d', '#7a9144']);
    for (let i = 0; i < n; i++) {
      const nx = x + Math.cos(a) * 11, ny = y + Math.sin(a) * 11;
      ctx.strokeStyle = col; ctx.lineWidth = 3 - i / n * 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      if (i > n * 0.35 && r() < 0.75) { ctx.fillStyle = pick(r, ['#f2cc1c', '#e6b90e', '#f8de4c', '#f0c532']); ctx.beginPath(); ctx.ellipse(nx + (r() - 0.5) * 7, ny + (r() - 0.5) * 7, 4.4 + r() * 2, 3.2 + r() * 1.5, r() * 3, 0, 6.3); ctx.fill(); }
      x = nx; y = ny; a += bend + (r() - 0.5) * 0.12;
      if (y < 14 || x < 14 || x > 242) break;
    }
  }
}

// A grey-green cushion of zigzag twigs and spines.
function paintThorn(ctx, ox, oy, r) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  // Small clumps for the body, with gaps between them so that light gets in.
  for (let i = 0; i < 52; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6, d = 20 + r() * 150, x = 128 + Math.cos(a) * d * 0.9, y = 250 + Math.sin(a) * d;
    ctx.fillStyle = pick(r, ['#868a69', '#787c5d', '#93966f', '#6d7155']); ctx.beginPath(); ctx.ellipse(x, y, 9 + r() * 9, 7 + r() * 7, r() * 3, 0, 6.3); ctx.fill();
  }
  for (let s = 0; s < 85; s++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.7, d0 = r() * 90; let x = 128 + Math.cos(a) * d0, y = 250 + Math.sin(a) * d0;
    const col = pick(r, ['#9da182', '#b0b391', '#8a8f6e', '#c2c2a2', '#7e8263', '#a39a78']);
    for (let i = 0; i < 16; i++) {
      const na = a + (r() < 0.5 ? 1 : -1) * (0.3 + r() * 0.8), l = 9 + r() * 9, nx = x + Math.cos(na) * l, ny = y + Math.sin(na) * l;
      ctx.strokeStyle = col; ctx.lineWidth = 1.9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      const sa = na + (r() < 0.5 ? 1.2 : -1.2); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + Math.cos(sa) * 7, ny + Math.sin(sa) * 7); ctx.stroke();
      x = nx; y = ny; if (Math.hypot(x - 128, (y - 250) * 1.05) > 120 || y < 12) break;
    }
  }
}

// A clump of grass blades from the bottom middle. o.seed adds seed heads, o.green adds short green blades at the base.
function paintGrass(ctx, ox, oy, r, o) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  const blade = (x, y, a, len, w, col, droop) => {
    const mx = x + Math.cos(a) * len * 0.55, my = y + Math.sin(a) * len * 0.55, ex = mx + Math.cos(a + droop) * len * 0.45, ey = my + Math.sin(a + droop) * len * 0.45;
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(mx, my); ctx.stroke();
    ctx.lineWidth = w * 0.6; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
    return [ex, ey, a + droop];
  };
  for (let i = 0; i < o.n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * o.fan, len = o.len[0] + r() * (o.len[1] - o.len[0]), head = o.seed && r() < o.seed;
    const tip = blade(128 + (r() - 0.5) * 34, 254, head ? a * 0.6 - Math.PI * 0.2 : a, head ? len * 0.85 : len, 2.3 + r() * 1.6, pick(r, o.cols), (a + Math.PI / 2) * 0.6 + (r() - 0.5) * 0.3);
    if (head) for (let k = 0; k < 7; k++) {
      const px = tip[0] + Math.cos(tip[2]) * k * 4.5, py = tip[1] + Math.sin(tip[2]) * k * 4.5;
      ctx.fillStyle = pick(r, ['#d9c58a', '#c2aa69', '#e6d6a3']); ctx.beginPath(); ctx.ellipse(px, py, 6 - k * 0.5, 2.8, tip[2] + (k % 2 ? 0.6 : -0.6), 0, 6.3); ctx.fill();
    }
  }
  for (let i = 0; i < (o.green || 0); i++) blade(128 + (r() - 0.5) * 40, 254, -Math.PI / 2 + (r() - 0.5) * o.fan * 1.1, 45 + r() * 60, 2.8 + r() * 1.5, pick(r, ['#7d8f45', '#8e9f50', '#6c7f3c']), (r() - 0.5) * 0.5);
}

// A thistle: a pale branching stem, spiny leaves, purple heads.
function paintThistle(ctx, ox, oy, r) {
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  const heads = [];
  const spiny = (x, y, a, len) => {
    const c = Math.cos(a), s = Math.sin(a), k = 5, up = [], dn = [];
    for (let i = 1; i <= k; i++) {
      const t = i / k, wv = (1 - Math.abs(t - 0.4)) * len * 0.3, bx = x + c * len * t, by = y + s * len * t, hx = x + c * len * (t - 0.1), hy = y + s * len * (t - 0.1);
      up.push([hx - s * wv * 0.3, hy + c * wv * 0.3], [bx - s * wv, by + c * wv]); dn.push([hx + s * wv * 0.3, hy - c * wv * 0.3], [bx + s * wv, by - c * wv]);
    }
    ctx.fillStyle = pick(r, ['#8fa083', '#7d8f72', '#a0ae93']); ctx.beginPath(); ctx.moveTo(x, y);
    for (const p of up) ctx.lineTo(p[0], p[1]); ctx.lineTo(x + c * len * 1.12, y + s * len * 1.12); for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
    ctx.closePath(); ctx.fill();
  };
  const grow = (x, y, a, len, w, d) => {
    const n = Math.floor(len / 14);
    for (let i = 0; i < n; i++) {
      const nx = x + Math.cos(a) * 14, ny = y + Math.sin(a) * 14;
      ctx.strokeStyle = '#8b9977'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      if (i % 2 === 0 && i < n - 1) spiny(nx, ny, a + (i % 4 ? 1 : -1) * (0.9 + r() * 0.3), 40 - i * 1.6);
      if (d > 0 && (i === Math.floor(n * 0.4) || i === Math.floor(n * 0.65))) grow(nx, ny, a + (i % 2 ? 0.65 : -0.65), len * 0.42, w * 0.7, d - 1);
      x = nx; y = ny; a += (r() - 0.5) * 0.12;
    }
    heads.push([x, y, a]);
  };
  grow(128, 254, -Math.PI / 2 + (r() - 0.5) * 0.1, 196, 4.6, 1);
  for (const [x, y, a] of heads) {
    ctx.strokeStyle = '#6f8160'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 16; i++) { const b = i / 16 * 6.283; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * 18, y + Math.sin(b) * 18); ctx.stroke(); }
    ctx.fillStyle = '#6f8160'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.3); ctx.fill();
    for (let i = 0; i < 22; i++) { const b = a + (r() - 0.5) * 1.9, l = 15 + r() * 9; ctx.strokeStyle = r() < 0.5 ? '#9a5fb8' : '#b78ad2'; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); ctx.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); ctx.stroke(); }
  }
}

function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = AT_W; cv.height = AT_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tm = [performance.now()];
  paintBark(ctx, 0, mulberry32(11), { base: '#958e80', tones: ['#a8a295', '#827b6a', '#b3ae9f', '#766f60'], blotch: 260, furrows: 90, flen: [60, 320], fw: [1.5, 4.5], wander: 5, dark: '#454037', light: '#c0baab' });
  paintBark(ctx, 1, mulberry32(12), { base: '#7c6859', tones: ['#917463', '#6b5549', '#a48b7a', '#877b70'], blotch: 300, furrows: 60, flen: [50, 200], fw: [2, 5], wander: 6, dark: '#30251f', light: '#ad9686', cracks: 220 });
  paintBark(ctx, 2, mulberry32(13), { base: '#7b6a58', tones: ['#8c7b68', '#695a4a', '#96887a'], blotch: 120, furrows: 200, flen: [120, 500], fw: [1, 2.2], wander: 2, dark: '#40352b', light: '#a39683' });
  paintBark(ctx, 3, mulberry32(14), { base: '#8c8678', tones: ['#a6a68d', '#9c9684', '#7a7264', '#6f685a'], blotch: 320, furrows: 110, flen: [80, 400], fw: [2, 5.5], wander: 7, dark: '#474239', light: '#b5af9f' });
  tm.push(performance.now());
  const tile = (t, fn, seed, arg) => {
    const ox = LEAF_X0 + (t % ACOLS) * TILE, oy = Math.floor(t / ACOLS) * TILE;
    ctx.save(); ctx.beginPath(); ctx.rect(ox + 3, oy + 3, TILE - 6, TILE - 6); ctx.clip(); fn(ctx, ox, oy, mulberry32(seed), arg); ctx.restore();
  };
  const olive = { stems: 7, fan: 1.6, root: 26, curl: 0.07, wob: 0.18, reach: 215, step: 10, bare: 2, stem: '#7b7461', stemW: 2.4, ang: [0.5, 1.0], len: [22, 31], wid: [4.6, 6.2], rib: 'rgba(205,212,186,0.5)',
    back: ['#55633f', '#5e6c48', '#4d5a3b'], cols: ['#6f7f5a', '#7b8a64', '#86956e', '#657552'], alt: ['#b4bea2', '#c2cab2', '#a6b196'], altP: 0.35 };
  tile(T.olive1, paintSpray, 21, olive);
  tile(T.olive2, paintSpray, 22, Object.assign({}, olive, { stems: 6, fan: 1.9, altP: 0.42 }));
  tile(T.olive3, paintSpray, 23, Object.assign({}, olive, { stems: 8, fan: 1.3, altP: 0.2, tip: (c, ox, oy, x, y, r) => { if (r() < 0.4) dots(c, ox, oy, x, y, r, 2, 12, 4, ['#59663a', '#6b7a45']); } }));
  tile(T.pine1, paintPine, 31); tile(T.pine2, paintPine, 32);
  tile(T.cyp1, paintCypress, 41, false); tile(T.cyp2, paintCypress, 42, true);
  tile(T.lentisk, paintSpray, 51, { stems: 9, fan: 2.5, root: 30, curl: 0.06, wob: 0.2, reach: 205, step: 9, bare: 1, stem: '#6b3f33', stemW: 2.6, ang: [0.7, 1.2], len: [15, 21], wid: [6.5, 8.5], rib: 'rgba(120,150,95,0.55)',
    back: ['#22361f', '#2a4025', '#1d2f1b'], cols: ['#2f4a2b', '#3a5a31', '#466936', '#2a4327'], alt: ['#557a3c'], altP: 0.12, tip: (c, ox, oy, x, y, r) => { if (r() < 0.45) dots(c, ox, oy, x, y, r, 6, 13, 2.6, ['#8e2f2a', '#a33a2e', '#6f2420']); } });
  tile(T.myrtle, paintSpray, 52, { stems: 10, fan: 2.1, root: 30, curl: 0.05, wob: 0.16, reach: 205, step: 7, bare: 1, stem: '#5d4a36', stemW: 2.2, ang: [0.6, 1.0], len: [11, 15], wid: [5, 6.6], rib: 'rgba(150,180,110,0.5)',
    back: ['#2c4426', '#34502c'], cols: ['#3f5e33', '#4c6f3a', '#5a7d42', '#37552e'], alt: ['#6c9048'], altP: 0.15, tip: (c, ox, oy, x, y, r) => { if (r() < 0.6) dots(c, ox, oy, x, y, r, 3, 22, 4.6, ['#f4f1e4', '#ffffff'], '#d8c25a'); } });
  tile(T.oleander, paintSpray, 53, { stems: 6, fan: 1.25, root: 26, curl: 0.05, wob: 0.1, reach: 205, step: 13, bare: 2, stem: '#6f7a4c', stemW: 3, ang: [0.3, 0.7], len: [40, 56], wid: [6, 8.4], rib: 'rgba(170,195,130,0.6)',
    back: ['#2c4429', '#35502f'], cols: ['#3d5b36', '#4b6c3f', '#5b7a48', '#345030'], alt: ['#6b8a50'], altP: 0.15, tip: (c, ox, oy, x, y, r) => dots(c, ox, oy, x, y, r, 6, 26, 8.5, ['#e27fa0', '#d9668d', '#efa3bb', '#e793ad'], '#b8456c') });
  tile(T.broom, paintBroom, 54); tile(T.thorn, paintThorn, 55);
  const straw = ['#d9c27a', '#c9ad5e', '#e6d596', '#bfa257', '#d2b96c'];
  tile(T.grassDry, paintGrass, 61, { n: 60, fan: 1.9, len: [110, 215], cols: straw });
  tile(T.grassGreen, paintGrass, 62, { n: 46, fan: 1.8, len: [100, 200], cols: straw, green: 30 });
  tile(T.grassSeed, paintGrass, 63, { n: 54, fan: 1.5, len: [130, 225], cols: straw, seed: 0.3, green: 8 });
  tile(T.thistle, paintThistle, 64);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  tm.push(performance.now());
  const base = new Uint8Array(ctx.getImageData(0, 0, AT_W, AT_H).data.buffer);
  tm.push(performance.now());
  // Give the clear pixels of each square the average leaf color, so that leaf edges do not get a dark fringe.
  const cov = [];
  for (let t = 0; t < TILES; t++) {
    const x0 = LEAF_X0 + (t % ACOLS) * TILE, y0 = Math.floor(t / ACOLS) * TILE; let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const k = ((y0 + y) * AT_W + x0 + x) * 4; if (base[k + 3] > 128) { sr += base[k]; sg += base[k + 1]; sb += base[k + 2]; n++; } }
    cov.push(n / (TILE * TILE)); if (!n) continue;
    sr /= n; sg /= n; sb /= n;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const k = ((y0 + y) * AT_W + x0 + x) * 4; if (base[k + 3] < 6) { base[k] = sr; base[k + 1] = sg; base[k + 2] = sb; } }
  }
  // Smaller copies for distance. In each one the leaves are thickened just enough that as much of the
  // square passes the cut-out test as in the full picture, so that crowns do not thin out far away.
  tm.push(performance.now());
  const mips = [{ data: base, width: AT_W, height: AT_H }], hist = new Uint32Array(256);
  let src = base, w = AT_W, h = AT_H, lvl = 0;
  while (w > 32) {
    const nw = w >> 1, nh = h >> 1, dst = new Uint8Array(nw * nh * 4); lvl++;
    for (let y = 0; y < nh; y++) { let a = y * 2 * w * 4, b = a + w * 4, o = y * nw * 4; for (let x = 0; x < nw; x++, a += 8, b += 8, o += 4) for (let c = 0; c < 4; c++) dst[o + c] = (src[a + c] + src[a + 4 + c] + src[b + c] + src[b + 4 + c] + 2) >> 2; }
    const ts = TILE >> lvl;
    for (let t = 0; t < TILES; t++) {
      if (!cov[t]) continue;
      const x0 = (LEAF_X0 >> lvl) + (t % ACOLS) * ts, y0 = Math.floor(t / ACOLS) * ts; hist.fill(0);
      for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) hist[dst[((y0 + y) * nw + x0 + x) * 4 + 3]]++;
      const need = cov[t] * ts * ts; let th = 255, acc = 0; while (th > 1 && acc + hist[th] <= need) { acc += hist[th]; th--; }
      const s = clamp(128 / Math.max(th, 1), 1, 4);
      if (s > 1.01) for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) { const k = ((y0 + y) * nw + x0 + x) * 4 + 3; dst[k] = Math.min(255, dst[k] * s); }
    }
    mips.push({ data: dst, width: nw, height: nh }); src = dst; w = nw; h = nh;
  }
  const tex = new THREE.DataTexture(base, AT_W, AT_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = mips; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapNearestFilter;   // the cheaper of the two smooth ways to shrink a picture: leaves are looked up very many times
  tex.needsUpdate = true;
  tm.push(performance.now());
  tex.userData.ms = { bark: tm[1] - tm[0], leaves: tm[2] - tm[1], read: tm[3] - tm[2], fill: tm[4] - tm[3], mips: tm[5] - tm[4] };   // where the time went, for testing
  return tex;
}

// ------------------------------------------------------------------------------------------------
// Building the models
// ------------------------------------------------------------------------------------------------

// Collects the points and triangles of one model. Triangles go into four lists:
//   0 big wood, 1 the leaf cards that every level draws, 2 small wood, 3 the other leaf cards.
// Lists 0 and 1 come first in the finished model, so the reduced level and the shadow can draw just that part.
class Geo {
  constructor() {
    this.p = []; this.n = []; this.uv = []; this.o = []; this.d = []; this.ix = [[], [], [], []]; this.nv = 0;
    this.leaf = 1;                                         // how leaf-like the cards are: 1 thin leaves that pass light, less for needles
    this.vary = 0.2;                                       // how much one card may be darker than the next
    this.bend = () => 0;                                   // how much a point sways in the wind
    this.shade = (x, y, z, out) => { out.x = 0; out.y = 1; out.z = 0; out.ao = 1; };   // leaf normal and darkening
    this._s = { x: 0, y: 1, z: 0, ao: 1 };
  }
  v(x, y, z, nx, ny, nz, u, v, ox, oy, oz, bend, leaf, ao, ph) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.o.push(ox, oy, oz); this.d.push(bend, leaf, ao, ph); return this.nv++; }
  // A branch: a tube along the points, with a radius at each point.
  tube(bucket, pts, rad, sides, strip, o) {
    o = o || {};
    const n = pts.length, base = this.nv, u0 = (strip * BARK_W + 3) / AT_W, u1 = ((strip + 1) * BARK_W - 3) / AT_W;
    const tan = new V3(), nx = new V3(), bx = new V3(); let len = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      tan.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
      if (i === 0) { nx.set(1, 0, 0); if (Math.abs(tan.x) > 0.9) nx.set(0, 0, 1); } else len += p.distanceTo(pts[i - 1]);
      nx.addScaledVector(tan, -nx.dot(tan)).normalize(); bx.crossVectors(tan, nx);
      const bend = this.bend(p.x, p.y, p.z), flare = o.flare ? 1 + o.flare * Math.exp(-Math.max(0, p.y) / 0.28) : 1;
      for (let k = 0; k < sides; k++) {
        const a = k / sides * Math.PI * 2, af = a + (o.twist || 0) * len; let r = rad[i] * flare;
        if (o.flute) r *= 1 + o.flute * Math.sin(af * o.lobes + (o.seed || 0)) + o.flute * 0.5 * Math.sin(af * 2 + len * 0.9);
        const ca = Math.cos(a), sa = Math.sin(a), dx = nx.x * ca + bx.x * sa, dy = nx.y * ca + bx.y * sa, dz = nx.z * ca + bx.z * sa, f = k / sides;
        // The bark strip is laid around the branch there and back, so it needs no seam.
        this.v(p.x + dx * r, p.y + dy * r, p.z + dz * r, dx, dy, dz, lerp(u0, u1, f < 0.5 ? f * 2 : 2 - f * 2), len / 3, 0, 0, 0, bend, 0, o.ao || 1, 0);
      }
    }
    const ix = this.ix[bucket];
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) { const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides; ix.push(a, b, b + sides, a, b + sides, a + sides); }
  }
  // A leaf card: a flat square picture that starts at b, runs along u, and is sw wide along w.
  card(bucket, b, u, w, sw, sh, tile, flip, ph) {
    const col = tile % ACOLS, row = Math.floor(tile / ACOLS), m = 3 / TILE, s = this._s, i0 = this.nv;
    const cx = b.x + u.x * sh * 0.5, cy = b.y + u.y * sh * 0.5, cz = b.z + u.z * sh * 0.5, dim = 1 - this.vary * ((ph * 7.3) % 1);
    for (let k = 0; k < 4; k++) {
      const sx = (k === 0 || k === 3) ? -0.5 : 0.5, ty = k < 2 ? 0 : 1;
      const x = b.x + w.x * sx * sw + u.x * ty * sh, y = b.y + w.y * sx * sw + u.y * ty * sh, z = b.z + w.z * sx * sw + u.z * ty * sh;
      this.shade(x, y, z, s);
      this.v(x, y, z, s.x, s.y, s.z, (LEAF_X0 + (col + (sx * flip > 0 ? 1 - m : m)) * TILE) / AT_W, (row + (ty ? m : 1 - m)) * TILE / AT_H, x - cx, y - cy, z - cz, this.bend(x, y, z), this.leaf, s.ao * dim, ph);
    }
    this.ix[bucket].push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  finish(name) {
    const ix = this.ix, index = ix[0].concat(ix[1], ix[2], ix[3]), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('aOff', new THREE.Float32BufferAttribute(this.o, 3));
    geo.setAttribute('aData', new THREE.Float32BufferAttribute(this.d, 4));
    geo.setIndex(index);
    let h = 0, rad = 0; for (let i = 0; i < this.p.length; i += 3) { h = Math.max(h, this.p[i + 1]); rad = Math.max(rad, Math.hypot(this.p[i], this.p[i + 2])); }
    geo.boundingSphere = new THREE.Sphere(new V3(0, h / 2, 0), Math.hypot(h / 2 + 0.5, rad));
    const prefix = ix[0].length + ix[1].length;
    // The reduced level shares the same data and draws only the first part of it.
    const mid = new THREE.BufferGeometry(); for (const k in geo.attributes) mid.setAttribute(k, geo.attributes[k]);
    mid.setIndex(geo.index); mid.setDrawRange(0, prefix); mid.boundingSphere = geo.boundingSphere;
    return { name, geo, mid, prefix, full: index.length, h, rad, tris: index.length / 3, midTris: prefix / 3 };
  }
}

const _q = new V3();
const randUnit = (r, out) => { const y = r() * 2 - 1, a = r() * 6.2832, s = Math.sqrt(1 - y * y); return out.set(Math.cos(a) * s, y, Math.sin(a) * s); };

// Grow one branch, then fork into the next ones. The ends are collected in `tips`, where the leaves go.
function growBranch(g, S, r, p0, d0, len, r0, lvl, tips) {
  const segs = S.segs[lvl], pts = [p0.clone()], rad = [r0], r1 = r0 * S.taper[lvl], d = d0.clone(), p = p0.clone(), gn = S.gnarl[lvl];
  for (let i = 1; i <= segs; i++) {
    d.x += (r() - 0.5) * gn; d.z += (r() - 0.5) * gn; d.y += (r() - 0.5) * gn * 0.5 + S.lift[lvl];
    if (lvl === 0 && S.pull) { d.x += S.pull[0]; d.z += S.pull[1]; }
    if (lvl > 0) { if (p.y > S.ceil) d.y = Math.min(d.y, -0.02); else if (p.y < S.floor) d.y = Math.max(d.y, 0.3); }
    d.normalize(); p.addScaledVector(d, len / segs);
    pts.push(p.clone()); rad.push(lerp(r0, r1, i / segs));
    if (lvl >= S.leafFrom && i < segs && (i % 2 === 0 || (lvl === S.leafFrom && i > 1))) tips.push({ p: p.clone(), d: d.clone(), k: 0.75 });
  }
  pts.push(p.clone().addScaledVector(d, r1 * 0.9)); rad.push(r1 * 0.3);       // a closed end, so a joint is not an open pipe
  g.tube(lvl <= S.prefixLvl ? 0 : 2, pts, rad, S.sides[lvl], S.bark, lvl === 0 ? S.trunk : { ao: lvl >= 2 ? 0.78 : 0.9 });
  if (lvl >= S.levels) { tips.push({ p: p.clone(), d: d.clone(), k: 1 }); return; }
  const k = S.forks[lvl][0] + Math.floor(r() * (S.forks[lvl][1] - S.forks[lvl][0] + 1));
  const a = new V3(1, 0, 0); if (Math.abs(d.x) > 0.8) a.set(0, 0, 1); a.addScaledVector(d, -a.dot(d)).normalize(); const b = new V3().crossVectors(d, a);
  const az0 = r() * 6.283;
  for (let j = 0; j < k; j++) {
    const az = az0 + j / k * 6.283 + (r() - 0.5) * 0.6, sp = S.spread[lvl][0] + r() * (S.spread[lvl][1] - S.spread[lvl][0]);
    const cd = d.clone().multiplyScalar(Math.cos(sp)).addScaledVector(a, Math.cos(az) * Math.sin(sp)).addScaledVector(b, Math.sin(az) * Math.sin(sp));
    growBranch(g, S, r, p.clone().addScaledVector(d, -r1 * 0.3), cd, S.len[lvl + 1] * (0.8 + r() * 0.4), r1 * S.radK[lvl], lvl + 1, tips);
  }
}

// Put a puff of leaf cards at each branch end.
function addFoliage(g, S, r, tips) {
  const C = new V3(); let lo = Infinity, hi = -Infinity;
  for (const t of tips) { C.add(t.p); lo = Math.min(lo, t.p.y); hi = Math.max(hi, t.p.y); }
  C.multiplyScalar(1 / tips.length); C.y = lerp(lo, hi, S.coreY);
  let R = 0; for (const t of tips) R = Math.max(R, Math.hypot(t.p.x - C.x, t.p.z - C.z)); R += S.puffR;
  const RY = hi - C.y + S.puffR;
  // Leaf normals point away from the middle of the crown, so the crown is lit as one soft rounded mass.
  // Leaves deep inside and on the underside are darkened.
  g.shade = (x, y, z, o) => {
    let nx = (x - C.x) / R, ny = (y - C.y) / RY, nz = (z - C.z) / R; const l = Math.hypot(nx, ny, nz);
    o.ao = clamp(S.aoMin + (1 - S.aoMin) * Math.pow(Math.min(1, l), 1.5), 0, 1) * (y < C.y ? lerp(1, 0.78, clamp((C.y - y) / RY, 0, 1)) : 1);
    ny = ny * S.nyK + S.nyUp; const m = Math.hypot(nx, ny, nz) || 1; o.x = nx / m; o.y = ny / m; o.z = nz / m;
  };
  const u = new V3(), w = new V3(), b = new V3(); let ci = 0;
  for (const t of tips) {
    const pc = t.p.clone().addScaledVector(t.d, 0.2), pr = S.puffR * t.k * (0.85 + r() * 0.3), n = Math.round(S.cards * t.k);
    for (let i = 0; i < n; i++) {
      randUnit(r, u).addScaledVector(t.d, S.fwd); u.x += (pc.x - C.x) / R * S.out; u.z += (pc.z - C.z) / R * S.out; u.y += S.up; u.normalize();
      w.crossVectors(u, randUnit(r, _q)).normalize();
      b.copy(pc).addScaledVector(randUnit(r, _q), pr * 0.45 * r());
      const sw = S.cw * (0.85 + r() * 0.3), sh = S.ch * (0.85 + r() * 0.3);
      // Keep leaves above head height near the trunk. Further out they may hang a little lower.
      const low = Math.min(b.y, b.y + u.y * sh) - Math.abs(w.y) * sw * 0.5, out = Math.hypot(b.x, b.z), minY = S.minLeaf - (out > 1.8 ? Math.min(0.3, (out - 1.8) * 0.3) : 0);
      if (low < minY) b.y += minY - low;
      g.card(ci % 3 === 0 ? 1 : 3, b, u, w, sw, sh, pick(r, S.tiles), r() < 0.5 ? -1 : 1, r() * 6.283);
      ci++;
    }
  }
}

const OLIVE = { bark: 0, levels: 3, segs: [6, 5, 4, 3], sides: [10, 6, 4, 3], taper: [0.85, 0.72, 0.65, 0.5], gnarl: [0.28, 0.42, 0.5, 0.5], lift: [0.04, 0.09, 0.07, 0.0],
  forks: [[3, 3], [2, 3], [2, 2]], spread: [[0.6, 0.9], [0.45, 0.8], [0.4, 0.75]], len: [1.8, 1.25, 1.0, 0.75], radK: [0.66, 0.64, 0.6], trunkR: 0.27,
  ceil: 4.1, floor: 2.9, prefixLvl: 1, leafFrom: 2, cards: 10, puffR: 0.55, cw: 0.8, ch: 0.85, tiles: [T.olive1, T.olive2, T.olive3], up: 0.1, out: 0.6, fwd: 0.5, flex: 0.55, stiff: 1.4, minLeaf: 2.75,
  coreY: 0.3, aoMin: 0.52, nyK: 1, nyUp: 0.1, H: 5.3, trunk: { flute: 0.2, lobes: 3, twist: 1.3, flare: 0.4 } };
// The trunks stay inside the circle that the kit registers for walking into a tree (0.5 m for an olive, 0.4 m for a pine, times the scale).
const OLIVES = [
  { seed: 101 },                                                                                             // one trunk, three limbs, a round open crown
  { seed: 202, twin: true, trunkR: 0.2, forks: [[2, 2], [2, 3], [2, 2]] },                                   // two stems from one root
  { seed: 303, bark: 3, trunkR: 0.34, len: [1.6, 1.4, 1.05, 0.75], forks: [[4, 4], [2, 2], [2, 2]], spread: [[0.75, 1.0], [0.45, 0.8], [0.4, 0.75]], ceil: 3.9, cards: 11, radK: [0.56, 0.64, 0.6], trunk: { flute: 0.2, lobes: 4, twist: 0.9, flare: 0.2 } },   // old and thick, broad and low
  { seed: 404, pull: [0.035, 0.015], gnarl: [0.3, 0.45, 0.5, 0.5] },                                        // leaning, with the crown carried to one side
  { seed: 505, trunkR: 0.22, len: [2.2, 1.2, 0.95, 0.7], spread: [[0.4, 0.62], [0.35, 0.6], [0.35, 0.6]], ceil: 4.7, floor: 3.1 },   // young, slender and upright
];
// Pines. The crown is a shallow dome on a bare trunk: R is its radius, base and dome its underside and its depth.
const PINE_LEAF = { cards: 11, puffR: 0.7, cw: 1.0, ch: 0.95, tiles: [T.pine1, T.pine2], up: 0.8, out: 0.5, fwd: 0.3, minLeaf: 4.6, coreY: 0.1, aoMin: 0.55, nyK: 1.3, nyUp: 0.25 };
const PINES = [
  { seed: 117, trunkH: 5.7, R: 3.15, dome: 1.9, base: 6.7, limbs: 6, n: 30, lean: [0.02, -0.01], bend: 0.03, jit: 0.2 },                      // the classic umbrella
  { seed: 222, trunkH: 5.4, R: 2.85, dome: 2.1, base: 6.4, limbs: 5, n: 26, lean: [0.1, 0.04], bend: 0.04, jit: 0.3, shift: [0.5, 0.2] },     // leaning, the crown carried to one side
  { seed: 333, trunkH: 5.1, R: 2.6, dome: 2.9, base: 6.1, limbs: 5, n: 26, lean: [-0.04, 0.06], bend: 0.04, jit: 0.45, low: true },           // rounder and less even, like an Aleppo pine
];
function buildPine(name, P) {
  const r = mulberry32(P.seed), g = new Geo(), tips = [], S = Object.assign({}, PINE_LEAF, P), H = P.base + P.dome + 0.4;
  g.leaf = 0.5;
  g.bend = (x, y) => 0.9 * Math.pow(clamp((y - 2.5) / (H - 2.5), 0, 1.2), 1.5);
  // The trunk: bare, leaning a little, with a slow curve.
  const tp = [], tr = [], ph = r() * 6.283;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, y = -0.4 + (P.trunkH + 0.4) * t, k = Math.max(0, y) / P.trunkH, wob = Math.sin(k * 3.1 + ph) * P.bend * P.trunkH * k * (1.15 - k) * 2;
    tp.push(new V3(P.lean[0] * P.trunkH * k * k + wob * Math.cos(ph), y, P.lean[1] * P.trunkH * k * k + wob * Math.sin(ph))); tr.push(lerp(0.3, 0.19, t));
  }
  const top = tp[8].clone();
  tp.push(top.clone().add(new V3(0, 0.25, 0))); tr.push(0.07);
  g.tube(0, tp, tr, 8, 1, { flute: 0.06, lobes: 5, twist: 0.3, flare: 0.3, seed: P.seed });
  // Limbs rise from the top of the trunk like the ribs of an umbrella, and one goes straight up.
  const cx = top.x + (P.shift ? P.shift[0] : 0), cz = top.z + (P.shift ? P.shift[1] : 0), K = P.limbs, az0 = r() * 6.283, limbs = [];
  const bez = (a, c, b, t, out) => out.set(0, 0, 0).addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(c, 2 * t * (1 - t)).addScaledVector(b, t * t);
  for (let k = 0; k <= K; k++) {
    const leader = k === K, az = az0 + k / K * 6.283 + (r() - 0.5) * 0.4, d = leader ? 0.15 : P.R * (0.5 + r() * 0.12);
    const end = new V3(cx + Math.cos(az) * d, P.base + P.dome * (leader ? 0.55 : 0.3) - 0.3, cz + Math.sin(az) * d);
    const ctl = new V3(lerp(top.x, end.x, 0.45), lerp(top.y, end.y, 0.78), lerp(top.z, end.z, 0.45));
    const pts = [], rad = [], n = leader ? 3 : 5, start = top.clone(); start.y -= 0.15;
    for (let i = 0; i <= n; i++) { const p = bez(start, ctl, end, i / n, new V3()); if (i > 0 && i < n) { p.x += (r() - 0.5) * 0.14; p.y += (r() - 0.5) * 0.1; p.z += (r() - 0.5) * 0.14; } pts.push(p); rad.push(lerp(leader ? 0.1 : 0.115, 0.05, i / n)); }
    g.tube(0, pts, rad, leader ? 5 : 6, 1, { ao: 0.9 });
    limbs.push({ az, pts, leader });
  }
  // Points are spread evenly over the dome, and a branch is grown from the nearest limb to each of them.
  const at = (pts, t, out) => { const f = clamp(t, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return out.lerpVectors(pts[i], pts[i + 1], f - i); };
  const dAng = (a, b) => { let d = (a - b) % 6.2832; if (d > 3.1416) d -= 6.2832; if (d < -3.1416) d += 6.2832; return Math.abs(d); };
  const A = new V3(), B = new V3(), M = new V3();
  const reach = (pts0, t, bx, by, bz, bucket, r0) => {
    at(pts0, t, A); B.set(bx, by, bz); M.lerpVectors(A, B, 0.5); const len = A.distanceTo(B); M.y += len * 0.14; M.x += (r() - 0.5) * 0.2; M.z += (r() - 0.5) * 0.2;
    const pts = [], rad = []; for (let i = 0; i <= 3; i++) { pts.push(bez(A, M, B, i / 3, new V3())); rad.push(lerp(r0, r0 * 0.4, i / 3)); }
    g.tube(bucket, pts, rad, bucket ? 3 : 4, 1, { ao: 0.8 });
    const d = B.clone().sub(M).normalize(); tips.push({ p: B.clone(), d, k: 1 });
    if (len > 1.3) tips.push({ p: bez(A, M, B, 0.55, new V3()), d, k: 0.7 });
  };
  for (let i = 0; i < P.n; i++) {
    const rr = P.R * Math.sqrt((i + 0.6) / P.n) * (1 + (r() - 0.5) * P.jit), th = i * 2.39996 + r() * 0.5, q = Math.min(1, rr / P.R);
    const y = P.base + P.dome * Math.pow(Math.max(0, 1 - q * q), 0.65) * (1 + (r() - 0.5) * P.jit) - 0.45;
    let best = limbs[K];
    if (q > 0.3) { let bd = 9; for (const l of limbs) { const da = l.leader ? 9 : dAng(th, l.az); if (da < bd) { bd = da; best = l; } } }
    reach(best.pts, best.leader ? 0.3 + r() * 0.7 : clamp(q / 0.55 * 0.8, 0.3, 1), cx + Math.cos(th) * rr, y, cz + Math.sin(th) * rr, 2, 0.045);
  }
  // One limb lower down, as old pines often keep.
  if (P.low) { const az = az0 + 1.3, a = tp[6]; reach([a, a], 0, a.x + Math.cos(az) * 2.1, Math.max(a.y + 0.9, S.minLeaf), a.z + Math.sin(az) * 2.1, 0, 0.075); }
  addFoliage(g, S, r, tips);
  return g.finish(name);
}

function buildBranched(name, base, over) {
  const S = Object.assign({}, base, over), r = mulberry32(S.seed), g = new Geo(), tips = [];
  g.bend = (x, y) => S.flex * Math.pow(clamp((y - S.stiff) / (S.H - S.stiff), 0, 1.2), 1.5);
  S.trunk = Object.assign({ seed: S.seed }, S.trunk);
  if (S.twin) {
    for (const sx of [-1, 1]) growBranch(g, S, r, new V3(sx * 0.13, -0.4, 0), new V3(sx * 0.14, 1, (r() - 0.5) * 0.14).normalize(), S.len[0] * (0.9 + r() * 0.2), S.trunkR, 0, tips);
  } else growBranch(g, S, r, new V3(0, -0.4, 0), new V3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize(), S.len[0], S.trunkR, 0, tips);
  addFoliage(g, S, r, tips);
  return g.finish(name);
}

const CYPRESSES = [
  { seed: 121, H: 8.8, R: 0.6, e1: 1.3, e2: 0.85, cards: 150, cardK: 1, tilt: [0.06, 0.2], wave: 0.02 },     // slim, drawn to a point
  { seed: 232, H: 8.2, R: 0.95, e1: 2.2, e2: 0.8, cards: 180, cardK: 1.12, tilt: [0.08, 0.26], wave: 0.03 }, // fuller, with round shoulders
  { seed: 343, H: 9.4, R: 0.76, e1: 1.7, e2: 0.9, cards: 170, cardK: 1.08, tilt: [0.14, 0.4], wave: 0.07 },  // tall and a little shaggy, the top bent
];
function buildCypress(name, P) {
  const r = mulberry32(P.seed), g = new Geo(), H = P.H, h0 = 0.45; g.leaf = 0.45;
  const lean = [(r() - 0.5) * 0.03, (r() - 0.5) * 0.03];
  const axis = (y) => [lean[0] * y + P.wave * (y / H) * y * Math.sin(y * 0.5 + P.seed), lean[1] * y + P.wave * (y / H) * y * Math.cos(y * 0.43 + P.seed)];
  const prof = (t) => P.R * (0.72 + 0.28 * clamp(t / 0.25, 0, 1)) * Math.pow(Math.max(0, 1 - Math.pow(t, P.e1)), P.e2);
  g.bend = (x, y) => 1.2 * Math.pow(clamp(y / H, 0, 1), 1.8);
  const pts = [], rad = [];
  for (let i = 0; i <= 5; i++) { const y = -0.4 + (H * 0.8 + 0.4) * i / 5, a = axis(Math.max(y, 0)); pts.push(new V3(a[0], y, a[1])); rad.push(lerp(0.17, 0.03, i / 5)); }
  g.tube(0, pts, rad, 6, 2, { flare: 0.5 });
  g.shade = (x, y, z, o) => {
    const a = axis(Math.max(y, 0)), dx = x - a[0], dz = z - a[1], l = Math.hypot(dx, dz) || 1e-3, t = clamp((y - h0) / (H - h0), 0, 1), pr = prof(t) + 0.15;
    o.ao = clamp(0.4 + 0.6 * Math.pow(Math.min(1, l / pr), 1.3), 0, 1) * lerp(0.8, 1, clamp(t * 3, 0, 1));
    const ny = 0.3 + t * 0.5, m = Math.hypot(1, ny); o.x = dx / l / m; o.z = dz / l / m; o.y = ny / m;
  };
  const u = new V3(), w = new V3(), b = new V3();
  for (let i = 0; i < P.cards; i++) {
    // Fronds stand all round the column, half of them facing out and half edge-on, each leaning out a little at the top.
    const t = Math.pow((i + r()) / P.cards, 1.15) * 0.93, y = h0 + t * (H - h0), pr = prof(t), th = i * 2.39996 + r() * 0.5, a = axis(y);
    const ch = (1.25 + r() * 0.5) * P.cardK * lerp(1, 0.75, t), cw = clamp(pr * 1.5, 0.35, 1.0) * (0.85 + r() * 0.3) * P.cardK;
    const facing = i % 2 === 0, cs = Math.cos(th), sn = Math.sin(th), tilt = P.tilt[0] + r() * (P.tilt[1] - P.tilt[0]);
    u.set(cs * Math.sin(tilt), Math.cos(tilt), sn * Math.sin(tilt));
    if (facing) w.set(-sn, 0, cs); else { const k = (r() - 0.5) * 0.8; w.set(cs - sn * k, 0, sn + cs * k).normalize(); }
    const rr = pr * (facing ? 0.62 : 0.42);
    b.set(a[0] + cs * rr, Math.max(0.25, y - ch * 0.3), a[1] + sn * rr);
    g.card(i % 3 === 0 ? 1 : 3, b, u, w, cw, ch, r() < 0.5 ? T.cyp1 : T.cyp2, r() < 0.5 ? -1 : 1, r() * 6.283);
  }
  for (let k = 0; k < 3; k++) {                                        // the tip
    const th = k * 2.094 + r(), a = axis(H - 1.2); b.set(a[0], H - 1.4, a[1]); u.set(0, 1, 0); w.set(Math.cos(th), 0, Math.sin(th));
    g.card(k === 0 ? 1 : 3, b, u, w, 0.5 * P.cardK, 1.4, T.cyp1, 1, r() * 6.283);
  }
  return g.finish(name);
}

// Shrubs and grass are built with the first leaf picture. Each plant then says which picture it really uses.
function buildMound() {
  const r = mulberry32(71), g = new Geo(), u = new V3(), w = new V3(), b = new V3(), N = 46;
  g.bend = (x, y) => 0.25 * clamp(y, 0, 1);
  g.shade = (x, y, z, o) => { const l = Math.hypot(x, y - 0.1, z) || 1; let ny = (y - 0.1) / l * 0.8 + 0.3; const nx = x / l, nz = z / l, m = Math.hypot(nx, ny, nz); o.x = nx / m; o.y = ny / m; o.z = nz / m; o.ao = clamp(0.42 + 0.62 * l / 0.9, 0, 1); };
  for (let i = 0; i < N; i++) {
    const yv = lerp(0.1, 0.98, (i + 0.5) / N), az = i * 2.39996, s = Math.sqrt(1 - yv * yv);
    u.set(Math.cos(az) * s, yv, Math.sin(az) * s); w.crossVectors(u, randUnit(r, _q)).normalize();
    b.copy(u).multiplyScalar(0.08 + r() * 0.08); b.y += 0.02;
    g.card(1, b, u, w, 0.72 + r() * 0.2, 0.78 + r() * 0.16, 0, r() < 0.5 ? -1 : 1, r() * 6.283);
  }
  return g.finish('mound');
}
function buildSpray() {
  const r = mulberry32(72), g = new Geo(), u = new V3(), w = new V3(), b = new V3(), N = 24;
  g.bend = (x, y) => 0.5 * clamp(y, 0, 1.2);
  g.shade = (x, y, z, o) => { const nx = x * 1.4, nz = z * 1.4, m = Math.hypot(nx, 0.6, nz); o.x = nx / m; o.y = 0.6 / m; o.z = nz / m; o.ao = clamp(0.5 + 0.5 * y, 0, 1); };
  for (let i = 0; i < N; i++) {
    const tilt = 0.06 + 0.5 * (i + 0.5) / N, az = i * 2.39996;
    u.set(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)); w.crossVectors(u, randUnit(r, _q)).normalize();
    b.set(Math.cos(az) * 0.1 * i / N, -0.03, Math.sin(az) * 0.1 * i / N);
    g.card(1, b, u, w, 0.62 + r() * 0.18, 0.85 + r() * 0.2, 0, r() < 0.5 ? -1 : 1, r() * 6.283);
  }
  return g.finish('spray');
}
function buildTuft() {
  const g = new Geo(), u = new V3(), w = new V3(), b = new V3();
  g.bend = (x, y) => 0.7 * clamp(y / 0.65, 0, 1);
  g.shade = (x, y, z, o) => { const nx = x * 0.5, nz = z * 0.5, m = Math.hypot(nx, 1, nz); o.x = nx / m; o.y = 1 / m; o.z = nz / m; o.ao = lerp(0.62, 1, clamp(y / 0.55, 0, 1)); };
  for (let i = 0; i < 4; i++) {
    const az = i * 1.571 + 0.4, tilt = 0.3;
    u.set(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)); w.set(-Math.sin(az), 0, Math.cos(az)); b.set(Math.cos(az) * 0.05, -0.04, Math.sin(az) * 0.05);
    g.card(1, b, u, w, 0.82, 0.62, 0, i % 2 ? -1 : 1, i * 1.3);
  }
  return g.finish('tuft');
}

// The five shrubs: which form, which leaf picture, and how wide and tall (times the form's own size of about 1.8 by 0.95 m, or 1.3 by 1 m).
const SHRUBS = [
  { name: 'lentisk', form: 'mound', tile: T.lentisk, sx: 1.05, sy: 1.25 },
  { name: 'myrtle', form: 'mound', tile: T.myrtle, sx: 0.85, sy: 1.45 },
  { name: 'thorn', form: 'mound', tile: T.thorn, sx: 0.8, sy: 0.9 },
  { name: 'broom', form: 'spray', tile: T.broom, sx: 1.25, sy: 1.5 },
  { name: 'oleander', form: 'spray', tile: T.oleander, sx: 1.5, sy: 1.75 },
];
const GRASSES = [{ tile: T.grassDry, sx: 1, sy: 1 }, { tile: T.grassGreen, sx: 1, sy: 0.9 }, { tile: T.grassSeed, sx: 0.9, sy: 1.4 }, { tile: T.thistle, sx: 0.75, sy: 1.6 }];

// ------------------------------------------------------------------------------------------------
// Shaders. Plants have their own small lit material. It takes the scene's lights, shadows, and fog from three.js,
// but works out the light at the corners of each leaf card and blends it across the card. Leaves lie many layers
// deep on screen, so the work done for every pixel has to stay small: one picture lookup, then the tone and fog steps.
// (The stock material lights every pixel and looks up the shadow sixteen times for each, which is too slow here.)
// ------------------------------------------------------------------------------------------------

const VERT_PARS = /* glsl */`
attribute vec3 aOff;      // from the middle of a leaf card to this corner (zero on wood)
attribute vec4 aData;     // x how much the point sways, y how leaf-like (0 on wood), z darkening, w a random phase
uniform vec4 uWind;       // x time, y strength, z and w the direction
uniform float uCard;      // leaf cards are drawn this much larger
uniform vec3 uFBounce;    // sunlight bounced off the ground, which reaches leaves in shade from the side and below
`;
// The start of the vertex stage: picks the leaf picture, grows the cards, and moves the plant in the wind.
// Shared by the lit material and by the one that draws shadows, so that a shadow sways with its tree.
const VERT_BEGIN = /* glsl */`
vec3 transformed = position + aOff * ( uCard - 1.0 );
float fPhase = 0.0, fBright = 1.0, fWarm = 0.0;
vec2 fTileOff = vec2( 0.0 );
#ifdef USE_INSTANCING_COLOR
  float fTile = floor( instanceColor.z );
  fPhase = fract( instanceColor.z ) * 6.2832; fBright = instanceColor.x; fWarm = instanceColor.y;
  fTileOff = vec2( mod( fTile, ${ACOLS}.0 ) * ${(TILE / AT_W).toFixed(6)}, floor( fTile / ${ACOLS}.0 ) * ${(TILE / AT_H).toFixed(6)} );
#endif
#ifdef USE_INSTANCING
  vec3 fOrigin = ( modelMatrix * instanceMatrix[ 3 ] ).xyz;
  vec3 fDir = ( vec3( uWind.z, 0.0, uWind.w ) * mat3( instanceMatrix ) ) / length( instanceMatrix[ 0 ].xyz );
#else
  vec3 fOrigin = modelMatrix[ 3 ].xyz;
  vec3 fDir = vec3( uWind.z, 0.0, uWind.w );
#endif
{
  float t = uWind.x, s = uWind.y, ph = fPhase + fOrigin.x * 0.21 + fOrigin.z * 0.17;
  float gust = 0.55 + 0.45 * sin( t * 0.5 - ( fOrigin.x * uWind.z + fOrigin.z * uWind.w ) * 0.05 );   // slow waves that travel downwind
  float sway = sin( t * 1.3 + ph ) * 0.7 + sin( t * 2.9 + ph * 1.7 ) * 0.3;
  transformed += fDir * ( aData.x * s * ( 0.07 * gust + 0.05 * sway * ( 0.5 + gust ) ) );
  float fl = aData.y * s * ( 0.4 + gust );
  vec3 wob = vec3( sin( t * 4.1 + aData.w ), sin( t * 3.3 + aData.w * 1.7 ), cos( t * 3.7 + aData.w * 0.6 ) );
  transformed += cross( aOff, wob ) * ( 0.10 * fl ) + wob * ( 0.006 * fl );
}
`;
const TINT = 'vec3( 1.0 + W * 0.14, 1.0 + W * 0.04, 1.0 - W * 0.16 ) * B';   // each plant is a little warmer or cooler, lighter or darker
const LEAF_VERT = /* glsl */`
#include <common>
#include <packing>
${VERT_PARS}
varying vec2 vUvF;
varying vec3 vLit;
#include <lights_pars_begin>
#include <shadowmap_pars_vertex>
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
#endif
#include <fog_pars_vertex>
// Light on a surface that faces the light by d (1 full on, -1 facing away). Leaves are lit a little past the edge.
float fLit( float d, float leaf ) { return mix( saturate( d ), saturate( d * 0.72 + 0.28 ), leaf ); }
void main() {
  ${VERT_BEGIN}
  vUvF = uv + fTileOff;
  vec3 fN = normal;
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mat3 fM = mat3( instanceMatrix );
    fN = fM * ( fN / vec3( dot( fM[ 0 ], fM[ 0 ] ), dot( fM[ 1 ], fM[ 1 ] ), dot( fM[ 2 ], fM[ 2 ] ) ) );
    mvPosition = instanceMatrix * mvPosition;
  #endif
  vec4 worldPosition = modelMatrix * mvPosition;
  mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  vec3 fNv = normalize( normalMatrix * fN );
  // Is this point in the sun's shadow? Four lookups, blended.
  float fShade = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  {
    vec4 sc = directionalShadowMatrix[ 0 ] * ( worldPosition + vec4( inverseTransformDirection( fNv, viewMatrix ) * directionalLightShadows[ 0 ].shadowNormalBias, 0.0 ) );
    vec3 fc = sc.xyz / sc.w;
    if ( fc.x > 0.0 && fc.x < 1.0 && fc.y > 0.0 && fc.y < 1.0 && fc.z < 1.0 ) {
      float fz = fc.z + directionalLightShadows[ 0 ].shadowBias;
      vec2 ft = 1.5 / directionalLightShadows[ 0 ].shadowMapSize;
      float fs = step( fz, unpackRGBAToDepth( texture2D( directionalShadowMap[ 0 ], fc.xy + vec2( - ft.x, - ft.y ) ) ) )
        + step( fz, unpackRGBAToDepth( texture2D( directionalShadowMap[ 0 ], fc.xy + vec2( ft.x, - ft.y ) ) ) )
        + step( fz, unpackRGBAToDepth( texture2D( directionalShadowMap[ 0 ], fc.xy + vec2( - ft.x, ft.y ) ) ) )
        + step( fz, unpackRGBAToDepth( texture2D( directionalShadowMap[ 0 ], fc.xy + vec2( ft.x, ft.y ) ) ) );
      fShade = mix( 1.0, fs * 0.25, directionalLightShadows[ 0 ].shadowIntensity );
    }
  }
  #endif
  // The light that falls here: sky and ground light, the sun or moon, and any lamps and fires.
  float leaf = aData.y;
  vec3 fView = normalize( - mvPosition.xyz );
  vec3 irr = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) irr += getHemisphereLightIrradiance( hemisphereLights[ i ], fNv );
  #endif
  #if NUM_DIR_LIGHTS > 0
    for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
      vec3 L = directionalLights[ i ].direction;
      float d = dot( fNv, L );
      // Light also passes through leaves: one facing away from the sun glows a yellow green, most of all when you look toward the sun.
      float back = saturate( - d ) * leaf * ( 0.25 + 0.75 * saturate( - dot( fView, L ) ) );
      irr += ( fLit( d, leaf ) + back * vec3( 0.47, 0.54, 0.18 ) ) * directionalLights[ i ].color * ( i == 0 ? fShade : 1.0 );
    }
  #endif
  // Bounced light: foliage in shade is never black in a sunny place. More on the sides and undersides, and more on thin leaves.
  irr += uFBounce * ( 1.0 - 0.6 * max( fN.y, 0.0 ) ) * ( 0.55 + 0.45 * leaf );
  #if NUM_POINT_LIGHTS > 0
    IncidentLight fl;
    for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
      getPointLightInfo( pointLights[ i ], mvPosition.xyz, fl );
      irr += fLit( dot( fNv, fl.direction ), leaf ) * fl.color;
    }
  #endif
  vLit = irr * RECIPROCAL_PI * aData.z * mix( vec3( mix( 1.0, fBright, 0.5 ) ), ${TINT.replace('B', 'fBright').replace(/W/g, 'fWarm')}, step( 0.05, leaf ) );
  #include <fog_vertex>
}`;
const LEAF_FRAG = /* glsl */`
uniform sampler2D map;
varying vec2 vUvF;
varying vec3 vLit;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D( map, vUvF );
  if ( t.a < 0.5 ) discard;
  gl_FragColor = vec4( t.rgb * vLit, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ------------------------------------------------------------------------------------------------

const _m4 = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sp = new THREE.Sphere(), _lx = new V3(), _ly = new V3(), _dir = new V3();
const _pos = new V3(), _quat = new THREE.Quaternion(), _scl = new V3(), _up = new V3(0, 1, 0);
const N_OLIVE = OLIVES.length, N_CYP = CYPRESSES.length, N_PINE = PINES.length, N_TREE = N_OLIVE + N_CYP + N_PINE;
const DK_MOUND = N_TREE, DK_SPRAY = N_TREE + 1, DK_GRASS = N_TREE + 2;
// Which variants each kit id may become, and a height factor (cypress_b is the smaller cypress).
const TREE_IDS = {
  olive_a: { first: 0, n: N_OLIVE, hk: 1, salt: 1 }, olive_b: { first: 0, n: N_OLIVE, hk: 1, salt: 2 },
  cypress_a: { first: N_OLIVE, n: N_CYP, hk: 1, salt: 3 }, cypress_b: { first: N_OLIVE, n: N_CYP, hk: 0.82, salt: 4 },
  pine_a: { first: N_OLIVE + N_CYP, n: N_PINE, hk: 1, salt: 5 },
};

export class Flora {
  constructor(kit, world) {
    this.kit = kit; this.world = world;
    this.placed = [];            // everything recorded by add()
    this.time = 0;
    this.motion = 1;             // set lower to calm the wind sway (0 stops it)
    this.forceLod = -1;          // for testing: 0, 1, or 2 forces every tree to that level
    this.farShadows = true;      // dark shapes on the ground under trees that are beyond the real shadows
    this.dirty = true;
    this.built = false; this.baked = false;
    this.root = new THREE.Group(); this.root.name = 'flora'; world.group.add(this.root);
    const t0 = performance.now();
    this.atlas = buildAtlas();
    this.atlasMs = performance.now() - t0;
    // The models. Trees first, then the two shrub forms and the grass tuft.
    this.kinds = [];
    OLIVES.forEach((o, i) => this.kinds.push(buildBranched('olive' + i, OLIVE, o)));
    CYPRESSES.forEach((o, i) => this.kinds.push(buildCypress('cypress' + i, o)));
    PINES.forEach((o, i) => this.kinds.push(buildPine('pine' + i, o)));
    this.kinds.push(buildMound(), buildSpray(), buildTuft());
    // The far pictures: one square per tree variant, then one per shrub.
    this.imps = [];
    for (let i = 0; i < N_TREE; i++) this.imps.push({ dk: i, tile: 0, w: this.kinds[i].rad * 2, h: this.kinds[i].h });
    for (const s of SHRUBS) { const dk = s.form === 'mound' ? DK_MOUND : DK_SPRAY; this.imps.push({ dk, tile: s.tile, w: this.kinds[dk].rad * 2, h: this.kinds[dk].h }); }
    this.impRT = new THREE.WebGLRenderTarget(1024, 512, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace });
    // Materials.
    const U = this.U = { uWind: { value: new THREE.Vector4(0, 1, WIND_X, WIND_Z) }, uFBounce: { value: new THREE.Color(0, 0, 0) } };
    const leaf = (card) => {
      const m = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, { map: { value: null }, uCard: { value: card } }]),
        vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, lights: true, fog: true, side: THREE.DoubleSide,
      });
      m.uniforms.map.value = this.atlas; m.uniforms.uWind = U.uWind; m.uniforms.uFBounce = U.uFBounce;
      return m;
    };
    this.matNear = leaf(1); this.matMid = leaf(MID_CARD);
    // Shadows are cast by the reduced model with its enlarged cards, and respect the leaf cut-outs.
    this.matDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.atlas, alphaTest: 0.5 });
    this.matDepth.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = U.uWind; sh.uniforms.uCard = { value: 1.4 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <begin_vertex>', VERT_BEGIN + '\n#ifdef USE_MAP\n\tvMapUv += fTileOff;\n#endif\n');
    };
    this.matDepth.customProgramCacheKey = () => 'flora-depth';
    // The far picture: a flat card that turns about its upright axis to face the camera, lit as if it were a rounded crown.
    this.matFar = new THREE.MeshLambertMaterial({ map: this.impRT.texture, alphaTest: 0.4 });
    this.matFar.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aA;\nattribute vec4 aB;\nvarying vec3 vTintF;')
        .replace('#include <beginnormal_vertex>', `
          vec3 fToCam = cameraPosition - aA.xyz; fToCam.y = 0.0; fToCam = normalize( fToCam + vec3( 1e-5, 0.0, 0.0 ) );
          vec3 fRight = vec3( fToCam.z, 0.0, - fToCam.x );
          vec3 objectNormal = normalize( fToCam * 0.5 + fRight * ( position.x * 1.7 ) + vec3( 0.0, 0.25 + position.y * 0.8, 0.0 ) );`)
        .replace('#include <begin_vertex>', `
          vec3 transformed = aA.xyz + fRight * ( position.x * aB.x ) + vec3( 0.0, ( position.y - ${IMP_BASE.toFixed(3)} ) * aB.y, 0.0 );
          float fT = abs( aA.w ) - 1.0;
          vMapUv = ( vec2( mod( fT, ${IMP_COLS}.0 ), floor( fT / ${IMP_COLS}.0 ) ) + vec2( aA.w > 0.0 ? uv.x : 1.0 - uv.x, uv.y ) ) / vec2( ${IMP_COLS}.0, ${IMP_ROWS}.0 );
          vTintF = ${TINT.replace('B', 'aB.z').replace(/W/g, 'aB.w')} * 1.2;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTintF;').replace('#include <color_fragment>', 'diffuseColor.rgb *= vTintF;');
    };
    this.matFar.customProgramCacheKey = () => 'flora-far';
    // Beyond the reach of the real shadows a tree still needs to sit on the ground. Its far picture is laid
    // on the ground along the sun's rays as a soft dark shape. Not shown where the real shadows are.
    this.matShade = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uSun: { value: new V3(0, 1, 0) }, uFocus: { value: new V3() }, uStrength: { value: 0 } }]),
      fog: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: `
        attribute vec4 aA; attribute vec4 aB;
        uniform vec3 uSun, uFocus; uniform float uStrength;
        varying vec2 vUvS; varying float vK;
        #include <fog_pars_vertex>
        void main() {
          vec3 base = aA.xyz, n = vec3( aB.z, sqrt( max( 0.0, 1.0 - aB.z * aB.z - aB.w * aB.w ) ), aB.w );
          vec3 right = normalize( vec3( uSun.z, 0.0, - uSun.x ) );
          vec3 P = right * ( position.x * aB.x ) + vec3( 0.0, ( position.y - ${IMP_BASE.toFixed(3)} ) * aB.y, 0.0 );
          vec3 Q = base + P - uSun * ( dot( P, n ) / max( dot( uSun, n ), 0.05 ) ) + n * 0.07;
          vec3 d = base - uFocus;
          vK = uStrength * smoothstep( 30.0, 36.0, max( abs( dot( d, right ) ), abs( dot( d, cross( uSun, right ) ) ) ) );
          vK *= smoothstep( 0.3, 0.6, dot( uSun, n ) );      // none on ground that slopes away from the sun, where it would be a long streak
          float fT = abs( aA.w ) - 1.0;
          vUvS = ( vec2( mod( fT, ${IMP_COLS}.0 ), floor( fT / ${IMP_COLS}.0 ) ) + vec2( aA.w > 0.0 ? uv.x : 1.0 - uv.x, uv.y ) ) / vec2( ${IMP_COLS}.0, ${IMP_ROWS}.0 );
          vec4 mvPosition = viewMatrix * vec4( Q, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec2 vUvS; varying float vK;
        #include <fog_pars_fragment>
        void main() {
          float a = smoothstep( 0.2, 0.6, texture2D( map, vUvS ).a ) * vK;
          #ifdef USE_FOG
            a *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( 0.0, 0.0, 0.0, a );
        }`,
    });
    this.matShade.uniforms.map.value = this.impRT.texture;
    this.pools = []; this.cells = []; this.zoneNames = []; this.spawned = [];
    this.last = { cam: new V3(1e9, 0, 0), dir: new V3(), focus: new V3(), sun: new V3(), fog: 0, mask: -1, force: -1, casts: false, p0: 0, p5: 0 };
    this.counts = { near: 0, mid: 0, far: 0, shrubs: 0, grass: 0, casters: 0 };
    this.buildMs = performance.now() - t0;
  }

  // Record one static plant. Called many times before build().
  add(id, x, y, z, rot, scale, zone) { this.placed.push({ id, x, y, z, rot, s: scale || 1, zone: zone || 'town' }); }

  // What a plant at this place becomes: which model, which leaf picture, its size and tint.
  _choose(id, x, z, s, avoid) {
    const h = (k) => hash(x, z, k);
    if (TREE_IDS[id]) {
      const t = TREE_IDS[id]; let v = Math.floor(h(t.salt) * t.n);
      if (avoid) for (let k = 0; k < t.n && avoid.includes(t.first + v); k++) v = (v + 1) % t.n;
      const dk = t.first + v, olive = dk < N_OLIVE;
      return { dk, tile: 0, imp: dk, sx: s * (0.94 + 0.12 * h(11)), sy: s * t.hk * (0.95 + 0.1 * h(12)), bright: 0.88 + 0.22 * h(13), warm: (h(14) - 0.5) * (olive ? 1.4 : 1.0), phase: h(15) };
    }
    if (id === 'bush_a' || id === 'bush_b') {
      const q = h(6), tab = id === 'bush_a' ? [[0.35, 0], [0.65, 2], [0.85, 1], [1.01, 3]] : [[0.35, 4], [0.65, 3], [0.85, 0], [1.01, 1]];
      const k = tab.find((e) => q < e[0])[1], sh = SHRUBS[k];
      return { dk: sh.form === 'mound' ? DK_MOUND : DK_SPRAY, tile: sh.tile, imp: N_TREE + k, sx: s * sh.sx * (0.85 + 0.3 * h(11)), sy: s * sh.sy * (0.85 + 0.3 * h(12)), bright: 0.9 + 0.2 * h(13), warm: (h(14) - 0.5) * 0.8, phase: h(15) };
    }
    const q = h(7), k = q < 0.45 ? 0 : q < 0.7 ? 1 : q < 0.9 ? 2 : 3, gr = GRASSES[k], ss = k === 3 ? Math.min(s, 1.25) : s;
    return { dk: DK_GRASS, tile: gr.tile, imp: -1, sx: ss * gr.sx, sy: ss * gr.sy * (0.85 + 0.3 * h(12)), bright: 0.92 + 0.16 * h(13), warm: (h(14) - 0.5) * 0.7, phase: h(15) };
  }

  // Make one plant now and add it to `parent`. Its position is the plant's base.
  spawn(id, x, y, z, rot, scale, parent) {
    const c = this._choose(id, x, z, scale || 1, null);
    return this._single(c, x, y, z, rot, parent);
  }
  // For testing: a named variant, such as 'olive2', 'cypress0', 'pine1', 'lentisk', 'broom', 'grass3'.
  spawnKind(name, x, y, z, rot, scale, parent) {
    let c = null; const s = scale || 1, di = this.kinds.findIndex((k) => k.name === name), si = SHRUBS.findIndex((k) => k.name === name);
    if (di >= 0 && di < N_TREE) c = { dk: di, tile: 0, sx: s, sy: s, bright: 1, warm: 0, phase: 0.3 };
    else if (si >= 0) { const sh = SHRUBS[si]; c = { dk: sh.form === 'mound' ? DK_MOUND : DK_SPRAY, tile: sh.tile, sx: s * sh.sx, sy: s * sh.sy, bright: 1, warm: 0, phase: 0.3 }; }
    else if (/^grass\d$/.test(name)) { const gr = GRASSES[+name[5]]; c = { dk: DK_GRASS, tile: gr.tile, sx: s * gr.sx, sy: s * gr.sy, bright: 1, warm: 0, phase: 0.3 }; }
    return c ? this._single(c, x, y, z, rot, parent) : null;
  }
  _single(c, x, y, z, rot, parent) {
    const kind = this.kinds[c.dk], g = new THREE.Group(), im = new THREE.InstancedMesh(kind.geo, this.matNear, 1);
    im.setMatrixAt(0, _m4.identity());
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array([c.bright, c.warm, c.tile + c.phase * 0.99]), 3);
    im.customDepthMaterial = this.matDepth; im.castShadow = c.dk !== DK_GRASS; im.receiveShadow = true;
    im.userData.casters = 1; im.userData.range = kind.full; this._hook(im, kind);
    g.add(im); g.position.set(x, y, z); g.rotation.y = rot || 0; g.scale.set(c.sx, c.sy, c.sx);
    if (parent) parent.add(g);
    this.spawned.push(g);
    return g;
  }
  // In the shadow pass a list draws only the plants that can cast into the sun's shadow box, and only the reduced model.
  _hook(mesh, kind) {
    mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry) { this.userData.all = this.count; this.count = this.userData.casters; geometry.setDrawRange(0, kind.prefix); };
    mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, geometry) { this.count = this.userData.all; geometry.setDrawRange(0, this.userData.range); };
  }

  // Turn everything recorded into lists that are drawn many at a time.
  build() {
    for (const pl of this.pools) if (pl) for (const m of [pl.near, pl.mid]) if (m) { this.root.remove(m); m.dispose(); }
    if (this.far) { this.root.remove(this.far, this.shade); this.far.geometry.dispose(); this.shade.geometry.dispose(); }
    this.pools = []; this.cells = []; this.zoneNames = [];
    // One entry per plant. A grass tuft in the layout becomes a patch of six.
    const list = [], world = this.world, near = [];
    for (const p of this.placed) {
      let zi = this.zoneNames.indexOf(p.zone); if (zi < 0) { zi = this.zoneNames.length; this.zoneNames.push(p.zone); }
      if (p.id === 'grass_tuft') {
        const lift = world && world.terrainY ? p.y - world.terrainY(p.x, p.z) : 0;
        for (let k = 0; k < 6; k++) {
          const a = hash(p.x, p.z, 20 + k) * 6.283, d = k ? 0.5 + hash(p.x, p.z, 30 + k) * 1.5 : 0, x = p.x + Math.cos(a) * d * p.s, z = p.z + Math.sin(a) * d * p.s;
          const y = k && world && world.terrainY ? world.terrainY(x, z) + lift : p.y;
          list.push({ x, y, z, rot: p.rot + k * 2.1, zi, c: this._choose(p.id, x, z, p.s * (k ? 0.5 + 0.45 * hash(x, z, 40) : 1), null) });
        }
        continue;
      }
      // Neighbouring trees of one species never get the same variant.
      let avoid = null;
      const t = TREE_IDS[p.id];
      if (t) {
        const same = near.filter((q) => q.first === t.first).map((q) => ({ dk: q.dk, d: Math.hypot(q.x - p.x, q.z - p.z) })).filter((q) => q.d < 40).sort((a, b) => a.d - b.d);
        avoid = same.slice(0, Math.min(3, t.n - 1)).map((q) => q.dk);
      }
      const c = this._choose(p.id, p.x, p.z, p.s, avoid);
      if (t) near.push({ first: t.first, dk: c.dk, x: p.x, z: p.z });
      list.push({ x: p.x, y: p.y, z: p.z, rot: p.rot, zi, c });
    }
    const n = list.length;
    const R = this.R = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), hh: new Float32Array(n), br: new Float32Array(n), dk: new Uint8Array(n), lod: new Uint8Array(n).fill(2),
      m: new Float32Array(n * 16), c: new Float32Array(n * 3), fa: new Float32Array(n * 8), sn: new Float32Array(n * 2), fade: new Float32Array(n).fill(1) };
    const count = new Array(this.kinds.length).fill(0), cellMap = new Map(); let nFar = 0;
    list.forEach((p, i) => {
      const c = p.c, kind = this.kinds[c.dk];
      R.x[i] = p.x; R.y[i] = p.y; R.z[i] = p.z; R.dk[i] = c.dk; R.hh[i] = kind.h * c.sy * 0.5; R.br[i] = Math.hypot(kind.h * c.sy * 0.5, kind.rad * c.sx);
      _m4.compose(_pos.set(p.x, p.y, p.z), _quat.setFromAxisAngle(_up, p.rot || 0), _scl.set(c.sx, c.sy, c.sx)); R.m.set(_m4.elements, i * 16);
      R.c[i * 3] = c.bright; R.c[i * 3 + 1] = c.warm; R.c[i * 3 + 2] = c.tile + c.phase * 0.99;
      if (c.imp >= 0) {
        const im = this.imps[c.imp]; nFar++;
        R.fa.set([p.x, p.y, p.z, (c.imp + 1) * (hash(p.x, p.z, 16) < 0.5 ? -1 : 1), im.w * c.sx / IMP_FILL, im.h * c.sy / IMP_FILL, c.bright, c.warm], i * 8);
      }
      if (c.dk < N_TREE && world && world.terrainY) {      // the slope of the ground under a tree, for its far shadow
        const gx = (world.terrainY(p.x + 2, p.z) - world.terrainY(p.x - 2, p.z)) / 4, gz = (world.terrainY(p.x, p.z + 2) - world.terrainY(p.x, p.z - 2)) / 4, l = Math.hypot(gx, 1, gz);
        R.sn[i * 2] = -gx / l; R.sn[i * 2 + 1] = -gz / l;
      }
      count[c.dk]++;
      const key = p.zi + '|' + Math.floor(p.x / CELL) + '|' + Math.floor(p.z / CELL);
      let cell = cellMap.get(key); if (!cell) { cell = { zi: p.zi, list: [] }; cellMap.set(key, cell); }
      cell.list.push(i);
    });
    const part = (list, test) => Int32Array.from(list.filter((i) => test(R.dk[i])));
    for (const cell of cellMap.values()) {
      let x = 0, y = 0, z = 0; for (const i of cell.list) { x += R.x[i]; y += R.y[i] + R.hh[i]; z += R.z[i]; }
      const k = cell.list.length; x /= k; y /= k; z /= k; let r = 0;
      for (const i of cell.list) r = Math.max(r, Math.hypot(R.x[i] - x, R.y[i] + R.hh[i] - y, R.z[i] - z) + R.br[i]);
      this.cells.push({ zi: cell.zi, x, y, z, r, trees: part(cell.list, (d) => d < N_TREE), shrubs: part(cell.list, (d) => d === DK_MOUND || d === DK_SPRAY), grass: part(cell.list, (d) => d === DK_GRASS) });
    }
    const mesh = (geo, mat, cap, kind, order) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0; im.visible = false; im.receiveShadow = true; im.castShadow = false; im.customDepthMaterial = this.matDepth; im.renderOrder = order;
      im.userData.casters = 0; im.userData.range = geo.drawRange.count === Infinity ? kind.full : geo.drawRange.count; this._hook(im, kind);
      this.root.add(im); return im;
    };
    this.kinds.forEach((kind, dk) => {
      const cap = count[dk]; if (!cap) { this.pools.push(null); return; }
      const tree = dk < N_TREE, pl = { tree, cast: new Int32Array(cap), rest: new Int32Array(cap), nc: 0, nr: 0, near: mesh(kind.geo, this.matNear, cap, kind, tree ? -2 : 0), mid: null };
      // Near trees are drawn before the ground, which saves shading the ground behind them.
      if (tree) { pl.mid = mesh(kind.mid, this.matMid, cap, kind, 0); pl.mcast = new Int32Array(cap); pl.mrest = new Int32Array(cap); pl.mc = 0; pl.mr = 0; }
      this.pools.push(pl);
    });
    // The far pictures, all in one list.
    const fg = new THREE.InstancedBufferGeometry(), cap = Math.max(1, nFar);
    fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    fg.setIndex([0, 1, 2, 0, 2, 3]);
    for (const k of ['aA', 'aB']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); fg.setAttribute(k, a); }
    fg.instanceCount = 0;
    this.far = new THREE.Mesh(fg, this.matFar); this.far.frustumCulled = false; this.far.visible = false; this.root.add(this.far);
    const sg = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'uv']) sg.setAttribute(k, fg.attributes[k]);
    sg.setIndex(fg.index);
    for (const k of ['aA', 'aB']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); sg.setAttribute(k, a); }
    sg.instanceCount = 0;
    this.shade = new THREE.Mesh(sg, this.matShade); this.shade.frustumCulled = false; this.shade.visible = false; this.shade.renderOrder = 2; this.root.add(this.shade);
    this.built = true; this.dirty = true;
  }

  // Draw each variant once from the side into a square of the far-picture sheet. No lights: the picture is lit later, where it stands.
  _bake(renderer) {
    this.baked = true;
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, IMP_COLS, IMP_ROWS, 0, -20, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.atlas }, uTile: { value: new THREE.Vector2() } }, side: THREE.DoubleSide,
      vertexShader: 'attribute vec4 aData; uniform vec2 uTile; varying vec2 vUv; varying float vS; varying float vY; void main(){ vUv = uv + uTile; vY = position.y; vS = aData.z * ( 0.8 + 0.2 * normal.y ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      // Nothing below the ground is drawn, so that one picture does not run into the square beneath it.
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying float vS; varying float vY; void main(){ vec4 t = texture2D( map, vUv ); if ( t.a < 0.5 || vY < 0.0 ) discard; gl_FragColor = vec4( t.rgb * vS, 1.0 ); }',
    });
    this.imps.forEach((im, i) => {
      const m = mat.clone(); m.uniforms.map.value = this.atlas; m.uniforms.uTile.value.set((im.tile % ACOLS) * TILE / AT_W, Math.floor(im.tile / ACOLS) * TILE / AT_H);
      const mesh = new THREE.Mesh(this.kinds[im.dk].geo, m); mesh.frustumCulled = false;
      mesh.scale.set(IMP_FILL / im.w, IMP_FILL / im.h, IMP_FILL / im.w); mesh.position.set((i % IMP_COLS) + 0.5, Math.floor(i / IMP_COLS) + IMP_BASE, 0);
      scene.add(mesh);
    });
    const oldTarget = renderer.getRenderTarget(), oldColor = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.impRT); renderer.setClearColor(0x33442a, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldColor, oldAlpha);
    scene.traverse((o) => { if (o.material) o.material.dispose(); });
  }

  // Called every frame.
  // Put the plants near a point back on the ground after the ground has changed shape (the crack in the ring story:
  // the grass over it used to stay where it was, in the air).
  reseat(x, z, radius) {
    const R = this.R, w = this.world; if (!R || !w || !w.terrainY) return;
    for (let i = 0; i < R.n; i++) { if (Math.hypot(R.x[i] - x, R.z[i] - z) > radius) continue; const y = w.terrainY(R.x[i], R.z[i]); R.y[i] = y; R.m[i * 16 + 13] = y; R.fa[i * 8 + 1] = y; }
    this.dirty = true;
  }
  update(sky, camera, dt) {
    const wind = sky.cur.wind;
    this.time += dt * (0.7 + 0.3 * wind);
    this.U.uWind.value.set(this.time, Math.pow(Math.max(wind, 0), 0.7) * this.motion, WIND_X, WIND_Z);
    // The same bounce as on the walls (surfaces.js): warm, from the sunlit ground, none by moonlight.
    this.U.uFBounce.value.copy(sky.cur.sun).multiplyScalar(sky.cur.sunI * Math.max(sky.sunDir.y, 0) * 0.8 * (1 - Math.min(1, sky.cur.stars * 2 + sky.cur.moon))).multiply(_fTint);   // stronger than on walls: leaves also pass light
    if (!this.baked && sky.renderer) this._bake(sky.renderer);
    if (!this.built || !this.world.group.visible) return;
    // How dark the far shadows are: as dark as a real shadow on the ground in this light, and gone when the sun is low
    // (a real shadow would then be far too long to lay on the ground as a flat shape).
    const c = sky.cur, direct = c.sunI * Math.sin(c.sunEl), ambient = c.hemiI * 0.8, su = this.matShade.uniforms;
    su.uStrength.value = sky.sun.castShadow && this.farShadows ? 0.85 * (1 - Math.pow(ambient / (ambient + direct + 1e-4), 0.45)) * clamp((c.sunEl - 0.2) / 0.25, 0, 1) : 0;
    su.uSun.value.copy(sky.sunDir); su.uFocus.value.copy(sky.sun.target.position);
    // Refill the lists only when something that matters has changed.
    let mask = 0; this.zoneNames.forEach((name, i) => { if (this.kit.zone(name).visible) mask |= 1 << i; });
    const L = this.last, cp = camera.position, focus = sky.sun.target.position, pe = camera.projectionMatrix.elements, casts = sky.sun.castShadow && sky.cur.sunI > 0.05;
    _dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (this.dirty || mask !== L.mask || this.forceLod !== L.force || casts !== L.casts || (su.uStrength.value > 0.01) !== L.shading || cp.distanceToSquared(L.cam) > 1 || focus.distanceToSquared(L.focus) > 1 || _dir.dot(L.dir) < 0.9994
      || sky.sunDir.dot(L.sun) < 0.9999 || Math.abs(sky.cur.fogF - L.fog) > 4 || pe[0] !== L.p0 || pe[5] !== L.p5) {
      L.cam.copy(cp); L.dir.copy(_dir); L.focus.copy(focus); L.sun.copy(sky.sunDir); L.fog = sky.cur.fogF; L.mask = mask; L.force = this.forceLod; L.casts = casts; L.p0 = pe[0]; L.p5 = pe[5]; L.shading = su.uStrength.value > 0.01;
      this.dirty = false;
      this._refill(sky, camera, mask, casts);
    }
  }

  // Decide which plants are drawn, and at which level. Sending a changed list to the graphics chip is the costly
  // part, so the lists are made to change as seldom as possible: near trees, shrubs, and grass are listed whichever
  // way the camera faces, and a list that comes out the same as last time is not sent again.
  _refill(sky, camera, mask, casts) {
    const R = this.R, cp = camera.position, focus = sky.sun.target.position, fogF = sky.cur.fogF + 12, S = sky.sunDir, force = this.forceLod;
    camera.updateMatrixWorld(); _fr.setFromProjectionMatrix(_m4.multiplyMatrices(camera.projectionMatrix, _inv.copy(camera.matrixWorld).invert()));
    // The sun's shadow box is 68 m square, seen along the light, and centered on the player. A plant casts a shadow
    // if it stands in that box and within 75 m of the player along the light. (With the sun low, trees further off
    // could still reach the player with their shadows. Those are left out to save time.)
    _lx.set(S.z, 0, -S.x).normalize(); _ly.crossVectors(S, _lx);
    const inBox = (i) => {
      const dx = R.x[i] - focus.x, dy = R.y[i] + R.hh[i] - focus.y, dz = R.z[i] - focus.z, rr = R.br[i] + 34;
      return Math.abs(dx * _lx.x + dz * _lx.z) < rr && Math.abs(dx * _ly.x + dy * _ly.y + dz * _ly.z) < rr && Math.abs(dx * S.x + dy * S.y + dz * S.z) < 75 + R.br[i];
    };
    for (const pl of this.pools) if (pl) { pl.nc = 0; pl.nr = 0; pl.mc = 0; pl.mr = 0; }
    const fA = this.far.geometry.attributes.aA, fB = this.far.geometry.attributes.aB, fa = fA.array, fb = fB.array; let nf = 0, hf = 0;
    const far = (i, f) => {
      const o = nf * 4, s = i * 8, src = R.fa; f = Math.round(f * 16) / 16; if (f <= 0) return;
      fa[o] = src[s]; fa[o + 1] = src[s + 1]; fa[o + 2] = src[s + 2]; fa[o + 3] = src[s + 3]; fb[o] = src[s + 4] * f; fb[o + 1] = src[s + 5] * f; fb[o + 2] = src[s + 6]; fb[o + 3] = src[s + 7];
      nf++; hf = (Math.imul(hf, 31) + i * 17 + f * 16) | 0;
    };
    const cnt = this.counts; cnt.near = cnt.mid = cnt.far = cnt.shrubs = cnt.grass = cnt.casters = 0;
    const sA = this.shade.geometry.attributes.aA, sB = this.shade.geometry.attributes.aB, sa = sA.array, sb = sB.array, shading = this.matShade.uniforms.uStrength.value > 0.01; let ns = 0, hs = 0;
    const ep = this.lodEye || cp;   // where levels and fades are measured from (game.js sets the player while following)
    const dist = (i) => { const dx = R.x[i] - ep.x, dy = R.y[i] + R.hh[i] - ep.y, dz = R.z[i] - ep.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
    for (const c of this.cells) {
      if (!((mask >> c.zi) & 1)) continue;
      const ex = c.x - cp.x, ey = c.y - cp.y, ez = c.z - cp.z, dc = Math.sqrt(ex * ex + ey * ey + ez * ez) - c.r; if (dc > fogF) continue;
      _sp.center.set(c.x, c.y, c.z); _sp.radius = c.r + 8;
      const fx = c.x - focus.x, fz = c.z - focus.z, vis = _fr.intersectsSphere(_sp), shadowy = casts && Math.sqrt(fx * fx + fz * fz) - c.r < 90;
      if (!vis && !shadowy && dc > SMALL_NEAR) continue;
      // Trees change level with a little slack, so that a tree at the boundary does not flicker.
      let idx = c.trees;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k], d = dist(i), pl = this.pools[R.dk[i]];
        let s = R.lod[i];
        if (s === 0) { if (d > NEAR + 3) s = d > FAR + 6 ? 2 : 1; } else if (s === 1) { if (d < NEAR - 3) s = 0; else if (d > FAR + 6) s = 2; } else if (d < FAR - 6) s = d < NEAR - 3 ? 0 : 1;
        R.lod[i] = s; if (force >= 0) s = force;
        if (vis && shading && d < fogF) { const o = ns * 4, q = i * 8, src = R.fa; sa[o] = src[q]; sa[o + 1] = src[q + 1]; sa[o + 2] = src[q + 2]; sa[o + 3] = src[q + 3]; sb[o] = src[q + 4]; sb[o + 1] = src[q + 5]; sb[o + 2] = R.sn[i * 2]; sb[o + 3] = R.sn[i * 2 + 1]; ns++; hs = (Math.imul(hs, 31) + i + 1) | 0; }
        if (s === 2) { if (vis && d < fogF) { far(i, 1); cnt.far++; } continue; }
        const cast = casts && inBox(i);
        if (cast) cnt.casters++;
        if (s === 0) { if (cast) pl.cast[pl.nc++] = i; else pl.rest[pl.nr++] = i; cnt.near++; }
        else if (vis || cast) { if (cast) pl.mcast[pl.mc++] = i; else pl.mrest[pl.mr++] = i; cnt.mid++; }
      }
      // Shrubs: the full form nearby, shrinking away at its limit, then a far picture for a while.
      if (dc > SMALL_FAR) continue;
      idx = c.shrubs;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k], d = dist(i), pl = this.pools[R.dk[i]];
        if (d < SMALL_NEAR) {
          const f = Math.round(Math.min(1, (SMALL_NEAR - d) / 10) * 16) / 16; R.fade[i] = f;
          if (f > 0) { if (casts && inBox(i)) { pl.cast[pl.nc++] = i; cnt.casters++; } else pl.rest[pl.nr++] = i; cnt.shrubs++; }
          if (f < 1 && vis) far(i, 1 - f);
        } else if (vis && d < Math.min(SMALL_FAR, fogF)) { far(i, Math.min(1, (SMALL_FAR - d) / 25)); cnt.far++; }
      }
      // Grass, only nearby.
      if (dc > SMALL_NEAR) continue;
      idx = c.grass; const pl = this.pools[DK_GRASS];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k], d = dist(i); if (d >= SMALL_NEAR) continue;
        const f = Math.round(Math.min(1, (SMALL_NEAR - d) / 10) * 16) / 16; if (f <= 0) continue;
        R.fade[i] = f; pl.rest[pl.nr++] = i; cnt.grass++;
      }
    }
    for (const pl of this.pools) if (pl) {
      this._write(pl.near, pl.cast, pl.nc, pl.rest, pl.nr, !pl.tree);
      if (pl.mid) this._write(pl.mid, pl.mcast, pl.mc, pl.mrest, pl.mr, false);
    }
    const send = (mesh, attrs, n, h) => {
      mesh.geometry.instanceCount = n; mesh.visible = n > 0;
      if (!n || (h === mesh.userData.sig && n === mesh.userData.n)) return;
      mesh.userData.sig = h; mesh.userData.n = n;
      for (const a of attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
    };
    send(this.far, [fA, fB], nf, hf); send(this.shade, [sA, sB], ns, hs);
  }

  // Copy the chosen plants into one list: those that cast shadows first, then the rest. Skipped if the list is the same as last time.
  _write(mesh, a, na, b, nb, fading) {
    const fade = this.R.fade, n = na + nb; let h = (na * 73856093) ^ (nb * 19349663);
    for (let pass = 0; pass < 2; pass++) {
      const list = pass ? b : a, len = pass ? nb : na;
      for (let k = 0; k < len; k++) { const i = list[k]; h = (Math.imul(h, 31) + i + 1) | 0; if (fading) h = (Math.imul(h, 31) + fade[i] * 16) | 0; }
    }
    mesh.count = n; mesh.visible = n > 0; mesh.userData.casters = na; mesh.castShadow = na > 0;
    if (!n || h === mesh.userData.sig) return;
    mesh.userData.sig = h;
    const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array, sm = this.R.m, sc = this.R.c; let j = 0;
    for (let pass = 0; pass < 2; pass++) {
      const list = pass ? b : a, len = pass ? nb : na;
      for (let k = 0; k < len; k++, j++) {
        const i = list[k], s = i * 16, o = j * 16, f = fading ? fade[i] : 1;
        for (let q = 0; q < 12; q++) M[o + q] = sm[s + q] * f;
        M[o + 12] = sm[s + 12]; M[o + 13] = sm[s + 13]; M[o + 14] = sm[s + 14]; M[o + 15] = 1;
        C[j * 3] = sc[i * 3]; C[j * 3 + 1] = sc[i * 3 + 1]; C[j * 3 + 2] = sc[i * 3 + 2];
      }
    }
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
  }

  // Numbers for testing.
  stats() {
    return {
      buildMs: Math.round(this.buildMs), atlasMs: Math.round(this.atlasMs), atlasParts: this.atlas.userData.ms, plants: this.R ? this.R.n : 0, drawn: Object.assign({}, this.counts),
      kinds: this.kinds.map((k) => ({ name: k.name, tris: k.tris, midTris: k.midTris, h: +k.h.toFixed(2), width: +(k.rad * 2).toFixed(2) })),
      lists: this.pools.map((pl, i) => (pl ? [this.kinds[i].name, pl.near.count, pl.mid ? pl.mid.count : 0] : null)).filter(Boolean),
    };
  }
}
