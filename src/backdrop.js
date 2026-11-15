// The far landscape: the plain beyond the playable ground, the mountains around it, and the
// islands across the water. It is real geometry, lit by the same sun as the town, so it works
// at every time of day. The heights, the fine surface detail and the ground color come from
// three pictures in assets/backdrop/, made ahead of time by bake_backdrop.py in that folder.
//
// The mesh is a fan of 680 strips that start on the 680 edge points of the playable ground and
// run outward for about 7.8 km. The first ring uses the playable ground's own edge heights, so
// the two meet with no gap. Close to the edge the surface uses the same ground shading as the
// playable ground and exactly the scene fog. Farther out it turns into the baked far terrain.
import * as THREE from 'three';
import { BOUNDS, rawHeight, HAZE_GLSL, GROUND_GLSL } from './world.js';
import { lerp, smooth } from './util.js';

const HALF = 8192, H_MIN = -64, H_MAX = 1536, HN = 1024;
const REACH = 7800;            // how far the mesh runs beyond the playable edge, in metres
const FAR = 12500;             // the camera must see at least this far
const ASSETS = new URL('../assets/backdrop/', import.meta.url).href;

const VERT = /* glsl */`
attribute float aNear;
attribute vec3 color;
varying vec3 vW;
varying float vNear;
varying float vZ;
varying vec3 vTint;
varying vec3 vN;
void main() {
  vW = position; vNear = aNear; vTint = color; vN = normal;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  vZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
varying vec3 vW;
varying float vNear;
varying float vZ;
varying vec3 vTint;
varying vec3 vN;
uniform sampler2D uAlb, uNrm;
uniform vec3 uLight, uHemi, uHemiGnd;
uniform vec4 uOff, uCloud;                               // the sky's cloud drift and cover (world.js CLOUD_GLSL)
uniform float uPaint;                                    // 1 the painted look, 0 the plain one (for comparing)
${HAZE_GLSL}
${GROUND_GLSL}
// Shadows of the low clouds: the sun's ray from this point meets the cloud layer, here taken as a plane 1.6 km up,
// and reads the same cloud pattern, drift, and cover as the sky (cloudField in world.js), so the shadows move
// with the wind and come and go with the weather.
float cloudShadow(vec3 P) {
  vec3 L = uSunDir; float t = max(1600.0 - P.y, 0.0) / max(L.y, 0.08);
  vec2 p = (P.xz + L.xz * t) / 1600.0;
  vec2 q = p * 0.42 + uOff.xy;
  float big = texture2D(uGNoise, p * 0.055 + uOff.zw * 0.7 + 0.13).r;
  float shape = texture2D(uGNoise, q).r * 0.74 + big * 0.42 - 0.08;
  float thr = mix(0.88, 0.16, uCloud.x);
  return smoothstep(thr - 0.06, thr + 0.26, shape);
}
void main() {
  if (vW.y < 0.0) discard;                               // under water: the sea is drawn by the sky dome
  vec2 uv = (vW.xz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)};
  // Farther ranges are painted a little more simply: the relief picture is read from a coarser level beyond
  // 2.5 km (half a level each time the distance doubles, at most one and a half).
  float dist = length(vW - cameraPosition);
  float simp = clamp(0.5 * log2(max(dist, 1.0) / 2500.0), 0.0, 1.5) * uPaint;
  vec3 alb = texture2D(uAlb, uv).rgb;
  vec3 nt = texture2D(uNrm, uv, simp).rgb;
  // Surface normal from the baked picture, with the relief pushed a little.
  vec2 nxz = (nt.xy * 2.0 - 1.0) * 1.2;
  vec3 N = normalize(vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.05)), nxz.y));
  float shelter = clamp(nt.z / 0.84, 0.0, 1.15);
  float grain = texture2D(uGNoise, vW.xz * 0.013).g;
  alb *= 0.9 + 0.2 * grain;
  // Close to the playable ground: the same ground shading as the playable ground itself.
  if (vNear > 0.0) {
    vec2 gb; vec3 gn = normalize(vN);
    vec3 ga = groundColor(vTint, vW, gn.y, gb);
    N = normalize(mix(N, normalize(gn + vec3(gb.x, 0.0, gb.y) * 0.85), vNear));
    alb = mix(alb, ga, vNear);
    shelter = mix(shelter, 1.0, vNear);
  }
  // Same light model as the town's ground: sun plus sky light. Out on the far land, as in a landscape painting:
  // cloud shadows pass over it, the shade is a little cooler than the light, and each farther range takes on
  // more of the sky's own color (blue by day, rose at dusk) before the haze.
  // A painter groups the light into a few masses: faces turned to the sun are lit nearly evenly, faces turned
  // away are in shade, with a short soft step between. Shade is cooler and violet, light a little warmer.
  float far = (1.0 - vNear) * uPaint;
  float nl = max(dot(N, uSunDir), 0.0);
  float sunK = mix(nl, 0.15 + 0.85 * smoothstep(0.02, 0.42, dot(N, uSunDir)), far * 0.75);
  sunK *= 1.0 - 0.68 * cloudShadow(vW) * far;
  vec3 hemi = mix(uHemiGnd, uHemi, N.y * 0.5 + 0.5);
  float shade = far * (1.0 - smoothstep(0.0, 0.45, sunK));
  hemi *= mix(vec3(1.0), vec3(0.84, 0.88, 1.16), shade);
  vec3 sunC = uLight * mix(vec3(1.0), vec3(1.06, 1.0, 0.9), far);
  vec3 col = alb * (sunC * sunK * mix(1.0, shelter, 0.5) + hemi * shelter) * 0.3183;
  float air = (1.0 - exp(-max(dist - 900.0, 0.0) / 11000.0)) * far;
  col = mix(col, uHemi * 0.3183 * 1.05, air * 0.45);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Haze, mixed after tone mapping exactly as three.js mixes scene fog.
  vec3 V = vW - cameraPosition;
  float hz = hazeAmount(length(V), vZ, cameraPosition.y, vW.y, 0.9, vNear);
  vec3 hc = mix(hazeColor(V), lookOut(uFog), vNear);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hc, hz);
}`;

export class Backdrop {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'backdrop';
    scene.add(this.group);
    this.triangles = 0; this.buildMs = 0; this.loaded = false;
    const tl = new THREE.TextureLoader();
    const tex = (file, srgb) => new Promise((res, rej) => tl.load(ASSETS + file, (t) => {
      t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.needsUpdate = true; res(t);
    }, undefined, rej));
    const heights = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = cv.height = HN;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
        const px = cx.getImageData(0, 0, HN, HN).data, h = new Float32Array(HN * HN);
        for (let i = 0; i < HN * HN; i++) h[i] = H_MIN + (px[i * 4] * 256 + px[i * 4 + 1]) / 65535 * (H_MAX - H_MIN);
        res(h);
      };
      img.onerror = rej; img.src = ASSETS + 'bd_height.png';
    });
    this.uniforms = {
      uAlb: { value: null }, uNrm: { value: null }, uGNoise: { value: null }, uGNoise2: { value: null },
      uLight: { value: new THREE.Color() }, uHemi: { value: new THREE.Color() }, uHemiGnd: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() }, uHzSun: { value: new THREE.Color() }, uHzAnti: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFogP: { value: new THREE.Vector3(90, 430, 1) },
      uOff: { value: new THREE.Vector4() }, uCloud: { value: new THREE.Vector4() }, uPaint: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: false });
    // Resolves when the pictures are in and the mesh is built. Until then the group is empty.
    // The color picture as painted by tools/paint_backdrop.py; ?paint=0 in the address shows the plain bake.
    const painted = !/[?&]paint=0/.test((typeof location !== 'undefined' && location.search) || '');
    this.ready = Promise.all([heights, tex(painted ? 'bd_paint.jpg' : 'bd_albedo.jpg', true), tex('bd_normal.jpg', false)]).then(([h, alb, nrm]) => {
      this.uniforms.uAlb.value = alb; this.uniforms.uNrm.value = nrm; this.uniforms.uPaint.value = painted ? 1 : 0;
      this.tex = tex;   // kept for the comparison tool (dev/hills.js), which loads the other picture
      this.build(h);
      this.loaded = true;
      return this;
    }).catch((e) => { console.error('Backdrop could not load', e); return this; });
  }

  // Height of the far terrain at a point, from the baked picture.
  farHeight(h, x, z) {
    const fx = Math.min(Math.max((x + HALF) / (2 * HALF) * HN - 0.5, 0), HN - 1.001), fz = Math.min(Math.max((z + HALF) / (2 * HALF) * HN - 0.5, 0), HN - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * HN + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + HN] * (1 - u) + h[k + HN + 1] * u) * v;
  }

  build(h) {
    const t0 = performance.now();
    const { x0, x1, z0, z1, cell } = BOUNDS, W = this.world;
    const NX = Math.round((x1 - x0) / cell), NZ = Math.round((z1 - z0) / cell), CX = (x0 + x1) / 2, CZ = (z0 + z1) / 2;
    // The edge points of the playable ground, in order around it.
    const B = [];
    for (let i = 0; i < NX; i++) B.push([i, 0]);
    for (let j = 0; j < NZ; j++) B.push([NX, j]);
    for (let i = NX; i > 0; i--) B.push([i, NZ]);
    for (let j = NZ; j > 0; j--) B.push([0, j]);
    const K = B.length;
    // Ring distances from the edge: about 3.5 m steps at first, about 80 m at the main ranges, wider beyond.
    const S = [0];
    for (let s = 0; s < REACH;) { s += s < 300 ? 3.5 + 0.085 * s : s < 5000 ? 29 + 0.0105 * (s - 300) : 78.35 + 0.06 * (s - 5000); S.push(Math.min(s, REACH)); }
    const M = S.length - 1, R = M + 1, nv = K * R;
    const pos = new Float32Array(nv * 3), near = new Float32Array(nv), col = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
    const alpha = [], rho = [];
    for (let k = 0; k < K; k++) {
      const bx = x0 + B[k][0] * cell, bz = z0 + B[k][1] * cell;
      let a = Math.atan2(bz - CZ, bx - CX);
      while (k > 0 && a < alpha[k - 1]) a += Math.PI * 2;
      alpha.push(a); rho.push(Math.hypot(bx - CX, bz - CZ));
    }
    for (let k = 0; k < K; k++) {
      const even = alpha[0] + k * Math.PI * 2 / K;          // far out, the strips are spread evenly around the compass
      for (let i = 0; i <= M; i++) {
        const p = (k * R + i) * 3;
        let x, y, z, dOut = 0;
        if (i === 0) {
          x = x0 + B[k][0] * cell; z = z0 + B[k][1] * cell; y = W.H[B[k][1] * (NX + 1) + B[k][0]];
        } else {
          const ang = lerp(alpha[k], even, smooth(0, 500, S[i])), r = rho[k] + S[i];
          x = CX + r * Math.cos(ang); z = CZ + r * Math.sin(ang);
          dOut = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
          const sp = S[i] - S[i - 1];
          let f = this.farHeight(h, x, z);
          if (sp > 40) {                                     // wide rings: average a little so ridge lines do not scallop
            const o = sp * 0.4;
            f = 0.4 * f + 0.15 * (this.farHeight(h, x + o, z) + this.farHeight(h, x - o, z) + this.farHeight(h, x, z + o) + this.farHeight(h, x, z - o));
          }
          y = dOut < 230 ? lerp(rawHeight(x, z), f, smooth(15, 230, dOut)) : f;
        }
        pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
        near[k * R + i] = 1 - smooth(70, 300, dOut);
      }
    }
    // Near the edge, give each point the playable ground's own tint and a smooth normal.
    const c = new THREE.Color(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let k = 0; k < K; k++) for (let i = 0; i <= M; i++) {
      const v = k * R + i;
      nrm[v * 3 + 1] = 1;
      if (near[v] <= 0) { col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 1; continue; }
      const a = ((k + 1) % K) * R + i, b = ((k + K - 1) % K) * R + i, u = k * R + Math.min(i + 1, M), d = k * R + Math.max(i - 1, 0);
      e1.set(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
      e2.set(pos[u * 3] - pos[d * 3], pos[u * 3 + 1] - pos[d * 3 + 1], pos[u * 3 + 2] - pos[d * 3 + 2]);
      e1.cross(e2).normalize(); if (e1.y < 0) e1.negate();
      if (i === 0) W.gridNormal(B[k][0], B[k][1], e1);     // on the edge: exactly the playable ground's normal
      nrm[v * 3] = e1.x; nrm[v * 3 + 1] = e1.y; nrm[v * 3 + 2] = e1.z;
      W.tint(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], c);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    // Which way round the triangles go, so that they face up.
    const a0 = 0, b0 = R, c0 = 1;
    e1.set(pos[c0 * 3] - pos[a0 * 3], 0, pos[c0 * 3 + 2] - pos[a0 * 3 + 2]); e2.set(pos[b0 * 3] - pos[a0 * 3], 0, pos[b0 * 3 + 2] - pos[a0 * 3 + 2]);
    const flip = e1.cross(e2).y < 0;
    const aPos = new THREE.BufferAttribute(pos, 3), aNear = new THREE.BufferAttribute(near, 1), aCol = new THREE.BufferAttribute(col, 3), aNrm = new THREE.BufferAttribute(nrm, 3);
    // Three pieces (thirds of the compass) so the pieces behind the camera are skipped. Open water is left out.
    const PARTS = 3;
    for (let part = 0; part < PARTS; part++) {
      const idx = [], k0 = Math.floor(K * part / PARTS), k1 = Math.floor(K * (part + 1) / PARTS);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
      for (let k = k0; k < k1; k++) {
        const ka = k * R, kb = ((k + 1) % K) * R;
        for (let i = 0; i < M; i++) {
          const a = ka + i, b = kb + i, cc = a + 1, d = b + 1;
          const top = Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[cc * 3 + 1], pos[d * 3 + 1]);
          if (top < -1.5) continue;
          if (flip) idx.push(a, b, cc, b, d, cc); else idx.push(a, cc, b, b, cc, d);
          minX = Math.min(minX, pos[a * 3]); maxX = Math.max(maxX, pos[a * 3]); minZ = Math.min(minZ, pos[a * 3 + 2]); maxZ = Math.max(maxZ, pos[a * 3 + 2]); maxY = Math.max(maxY, top);
        }
      }
      if (!idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', aPos); g.setAttribute('aNear', aNear); g.setAttribute('color', aCol); g.setAttribute('normal', aNrm);
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2), Math.hypot(maxX - minX, maxZ - minZ, maxY) / 2 + 200);
      const m = new THREE.Mesh(g, this.mat);
      m.renderOrder = 100;            // after the town (so hidden parts cost nothing), before the sky dome
      m.matrixAutoUpdate = false;
      this.group.add(m);
      this.triangles += idx.length / 3;
    }
    this.buildMs = performance.now() - t0;
  }

  // Call once a frame. Copies the light and haze from the sky and makes sure the camera sees far enough.
  update(sky, camera, dt) {
    if (camera.far < FAR) { camera.far = FAR; camera.updateProjectionMatrix(); }
    const u = this.uniforms, s = sky.u;
    u.uGNoise.value = s.uNoise.value; u.uGNoise2.value = s.uNoise2.value;
    u.uLight.value = s.uLight.value; u.uHemi.value = s.uHemi.value; u.uHemiGnd.value = s.uHemiGnd.value;
    u.uFog.value = s.uFog.value; u.uHzSun.value = s.uHzSun.value; u.uHzAnti.value = s.uHzAnti.value;
    u.uSunDir.value = s.uSunDir.value; u.uFogP.value = s.uFogP.value;
    u.uOff.value = s.uOff.value; u.uCloud.value = s.uCloud.value;
  }
}
