// The districts of the town and the country round it: a name shown on entering each, its own light and air, a few
// landmarks that can be seen from a distance, and the sea and the wind in the background sound.
// From the review Roman passed on (2026-11-16): "stronger differences between places", and "concentrate detail
// where people work and walk". He chose this item on 2026-11-16.
//
// Everything here is the game's own staging. The ribbons in the market square are for the festival of Bendis, which
// is in the Republic (the festival at 327a; the goddess is named at 354a); that ribbons were strung is made up.
import * as THREE from 'three';

// Each district: where it is, the name shown on entering it, and how its light differs from the plain profile.
// ex exposure, color how much color, contrast, haze thickness of the far haze, warm and cool the tint of lit and
// shaded surfaces (red, green, blue). 1 means no change.
const N = { ex: 1, color: 1, contrast: 1, haze: 1, warm: [1, 1, 1], cool: [1, 1, 1] };
const STRENGTH = 1.5;   // how far each district's light is pushed from the plain profile: 1 is as written below, 0 is no difference
export const DISTRICTS = [
  { id: 'stakes', name: 'The staked ground', sub: 'Where a new city is marked out', test: (x, z) => Math.hypot(x - 130, z + 160) < 45, look: { ex: 1.04, color: 1.08, contrast: 1.02, haze: 0.8, warm: [1.03, 1.02, 0.95], cool: [0.98, 1.01, 1.0] } },
  { id: 'hill', name: 'The hill', sub: 'The road to the cave', test: (x, z) => z < -170, look: { ex: 1.02, color: 1.0, contrast: 1.09, haze: 0.5, warm: [1, 1, 1], cool: [0.93, 0.99, 1.08] } },
  { id: 'fields', name: 'The fields', sub: 'Outside the north gate', test: (x, z) => z < -82, look: { ex: 1.05, color: 1.13, contrast: 1.02, haze: 0.8, warm: [1.04, 1.02, 0.93], cool: [0.98, 1.02, 0.99] } },
  { id: 'harbor', name: 'The harbor', sub: 'Where the ships unload', test: (x, z) => z > 36, look: { ex: 1.05, color: 1.05, contrast: 0.97, haze: 1.4, warm: [1.0, 1.0, 1.03], cool: [0.95, 1.0, 1.07] } },
  { id: 'agora', name: 'The market square', sub: 'Stalls, the stoa, and the speakers’ platform', test: (x, z) => x > -38 && x < 36 && z > -24 && z < 16, look: { ex: 1.0, color: 1.1, contrast: 1.03, haze: 1.0, warm: [1.04, 1.0, 0.95], cool: [1.02, 0.99, 0.96] } },
  { id: 'west', name: 'The west quarter', sub: 'The house of Cephalus and the weavers’ lane', test: (x, z) => x <= -38 && z <= 36 && z >= -82, look: { ex: 0.95, color: 0.92, contrast: 1.0, haze: 0.9, warm: [1.0, 0.99, 0.97], cool: [0.94, 0.98, 1.05] } },
  { id: 'east', name: 'The craftsmen’s quarter', sub: 'Potters, smiths, and stonecutters', test: (x, z) => x >= 36 && z <= 36 && z >= -82, look: { ex: 0.98, color: 0.95, contrast: 1.07, haze: 1.7, warm: [1.07, 0.98, 0.89], cool: [1.0, 0.96, 0.91] } },
  { id: 'road', name: 'The gate road', sub: 'From the square to the north gate', test: (x, z) => z <= -24 && z >= -82, look: N },
  { id: 'street', name: 'The harbor street', sub: 'From the quay up to the square', test: (x, z) => z >= 16 && z <= 36, look: N },
];
export const districtAt = (x, z) => DISTRICTS.find((d) => d.test(x, z)) || null;

// ---- a small builder: many flat pieces with their own colors, drawn as one object
const clothUniforms = { uClothTime: { value: 0 }, uClothWind: { value: 1 } };
function windCloth(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, clothUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCloth; uniform float uClothTime; uniform float uClothWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat wave = sin(position.x * 1.8 + position.z * 1.1 - uClothTime * 2.2) + 0.35 * sin(position.y * 5.1 - uClothTime * 3.7);\ntransformed.x += wave * aCloth * uClothWind * 0.11;\ntransformed.z += wave * aCloth * uClothWind * 0.055;');
  };
  material.customProgramCacheKey = () => 'codex-cloth-wind-v1';
  return material;
}
function pieces() {
  const pos = [], col = [], cpos = [], ccol = [], cnor = [], cwind = [], c = new THREE.Color();
  const quad = (a, b, d, e, hex, shade = 1) => { c.setHex(hex); for (const p of [a, b, d, a, d, e]) { pos.push(p[0], p[1], p[2]); col.push(c.r * shade, c.g * shade, c.b * shade); } };
  return {
    quad,
    // A piece of cloth. It is drawn once for each side, and both sides are lit as if they faced the sky, so hanging
    // cloth shows its color from either side and from below (lit by its true facing, the shaded side came out nearly black).
    cloth(a, b, d, e, hex) {
      c.setHex(hex);
      const hanging = (a[1] + b[1] - d[1] - e[1]) * 0.5 > 0.25;
      const at = (u, v) => a.map((n, i) => (n * (1 - u) + b[i] * u) * (1 - v) + (e[i] * (1 - u) + d[i] * u) * v);
      const point = (u, v) => {
        cpos.push(...at(u, v)); ccol.push(c.r, c.g, c.b); cnor.push(0, 1, 0);
        cwind.push(hanging ? v * v : Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
      };
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
        const u = i / 3, v = j / 5, x = (i + 1) / 3, y = (j + 1) / 5;
        for (const [s, t] of [[u,v],[x,v],[x,y],[u,v],[x,y],[u,y],[u,v],[x,y],[x,v],[u,v],[u,y],[x,y]]) point(s, t);
      }
    },
    // an upright post, square in section
    post(x, y, z, h, w = 0.09, hex = 0x5a4634) { const k = [[-w, -w], [w, -w], [w, w], [-w, w]]; for (let i = 0; i < 4; i++) { const p = k[i], q = k[(i + 1) % 4]; quad([x + p[0], y, z + p[1]], [x + q[0], y, z + q[1]], [x + q[0], y + h, z + q[1]], [x + p[0], y + h, z + p[1]], hex, 0.8 + 0.1 * i); } },
    // a sagging rope from a to b, as thin crossed strips; returns the points along it
    rope(a, b, sag, n = 10, hex = 0x4a3a2a) {
      const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]); }
      for (let i = 0; i < n; i++) { const p = pts[i], q = pts[i + 1], w = 0.025; quad([p[0], p[1] - w, p[2]], [q[0], q[1] - w, q[2]], [q[0], q[1] + w, q[2]], [p[0], p[1] + w, p[2]], hex); quad([p[0] - w, p[1], p[2] - w], [q[0] - w, q[1], q[2] - w], [q[0] + w, q[1], q[2] + w], [p[0] + w, p[1], p[2] + w], hex); }
      return pts;
    },
    // two objects: the posts and ropes, and the cloth
    mesh(shadow) {
      const grp = new THREE.Group();
      const g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g1.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g1.computeVertexNormals();
      const m1 = new THREE.Mesh(g1, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m1.receiveShadow = true; grp.add(m1);
      if (cpos.length) {
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(cnor, 3));
        g2.setAttribute('aCloth', new THREE.Float32BufferAttribute(cwind, 1));
        const m2 = new THREE.Mesh(g2, windCloth(new THREE.MeshLambertMaterial({ vertexColors: true })));
        m2.castShadow = !!shadow;
        m2.customDepthMaterial = windCloth(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
        g2.computeBoundingSphere(); g2.boundingSphere.radius += 0.3;
        grp.add(m2);
      }
      return grp;
    },
  };
}
const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

export function setupPlaces(g) {
  const w = g.world, gy = (x, z) => w.groundY(x, z);
  const DYE = [0x3c5f8a, 0xa8442e, 0xc9a23c, 0xe6dcc0, 0x6f7f4a, 0x8a3b5a];

  // ---- the market square: ribbons strung between posts for the festival
  {
    const B = pieces(), nodes = [[-25, 13.4], [-8.5, 13.4], [8.5, 13.4], [25, 13.4], [25.4, -4], [25, -21.4], [8.5, -21.4], [-8.5, -21.4], [-25, -21.4]], H = 5.2, RIB = [0xa8442e, 0xd9a93c, 0xf0e8d6];
    nodes.forEach(([x, z]) => { B.post(x, gy(x, z), z, H, 0.08); w.addCircle(x, z, 0.16, 3); });
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1], pts = B.rope([a[0], gy(a[0], a[1]) + H - 0.1, a[1]], [b[0], gy(b[0], b[1]) + H - 0.1, b[1]], 0.9, 14);
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      for (let k = 1; k < 28; k++) {
        const t = k / 28, f = t * 14, j = Math.min(13, Math.floor(f)), p = lerp3(pts[j], pts[j + 1], f - j), len = 0.55 + 0.35 * ((k * 7) % 5) / 4, hw = 0.07, sw = 0.08 * Math.sin(k * 2.1);
        B.cloth([p[0] - ux * hw, p[1], p[2] - uz * hw], [p[0] + ux * hw, p[1], p[2] + uz * hw], [p[0] + ux * hw - uz * sw, p[1] - len, p[2] + uz * hw + ux * sw], [p[0] - ux * hw - uz * sw, p[1] - len, p[2] - uz * hw + ux * sw], RIB[k % 3]);
      }
    }
    w.group.add(B.mesh(false));
  }

  // ---- the west quarter: dyed cloth hung out to dry across the lane, and beside the weaver
  {
    const B = pieces();
    const line = (a, b, h, n, len) => {
      const A = [a[0], gy(a[0], a[1]) + h, a[1]], Bp = [b[0], gy(b[0], b[1]) + h, b[1]], pts = B.rope(A, Bp, 0.25, 10);
      B.post(a[0], gy(a[0], a[1]), a[1], h + 0.1); B.post(b[0], gy(b[0], b[1]), b[1], h + 0.1); w.addCircle(a[0], a[1], 0.14, 3); w.addCircle(b[0], b[1], 0.14, 3);
      for (let k = 0; k < n; k++) {
        const t0 = (k + 0.12) / n, t1 = (k + 0.88) / n, at = (t) => { const f = t * 10, j = Math.min(9, Math.floor(f)); return lerp3(pts[j], pts[j + 1], f - j); }, p = at(t0), q = at(t1), l = len * (0.8 + 0.4 * ((k * 5 + n) % 4) / 3), s = 0.1 * Math.sin(k * 1.7 + n);
        const nx = -(q[2] - p[2]), nz = q[0] - p[0], nl = Math.hypot(nx, nz) || 1;
        B.cloth(p, q, [q[0] + nx / nl * s, q[1] - l, q[2] + nz / nl * s], [p[0] + nx / nl * s, p[1] - l, p[2] + nz / nl * s], DYE[(k * 3 + n + Math.round(Math.abs(a[1]))) % DYE.length]);
      }
    };
    line([-69.3, -28], [-62.7, -28], 3.5, 4, 1.5); line([-69.3, -40.5], [-62.7, -40.5], 3.6, 5, 1.3); line([-69.3, -52], [-62.7, -52], 3.5, 4, 1.6); line([-69.3, -66], [-62.7, -66], 3.6, 5, 1.4);
    line([-60.6, 0.2], [-60.6, 6.8], 2.6, 5, 1.5);          // beside the weaver, low enough to reach
    w.group.add(B.mesh(true));
  }

  // ---- the craftsmen's quarter: shade cloths over the street, pots set out to dry, and smoke from the kiln and the forge
  const smokes = [];
  {
    const B = pieces();
    for (const [z, hex, hex2] of [[-9, 0xe6dcc0, 0xa8442e], [-17.5, 0xc9a23c, 0xe6dcc0], [-26, 0xe6dcc0, 0x3c5f8a], [-34.5, 0xa8442e, 0xc9a23c]]) {
      const x0 = 59.1, x1 = 64.9, h = 4.1, zz = [z - 1.5, z + 1.5];
      for (const x of [x0, x1]) for (const q of zz) { B.post(x, gy(x, q), q, h + 0.05, 0.07); w.addCircle(x, q, 0.13, 3); }
      const S = 7;      // seven strips across the street, sagging in the middle, in two colors
      for (let i = 0; i < S; i++) { const xa = x0 + (x1 - x0) * i / S, xb = x0 + (x1 - x0) * (i + 1) / S, ya = gy(xa, z) + h - Math.sin(i / S * Math.PI) * 0.45, yb = gy(xb, z) + h - Math.sin((i + 1) / S * Math.PI) * 0.45; B.cloth([xa, ya, zz[0]], [xb, yb, zz[0]], [xb, yb, zz[1]], [xa, ya, zz[1]], i % 2 ? hex2 : hex); }
    }
    w.group.add(B.mesh(true));
    for (const [id, x, z, r] of [['amphora_group', 64.6, -0.4, 0.3], ['amphora_group', 65.2, -7.6, 1.2], ['amphora_group', 69.6, -8.4, 0.2], ['pithos', 63.9, -3.6, 0], ['pithos', 69.9, -1.2, 0], ['amphora', 64.2, -6.1, 0], ['amphora', 68.6, -9.6, 0], ['shield_stack', 55.4, -24.2, 0.4], ['sacks', 55.0, -30.2, 1.1]]) g.kit.place(id, x, z, r);
    // smoke: soft dark puffs that rise and lean with the wind, as at the charcoal pit
    const tex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
    for (const [x, z, y0, rise] of [[68.9, -4, 2.6, 20], [55.5, -27, 3.0, 16]]) {
      const set = { x, z, y: gy(x, z) + y0, rise, puffs: [] };
      for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x6e6a66, transparent: true, opacity: 0, depthWrite: false })); s.renderOrder = 1000; w.group.add(s); set.puffs.push(s); }
      smokes.push(set);
    }
  }

  // ---- names, light, smoke and background sound, as the player moves
  const cur = { ex: 1, color: 1, contrast: 1, haze: 1, wr: 1, wg: 1, wb: 1, cr: 1, cg: 1, cb: 1 };
  if (g.post) g.post.place = cur;
  let here = 'harbor', shownAt = {}, soundT = 0;       // the game opens with its own title at the harbor
  shownAt.harbor = 0;
  g.tickers.push((dt) => {
    clothUniforms.uClothTime.value = g.time;
    // The cloth moves less between gusts and more in one (gusts.js, 2026-11-19): 0.75 to 1.35 times what it was.
    clothUniforms.uClothWind.value = g.reduceMotion ? 0 : Math.min(1.7, g.sky.cur.wind || 0) * (0.75 + 0.6 * (g.gusts ? g.gusts.v : 0.4));
    const p = g.player, world = g.space === 'world', d = world ? districtAt(p.x, p.z) : null, L = d ? d.look : N, k = 1 - Math.exp(-0.7 * dt);
    g.fieldNotes?.visit(d);
    const S = (v) => 1 + (v - 1) * STRENGTH, to = { ex: S(L.ex), color: S(L.color), contrast: S(L.contrast), haze: S(L.haze), wr: S(L.warm[0]), wg: S(L.warm[1]), wb: S(L.warm[2]), cr: S(L.cool[0]), cg: S(L.cool[1]), cb: S(L.cool[2]) };
    for (const key in cur) cur[key] += (to[key] - cur[key]) * k;
    // the name, once on coming into a district, and again only after two minutes away from it
    if (d && d.id !== here) {
      here = d.id;
      if (!g.busy && (shownAt[d.id] == null || g.time - shownAt[d.id] > 120)) g.ui.area(d.name, d.sub);
      shownAt[d.id] = g.time;
    } else if (d) shownAt[d.id] = g.time;
    // smoke over the kiln and the forge, drawn only from within 80 m (each puff is a separate draw, and the harbor view is already the heaviest)
    const t = g.time;
    for (const s of smokes) {
      const near = world && Math.hypot(p.x - s.x, p.z - s.z) < 80;
      s.puffs.forEach((sp, i) => { sp.visible = near; if (!near) return; const q = (t / 14 + i / s.puffs.length) % 1, lean = q * q, sc = 1.0 + q * 4.2; sp.position.set(s.x + lean * 6 + Math.sin(i * 2.4 + q * 5) * 0.4 * q, s.y + q * s.rise, s.z + lean * 2); sp.scale.set(sc, sc, 1); sp.material.opacity = 0.42 * Math.pow(Math.sin(Math.PI * Math.min(1, q * 1.3)), 0.6) * (1 - q * 0.7); });
    }
    // The sea at the water's edge, the wind in the open, and the low tone of the cave. Set twice a second; the sound
    // follows over about a second. Levels were measured with an offline render on 2026-11-17, after Roman heard the
    // first version: "waves are too loud", "it should start quieter and then disappear as you move away".
    // The sea is heard only within 20 m of the quay's edge, that is, on the quay paving and the piers (it was 38 m until
    // 2026-11-19, when Roman said the waves "persist as I walk away"; once off the quay "I really shouldn't hear it").
    // The wind and the cave tone came down by about 10 dB too,
    // because the wind on the hill and the cave tone measured as loud as the sea he complained of.
    soundT -= dt;
    if (soundT <= 0 && g.audio && g.audio.mix) {
      soundT = 0.5;
      const wind = (g.sky && g.sky.cur && g.sky.cur.wind != null ? g.sky.cur.wind : 1);
      const edge = world ? Math.max(0, 58.3 - p.z) : 99, sea = edge >= 20 ? 0 : Math.pow(1 - edge / 20, 2);      // 58.3 is the quay front; at 20 m the quay paving ends
      const air = g.space === 'cave' ? 0 : g.space === 'lydia' ? 0.016 : d && d.id === 'hill' ? 0.022 : d && (d.id === 'fields' || d.id === 'stakes') ? 0.016 : d && d.id === 'harbor' ? 0.006 : 0.008;   // at the harbor the wind is kept under the sea, or its steady hiss hides the swells
      if (g.audio.sea) g.audio.sea(sea);
      if (g.gusts) g.gusts.place(air >= 0.016 ? 1 : 0, wind);
      g.audio.mix({ wind: air * Math.min(2, wind), cave: g.space === 'cave' ? 0.045 : 0, gust: g.gusts ? g.gusts.at(g.gusts.t + 0.25) : 0 });   // the wind comes in gusts (gusts.js)
    }
  });
  g.places = { districtAt, cur };
}
