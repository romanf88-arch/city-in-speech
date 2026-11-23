// Dry leaves and dust that blow across the ground when a gust comes (2026-11-19, one of the first-five-minutes
// changes; Roman picked it so that the gusts he hears can be seen). The gusts are timed by gusts.js.
//
// Leaves: 200 dry leaves, 10 to 22 cm long (olive, plane, fig), lie on open ground within 14 m of the player, wherever there is
// no wall, house, stall or water. When a gust is strong enough a leaf starts to slide and skitter downwind, now and
// then hops and tumbles through the air, sometimes up to head height, and stops against walls. When the gust dies
// they come to rest where they are. Leaves left more than 17 m behind are laid down again at the edge of the circle
// (during a gust, on its upwind side and already moving, so they keep blowing through). One draw for all of them.
// Dust: during a gust, soft low clouds of pale dust rise from the ground in front of the camera and drift downwind
// for 2.5 to 4 s, more from beaten earth than from paving. Up to 10 at once, 6 to 16 m away, in one draw. (The first
// version allowed 24, from 4 m away and up to 11 m wide, and a cloud close to the camera filled the screen: on the
// UHD 620 that is several milliseconds of blending a frame.)
// With "Reduce motion" on, the leaves lie still and no dust rises.
import * as THREE from 'three';
import { getNoise } from './world.js';

const N = 200, R = 14, FAR = 17, DUST = 10;
// Darker than the paving, or they cannot be seen on it (the first colors, tans, could not be told from the stone).
const COLORS = [0x7a4a26, 0x8a5a2e, 0x6e4a2a, 0x9a6a34, 0x6f6a3a, 0xa8762a, 0x5e4426, 0x84562c];

// A leaf one unit long, its two halves raised toward the edges the way a dry leaf curls. Scaled per leaf.
function leafGeometry() {
  const B = [0, 0, -0.5], T = [0, 0, 0.5], l1 = [-0.21, 0.1, -0.17], l2 = [-0.17, 0.1, 0.19], r1 = [0.21, 0.1, -0.17], r2 = [0.17, 0.1, 0.19];
  const tri = [B, l1, l2, B, l2, T, B, r2, r1, B, T, r2], pos = [];
  for (const p of tri) pos.push(p[0], p[1], p[2]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

const DUST_VERT = /* glsl */`
attribute vec3 aPos; attribute vec4 aP;   // aP: size, alpha, seed, how far the wind has carried its wisps across the view
varying vec2 vUv; varying float vA; varying float vS; varying float vD;
void main() {
  vUv = uv; vA = aP.y; vS = aP.z; vD = aP.w;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * vec2(1.7, 0.75) * aP.x;   // wide and low
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */`
uniform sampler2D uNoise; uniform vec3 uDust; uniform float uTime;
varying vec2 vUv; varying float vA; varying float vS; varying float vD;
void main() {
  vec2 q = vUv - 0.5; float d = length(q * vec2(1.0, 1.15));
  float n = texture2D(uNoise, vUv * vec2(0.9, 0.4) + vec2(vS * 3.1 - vD * 0.05, vS * 1.7)).r;
  // Long thin wisps that stream across the view the way the wind blows.
  float w = texture2D(uNoise, vUv * vec2(0.8, 3.4) + vec2(vS * 1.3 - vD * 0.22, vS * 2.9)).g;
  // Soft, broken at the edge by the noise, and fading out toward the bottom, so where it meets the ground no line shows.
  float a = (1.0 - smoothstep(0.12, 0.5, d + (n - 0.5) * 0.3)) * smoothstep(0.0, 0.42, vUv.y) * vA * smoothstep(0.32, 0.72, w) * 1.7;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uDust * (0.85 + 0.3 * n), min(a, 0.6));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Leaves {
  constructor(g) {
    this.g = g;
    const mesh = this.mesh = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), N);
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false;
    const S = this.s = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
      ex: new Float32Array(N), ey: new Float32Array(N), ez: new Float32Array(N), wx: new Float32Array(N), wy: new Float32Array(N), wz: new Float32Array(N),
      st: new Uint8Array(N), k: new Float32Array(N), sc: new Float32Array(N), wd: new Float32Array(N), seed: new Float32Array(N), on: new Uint8Array(N) };
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const r = Math.random();
      S.sc[i] = 0.1 + 0.12 * r * r;                       // 10 to 22 cm long
      S.wd[i] = 0.55 + 0.75 * Math.random();              // narrow (olive) to broad (plane, fig)
      S.k[i] = 0.7 + 0.6 * Math.random();                 // how easily the wind takes it
      S.seed[i] = Math.random() * 100;
      mesh.setColorAt(i, c.setHex(COLORS[i % COLORS.length]).multiplyScalar(0.85 + 0.3 * Math.random()));
    }
    g.world.group.add(mesh);
    this.filled = false; this.rr = 0; this.px = 0; this.pz = 0; this.moving = 0;
    this._e = new THREE.Euler(); this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._sc = new THREE.Vector3();

    // dust
    const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    this.dPos = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 3), 3); this.dP = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 4), 4);
    this.dPos.setUsage(THREE.DynamicDrawUsage); this.dP.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.dPos); geo.setAttribute('aP', this.dP); geo.instanceCount = 0;
    this.dU = { uNoise: { value: getNoise()[0] }, uDust: { value: new THREE.Color() }, uTime: { value: 0 } };
    const dm = this.dust = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.dU, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false, fog: false }));
    dm.frustumCulled = false; dm.renderOrder = 999; g.world.group.add(dm);
    this.puffs = []; this.dustT = 0; this._fw = new THREE.Vector3();
    g.tickers.push((dt) => this.update(dt));
  }

  // Open ground a leaf can lie on: outdoors, above the water, and not inside anything solid.
  ok(x, z) {
    const W = this.g.world;
    if (W.indoor(x, z, 0.3) || W.groundY(x, z) < 0.3) return false;
    const q = W.resolve(x, z, 0.06);
    return Math.abs(q[0] - x) + Math.abs(q[1] - z) < 1e-4;
  }
  // Lay leaf i down. mode 0: anywhere in the circle; 1: near its edge; 2: on the upwind edge, already blowing.
  spawn(i, mode) {
    const S = this.s, p = this.g.player, G = this.g.gusts;
    for (let tries = 0; tries < 8; tries++) {
      let x, z;
      if (mode === 2) { const back = R * (0.9 + 0.1 * Math.random()), side = (Math.random() * 2 - 1) * R * 0.8; x = p.x - G.dx * back - G.dz * side; z = p.z - G.dz * back + G.dx * side; }
      else { const a = Math.random() * Math.PI * 2, d = mode === 1 ? R * (0.85 + 0.15 * Math.random()) : R * Math.sqrt(Math.random()); x = p.x + Math.sin(a) * d; z = p.z + Math.cos(a) * d; }
      if (!this.ok(x, z)) continue;
      S.x[i] = x; S.z[i] = z; S.y[i] = this.g.world.standY(x, z) + 0.012;
      S.ey[i] = Math.random() * 6.283; S.ex[i] = Math.random() < 0.3 ? Math.PI : 0; S.ez[i] = 0;
      S.vx[i] = S.vz[i] = S.vy[i] = 0; S.st[i] = 0; S.on[i] = 1;
      if (mode === 2) { S.st[i] = 1; S.vx[i] = G.dx * G.speed * 0.5; S.vz[i] = G.dz * G.speed * 0.5; }
      this.place(i); return true;
    }
    S.on[i] = 0; this.place(i); return false;
  }
  place(i) {
    const S = this.s, sc = S.on[i] ? S.sc[i] : 0;
    this._q.setFromEuler(this._e.set(S.ex[i], S.ey[i], S.ez[i], 'YXZ'));
    this._m.compose(this._p.set(S.x[i], S.y[i], S.z[i]), this._q, this._sc.set(sc * S.wd[i], sc, sc));
    this.mesh.setMatrixAt(i, this._m); this.dirty = true;
  }

  update(dt) {
    const g = this.g, G = g.gusts, p = g.player, S = this.s, W = g.world;
    const world = g.space === 'world';
    this.mesh.visible = world; this.dust.visible = world && this.puffs.length > 0;
    if (!world || !G) { this.filled = false; return; }
    dt = Math.min(dt, 0.05);
    // Fill the circle on arrival, and again after a jump across the map.
    if (!this.filled || Math.hypot(p.x - this.px, p.z - this.pz) > 25) { for (let i = 0; i < N; i++) this.spawn(i, 0); this.filled = true; }
    this.px = p.x; this.pz = p.z;
    const t = G.t, still = g.reduceMotion, gv = still ? 0 : G.v, gust = gv > 0.25;
    // A few resting leaves each frame: lay down again the ones the player has left behind, or that never found a spot.
    for (let n = 0; n < 12; n++) {
      const i = this.rr = (this.rr + 1) % N;
      if (S.st[i] === 0 && (!S.on[i] || Math.hypot(S.x[i] - p.x, S.z[i] - p.z) > FAR)) this.spawn(i, gust ? 2 : 1);
    }
    let moving = 0;
    const wsp0 = still ? 0 : G.speed;
    for (let i = 0; i < N; i++) {
      if (!S.on[i]) continue;
      const sd = S.seed[i], k = S.k[i];
      // The wind where this leaf is: gusty, and turned a little this way and that by the streets.
      const turb = 0.5 + 0.5 * Math.sin(t * 1.9 + sd * 11) * Math.sin(t * 0.7 + sd * 5), sw = 0.5 * Math.sin(t * 0.8 + sd * 9);
      const wsp = wsp0 * k * (0.75 + 0.5 * turb), cs = Math.cos(sw), sn = Math.sin(sw);
      const ux = wsp * (G.dx * cs - G.dz * sn), uz = wsp * (G.dz * cs + G.dx * sn);
      let st = S.st[i];
      if (st === 0) {
        if (wsp > 1.6 && Math.random() < dt * (wsp - 1.6) * 1.2) { st = S.st[i] = 1; } else continue;
      }
      moving++;
      let vx = S.vx[i], vy = S.vy[i], vz = S.vz[i];
      if (st === 1) {   // sliding and skittering along the ground
        if (wsp > 1.1) { const a = 1 - Math.exp(-2.5 * dt); vx += (0.5 * ux - vx) * a; vz += (0.5 * uz - vz) * a; }
        else { const f = Math.exp(-6 * dt); vx *= f; vz *= f; }
        if (Math.random() < dt * Math.max(0, wsp - 1.7) * 1.3) {
          st = S.st[i] = 2; vy = 1.2 + 1.8 * Math.random();
          S.wx[i] = (Math.random() - 0.5) * 24; S.wy[i] = (Math.random() - 0.5) * 8; S.wz[i] = (Math.random() - 0.5) * 24;
        }
        const sp = Math.hypot(vx, vz);
        S.ey[i] += dt * sp * 4 * (sd % 2 < 1 ? 1 : -1);
        // lie flat (or upside down) again
        const fa = 1 - Math.exp(-10 * dt);
        S.ex[i] += (Math.round(S.ex[i] / Math.PI) * Math.PI - S.ex[i]) * fa; S.ez[i] += (Math.round(S.ez[i] / Math.PI) * Math.PI - S.ez[i]) * fa;
        if (sp < 0.04 && wsp < 1.1) { S.st[i] = 0; vx = vz = 0; }
      } else {          // in the air: carried by the wind, falling slowly, lifted now and then, tumbling
        const a = 1 - Math.exp(-3 * dt); vx += (0.85 * ux - vx) * a; vz += (0.85 * uz - vz) * a;
        const gy = W.standY(S.x[i], S.z[i]);
        const lift = S.y[i] < gy + 2.2 ? 16 * gv * k * Math.max(0, Math.sin(t * 1.3 + sd * 17)) : 0;
        vy += (lift - 9.8) * dt; vy *= Math.exp(-6 * dt);
        const fl = Math.sin(t * 6 + sd * 3) * 1.5 * dt; vx -= G.dz * fl; vz += G.dx * fl;
        S.ex[i] += S.wx[i] * dt; S.ey[i] += S.wy[i] * dt; S.ez[i] += S.wz[i] * dt;
      }
      let nx = S.x[i] + vx * dt, nz = S.z[i] + vz * dt;
      if (W.groundY(nx, nz) < 0.3 || W.indoor(nx, nz, 0)) { S.st[i] = 0; this.spawn(i, gust ? 2 : 1); continue; }
      const q = W.resolve(nx, nz, 0.05);
      if (q[0] !== nx || q[1] !== nz) { nx = q[0]; nz = q[1]; vx *= 0.25; vz *= 0.25; }   // against a wall: it stops there
      const gy = W.standY(nx, nz) + 0.012;
      let ny = S.st[i] === 2 ? S.y[i] + vy * dt : gy;
      if (ny <= gy) { ny = gy; if (S.st[i] === 2) { S.st[i] = 1; vy = 0; vx *= 0.6; vz *= 0.6; } }
      S.x[i] = nx; S.y[i] = ny; S.z[i] = nz; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
      if (Math.hypot(nx - p.x, nz - p.z) > FAR + 4) { S.st[i] = 0; this.spawn(i, gust ? 2 : 1); continue; }
      this.place(i);
    }
    this.moving = moving;
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
    this.updateDust(dt, gv, G);
  }

  updateDust(dt, gv, G) {
    const g = this.g, W = g.world, cam = g.camera;
    this.dU.uTime.value = G.t;
    // Lit like the ground: the sun on a level surface and the light from the sky.
    const u = g.sky.u, sy = Math.max(0, u.uSunDir.value.y);
    const L = u.uLight.value, H = u.uHemi.value, kl = 0.3183 * 1.15;
    // Paler than the paving (dust in the air catches the light), or it cannot be seen against it.
    this.dU.uDust.value.setRGB(0.95 * (L.r * sy + H.r) * kl, 0.85 * (L.g * sy + H.g) * kl, 0.68 * (L.b * sy + H.b) * kl);
    // New clouds of dust, in front of the camera and a little upwind, so they drift across the view.
    if (gv > 0.25 && this.puffs.length < DUST) {
      this.dustT += dt * 2.6 * (gv - 0.25) / 0.75;
      while (this.dustT >= 1) {
        this.dustT -= 1;
        cam.getWorldDirection(this._fw); const fl = Math.hypot(this._fw.x, this._fw.z) || 1, fx = this._fw.x / fl, fz = this._fw.z / fl;
        const d = 6 + Math.random() * 10, side = (Math.random() * 2 - 1) * d * 0.55, up = G.speed * 1.5;
        const x = cam.position.x + fx * d - fz * side - G.dx * up, z = cam.position.z + fz * d + fx * side - G.dz * up;
        if (!this.ok(x, z)) continue;
        const kind = W.surfaceAt(x, z), kk = kind === 'earth' ? 1.3 : kind === 'wood' ? 0.3 : 1;
        this.puffs.push({ x, y: W.standY(x, z) + 0.35, z, life: 0, dur: 2.5 + Math.random() * 1.5, size: 1.2 + 1.0 * Math.random(), a: (0.22 + 0.12 * Math.random()) * kk, seed: Math.random() * 10, off: 0 });
      }
    } else this.dustT = 0;
    // which way, and how fast, the wind crosses the view (the camera's right is +)
    cam.getWorldDirection(this._fw); const cr = -(G.dx * this._fw.z - G.dz * this._fw.x) / (Math.hypot(this._fw.x, this._fw.z) || 1), drift = cr * G.speed / 3;
    let n = 0;
    for (let j = this.puffs.length - 1; j >= 0; j--) {
      const P = this.puffs[j]; P.life += dt;
      if (P.life >= P.dur) { this.puffs.splice(j, 1); continue; }
      const s = 0.8 * G.speed; let nx = P.x + G.dx * s * dt, nz = P.z + G.dz * s * dt;
      const q = W.resolve(nx, nz, 0.3); P.x = q[0]; P.z = q[1]; P.y += 0.12 * dt; P.off += drift * dt;
    }
    for (const P of this.puffs) {
      const v = P.life / P.dur, env = Math.pow(Math.sin(Math.PI * v), 0.7);
      this.dPos.setXYZ(n, P.x, P.y, P.z); this.dP.setXYZW(n, P.size * (1 + 0.5 * v), P.a * env * Math.min(1.2, Math.max(0.5, gv / 0.7)), P.seed, P.off); n++;
    }
    this.dust.geometry.instanceCount = n; this.dust.visible = n > 0;
    if (n) { this.dPos.needsUpdate = true; this.dP.needsUpdate = true; }
  }
}
