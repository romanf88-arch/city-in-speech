// Wet paving at the well and at the washing place in the market square (2026-11-19, one of the first-five-minutes
// changes Roman picked). Around the well the stone is dark where the water slops over when the bucket comes up and
// the jars are filled, with a few shallow puddles, a run of drips where the woman carries her jar away, and a wet
// streak downhill. At the washing basin the stone is wet all round, drips from the clothes on the line have wet a
// strip under it, and a thin trickle runs from the basin down the square toward the sea (the square falls about
// 1 cm in each meter toward +z) and ends in a puddle.
//
// An overlay laid 1.2 cm over the paving, drawn after the streets in two passes over the same cells. The first
// multiplies what is drawn: wet stone to about half its brightness and browner (darkening alone looked like more
// shadow, which is darker and bluer), darker still under a puddle. The second adds what the water mirrors: the deep
// sky high up and its moving clouds, fainter than in the sky (the same sky colors and clouds as the sea), and the sun
// or moon, as a small glint in a puddle and a broad sheen on wet stone when you look toward it, which is what most
// shows the stone to be wet. A puddle gives back 20 to 45 percent and has a darker rim where the water is thin; wet
// stone gives back a little, more at a low angle, so it is dark close by and glossy farther off. Small ripples move
// the reflections and grow when a gust blows (gusts.js). The look was set by trying it in pictures on 2026-11-19: at
// a true sky reflection low over the horizon the puddles looked like white paint, and mirroring a brown shade for
// the houses round the square they could not be told from the wet stone. The shapes are set by hand below, in each
// scene's own coordinates (life.js).
import * as THREE from 'three';
import { getNoise, CLOUD_GLSL, HAZE_GLSL, ATMOS_GLSL } from './world.js';

const CELL = 0.2, LIFT = 0.012;
const lineDist = (x, z, pts) => {   // distance to a polyline, and how far along it (0 to 1)
  let best = 1e9, at = 0, run = 0, total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d < best) { best = d; at = (run + u * L) / total; }
    run += L;
  }
  return [best, at];
};

// Shapes in a scene's own coordinates (meters; +z is the way the scene faces).
//   blob [x, z, rx, rz]       wet stone, an ellipse
//   pud  [x, z, r]            a puddle
//   drip [[x, z], ...]        a line of drips (fewer toward its end)
//   run  [[x, z], ...], w     a wet streak w wide with a thin line of water down its middle
const SITES = [
  { x: -15, z: -12, rot: 0.3, name: 'well',          // well_drawers: the well (radius 0.72) at the origin, the woman hauling at (0, 1.5)
    blob: [[0, 0.3, 2.3, 2.6], [0.2, 1.9, 1.5, 1.2], [-1.0, 1.6, 1.0, 0.9]],
    pud: [[0.5, 2.3, 0.45], [-0.6, 2.6, 0.32], [1.2, -0.6, 0.28], [-1.1, 0.9, 0.22]],
    drip: [[[1.5, 1.7], [2.2, 4], [1.8, 7.5]]],      // the jar carried away along the scene's path
    run: [[[[0.3, 2.7], [0.0, 3.6], [-0.4, 4.6], [-0.5, 5.3]], 0.5]] },
  { x: -9, z: -18.5, rot: Math.PI, name: 'washers',   // washers: the basin at (0, 0.62), the clothes line at z -1.1
    blob: [[0, 0.5, 1.9, 1.4], [0, -1.1, 1.9, 0.38]],
    pud: [[-1.1, -1.12, 0.22], [-0.3, -1.08, 0.17], [0.4, -1.1, 0.25], [1.2, -1.13, 0.18], [0.75, 1.15, 0.3]],
    drip: [],
    run: [[[[0.3, -0.2], [0.5, -1.9], [0.9, -3.3], [1.2, -4.3], [1.25, -4.6]], 0.42]], end: [1.25, -4.65, 0.36] },
];

const VERT = /* glsl */`
attribute vec3 aW; varying vec3 vW3; varying vec3 vGW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vGW = w.xyz; vW3 = aW; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = /* glsl */`
uniform vec3 uTop, uBot, uAnti, uGlow, uCl, uCs, uLight, uHemi; uniform vec4 uMisc; uniform float uRip;
varying vec3 vW3; varying vec3 vGW;
${CLOUD_GLSL}
${HAZE_GLSL}
${ATMOS_GLSL}
void main() {
  // Where it is wet, broken up by noise so the edges are irregular; drips are small spots.
  vec4 n1 = texture2D(uNoise, vGW.xz * 0.61 + 0.17), n2 = texture2D(uNoise, vGW.xz * 0.19 + 0.53);
  float wet = smoothstep(0.42, 0.6, vW3.x + (n1.r - 0.5) * 0.5 + (n2.g - 0.5) * 0.3);
  float pv = vW3.y + (n2.r - 0.5) * 0.3 + (n1.g - 0.5) * 0.08;   // smoother edges than the wet stone's
  float pud = smoothstep(0.5, 0.56, pv), core = smoothstep(0.53, 0.68, pv);   // the water, and its middle away from the edge
  float drip = smoothstep(0.62, 0.7, texture2D(uNoise, vGW.xz * 1.9 + 0.71).b * (0.55 + 0.45 * vW3.z)) * step(0.02, vW3.z);
  wet = max(max(wet, drip), pud);
  if (wet < 0.003) discard;
  // The water's surface: level and calm, with slow ripples that grow when a gust blows.
  vec3 V = vGW - cameraPosition; float dist = length(V); vec3 d = V / dist;
  vec2 rp = texture2D(uNoise, vGW.xz * 0.45 + uMisc.w * vec2(0.021, 0.015)).rg - 0.5;
  float ra = 0.015 + 0.12 * uRip;
  vec3 nrm = normalize(vec3(rp.x * ra, 1.0, rp.y * ra));
  vec3 r = reflect(d, nrm); r.y = abs(r.y);
  // How much the water gives back. A puddle: 20 to 45 percent, a little more than water really does at these low
  // angles (at 45 to 80 percent the puddles read as white paint, tested 2026-11-19). Wet stone without a
  // puddle: about half what water would, so it is dark close by and glossy farther off, as wet paving is.
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(-d, nrm), 0.0), 5.0);
  float far = 1.0 - smoothstep(45.0, 70.0, dist);
  // At the edge of a puddle the water is too thin to mirror much, so a darker rim runs round it.
  float refK = far * (core * clamp(0.2 + F * 0.8, 0.0, 0.45) + (wet - pud) * F * 0.45);
#ifndef WET_ADD
  // First pass, multiplied into what is drawn: the stone darkened and made browner where it is wet (shadow on dry
  // stone is darker and bluer, so with darkening alone wet stone looked like more shadow), darker under a puddle,
  // and less of it showing where the water mirrors the sky.
  vec3 m = mix(vec3(1.0), vec3(0.6, 0.53, 0.45), wet * far) * (1.0 - 0.25 * pud * far) * (1.0 - refK);
  gl_FragColor = vec4(m, 1.0);
#else
  // Second pass, added on top: what the water mirrors, and the sun in it.
  // The sky and its clouds (read the way the sea reads them, world.js seaColorN), always the deeper sky high up, so
  // the water is blue and not the brown of the stone round it. (Low reflections would really be of the houses; as
  // the pale sky near the horizon the puddles read as white paint, and as a brown shade for the houses they could
  // not be told from the wet stone, tested 2026-11-19.)
  vec3 rs = normalize(vec3(r.x, max(r.y, 0.6), r.z));
  vec3 sky = atmosphere(rs, dot(rs, uSunDir));
  { vec2 cp = rs.xz / (rs.y + 0.10);
    float rb = texture2D(uNoise, cp * 0.42 + uOff.xy).r, big = texture2D(uNoise, cp * 0.055 + uOff.zw * 0.7 + 0.13).r;
    float thr = mix(0.88, 0.16, uCloud.x);
    float low = smoothstep(thr, thr + 0.2, rb * 0.74 + big * 0.42 - 0.08) * smoothstep(0.0, 0.11, rs.y);
    sky = mix(sky, mix(uCs, uCl, clamp(0.55 + (rb - 0.35) * 1.2, 0.0, 1.0)), low * 0.3); }   // fainter than in the sky, or the puddles look like fleece
  // The sun (or the moon) seen in the water: a small sharp glint in a puddle, and a broad sheen on wet stone when you
  // look toward it, which is what most shows stone to be wet.
  float sd = max(dot(r, uSunDir), 0.0);
  vec3 glint = uGlow * uMisc.z * (pow(sd, 900.0) * 6.0 * pud + pow(sd, 30.0) * 0.35 * (wet - pud));
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float hz = hazeAmount(dist, dot(d, fwd) * dist, cameraPosition.y, vGW.y, 0.8, 0.0);
  gl_FragColor = vec4(glint, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 gl = gl_FragColor.rgb * far * (1.0 - hz);
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(d), hz);
  gl_FragColor = vec4(gl_FragColor.rgb * refK + gl, 1.0);
#endif
}`;

export class WetStone {
  constructor(g) {
    this.g = g;
    const u = g.sky.u, U = { uNoise: { value: getNoise()[0] }, uRip: { value: 0.2 } };
    for (const k of ['uTop', 'uBot', 'uAnti', 'uGlow', 'uLight', 'uHemi', 'uFog', 'uHzSun', 'uHzAnti', 'uSunDir', 'uFogP', 'uMisc', 'uCloud', 'uOff', 'uCl', 'uCs']) U[k] = u[k];
    this.u = U;
    // Two passes over the same cells: the first multiplies what is drawn by a color, the second adds to it.
    const pass = (add) => new THREE.ShaderMaterial({
      uniforms: U, vertexShader: VERT, fragmentShader: FRAG, fog: false, defines: add ? { WET_ADD: '' } : {},
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: add ? THREE.OneFactor : THREE.ZeroFactor, blendDst: add ? THREE.OneFactor : THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mat = pass(false); this.matAdd = pass(true);
    this.meshes = SITES.map((s) => this.build(s));
    g.tickers.push(() => { U.uRip.value = 0.2 + (g.gusts && !g.reduceMotion ? g.gusts.v : 0); });
  }
  build(S) {
    const W = this.g.world, c = Math.cos(S.rot), s = Math.sin(S.rot);
    const toWorld = (p) => [S.x + p[0] * c + p[1] * s, S.z - p[0] * s + p[1] * c];
    const blobs = S.blob.map((b) => { const p = toWorld(b); return [p[0], p[1], b[2], b[3]]; });
    const puds = S.pud.concat(S.end ? [S.end] : []).map((b) => { const p = toWorld(b); return [p[0], p[1], b[2]]; });
    const drips = S.drip.map((line) => line.map(toWorld)), runs = S.run.map(([line, w]) => [line.map(toWorld), w]);
    // Each shape's value is 0.5 at its edge (the shader cuts there, with noise), 1 at its middle, 0 well outside.
    const wetAt = (x, z) => {
      let w = 0, p = 0, d = 0;
      for (const [bx, bz, rx, rz] of blobs) {   // the ellipses are laid along the scene's own axes
        const dx = x - bx, dz = z - bz, lx = (dx * c - dz * s) / rx, lz = (dx * s + dz * c) / rz;
        w = Math.max(w, 1 - 0.5 * (lx * lx + lz * lz));
      }
      for (const [px, pz, r] of puds) { const q = Math.hypot(x - px, z - pz) / r; p = Math.max(p, 1 - 0.5 * q * q); }
      for (const line of drips) { const [dd, at] = lineDist(x, z, line); d = Math.max(d, (1 - (dd / 0.35) ** 2) * (1 - 0.7 * at)); }
      for (const [line, wd] of runs) {
        const [dd, at] = lineDist(x, z, line), q = dd / (wd / 2), q2 = dd / 0.06;
        w = Math.max(w, (1 - 0.5 * q * q) * (1 - 0.25 * at)); p = Math.max(p, (1 - 0.5 * q2 * q2) * (1 - 0.3 * at));
      }
      return [Math.max(0, w), Math.max(0, p), Math.max(0, d)];
    };
    // A grid of 20 cm cells over everything, keeping only the cells where something is wet.
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    const grow = (x, z, r) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
    for (const [bx, bz, rx, rz] of blobs) grow(bx, bz, 1.5 * Math.max(rx, rz));
    for (const [px, pz, r] of puds) grow(px, pz, 1.5 * r);
    for (const line of drips) for (const p of line) grow(p[0], p[1], 0.5);
    for (const [line, wd] of runs) for (const p of line) grow(p[0], p[1], wd);
    const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL), vals = [], ys = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + i * CELL, z = z0 + j * CELL; vals.push(wetAt(x, z)); ys.push(W.standY(x, z) + LIFT); }
    const pos = [], aw = [];
    const put = (i, j) => { const k = j * (nx + 1) + i, v = vals[k]; pos.push(x0 + i * CELL, ys[k], z0 + j * CELL); aw.push(v[0], v[1], v[2]); };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const ks = [j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1];
      if (!ks.some((k) => vals[k][0] > 0.02 || vals[k][1] > 0.02 || vals[k][2] > 0.02)) continue;
      // wound to face up
      put(i, j); put(i, j + 1); put(i + 1, j); put(i + 1, j); put(i, j + 1); put(i + 1, j + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 3)); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.mat); m.renderOrder = 5; m.name = 'wet-' + S.name;
    const m2 = new THREE.Mesh(geo, this.matAdd); m2.renderOrder = 6; m2.name = 'wet-' + S.name + '-sky';
    W.group.add(m, m2);
    return m;
  }
}
