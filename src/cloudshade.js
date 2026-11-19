// Shadows of the low clouds on the town, the people, the trees and everything else that is lit (2026-11-19, one of
// the first-five-minutes changes Roman asked for). The painted mountains already had them (backdrop.js, cloudShadow);
// this uses the same cloud pattern, drift and cover as the sky, read where the sun's ray from each point meets the
// cloud layer 1.6 km up, so the shadows match the clouds overhead and move with the wind. It takes away part of the
// direct sunlight only; the light from the sky stays. The sea dims its glitter the same way (world.js, seaColorN).
//
// Every lit material in the scene (Lambert, Phong, Standard) gets the change once, after the world is built: its own
// shader change, if it has one, runs first, then this one. Shader materials (sky, sea, overlays) are left alone.
import { getNoise } from './world.js';

const GLSL = /* glsl */`
uniform vec4 uCOff, uCCloud, uCMisc; uniform vec3 uCSun; uniform sampler2D uCNoise;
// How much of the direct light a low cloud takes away here: 0 in the open, up to 0.5 under a thick one, less in
// thick overcast (the sky's own light is already dim then) and none by night.
float cloudShade(vec3 P) {
  float t = max(1600.0 - P.y, 0.0) / max(uCSun.y, 0.08);
  vec2 p = (P.xz + uCSun.xz * t) / 1600.0;
  float big = texture2D(uCNoise, p * 0.055 + uCOff.zw * 0.7 + 0.13).r;
  float shape = texture2D(uCNoise, p * 0.42 + uCOff.xy).r * 0.74 + big * 0.42 - 0.08;
  float thr = mix(0.88, 0.16, uCCloud.x);
  return smoothstep(thr - 0.06, thr + 0.26, shape) * 0.5 * (1.0 - smoothstep(0.6, 0.9, uCCloud.x)) * smoothstep(0.05, 0.3, uCMisc.z);
}`;
// The point's world position, from the view position every lit material already has.
const APPLY = /* glsl */`
  { vec3 cWP = cameraPosition + transpose(mat3(viewMatrix)) * (-vViewPosition); float cS = cloudShade(cWP);
    reflectedLight.directDiffuse *= 1.0 - cS; reflectedLight.directSpecular *= 1.0 - cS; }`;

export function setupCloudShade(g) {
  const u = g.sky.u, U = { uCOff: u.uOff, uCCloud: u.uCloud, uCMisc: u.uMisc, uCSun: u.uSunDir, uCNoise: { value: getNoise()[0] } };
  const seen = new Set();
  const patch = (m) => {
    if (!m || seen.has(m) || m.isShaderMaterial || !(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial)) return;
    seen.add(m);
    const prev = m.onBeforeCompile, own = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null;
    const key = (own ? own.call(m) : prev ? prev.toString() : '') + '|cloud-1';
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + APPLY);
    };
    m.customProgramCacheKey = own ? function () { return own.call(this) + '|cloud-1'; } : () => key;
    m.needsUpdate = true;
  };
  g.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch); });
  g.cloudShadeCount = seen.size;
  g.cloudShadeMaterial = patch;   // for things made later
}
