// Loads the Blender asset kit and places instances of it in the world.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

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
};
const NO_COLLIDE = new Set(['stool', 'bush_a', 'bush_b', 'grass_tuft', 'sheep', 'bema', 'boat_small']);
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
    try {
      const gltf = await new GLTFLoader().loadAsync(base + 'kit.glb');
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
      this.loaded = true;
    } catch (e) { console.warn('Kit not loaded, using stand-in boxes:', e.message); }
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
    const s = opts.scale || 1, y = opts.y != null ? opts.y : this.world.terrainY(x, z) + (opts.lift || 0), zone = opts.zone || 'town';
    if (this.flora && FLORA_IDS.has(id)) {
      this.flora.add(id, x, y, z, rot, s, zone);
      const reg = this._register(id, x, y, z, rot, s, opts);
      return { id, x, y, z, rot, colliders: reg.colliders, anchor: (name) => reg.anchors[name] || new THREE.Vector3(x, y, z) };
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, opts.scaleY || s, s));
    // Instances are grouped by map cell so that far-off ones are skipped when drawing and when casting shadows.
    const key = id + '|' + zone + '|' + Math.floor(x / CELL) + '|' + Math.floor(z / CELL);
    (this.placements[key] || (this.placements[key] = [])).push(m);
    const reg = this._register(id, x, y, z, rot, s, opts);
    return { id, x, y, z, rot, colliders: reg.colliders, anchor: (name) => reg.anchors[name] || new THREE.Vector3(x, y, z) };
  }

  // A single movable object (not instanced), for things that appear, move, or vanish.
  spawn(id, x, z, rot = 0, opts = {}) {
    const a = this._asset(id), s = opts.scale || 1, y = opts.y != null ? opts.y : this.world.terrainY(x, z);
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

  zone(name) {
    if (!this.zones[name]) { this.zones[name] = new THREE.Group(); this.zones[name].name = 'zone:' + name; this.world.group.add(this.zones[name]); }
    return this.zones[name];
  }

  // Hide groups that are beyond the fog, and small things that are too far to matter.
  cull(cx, cz, far) {
    for (const c of this.chunks) { const d = Math.hypot(c.x - cx, c.z - cz) - c.r; c.mesh.visible = d < (c.small ? Math.min(far, 95) : far); }
  }

  // Turn all recorded placements into instanced meshes.
  build() {
    const NO_SHADOW = new Set(['grass_tuft']);
    for (const key in this.placements) {
      const [id, zone] = key.split('|'), list = this.placements[key], a = this._asset(id);
      for (const p of a.parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.glow ? this.glowMat : this.mat(), list.length);
        for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = !p.glow && !NO_SHADOW.has(id); im.receiveShadow = !p.glow;
        im.computeBoundingSphere();
        this.zone(zone).add(im);
        this.chunks.push({ mesh: im, x: im.boundingSphere.center.x, z: im.boundingSphere.center.z, r: im.boundingSphere.radius, small: SMALL.has(id) });
      }
    }
    this.placements = {};
    if (this.flora) this.flora.build();
  }
}
