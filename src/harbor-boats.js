// Boats that move (2026-11-19, one of the first-five-minutes changes). A small boat rowed slowly round the water
// between the two piers, and a merchant ship under sail crossing the bay beyond the harbor. Both rise, fall and rock
// as the moored ships do (layout.js). The rower faces the stern, as rowers do, and the oars follow his stroke.
// Each leaves a wake, and the oars throw a splash as they go in.
import * as THREE from 'three';
import { Actor, rowPull } from './actors.js';
import { WAVE_VERTEX } from './harbor-detail.js';

// A wake (2026-11-19): a strip of foam laid along where the stern has been, riding the same waves as the sea
// (WAVE_VERTEX). Churned water just behind the boat, and two lines along its outer edges that spread and fade.
// N points of history, one every `every` seconds; half-width from hw0 at the stern to hw1 at the end.
function makeWake(g, N, every, hw0, hw1, back, far) {
  // Seven points across, so the strip follows the swell instead of cutting under it.
  const M = 7, pos = new Float32Array(N * M * 3), uv = new Float32Array(N * M * 2), idx = [];
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < M - 1; j++) { const a = i * M + j; idx.push(a, a + 1, a + M, a + 1, a + M + 1, a + M); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const U = Object.assign({ uFar: { value: far } }, g.harbor.uniforms);   // the sea's clock, the day's light and the foam tint (harbor-detail.js)
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: WAVE_VERTEX + '\nvarying vec2 vUv; varying vec3 vWorld;\nvoid main() { vUv = uv; vWorld = waterPoint(position); gl_Position = projectionMatrix * viewMatrix * vec4(vWorld + vec3(0.0, 0.06, 0.0), 1.0); }',
    fragmentShader: `uniform sampler2D uNoise; uniform float uTime, uDay, uFar; uniform vec3 uTint; varying vec2 vUv; varying vec3 vWorld;
void main() {
  float age = vUv.y, x = abs(vUv.x - 0.5) * 2.0;
  float n = texture2D(uNoise, vWorld.xz * 0.32 + vec2(uTime * 0.02, 0.0)).g, n2 = texture2D(uNoise, vWorld.xz * 0.9 - vec2(0.0, uTime * 0.03)).r;
  float churn = (1.0 - smoothstep(0.1, 0.75, x)) * (1.0 - smoothstep(0.05, 0.55, age));
  float lines = (1.0 - smoothstep(0.0, 0.26, abs(x - 0.78))) * (1.0 - age) * 0.6 * smoothstep(0.3, 0.65, n2 + 0.15);
  float a = (churn + lines) * smoothstep(0.2, 0.55, n * 0.7 + n2 * 0.5 + 0.3 * (1.0 - age)) * smoothstep(0.0, 0.03, age) * (1.0 - smoothstep(0.85, 1.0, age));
  a = min(0.85, a * (0.65 + 0.9 * uDay)) * (1.0 - smoothstep(uFar * 0.5, uFar, distance(cameraPosition, vWorld)));
  gl_FragColor = vec4(uTint, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
  mesh.frustumCulled = false; mesh.renderOrder = 806; g.scene.add(mesh);
  const pts = []; let clock = 0;
  return { mesh, update(dt, x, z, heading) {
    const sx = x - Math.sin(heading) * back, sz = z - Math.cos(heading) * back;
    clock -= dt;
    if (clock <= 0 || !pts.length) { clock = every; pts.unshift({ x: sx, z: sz, h: heading }); if (pts.length > N) pts.pop(); } else { pts[0].x = sx; pts[0].z = sz; pts[0].h = heading; }
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, pts.length - 1)], age = i / (N - 1), hw = hw0 + (hw1 - hw0) * Math.sqrt(age), rx = Math.cos(p.h), rz = -Math.sin(p.h);
      for (let j = 0; j < M; j++) { const u = j / (M - 1), o = (u * 2 - 1) * hw, k = i * M + j; pos[k * 3] = p.x + rx * o; pos[k * 3 + 1] = 0.03; pos[k * 3 + 2] = p.z + rz * o; uv[k * 2] = u; uv[k * 2 + 1] = age; }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
  } };
}

// Splashes from the oars: a pool of drops thrown up where a blade goes into the water.
function makeSplashes(g) {
  const N = 64, pool = Array.from({ length: N }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })), P = new Float32Array(N * 3), L = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('aLife', new THREE.BufferAttribute(L, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uH: { value: 720 }, uDay: g.harbor.uniforms.uDay },
    vertexShader: 'attribute float aLife; varying float vL; uniform float uH; void main() { vL = aLife; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_PointSize = clamp(uH * 0.045 / max(-p.z, 0.1), 1.0, 9.0); }',
    fragmentShader: 'varying float vL; uniform float uDay; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.85, 0.9, 0.92) * (0.45 + 0.55 * uDay), (1.0 - smoothstep(0.3, 1.0, r)) * smoothstep(0.0, 0.3, vL) * 0.8); }',
    transparent: true, depthWrite: false,
  }));
  pts.frustumCulled = false; pts.visible = false; g.scene.add(pts);
  return {
    emit(x, y, z, n) { for (let k = 0; k < n; k++) { const q = pool.find((p) => p.life <= 0); if (!q) return; q.life = 0.5 + Math.random() * 0.35; q.x = x + (Math.random() - 0.5) * 0.25; q.y = y; q.z = z + (Math.random() - 0.5) * 0.25; q.vx = (Math.random() - 0.5) * 0.9; q.vz = (Math.random() - 0.5) * 0.9; q.vy = 0.9 + Math.random() * 1.1; } },
    update(dt) {
      let live = 0;
      pool.forEach((q, i) => { if (q.life > 0) { q.life -= dt; q.vy -= 7 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.y < -0.05) q.life = 0; live++; } P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.z; L[i] = Math.max(0, q.life); });
      pts.visible = live > 0; if (live) { geo.attributes.position.needsUpdate = true; geo.attributes.aLife.needsUpdate = true; pts.material.uniforms.uH.value = g.renderer.domElement.height; }
    },
  };
}

export function setupHarborBoats(g) {
  const kit = g.kit, w = g.world, wood = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  const boats = [], splash = makeSplashes(g), _b = new THREE.Vector3();
  const afloat = (id, y) => { const o = kit.spawn(id, 0, 0, 0, { y, noCollide: true }), rock = new THREE.Group(); while (o.children.length) rock.add(o.children[0]); o.add(rock); return { o, rock, y }; };

  // ---- the rowboat: an ellipse 64 m by 32 m between the piers (their inner faces are at x = -56.5 and 56.5), clear
  // of the ship at the quay (to z 79), at about 1.1 m/s, so once round takes a little over two minutes.
  const row = afloat('boat_small', 0.1);
  const rower = new Actor({ skin: 'tan', hair: 0x2e2218, beard: 'short', dress: 'exomis', length: 'short', robe: 0x8a7a5e, hat: 'none' }, 4311);
  rower.place(0, -0.35, Math.PI, 0.22); rower.setActivity('row', { phase: 0 }); row.rock.add(rower.group);
  const oars = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.74, 0.62, -0.15);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.9, 6), wood); shaft.rotation.z = Math.PI / 2; shaft.position.x = side * 0.7;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.14), wood); blade.position.x = side * 1.95;
    shaft.castShadow = blade.castShadow = true; pivot.add(shaft, blade); row.rock.add(pivot);
    return { pivot, side };
  });
  const R = { cx: 0, cz: 100, rx: 32, rz: 16, speed: 1.1, a: 0.6 };
  const rowWake = makeWake(g, 40, 0.25, 0.55, 2.2, 2.4, 140);
  boats.push({ b: row, k: 1.6, ph: 0.3, wake: rowWake, step(dt) {
    R.a += dt * R.speed / Math.hypot(R.rx * Math.sin(R.a), R.rz * Math.cos(R.a));
    const x = R.cx + R.rx * Math.cos(R.a), z = R.cz + R.rz * Math.sin(R.a), dx = -R.rx * Math.sin(R.a), dz = R.rz * Math.cos(R.a);
    row.o.position.x = x; row.o.position.z = z; row.o.rotation.y = Math.atan2(dx, dz);
    // The oars: at the catch the blades point toward the bow; on the pull they sweep aft through the water, and on
    // the return they come forward raised. (The boat moves toward its local +z; the rower faces -z.)
    const p = rowPull(rower.actT || 0), pulling = p >= (R.prevP != null ? R.prevP : p); R.prevP = p;
    // The blades go in at the catch: a splash at each, if the boat is near enough to be seen.
    if (pulling && !R.wasPulling && Math.hypot(x - g.player.x, z - g.player.z) < 90) for (const o of oars) { o.pivot.children[1].getWorldPosition(_b); splash.emit(_b.x, 0.08, _b.z, 7); }
    R.wasPulling = pulling;
    for (const o of oars) {
      o.dip = (o.dip || 0) + ((pulling ? 0.32 : -0.03) - (o.dip || 0)) * Math.min(1, dt * 7);
      o.pivot.rotation.y = o.side * (-0.6 + 1.1 * p); o.pivot.rotation.z = -o.side * o.dip;
    }
    return [x, z];
  } });

  // ---- the merchant ship under sail, crossing the mouth of the bay from west to east 185 m out, at 2.2 m/s; past
  // 330 m it starts again from the west, out in the haze.
  const ship = afloat('ship_merchant', 0.15);
  const cloth = new THREE.MeshLambertMaterial({ color: 0xe6d8bb, side: THREE.DoubleSide });
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 6.4, 14, 8), cloth), sp = sail.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) { const u = sp.getX(i) / 7.4 + 0.5, v = sp.getY(i) / 6.4 + 0.5; sp.setZ(i, 0.95 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.25 + 0.75 * v))); }
  sail.geometry.computeVertexNormals(); sail.position.set(0.1, 7.5, 1.1); sail.castShadow = true; ship.rock.add(sail);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8.2, 6), wood); yard.rotation.z = Math.PI / 2; yard.position.set(0.1, 10.7, 1.0); ship.rock.add(yard);
  const S = { x: -150, z: 185, speed: 2.2 };
  const shipWake = makeWake(g, 40, 0.5, 2.4, 8.0, 9.0, 420);
  boats.push({ b: ship, k: 0.8, ph: 1.7, wake: shipWake, step(dt) {
    S.x += dt * S.speed; if (S.x > 330) S.x = -330;
    ship.o.position.x = S.x; ship.o.position.z = S.z; ship.o.rotation.y = Math.PI / 2;
    return [S.x, S.z];
  } });

  g.tickers.push((dt) => {
    const t = g.time, p = g.player, near = g.space === 'world';
    splash.update(dt);
    for (const B of boats) {
      const [x, z] = B.step(dt), o = B.b.o, rk = B.b.rock;
      o.visible = near; B.wake.mesh.visible = near; if (near) B.wake.update(dt, x, z, o.rotation.y);
      o.position.y = B.b.y + (Math.sin(t * 0.55 + B.ph) * 0.05 + Math.sin(t * 0.93 + B.ph * 1.7) * 0.025) * B.k;
      rk.rotation.z = (Math.sin(t * 0.62 + B.ph) * 0.02 + Math.sin(t * 1.1 + B.ph * 2.1) * 0.008) * B.k;
      rk.rotation.x = Math.sin(t * 0.47 + B.ph * 1.3) * 0.009 * B.k;
      if (B.b === row) { const d = Math.hypot(x - p.x, z - p.z); rower.setDistance(d); if (d < 120 && near) rower.queue(dt); }
    }
  });
  g.harborBoats = { row, ship, rower };
}
