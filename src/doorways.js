// Doors standing open onto a room (2026-11-19, one of the first-five-minutes changes). Every house had its door
// shut. The doors are part of each house's model and cannot swing, so for about two houses in three a flat panel is
// laid over the closed leaves, inside the frame, and its shader looks through it into a room: the view ray from the
// eye is followed into a box 3.2 m deep behind the wall, and the floor, walls or ceiling it meets are colored and lit
// there (a technique called interior mapping). The room has an earth floor, plastered walls with a painted lower band,
// ceiling beams, a darker opening to an inner room, a big storage jar, and the two door leaves folded back. Daylight
// from the door fades toward the back, and some houses have a hearth glowing at the back, which shows most at night.
// One draw call for every open door.
import * as THREE from 'three';
import { HAZE_GLSL } from './world.js';

// The doors as built in Blender (blender/assets_buildings.py, door_leaves and door_frame): width and height of the
// opening, how far the leaves stand back from the wall face, and how far the door anchor stands out in front of it.
const DOOR = { house_a: [1.1, 2.1, 0.24, 0.6], house_b: [1.1, 2.1, 0.22, 0.6], warehouse: [3.2, 3.0, 0.25, 0.8] };

const VERT = /* glsl */`
attribute vec3 aO, aR, aN; attribute vec3 aSize;
varying vec3 vW, vO, vR, vN, vSize;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vO = aO; vR = aR; vN = aN; vSize = aSize; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */`
uniform vec3 uLight, uHemi; uniform vec4 uMisc;
${HAZE_GLSL}
varying vec3 vW, vO, vR, vN, vSize;
float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 V = normalize(vW - cameraPosition);
  // In the door's own frame: x across (right), y up from the sill, z out of the wall (the room is at negative z).
  vec3 p = vec3(dot(vW - vO, vR), vW.y - vO.y, dot(vW - vO, vN)), d = vec3(dot(V, vR), V.y, dot(V, vN));
  float w = vSize.x, h = vSize.y, seed = vSize.z, RW = max(3.6, w + 2.0), RH = h + 0.7, RD = 3.2;
  float tx = d.x > 1e-4 ? (RW * 0.5 - p.x) / d.x : d.x < -1e-4 ? (-RW * 0.5 - p.x) / d.x : 1e6;
  float ty = d.y > 1e-4 ? (RH - p.y) / d.y : d.y < -1e-4 ? -p.y / d.y : 1e6;
  float tz = d.z < -1e-4 ? (-RD - p.z) / d.z : 1e6;
  float t = min(tx, min(ty, tz)); vec3 q = p + d * t;
  vec3 alb; float lit = 1.0;
  if (t == tz) {                                   // the back wall, with an opening to an inner room
    alb = q.y < 0.9 ? vec3(0.46, 0.24, 0.16) : vec3(0.66, 0.58, 0.46);
    float ix = (seed - 0.5) * (RW - 1.6);
    if (abs(q.x - ix) < 0.42 && q.y < 1.95) { alb = vec3(0.05, 0.04, 0.035); lit = 0.4; }
  } else if (t == ty) {
    if (d.y < 0.0) { alb = vec3(0.30, 0.24, 0.18) * (0.9 + 0.2 * h1(floor(q.xz * 1.7))); }   // packed earth
    else { alb = fract(q.z * 1.8) < 0.3 ? vec3(0.14, 0.10, 0.07) : vec3(0.26, 0.2, 0.14); lit = 0.7; }   // beams and boards
  } else {                                         // a side wall
    alb = q.y < 0.9 ? vec3(0.46, 0.24, 0.16) : vec3(0.66, 0.58, 0.46);
  }
  // The two leaves, opened inward against the sides of the doorway.
  for (int k = 0; k < 2; k++) {
    float sx = k == 0 ? 0.5 * w - 0.03 : -0.5 * w + 0.03;
    if (abs(d.x) > 1e-4) { float tl = (sx - p.x) / d.x; vec3 l = p + d * tl; if (tl > 0.0 && tl < t && l.z < 0.0 && l.z > -0.56 * w && l.y > 0.0 && l.y < h) { t = tl; q = l; alb = vec3(0.17, 0.115, 0.08) * (0.85 + 0.3 * step(0.5, fract(l.z * 7.0))); lit = 0.8; } }
  }
  // A big storage jar standing on the floor, on the side away from the hearth (an upright ellipsoid, 0.7 m by 1 m).
  { vec3 jc = vec3((seed - 0.5) * (RW - 1.3) * -1.0 + (seed > 0.45 ? 0.0 : 0.6), 0.5, -RD + 0.7), s = vec3(1.0, 0.7, 1.0) / 0.36;
    vec3 oc = (p - jc) * s, dd = d * s; float b = dot(oc, dd), c = dot(oc, oc) - 1.0, a = dot(dd, dd), disc = b * b - a * c;
    if (disc > 0.0) { float tj = (-b - sqrt(disc)) / a; if (tj > 0.0 && tj < t) { t = tj; q = p + d * tj; vec3 nrm = normalize((q - jc) * s * s); alb = vec3(0.45, 0.24, 0.15) * (0.55 + 0.45 * max(nrm.z, 0.0) + 0.2 * nrm.y); lit = 1.0; } } }
  float depth = -q.z, day = uMisc.z * (1.0 - uMisc.x), night = clamp(uMisc.x, 0.0, 1.0);
  // Daylight through the door: strongest on the floor just inside, fading toward the back and up the walls.
  float fromDoor = exp(-depth * 0.75) * (t == ty && d.y < 0.0 ? 1.0 : 0.55) * (1.0 - 0.35 * smoothstep(0.0, RH, q.y));
  // Daylight comes in off the sunlit street, so it is warm.
  vec3 light = (uHemi * 0.45 + uLight * 0.22) * vec3(1.05, 0.95, 0.82) * fromDoor * (0.25 + 0.75 * day) + uHemi * 0.05;
  // A lamp hanging in the room, lit at night; and a hearth at the back in about half the houses.
  { vec3 lp = vec3(0.0, RH - 0.5, -RD * 0.55); float dl = dot(q - lp, q - lp); light += vec3(1.0, 0.62, 0.3) * (0.05 * day + 0.85 * night) / (1.0 + dl * 1.1); }
  if (seed > 0.45) { vec3 hp = vec3((0.5 - seed) * (RW - 1.0), 0.3, -RD + 0.4); float dd = dot(q - hp, q - hp); light += vec3(1.0, 0.52, 0.22) * (0.45 + 1.1 * night) / (1.0 + dd * 2.2); }
  vec3 col = alb * light * lit;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float dist = length(vW - cameraPosition); vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(V), hazeAmount(dist, dot(V, fwd) * dist, cameraPosition.y, vW.y, 0.8, 1.0));
}`;

export function setupDoorways(g) {
  const doors = (g.world.doors || []).filter((d) => DOOR[d.id]);
  const pos = [], O = [], R = [], N = [], Z = [], idx = [];
  let n = 0, k = 0;
  for (const d of doors) {
    const hsh = Math.abs(Math.sin(d.x * 12.9898 + d.z * 78.233) * 43758.5453) % 1;
    if (d.id === 'warehouse' ? hsh > 0.3 : hsh > 0.68) continue;   // about two houses in three, and one warehouse in three, stand open
    const [w, h, recess, out] = DOOR[d.id], ox = Math.sin(d.rot), oz = Math.cos(d.rot), rx = oz, rz = -ox;
    const back = out + recess - 0.05;                                 // 5 cm in front of the closed leaves, so their handles stay behind
    const cx = d.x - ox * back, cz = d.z - oz * back, y0 = d.y;
    for (const [u, v] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      pos.push(cx + rx * u * w, y0 + v * h, cz + rz * u * w);
      O.push(cx, y0, cz); R.push(rx, 0, rz); N.push(ox, 0, oz); Z.push(w, h, hsh / 0.68);
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4; k++;
  }
  if (!k) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [name, a] of [['aO', O], ['aR', R], ['aN', N], ['aSize', Z]]) geo.setAttribute(name, new THREE.Float32BufferAttribute(a, 3));
  geo.setIndex(idx); geo.computeBoundingSphere();
  const u = g.sky.u, mat = new THREE.ShaderMaterial({
    uniforms: { uLight: u.uLight, uHemi: u.uHemi, uMisc: u.uMisc, uFog: u.uFog, uHzSun: u.uHzSun, uHzAnti: u.uHzAnti, uSunDir: u.uSunDir, uFogP: u.uFogP },
    vertexShader: VERT, fragmentShader: FRAG, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'open doorways'; mesh.frustumCulled = false; mesh.receiveShadow = false;
  g.world.group.add(mesh);
  g.doorways = { mesh, open: k, of: doors.length };
}
