// Loads the Blender asset kit and places instances of it in the world.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { makeRock, makeCaveMouth } from './rocks.js';
import { makeProps, makeCrateStack } from './props.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// Sizes [width x, height y, depth z] used for stand-in boxes if an asset is missing.
const FALLBACK = {
  house_a: [7, 5, 6], house_b: [8, 7.5, 7], house_c: [12, 5, 10], courtyard_house: [20, 5.5, 18], stoa: [26, 6, 7], shrine: [9, 8.5, 14],
  warehouse: [18, 6, 8], wall_seg: [12, 6, 2.4], wall_tower: [5, 9, 5], gate: [14, 9, 4], hut: [4, 3.2, 4], palace_hall: [22, 9, 10], palace_wall: [14, 4, 0.8],
  ship_merchant: [6, 13, 19], ship_trireme: [5.5, 7, 36], boat_small: [1.8, 1, 5.5], bollard: [0.5, 0.9, 0.5], crate_stack: [1.6, 1.5, 1.2], amphora: [0.45, 0.95, 0.45],
  amphora_group: [2.2, 1.1, 1.2], pithos: [1.1, 1.4, 1.1], sacks: [1.8, 0.9, 1.4], cart: [1.5, 1.4, 2.6], net_rack: [3, 2, 0.6],
  stall_a: [3, 2.6, 2.2], stall_b: [3, 2.6, 2.2], stall_c: [3, 2.6, 2.2], bookstall: [3.4, 2.6, 2.2], bema: [4, 0.9, 3], bench: [2, 0.45, 0.5], stool: [0.5, 0.45, 0.5],
  couch: [0.8, 0.6, 1.9], table_low: [1, 0.4, 0.6], well: [1.4, 2, 1.4], altar: [1.2, 1.1, 1.2], herm: [0.35, 1.9, 0.35], statue_goddess: [1.4, 3.6, 1.4],
  brazier: [0.6, 1.1, 0.6], torch_post: [0.3, 2.6, 0.3], column_single: [0.9, 4.5, 0.9], exedra: [5, 0.9, 2.8], milestone: [0.4, 1, 0.25],
  olive_a: [5, 5.5, 5], olive_b: [5, 5.5, 5], cypress_a: [1.8, 9, 1.8], cypress_b: [1.5, 6.5, 1.5], pine_a: [6, 8, 6], bush_a: [1.6, 1.2, 1.4], bush_b: [1.8, 1.6, 1.6],
  grass_tuft: [0.5, 0.4, 0.5], rock_a: [1.2, 0.8, 1], rock_b: [2.5, 1.6, 2], rock_c: [4.5, 2, 3.5], cliff_a: [10, 8, 6], cave_mouth: [11, 8, 5],
  bronze_horse: [1.3, 3.8, 4.2], sheep: [0.55, 0.8, 1.1], throne: [1.2, 2.2, 1], chest: [1.1, 0.8, 0.7],
  school: [9.5, 5.8, 7.8], klismos: [0.56, 0.95, 0.62], school_bench: [2.6, 0.43, 0.38], wall_a: [2.5, 0.6, 0.2], wall_b: [2.2, 0.9, 0.2], tablet_set: [0.44, 0.03, 0.3], scroll_bin: [0.4, 0.5, 0.4], bone_basket: [0.3, 0.1, 0.24],
  workshop: [12.8, 6.2, 8.8], shield: [0.9, 0.94, 0.16], shield_stack: [0.9, 0.4, 0.9], workbench: [2, 0.95, 0.9], stump_anvil: [0.75, 0.82, 0.75], forge: [1.7, 0.9, 1], loom: [1.9, 2.05, 0.95], wool_basket: [0.42, 0.5, 0.42],
};
const NO_COLLIDE = new Set(['stool', 'bush_a', 'bush_b', 'grass_tuft', 'sheep', 'bema', 'boat_small', 'klismos', 'school_bench', 'wall_a', 'wall_b', 'tablet_set', 'bone_basket', 'shield']);
const CELL = 56;
// Small things that are not worth drawing from far away.
const SMALL = new Set(['grass_tuft', 'bush_a', 'bush_b', 'rock_a', 'amphora', 'bollard', 'milestone', 'stool', 'herm', 'brazier', 'torch_post', 'crate_stack', 'sacks', 'pithos', 'bench', 'table_low', 'couch', 'amphora_group', 'net_rack', 'cart', 'well', 'altar']);
const OPEN_WHEN_STANDIN = new Set(['courtyard_house', 'gate', 'cave_mouth', 'palace_hall', 'stoa', 'exedra']);
// Plants that a separate module (kit.flora) draws, when one is attached. The kit still registers their colliders.
export const FLORA_IDS = new Set(['olive_a', 'olive_b', 'cypress_a', 'cypress_b', 'pine_a', 'bush_a', 'bush_b', 'grass_tuft']);
const TREE_TRUNK = { olive_a: 0.5, olive_b: 0.5, cypress_a: 0.45, cypress_b: 0.4, pine_a: 0.4, well: 0.8, pithos: 0.6, herm: 0.3, bollard: 0.3, amphora: 0.3, brazier: 0.35, torch_post: 0.16, column_single: 0.45, statue_goddess: 0.8, hut: 2.0, rock_a: 0.55, rock_b: 1.1, rock_c: 1.9, milestone: 0.25 };

export class Kit {
  constructor(world) {
    this.world = world;
    this.assets = {};       // id -> { parts: [{ geometry, glow }], info }
    this.placements = {};   // key id|zone -> [matrix]
    this.zones = {};        // zone -> THREE.Group
    this.kitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    this.loaded = false; this.missing = []; this.chunks = [];
    this.flora = null;      // set by the game: draws trees, bushes, and grass in place of the kit's own
    this.surface = null;    // set by the game before load(): prepares each part's geometry and supplies the material for it
  }

  async load(base) {
    let manifest = { assets: {} };
    try { const r = await fetch(base + 'manifest.json', { cache: 'no-cache' }); if (r.ok) manifest = await r.json(); } catch (e) { /* stand-in boxes will be used */ }
    this.manifest = manifest;
    const read = async (file) => {
      const gltf = await new GLTFLoader().loadAsync(base + file);
      gltf.scene.updateMatrixWorld(true);
      for (const root of gltf.scene.children) {
        const parts = [], inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        root.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
          if (!g.attributes.color) {
            const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(0.7);
            g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          } else if (g.attributes.color.itemSize === 4) {
            const src = g.attributes.color, n = src.count, c = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) { c[i * 3] = src.getX(i); c[i * 3 + 1] = src.getY(i); c[i * 3 + 2] = src.getZ(i); }
            g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          }
          const glow = /glow/i.test(o.material && o.material.name || '');
          parts.push({ geometry: this.surface && !glow ? this.surface.prepare(g, root.name) : g, glow });
        });
        if (parts.length) this.assets[root.name] = { parts, info: manifest.assets[root.name] || null };
      }
    };
    try { await read('kit.glb'); this.loaded = true; } catch (e) { console.warn('Kit not loaded, using stand-in boxes:', e.message); }
    // More models in a file of their own: the schoolroom and its furniture (blender/assets_school.py).
    try {
      const r = await fetch(base + 'manifest_extra.json', { cache: 'no-cache' });
      if (r.ok) { Object.assign(manifest.assets, (await r.json()).assets); await read('kit_extra.glb'); }
    } catch (e) { console.warn('Extra models not loaded:', e.message); }
    // Rocks: several shapes for each size, made in code (rocks.js), in place of one model each. A placed rock
    // takes one of them by where it stands.
    this.rockKinds = {};
    for (const [id, count, detail] of [['rock_a', 5, 4], ['rock_b', 4, 5], ['rock_c', 3, 6], ['cliff_a', 3, 8]]) {
      for (let v = 0; v < count; v++) {
        const g = makeRock(id.charCodeAt(5) * 100 + v * 17 + 1, this.size(id), detail);
        this.assets[id + '~' + v] = { parts: [{ geometry: this.surface ? this.surface.prepareAs(g, id, 'rockcut') : g, glow: false }], info: (this.assets[id] && this.assets[id].info) || null };
      }
      this.rockKinds[id] = count;
    }
    // Small things for doorways and the market (props.js), dressed by the surface pass like the rest.
    const props = makeProps();
    for (const id in props) {
      const p = props[id], col = p.r ? [{ t: 'circle', x: 0, z: 0, r: p.r }] : p.box ? [{ t: 'box', x: 0, z: 0, hx: p.box[0], hz: p.box[1] }] : [];
      this.assets[id] = { parts: p.parts.map(([g, type]) => ({ geometry: this.surface ? this.surface.prepareAs(g, id, type) : g, glow: false })), info: { size: p.size, colliders: col } };
      SMALL.add(id);
    }
    if (this.assets.crate_stack) this.assets.crate_stack.parts = makeCrateStack().map(([g, type]) => ({ geometry: this.surface ? this.surface.prepareAs(g, 'crate_stack', type) : g, glow: false }));
    if (this.assets.cave_mouth) { const g = makeCaveMouth(mergeGeometries); this.assets.cave_mouth.parts = [{ geometry: this.surface ? this.surface.prepareAs(g, 'cave_mouth', 'rockcut') : g, glow: false }]; }
  }

  // The material for ordinary kit parts: the surface module's if one is attached, the plain one otherwise.
  mat() { return (this.surface && this.surface.material) || this.kitMat; }

  _asset(id) {
    if (this.assets[id]) return this.assets[id];
    const s = FALLBACK[id] || [1, 1, 1];
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]).toNonIndexed(); g.translate(0, s[1] / 2, 0);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = 0.5 + 0.12 * ((i / 6) | 0) % 3 * 0.5; c[i * 3] = v * 1.05; c[i * 3 + 1] = v * 0.95; c[i * 3 + 2] = v * 0.82; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!this.missing.includes(id)) this.missing.push(id);
    return (this.assets[id] = { parts: [{ geometry: g, glow: false }], info: null, standIn: true });
  }

  size(id) { const a = this._asset(id); return (a.info && a.info.size) || FALLBACK[id] || [1, 1, 1]; }

  // Register colliders, floors, and anchors for one placement and return its anchors.
  _register(id, x, y, z, rot, s, opts) {
    const a = this._asset(id), info = a.info, w = this.world, cos = Math.cos(rot), sin = Math.sin(rot), size = this.size(id);
    const toWorld = (lx, lz) => [x + (lx * cos + lz * sin) * s, z + (-lx * sin + lz * cos) * s];
    const made = [];
    if (!opts.noCollide) {
      const before = w.colliders.length;
      if (info && info.colliders && info.colliders.length) {
        for (const c of info.colliders) {
          const [wx, wz] = toWorld(c.x || 0, c.z || 0);
          if (c.t === 'circle') w.addCircle(wx, wz, c.r * s, size[1] * s);
          else w.addBox(wx, wz, c.hx * s, c.hz * s, rot + (c.rot || 0), size[1] * s);
        }
      } else if (a.standIn && OPEN_WHEN_STANDIN.has(id)) {
        /* a stand-in box for something you walk through: leave it open */
      } else if (!NO_COLLIDE.has(id) && !(info && info.colliders)) {
        if (TREE_TRUNK[id]) w.addCircle(x, z, TREE_TRUNK[id] * s, size[1] * s);
        else w.addBox(x, z, size[0] / 2 * s, size[2] / 2 * s, rot, size[1] * s);
      }
      for (let i = before; i < w.colliders.length; i++) made.push(w.colliders[i]);
    }
    if (info && info.floors) for (const f of info.floors) { const [wx, wz] = toWorld(f.x || 0, f.z || 0); w.addFloor(wx, wz, f.hx * s, f.hz * s, rot, y + f.y * s); }
    else if (a.standIn && (id === 'bema' || id === 'stoa' || id === 'shrine')) w.addFloor(x, z, size[0] / 2, size[2] / 2, rot, y + (id === 'stoa' ? 0.6 : 0.9));
    const anchors = {};
    if (info && info.anchors) for (const k in info.anchors) {
      const p = info.anchors[k], [wx, wz] = toWorld(p[0], p[2]);
      anchors[k] = new THREE.Vector3(wx, y + p[1] * s, wz);
    }
    return { anchors, colliders: made };
  }

  // Place a static instance. Returns { x, y, z, rot, anchor(name) }.
  place(id, x, z, rot = 0, opts = {}) {
    const s = opts.scale || 1, y = opts.y != null ? opts.y : this.groundUnder(id, x, z, rot, s) + (opts.lift || 0), zone = opts.zone || 'town';
    if (this.flora && FLORA_IDS.has(id)) {
      this.flora.add(id, x, y, z, rot, s, zone);
      const reg = this._register(id, x, y, z, rot, s, opts);
      return { id, x, y, z, rot, colliders: reg.colliders, anchor: (name) => reg.anchors[name] || new THREE.Vector3(x, y, z) };
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, opts.scaleY || s, s));
    // Instances are grouped by map cell so that far-off ones are skipped when drawing and when casting shadows.
    const key = this.shapeOf(id, x, z) + '|' + zone + '|' + Math.floor(x / CELL) + '|' + Math.floor(z / CELL);
    (this.placements[key] || (this.placements[key] = [])).push(m);
    const reg = this._register(id, x, y, z, rot, s, opts);
    return { id, x, y, z, rot, colliders: reg.colliders, anchor: (name) => reg.anchors[name] || new THREE.Vector3(x, y, z) };
  }

  // A single movable object (not instanced), for things that appear, move, or vanish.
  spawn(id, x, z, rot = 0, opts = {}) {
    const a = this._asset(this.shapeOf(id, x, z)), s = opts.scale || 1, y = opts.y != null ? opts.y : this.groundUnder(id, x, z, rot, s);
    if (this.flora && FLORA_IDS.has(id)) {
      const parent = opts.parent || this.zone(opts.zone || 'town'), obj = this.flora.spawn(id, x, y, z, rot, s, parent);
      const reg = this._register(id, x, y, z, rot, s, opts);
      obj.userData = Object.assign(obj.userData || {}, { anchors: reg.anchors, colliders: reg.colliders });
      return obj;
    }
    const g = new THREE.Group();
    for (const p of a.parts) {
      const mesh = new THREE.Mesh(p.geometry, p.glow ? this.glowMat : this.mat());
      mesh.castShadow = !p.glow; mesh.receiveShadow = !p.glow; g.add(mesh);
    }
    g.position.set(x, y, z); g.rotation.y = rot; g.scale.setScalar(s);
    const reg = opts.noCollide ? { anchors: {}, colliders: [] } : this._register(id, x, y, z, rot, s, opts);
    if (opts.noCollide) Object.assign(reg, this._register(id, x, y, z, rot, s, { noCollide: true }));
    g.userData = { anchors: reg.anchors, colliders: reg.colliders };
    (opts.parent || this.zone(opts.zone || 'town')).add(g);
    return g;
  }

  // The ground height to set an asset on. A rock goes on the lowest ground under it, so that on a slope its downhill
  // side does not hang in the air (it is made with a buried foot for this). Everything else uses its center.
  groundUnder(id, x, z, rot, s) {
    const w = this.world;
    if (!this.rockKinds || !this.rockKinds[id]) return w.terrainY(x, z);
    const sz = this.size(id), hx = sz[0] / 2 * s * 0.8, hz = sz[2] / 2 * s * 0.8, c = Math.cos(rot), sn = Math.sin(rot);
    let y = w.terrainY(x, z);
    for (const [ax, az] of [[hx, 0], [-hx, 0], [0, hz], [0, -hz], [hx * 0.7, hz * 0.7], [-hx * 0.7, hz * 0.7], [hx * 0.7, -hz * 0.7], [-hx * 0.7, -hz * 0.7]]) y = Math.min(y, w.terrainY(x + ax * c + az * sn, z - ax * sn + az * c));
    return y;
  }

  // Which of an asset's shapes to use at a place (only rocks have more than one).
  shapeOf(id, x, z) {
    const n = this.rockKinds && this.rockKinds[id];
    if (!n) return id;
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
    return id + '~' + Math.floor((h - Math.floor(h)) * n);
  }

  zone(name) {
    if (!this.zones[name]) { this.zones[name] = new THREE.Group(); this.zones[name].name = 'zone:' + name; this.world.group.add(this.zones[name]); }
    return this.zones[name];
  }

  // Hide groups that are beyond the fog, and small things that are too far to matter.
  cull(cx, cz, far) {
    for (const c of this.chunks) { const d = Math.hypot(c.x - cx, c.z - cz) - c.r; c.mesh.visible = d < (c.small ? Math.min(far, 95) : far); }
  }

  // Turn all recorded placements into meshes. Most placements are one of a kind in their map cell (212 of 307 groups
  // in the town held a single copy), so instancing saved nothing for them and each still cost a draw call: in the
  // market, 173 for the town picture and 81 for the sun's shadow picture, at about 14 microseconds each on the page's
  // side (2026-11-15). Now every surface-dressed part in a cell is merged into one shape per zone, material, shadow
  // setting, and size class (small things are still hidden from 95 m by cull). Parts placed more than BAKE_MAX times
  // in a cell stay instanced. ?bake=0 in the address keeps the old way, for comparing.
  build() {
    const NO_SHADOW = new Set(['grass_tuft']), BAKE_MAX = 6;
    const bakeOn = !/[?&]bake=0/.test((typeof location !== 'undefined' && location.search) || '');
    const groups = new Map();
    const instanced = (id, zone, list, p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.glow ? this.glowMat : this.mat(), list.length);
      for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = !p.glow && !NO_SHADOW.has(id); im.receiveShadow = !p.glow;
      im.computeBoundingSphere();
      this.zone(zone).add(im);
      this.chunks.push({ mesh: im, x: im.boundingSphere.center.x, z: im.boundingSphere.center.z, r: im.boundingSphere.radius, small: SMALL.has(id) });
    };
    for (const key in this.placements) {
      const [id, zone, cx, cz] = key.split('|'), list = this.placements[key], a = this._asset(id);
      for (const p of a.parts) {
        const g = p.geometry, cast = !p.glow && !NO_SHADOW.has(id);
        if (!bakeOn || p.glow || !g.attributes.aSurf || g.index || list.length > BAKE_MAX) { instanced(id, zone, list, p); continue; }
        const sig = Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize + g.attributes[k].array.constructor.name).join(',');
        const bk = [zone, cx, cz, cast ? 1 : 0, SMALL.has(id) ? 1 : 0, sig].join('|');
        let G = groups.get(bk);
        if (!G) groups.set(bk, (G = { zone, cast, small: SMALL.has(id), items: [] }));
        for (const m of list) G.items.push([g, m]);
      }
    }
    for (const G of groups.values()) {
      const geo = bakeParts(G.items), mesh = new THREE.Mesh(geo, this.mat());
      mesh.castShadow = G.cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      geo.computeBoundingSphere();
      this.zone(G.zone).add(mesh);
      this.chunks.push({ mesh, x: geo.boundingSphere.center.x, z: geo.boundingSphere.center.z, r: geo.boundingSphere.radius, small: G.small });
    }
    this.placements = {};
    if (this.flora) this.flora.build();
  }
}

// Merge copies of surface-dressed parts into one shape in world space. items: [[geometry, matrix]]. Each part's
// own values keep their meaning: the picture's across-direction (aT) turns and scales with the copy as the shader
// would have turned it, normals turn, and the height in the model (aY) and everything else is copied as it is.
const _nm = new THREE.Matrix3(), _bv = new THREE.Vector3();
function bakeParts(items) {
  let n = 0;
  for (const [g] of items) n += g.attributes.position.count;
  const names = Object.keys(items[0][0].attributes), out = {};
  for (const k of names) { const a = items[0][0].attributes[k]; out[k] = new a.array.constructor(n * a.itemSize); }
  let o = 0;
  for (const [g, m] of items) {
    const c = g.attributes.position.count, e = m.elements;
    _nm.getNormalMatrix(m);
    for (const k of names) {
      const src = g.attributes[k], s = src.array, d = out[k], w = src.itemSize;
      if (k === 'position') for (let i = 0; i < c; i++) { _bv.fromArray(s, i * 3).applyMatrix4(m); _bv.toArray(d, (o + i) * 3); }
      else if (k === 'normal') for (let i = 0; i < c; i++) { _bv.fromArray(s, i * 3).applyMatrix3(_nm).normalize(); _bv.toArray(d, (o + i) * 3); }
      else if (k === 'aT') for (let i = 0; i < c; i++) { const x = s[i * 3], y = s[i * 3 + 1], z = s[i * 3 + 2], j = (o + i) * 3; d[j] = e[0] * x + e[4] * y + e[8] * z; d[j + 1] = e[1] * x + e[5] * y + e[9] * z; d[j + 2] = e[2] * x + e[6] * y + e[10] * z; }
      else d.set(s.subarray(0, c * w), o * w);
    }
    o += c;
  }
  const geo = new THREE.BufferGeometry();
  for (const k of names) { const a = items[0][0].attributes[k]; geo.setAttribute(k, new THREE.BufferAttribute(out[k], a.itemSize, a.normalized)); }
  return geo;
}
