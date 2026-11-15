// Small things on the ground in the harbor town: weeds in the cracks of the paving, weeds and pebbles along
// the foot of every wall, pebbles and dry tufts on the open ground, and straw and broken pottery around the
// market stalls and the goods on the quay. They make the size of the ground readable and keep it from looking
// like one bare plane.
//
// Everything is placed once, at load, from the layout. Each frame only what is near the eye is drawn: when the
// eye has moved a few meters the near set is refilled (one instanced mesh per kind, so four draw calls), and
// things shrink away at the edge of that set so nothing pops.
import * as THREE from 'three';
import { mulberry32, noise2 } from './util.js';
import { FIELDS } from './world.js';

const TOWN = { x0: -100, x1: 100, z0: -135, z1: 57 };   // the harbor town and the fields north of the wall
const PAVINGS = [{ x0: -90, x1: 90, z0: 38, z1: 55.2, tile: 2.6 }, { x0: -26, x1: 26, z0: -22, z1: 14, tile: 2 }];
const GOODS = [[-15, 10.4], [-8.5, 10.8], [14, 10.4], [23, -16], [-44, 50], [-41.5, 51.2], [-36, 44], [30, 49], [-52, 46], [46, 51], [-24, 43], [-22.4, 44.2], [38, 43], [52, 44], [70, 42], [-66, 50.5], [64, 52]];
const NEAR = { tuft: 62, pebble: 48, straw: 34, shard: 34 };

// ---------------------------------------------------------------- pictures for the tufts
function paintAtlas() {
  const S = 128, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S;
  const c = cv.getContext('2d'), rng = mulberry32(77);
  const blade = (ox, x, len, ang, w, col) => {
    const bx = ox + x, by = S - 2, tx = bx + Math.sin(ang) * len, ty = by - Math.cos(ang) * len;
    const mx = bx + Math.sin(ang * 0.5) * len * 0.5, my = by - Math.cos(ang * 0.5) * len * 0.55;
    c.beginPath(); c.moveTo(bx - w, by); c.quadraticCurveTo(mx - w * 0.6, my, tx, ty); c.quadraticCurveTo(mx + w * 0.6, my, bx + w, by); c.closePath();
    c.fillStyle = col; c.fill();
  };
  const leaf = (ox, x, len, ang, w, col) => {
    const bx = ox + x, by = S - 3; c.save(); c.translate(bx, by); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(w, -len * 0.3, w * 0.8, -len * 0.8, 0, -len); c.bezierCurveTo(-w * 0.8, -len * 0.8, -w, -len * 0.3, 0, 0);
    c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(30,40,20,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len * 0.9); c.stroke(); c.restore();
  };
  const pick = (a) => a[Math.floor(rng() * a.length)];
  // 0: a low green weed with broad leaves
  for (let i = 0; i < 16; i++) leaf(0, 64 + (rng() - 0.5) * 30, 40 + rng() * 50, (rng() - 0.5) * 2.4, 9 + rng() * 7, pick(['#5f7a3a', '#6d8742', '#56702f', '#7a8f4a']));
  // 1: dry grass blades
  for (let i = 0; i < 44; i++) blade(S, 64 + (rng() - 0.5) * 50, 50 + rng() * 70, (rng() - 0.5) * 1.5, 1.6 + rng() * 1.4, pick(['#c9b07a', '#b89c62', '#d6c08c', '#a88f58', '#9a8a5a']));
  // 2: a weed in flower (chamomile): thin stems, small white heads with yellow middles
  for (let i = 0; i < 18; i++) blade(S * 2, 64 + (rng() - 0.5) * 40, 40 + rng() * 60, (rng() - 0.5) * 1.6, 1.3, pick(['#6b8442', '#7d9450']));
  for (let i = 0; i < 9; i++) {
    const x = S * 2 + 64 + (rng() - 0.5) * 70, y = S - 45 - rng() * 60;
    c.fillStyle = '#f2efe2'; c.beginPath(); c.arc(x, y, 5 + rng() * 2, 0, 6.283); c.fill();
    c.fillStyle = '#e0b83a'; c.beginPath(); c.arc(x, y, 2.4, 0, 6.283); c.fill();
  }
  // 3: a grey-green thistle rosette
  for (let i = 0; i < 12; i++) leaf(S * 3, 64 + (rng() - 0.5) * 24, 34 + rng() * 40, (rng() - 0.5) * 2.8, 6 + rng() * 4, pick(['#7f8f72', '#8a9a7c', '#6f8064']));
  for (let i = 0; i < 3; i++) { const x = S * 3 + 54 + rng() * 20, y = S - 70 - rng() * 30; blade(S * 3, x - S * 3, S - y, (rng() - 0.5) * 0.4, 1.5, '#7f8f72'); c.fillStyle = '#9a6aa0'; c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Three crossed upright cards, 1 m tall and 1 m wide, standing on the ground; the picture's column is chosen
// per tuft. Normals point up so the tuft is lit like the ground under it.
function tuftGeometry() {
  const pos = [], uv = [], nrm = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}
function pebbleGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0), p = g.attributes.position, rng = mulberry32(5);
  for (let i = 0; i < p.count; i++) { const k = 0.8 + rng() * 0.35; p.setXYZ(i, p.getX(i) * k, Math.max(p.getY(i) * k, -0.12), p.getZ(i) * k); }
  g.translate(0, 0.1, 0); g.computeVertexNormals(); return g;
}
function strawGeometry() { const g = new THREE.BoxGeometry(1, 0.005, 0.012); g.translate(0, 0.004, 0); return g; }
function shardGeometry() { const g = new THREE.CylinderGeometry(0.5, 0.47, 0.7, 6, 1, true, -0.75, 1.5); g.rotateX(Math.PI / 2); g.translate(0, 0.52, 0); g.scale(1, 0.6, 1); return g; }

// The shared shader change: shrink things at the edge of the near set, and let tufts move a little in the wind.
function fitMaterial(mat, kind, u) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNear = u.near; sh.uniforms.uTime = u.time;
    let head = '#include <common>\nuniform float uNear; uniform float uTime;';
    if (kind === 'tuft') head += '\nattribute float aTile; varying float vTile;';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', head).replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float dd = distance(ip.xz, cameraPosition.xz);
  transformed *= smoothstep(uNear, uNear - 9.0, dd);
  ${kind === 'tuft' ? 'vTile = aTile; transformed.x += sin(uTime * 1.6 + ip.x * 0.7 + ip.z * 0.4) * 0.05 * position.y; transformed.z += cos(uTime * 1.3 + ip.z * 0.6) * 0.04 * position.y;' : ''}`);
    if (kind === 'tuft') {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTile;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);   // both sides face up, lit like the ground')
        .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vec2((vMapUv.x + vTile) * 0.25, vMapUv.y));\n  diffuseColor *= sampledDiffuseColor;');
    }
  };
  mat.customProgramCacheKey = () => 'scatter-' + kind;
}

export class Scatter {
  constructor(game) {
    this.g = game; const w = game.world, rng = mulberry32(31415);
    this.u = { near: { value: 60 }, time: { value: 0 } };
    this.kinds = {};
    const add = (kind, geo, mat, extra) => {
      fitMaterial(mat, kind, { near: { value: NEAR[kind] }, time: this.u.time });
      this.kinds[kind] = { geo, mat, extra, list: [], mesh: null };
    };
    const atlas = paintAtlas();
    add('tuft', tuftGeometry(), new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide }), true);   // alpha to coverage: soft, steady edges with anti-aliasing
    add('pebble', pebbleGeometry(), new THREE.MeshLambertMaterial());
    add('straw', strawGeometry(), new THREE.MeshLambertMaterial());
    add('shard', shardGeometry(), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));

    const free = (x, z, r) => { if (!w.walkable(x, z) || onFloor(x, z) || w.indoor(x, z, 0.35)) return false; const q = w.resolve(x, z, r); return Math.abs(q[0] - x) < 1e-3 && Math.abs(q[1] - z) < 1e-3; };
    const onPaving = (x, z) => w.standY(x, z) > w.groundY(x, z) + 0.01;
    const inPaving = (x, z) => PAVINGS.some((P) => x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1);
    // Raised floors that belong to buildings (the Cephalus courtyard and the like): nothing grows on them.
    const onFloor = (x, z) => w.floors.some((f) => { const dx = x - f.x, dz = z - f.z; if (Math.abs(dx) > f.reach || Math.abs(dz) > f.reach) return false; const lx = dx * f.cos - dz * f.sin, lz = dx * f.sin + dz * f.cos; return Math.abs(lx) < f.hx + 0.3 && Math.abs(lz) < f.hz + 0.3; });
    const col = new THREE.Color();
    const put = (kind, x, z, s, sy, yaw, hex, jitter, tile, tilt) => {
      const y = w.standY(x, z);
      col.set(hex).multiplyScalar(1 - jitter / 2 + rng() * jitter);
      this.kinds[kind].list.push({ x, y, z, s, sy, yaw, tilt: tilt || 0, r: col.r, gg: col.g, b: col.b, tile: tile || 0 });
    };
    const tuft = (x, z, size, dryness) => {
      const t = rng();
      const tile = dryness > 0.6 ? (t < 0.75 ? 1 : 3) : t < 0.45 ? 0 : t < 0.7 ? 1 : t < 0.88 ? 2 : 3;
      const hex = tile === 1 ? 0xffffff : tile === 3 ? 0xf2f2ea : 0xeef0e2;
      put('tuft', x, z, size * (0.8 + rng() * 0.5), size * (0.7 + rng() * 0.6), rng() * 6.283, hex, 0.25, tile);
    };
    const pebble = (x, z, size, hex) => put('pebble', x, z, size * (0.5 + rng()), 0.35 + rng() * 0.4, rng() * 6.283, hex, 0.3, 0, (rng() - 0.5) * 0.5);

    // 1. Weeds in the cracks of the paving: along the joints, more toward the edges and walls, few where
    //    people walk in the middle.
    for (const P of PAVINGS) {
      for (let i = 0; i < 6500; i++) {
        const along = rng() < 0.5;
        let x, z;
        if (along) { x = P.x0 + P.tile * Math.round(rng() * (P.x1 - P.x0) / P.tile); z = P.z0 + rng() * (P.z1 - P.z0); }
        else { z = P.z0 + P.tile * Math.round(rng() * (P.z1 - P.z0) / P.tile); x = P.x0 + rng() * (P.x1 - P.x0); }
        x += (rng() - 0.5) * 0.06; z += (rng() - 0.5) * 0.06;
        const edge = Math.min(x - P.x0, P.x1 - x, z - P.z0, P.z1 - z), byWall = !free(x, z, 1.2);
        const want = byWall ? 0.6 : edge < 3 ? 0.35 : 0.06;
        if (rng() > want || !free(x, z, 0.1)) continue;
        if (rng() < 0.2) pebble(x, z, 0.05, 0xa29a8a); else tuft(x, z, 0.12 + rng() * 0.12, 0.3);
      }
    }
    // 2. Along the foot of walls: tufts and pebbles where nobody walks.
    for (const c of w.colliders) {
      if (c.t !== 1 || c.h < 1.6 || Math.max(c.hx, c.hz) < 1.0) continue;
      if (c.x < TOWN.x0 - 10 || c.x > TOWN.x1 + 10 || c.z < TOWN.z0 - 6 || c.z > TOWN.z1) continue;
      const sides = [[c.hx, 0, 0, 1], [-c.hx, 0, 0, 1], [0, c.hz, 1, 0], [0, -c.hz, 1, 0]];
      for (const [ox, oz, ax, az] of sides) {
        const len = ax ? c.hx : c.hz, nx = Math.sign(ox), nz = Math.sign(oz);
        for (let s = -len; s < len; s += 0.38) {
          if (rng() > 0.8) continue;
          const out = 0.08 + Math.pow(rng(), 2) * 0.5, lx = ox + ax * s + nx * out, lz = oz + az * s + nz * out;
          const x = c.x + lx * c.cos + lz * c.sin, z = c.z - lx * c.sin + lz * c.cos;
          if (!free(x, z, 0.05)) continue;
          if (rng() < 0.38) pebble(x, z, 0.07 + rng() * 0.07, onPaving(x, z) ? 0xa09686 : 0xa99880);
          else tuft(x, z, 0.16 + rng() * 0.26, onPaving(x, z) ? 0.3 : 0.55);
        }
      }
    }
    // 3. Open ground: pebbles in loose drifts, dry tufts where few people walk (away from paving and streets).
    for (let i = 0; i < 84000; i++) {
      const x = TOWN.x0 + rng() * (TOWN.x1 - TOWN.x0), z = TOWN.z0 + rng() * (TOWN.z1 - TOWN.z0);
      if (!free(x, z, 0.15)) continue;
      if (onPaving(x, z)) {   // a dirt street (the paved squares get their own weeds above): a few pebbles, a rare weed at the edge
        if (inPaving(x, z)) continue;
        const r0 = rng();
        if (r0 < 0.06) pebble(x, z, 0.04 + rng() * 0.07, rng() < 0.5 ? 0xb3a488 : 0x9f927c);
        else if (r0 < 0.07 && !onPaving(x + 1.2, z) || r0 < 0.07 && !onPaving(x - 1.2, z)) tuft(x, z, 0.16 + rng() * 0.18, 0.8);
        continue;
      }
      if (FIELDS.some(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) < fr + 1.5)) continue;   // not in the sown fields
      const drift = noise2(x * 0.11 + 3.1, z * 0.11 - 1.7), quiet = noise2(x * 0.07 - 7, z * 0.07 + 2);
      let nearPath = false; for (const [dx, dz] of [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) if (onPaving(x + dx, z + dz)) { nearPath = true; break; }
      // Patches of dry grass where few people walk: thick in the middle of a patch, none on the trodden ground.
      const patch = nearPath ? 0 : Math.max(0, (quiet - 0.48) / 0.52);
      const r = rng();
      if (r < 0.3 * drift * drift) pebble(x, z, 0.05 + rng() * 0.1, rng() < 0.5 ? 0xb3a488 : 0x9f927c);
      else if (z < -84) { if (r < 0.3 * drift * drift + 0.04) put('tuft', x, z, 0.2 + rng() * 0.2, 0.18 + rng() * 0.2, rng() * 6.283, 0xd8e0c8, 0.25, 0); }   // out in the green fields: low green weeds only
      else if (r < 0.3 * drift * drift + 0.9 * patch * patch + 0.045) tuft(x, z, 0.22 + rng() * 0.3 + patch * 0.25, patch > 0.3 || rng() < 0.7 ? 0.8 : 0.3);
    }
    // 4. Around the stalls and the goods on the quay: straw, and pieces of broken pots.
    for (const [gx, gz] of GOODS) {
      for (let i = 0; i < 40; i++) {
        const a = rng() * 6.283, d = 0.8 + Math.pow(rng(), 0.7) * 3.2, x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
        if (!free(x, z, 0.05)) continue;
        if (rng() < 0.78) put('straw', x, z, 0.14 + rng() * 0.16, 0.6 + rng() * 0.5, rng() * 6.283, rng() < 0.7 ? 0xc8ad6a : 0xa88d50, 0.25, 0, (rng() - 0.5) * 0.3);
        else put('shard', x, z, 0.1 + rng() * 0.12, 1, rng() * 6.283, rng() < 0.75 ? 0xa45a36 : 0x3a302a, 0.2, 0, (rng() - 0.5) * 0.6);
      }
    }

    // Instanced meshes, each big enough for all its things; the near set fills the front of the buffers.
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const kind in this.kinds) {
      const K = this.kinds[kind], n = K.list.length;
      K.mats = new Float32Array(n * 16); K.cols = new Float32Array(n * 3); K.tiles = new Float32Array(n);
      K.list.forEach((p, i) => {
        e.set(p.tilt, p.yaw, p.tilt * 0.6); q.setFromEuler(e); v.set(p.x, p.y, p.z); sc.set(p.s, p.sy * (kind === 'tuft' ? 1 : p.s / Math.max(p.s, 1e-3)), p.s);
        if (kind === 'pebble') sc.set(p.s, p.s * p.sy, p.s * (0.7 + 0.3 * Math.abs(Math.sin(p.yaw * 3))));
        if (kind === 'straw') sc.set(p.s, 1, p.sy);
        if (kind === 'shard') sc.set(p.s, p.s, p.s);
        m4.compose(v, q, sc); m4.toArray(K.mats, i * 16);
        K.cols[i * 3] = p.r; K.cols[i * 3 + 1] = p.gg; K.cols[i * 3 + 2] = p.b; K.tiles[i] = p.tile;
      });
      // A grid of 10 m cells, so the refill only looks at nearby cells.
      K.cells = new Map();
      K.list.forEach((p, i) => { const k = Math.floor(p.x / 10) + ',' + Math.floor(p.z / 10); let a = K.cells.get(k); if (!a) K.cells.set(k, a = []); a.push(i); });
      const mesh = new THREE.InstancedMesh(K.geo, K.mat, Math.max(1, n));
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
      if (kind === 'tuft') { K.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1); K.geo.setAttribute('aTile', K.tileAttr); }
      mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.name = 'scatter:' + kind;
      w.group.add(mesh); K.mesh = mesh;
    }
    this.last = new THREE.Vector2(1e9, 1e9);
    this.total = Object.fromEntries(Object.entries(this.kinds).map(([k, K]) => [k, K.list.length]));
  }

  // Refill the near set when the eye has moved more than 6 m: one kind per frame, so the work is spread over
  // four frames, with an 8 m margin so nothing near the eye is missing meanwhile.
  update(eye, dt) {
    this.u.time.value += dt || 0;
    if (!this.queue || !this.queue.length) {
      if (Math.hypot(eye.x - this.last.x, eye.z - this.last.y) < 6) return;
      this.last.set(eye.x, eye.z); this.at = { x: eye.x, z: eye.z }; this.queue = Object.keys(this.kinds);
    }
    this.fill(this.queue.shift(), this.at);
  }
  fill(kind, eye) {
    const K = this.kinds[kind], R = NEAR[kind] + 8, R2 = R * R, mesh = K.mesh, M = mesh.instanceMatrix.array, C = mesh.instanceColor.array, T = K.tileAttr ? K.tileAttr.array : null;
    const src = K.mats, cols = K.cols, list = K.list;
    let n = 0;
    const c0x = Math.floor((eye.x - R) / 10), c1x = Math.floor((eye.x + R) / 10), c0z = Math.floor((eye.z - R) / 10), c1z = Math.floor((eye.z + R) / 10);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const a = K.cells.get(cx + ',' + cz); if (!a) continue;
      for (let j = 0; j < a.length; j++) {
        const i = a[j], p = list[i], dx = p.x - eye.x, dz = p.z - eye.z; if (dx * dx + dz * dz > R2) continue;
        const si = i * 16, di = n * 16;
        for (let k = 0; k < 16; k++) M[di + k] = src[si + k];
        C[n * 3] = cols[i * 3]; C[n * 3 + 1] = cols[i * 3 + 1]; C[n * 3 + 2] = cols[i * 3 + 2];
        if (T) T[n] = K.tiles[i];
        n++;
      }
    }
    mesh.count = n;
    const up = (attr, size) => { attr.clearUpdateRanges(); attr.addUpdateRange(0, Math.max(1, n) * size); attr.needsUpdate = true; };
    up(mesh.instanceMatrix, 16); up(mesh.instanceColor, 3); if (K.tileAttr) up(K.tileAttr, 1);
  }
}
