// Every fire in the game: moving flames, rising sparks, and smoke. All flames are drawn in one call,
// all sparks in one, and all smoke in one, so adding a fire costs almost nothing.
import * as THREE from 'three';

const MAX = 200, SPARKS = 8, PUFFS = 5;

// A small tiling picture of soft noise, used to make the flames lick and the smoke billow.
function noiseTexture(size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'), img = c.createImageData(size, size), d = img.data;
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grids = [8, 16, 32].map((n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return [n, g]; });
  const at = (n, g, x, y) => { const fx = x * n, fy = y * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), i = (a, b) => g[((b % n + n) % n) * n + ((a % n + n) % n)]; return (i(x0, y0) * (1 - sx) + i(x0 + 1, y0) * sx) * (1 - sy) + (i(x0, y0 + 1) * (1 - sx) + i(x0 + 1, y0 + 1) * sx) * sy; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, n = at(...grids[0], u, v) * 0.55 + at(...grids[1], u, v) * 0.3 + at(...grids[2], u, v) * 0.15, k = (y * size + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = Math.round(n * 255); d[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Fires {
  constructor(scene) {
    this.n = 0; this.time = 0; this.list = [];
    const noise = noiseTexture();
    this.u = { uTime: { value: 0 }, uNoise: { value: noise }, uNight: { value: 0 }, uSmoke: { value: new THREE.Color(0.5, 0.5, 0.5) }, uWind: { value: new THREE.Vector2(0.3, 0.1) }, uScale: { value: 600 } };

    // ---- flames: one upright card per fire, turned to face the viewer
    const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
    const fg = new THREE.InstancedBufferGeometry(); fg.index = quad.index; fg.setAttribute('position', quad.attributes.position); fg.setAttribute('uv', quad.attributes.uv);
    this.fPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 3), 3); this.fParm = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 4), 4);
    fg.setAttribute('aPos', this.fPos); fg.setAttribute('aParm', this.fParm); fg.instanceCount = 0;
    this.flames = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute vec3 aPos; attribute vec4 aParm; uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vB;
        void main() {
          vUv = uv; vSeed = aParm.x; vB = aParm.w;
          vec3 toCam = cameraPosition - aPos; toCam.y = 0.0; toCam = normalize(toCam + vec3(0.0001, 0.0, 0.0));
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          float sway = (sin(uTime * 2.3 + aParm.x * 6.0) * 0.07 + sin(uTime * 5.1 + aParm.x * 11.0) * 0.03) * uv.y * uv.y;
          vec3 p = aPos + right * (position.x * aParm.y + sway * aParm.z) + vec3(0.0, position.y * aParm.z, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform sampler2D uNoise; uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vB;
        void main() {
          vec2 uv = vUv; float t = uTime;
          float n1 = texture2D(uNoise, vec2(uv.x * 0.55 + vSeed, uv.y * 0.42 - t * 0.62)).r;
          float n2 = texture2D(uNoise, vec2(uv.x * 1.3 - vSeed * 1.7, uv.y * 0.95 - t * 1.25)).r;
          float n = n1 * 0.62 + n2 * 0.38;
          float n3 = texture2D(uNoise, vec2(uv.x * 2.6 + vSeed * 3.3, uv.y * 1.9 - t * 2.1)).r;
          float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 1.25 * uv.y;      // tongues lean more toward the top
          float width = mix(0.82, 0.03, pow(uv.y, 0.7)) * (0.72 + n2 * 0.6);   // wide at the base, ragged, a point at the tip
          float body = 1.0 - smoothstep(width * 0.35, width, abs(x));
          float top = 1.0 - smoothstep(0.22, 1.0, uv.y + (n - 0.5) * 1.15);
          float f = body * top * smoothstep(0.0, 0.07, uv.y) * (0.65 + n * 0.8);
          f -= smoothstep(0.58, 0.9, n3) * uv.y * 0.55;                // gaps between the tongues
          if (f < 0.04) discard;
          vec3 hot = vec3(1.0, 0.95, 0.66), mid = vec3(1.0, 0.56, 0.12), cool = vec3(0.80, 0.16, 0.03);
          vec3 col = mix(cool, mid, smoothstep(0.10, 0.42, f));
          col = mix(col, hot, smoothstep(0.45, 0.92, f) * (1.0 - uv.y * 0.55));
          gl_FragColor = vec4(col * vB, smoothstep(0.04, 0.38, f));
        }`,
    }));
    this.flames.frustumCulled = false; this.flames.renderOrder = 1001;

    // ---- sparks and smoke: points that rise from each fire, moved entirely on the graphics chip
    const pts = (count, vertex, fragment, blending, order) => {
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(MAX * count * 3), 3), parm = new THREE.BufferAttribute(new Float32Array(MAX * count * 4), 4);
      g.setAttribute('position', pos); g.setAttribute('aParm', parm); g.setDrawRange(0, 0);
      const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.u, transparent: true, depthWrite: false, blending, fog: false, vertexShader: vertex, fragmentShader: fragment }));
      m.frustumCulled = false; m.renderOrder = order; scene.add(m);
      return { mesh: m, pos, parm, count };
    };
    this.sparks = pts(SPARKS, `attribute vec4 aParm; uniform float uTime; uniform float uScale; uniform float uNight; varying float vA;
      void main() {
        float seed = aParm.x, life = fract(uTime * (0.22 + seed * 0.25) + seed * 7.31);
        vec3 p = position + vec3(sin(seed * 40.0 + life * 6.0) * 0.16 * (0.3 + life) * aParm.y, life * aParm.z, cos(seed * 23.0 + life * 5.0) * 0.16 * (0.3 + life) * aParm.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = (1.0 - life) * (0.3 + 0.7 * uNight) * aParm.w;
        gl_PointSize = max(1.0, uScale * 0.035 * (1.0 - life * 0.6) / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`, `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * vA * 1.4, 1.0); }`, THREE.AdditiveBlending, 1002);
    this.smoke = pts(PUFFS, `attribute vec4 aParm; uniform float uTime; uniform float uScale; uniform vec2 uWind; uniform sampler2D uNoise; varying float vA; varying float vS;
      void main() {
        float seed = aParm.x, life = fract(uTime * (0.085 + seed * 0.03) + seed * 3.17);
        float rise = life * aParm.z;
        vec3 p = position + vec3(uWind.x * rise * 0.55 + sin(seed * 31.0 + life * 3.0) * 0.25 * life, 0.35 * aParm.y + rise, uWind.y * rise * 0.55 + cos(seed * 17.0 + life * 2.6) * 0.25 * life);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = sin(3.14159 * life) * (1.0 - life * 0.5) * aParm.w; vS = seed;
        gl_PointSize = uScale * aParm.y * (0.5 + life * 1.9) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`, `uniform sampler2D uNoise; uniform vec3 uSmoke; uniform float uTime; varying float vA; varying float vS;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float n = texture2D(uNoise, gl_PointCoord * 0.6 + vec2(vS * 3.1, vS * 1.7 - uTime * 0.03)).r;
        float a = (1.0 - smoothstep(0.18, 0.5, d + (n - 0.5) * 0.22)) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uSmoke * (0.75 + n * 0.5), a);
      }`, THREE.NormalBlending, 1000);
    scene.add(this.flames);
  }

  // Add a fire whose base is at (x, y, z). Options: w and h (flame size in metres), smoke (0 for none),
  // sparks (0 for none), bright. Returns its number.
  add(x, y, z, o = {}) {
    if (this.n >= MAX) return -1;
    const i = this.n++, w = o.w || 0.5, h = o.h || 0.85, seed = (i * 0.6180339) % 1;
    this.fPos.setXYZ(i, x, y, z); this.fParm.setXYZW(i, seed, w, h, o.bright || 1);
    // Larger fires are two or three overlapping sheets of flame, so they do not look like one candle.
    this.cards = this.cards || MAX;
    const extra = w > 1.2 ? 3 : w > 0.42 ? 2 : 0;
    for (let k = 0; k < extra && this.cards < MAX * 2; k++) {
      const j = this.cards++, a = seed * 6.283 + k * 2.4, r = w * 0.2;
      this.fPos.setXYZ(j, x + Math.cos(a) * r, y, z + Math.sin(a) * r); this.fParm.setXYZW(j, (seed + 0.37 * (k + 1)) % 1, w * (0.62 - k * 0.07), h * (0.8 - k * 0.12), o.bright || 1);
    }
    this.fPos.needsUpdate = this.fParm.needsUpdate = true; this.flames.geometry.instanceCount = this.cards;
    const fill = (set, count, size, rise, strength) => {
      for (let k = 0; k < count; k++) { const j = i * count + k; set.pos.setXYZ(j, x, y + h * 0.35, z); set.parm.setXYZW(j, (seed + k / count + k * 0.137) % 1, size, rise, strength); }
      set.pos.needsUpdate = set.parm.needsUpdate = true; set.mesh.geometry.setDrawRange(0, this.n * count);
    };
    fill(this.sparks, SPARKS, w * 1.4, h * 2.6 + 0.6, o.sparks != null ? o.sparks : 1);
    fill(this.smoke, PUFFS, Math.max(0.35, w * 1.5), 2.2 + h * 2.4, (o.smoke != null ? o.smoke : 1) * 0.2);
    this.list.push({ x, y, z, w, h });
    return i;
  }

  // night is 0 in daylight and 1 in the dark. Smoke takes its color from the light in the sky.
  update(dt, night, sky, renderer) {
    this.time += dt; this.u.uTime.value = this.time; this.u.uNight.value = night;
    if (sky && sky.cur) { const c = sky.cur; this.u.uSmoke.value.copy(c.hemiSky).multiplyScalar(0.42 + 0.45 * Math.min(1, c.sunI / 2.5)); if (c.wind != null) this.u.uWind.value.set(0.25 + c.wind * 0.35, 0.1 + c.wind * 0.12); }
    if (renderer) this.u.uScale.value = renderer.domElement.height * 0.9;
  }
}
