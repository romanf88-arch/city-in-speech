// The finishing pass. The scene is drawn into a picture that keeps brightness above white, and then:
//   contact shade   corners, the ground under feet, and the undersides of things get darker (worked out from depth)
//   near haze       the air between the eye and the town, brighter and warmer toward the sun
//   lit smoke       in the cave, the fire lights the smoky air, and the statues and carriers block it, so beams
//                   and shadows show in the air; at night outdoor fires give a soft halo
//   glow            bright things (flames, the sun on white plaster) spread a little light around them
//   finish          the same filmic curve as before, then a color grade (muted reds, warm light, cool shade,
//                   a gentle contrast curve), darker screen corners, and fine noise so smooth skies do not band
// game.post.enabled = false draws the old way (F9 switches while playing).
//
// How it keeps the old look: the scene is first drawn exactly as before, filmic curve and all, with fog and haze
// mixed in after the curve the way the light profiles were tuned. That picture is then run backward through the
// curve to get light values again, the new effects are added to those, and the curve is applied once more at the
// end. With every effect off, the result is the old picture.
import * as THREE from 'three';

// The filmic curve (three.js's ACES) and its inverse, as numbers for both the shaders and the page.
const AIN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const AOUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const AIN_INV = AIN.clone().invert(), AOUT_INV = AOUT.clone().invert();
const m3 = (m) => 'mat3(' + Array.from(m.elements, (x) => x.toFixed(7)).join(', ') + ')';
const CURVE_GLSL = /* glsl */`
vec3 lookRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 lookAces(vec3 c) { return clamp(${m3(AOUT)} * lookRRT(${m3(AIN)} * c), 0.0, 1.0); }
vec3 lookUnRRT(vec3 y) {
  y = clamp(y, 0.0, 0.992);
  vec3 A = y * 0.983729 - 1.0, B = y * 0.4329510 - 0.0245786, C = y * 0.238081 + 0.000090537;
  return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
}
// A color as the old game put it on screen (gamma-encoded) back to light before the curve, at curve scale ex.
vec3 lookUnDisplay(vec3 s, float ex) {
  s = clamp(s, 0.0, 1.0);
  vec3 l = mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s));
  return max(${m3(AIN_INV)} * lookUnRRT(${m3(AOUT_INV)} * l), 0.0) / ex;
}
`;
// While the scene is drawn for the finishing pass, three.js leaves out the filmic curve (it never applies it
// when drawing into a picture). These two patches put it back at the same place in every material, so fog and
// haze are mixed after it as before. The page signals that case with a negative exposure.
THREE.ShaderChunk.colorspace_pars_fragment += `
#ifndef TONE_MAPPING
uniform float toneMappingExposure;
#endif
// The signal: exposure -e means "drawing for the finishing pass, new look"; -(e + 100) means "drawing for the
// finishing pass, old look" (F9), which leaves out the near haze.
float lookExposure() { float e = -toneMappingExposure; return e > 50.0 ? e - 100.0 : e; }
bool lookNew() { return toneMappingExposure > -50.0; }
${CURVE_GLSL}
vec3 lookSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(vec3(0.0031308), c)); }`;
THREE.ShaderChunk.colorspace_fragment = `
#ifndef TONE_MAPPING
if (toneMappingExposure < 0.0) gl_FragColor.rgb = lookSRGB(lookAces(gl_FragColor.rgb * (lookExposure() / 0.6)));
#endif
gl_FragColor = linearToOutputTexel( gl_FragColor );`;
// Scene fog: the fog color is screen-encoded, as three.js passes it when drawing to the screen.
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogC = fogColor;
  #ifndef TONE_MAPPING
  if (toneMappingExposure < 0.0) {
    fogC = lookSRGB(fogC);
    #ifndef FOG_EXP2
    // Near haze: from 20 m out, thicker when the profile's fog is short (storm, cave), gone where the old fog is full.
    float nearHaze = (1.0 - exp(-max(vFogDepth - 20.0, 0.0) * 0.0015 * 430.0 / fogFar)) * (1.0 - fogFactor);
    if (lookNew()) gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, nearHaze * 0.85 );
    #endif
  }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;

// Light from a flame falls off with distance, but not without limit close in: within 1.5 m it stays at its 1.5 m
// strength. Without this a person standing beside a torch was lit as if the flame were inside them and went white.
THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
  'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );',
  'float distanceFalloff = 1.0 / pow( max( lightDistance, 1.5 ), decayExponent );');

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Reading depth and turning it back into a position seen from the eye.
const DEPTH_GLSL = /* glsl */`
uniform sampler2D tDepth;
uniform vec4 uProj;   // x, y: tangent of half the view angle across and up; z near; w far
uniform vec4 uSc;     // the part of the scene pictures in use (xy, as a share of the picture) and the last pixel centers in it (zw)
vec2 inScene(vec2 uv) { return min(uv * uSc.xy, uSc.zw); }
float viewZ(vec2 uv) { float d = texture2D(tDepth, inScene(uv)).x; return (uProj.z * uProj.w) / ((uProj.w - uProj.z) * d - uProj.w); }
vec3 viewPos(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0) * uProj.xy * -z, z); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// ---------------------------------------------------------------- contact shade (half size)
const AO_FRAG = /* glsl */`
${DEPTH_GLSL}
uniform vec2 uTexel;   // one full-size pixel, in picture coordinates
uniform vec4 uAO;      // x reach in meters, y strength, z fade start, w fade end (meters from the eye)
varying vec2 vUv;
const float BAY[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
void main() {
  float d = texture2D(tDepth, inScene(vUv)).x;
  if (d > 0.99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  float z = viewZ(vUv); vec3 P = viewPos(vUv, z); float dist = -z;
  float fade = 1.0 - smoothstep(uAO.z, uAO.w, dist);
  vec2 rUv = uAO.x / (dist * 2.0 * uProj.xy);
  if (fade <= 0.0 || rUv.y < 3.0 * uTexel.y) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }
  rUv = min(rUv, vec2(0.1));
  // The surface direction, from the neighbor on the side that is not across an edge.
  vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
  float zl = viewZ(vUv - ox), zr = viewZ(vUv + ox), zd = viewZ(vUv - oy), zu = viewZ(vUv + oy);
  vec3 dx = abs(zr - z) < abs(z - zl) ? viewPos(vUv + ox, zr) - P : P - viewPos(vUv - ox, zl);
  vec3 dy = abs(zu - z) < abs(z - zd) ? viewPos(vUv + oy, zu) - P : P - viewPos(vUv - oy, zd);
  vec3 N = normalize(cross(dx, dy));
  if (dot(N, P) > 0.0) N = -N;
  ivec2 ip = ivec2(gl_FragCoord.xy) & 3;
  float rot = BAY[ip.y * 4 + ip.x] / 16.0 * 6.2831853;
  float R = uAO.x, R2 = R * R, sum = 0.0;
  for (int i = 0; i < NS; i++) {
    float a = (float(i) + 0.5) / float(NS);
    float ang = a * 6.2831853 * 3.0 + rot;
    vec2 suv = vUv + vec2(cos(ang), sin(ang)) * sqrt(a) * rUv;
    vec3 v = viewPos(suv, viewZ(suv)) - P;
    float vv = dot(v, v), vn = dot(v, N);
    float f = max(1.0 - vv / R2, 0.0);
    sum += f * f * max((vn - 0.012 * dist) / (vv + 0.02 * R2), 0.0) * R;
  }
  float ao = clamp(1.0 - uAO.y * sum / float(NS), 0.0, 1.0);
  gl_FragColor = vec4(mix(1.0, ao, fade), dist, 0.0, 1.0);
}`;

// Smooths the contact shade over 4 by 4 pixels (the size of the pattern that turns the samples), without
// smoothing across edges in depth.
const AO_BLUR = /* glsl */`
uniform sampler2D tAO; uniform vec2 uT;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tAO, vUv);
  float s = 0.0, w = 0.0;
  for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) {
    vec4 t = texture2D(tAO, vUv + vec2(float(x), float(y)) * uT);
    float k = max(0.0, 1.0 - abs(t.g - c.g) / (0.04 * c.g + 0.05));
    s += t.r * k; w += k;
  }
  gl_FragColor = vec4(s / max(w, 1e-4), c.g, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- lit smoke and halos (quarter size)
const VOL_FRAG = /* glsl */`
#include <packing>
${DEPTH_GLSL}
uniform mat4 uCamMat; uniform vec3 uCamPos;
uniform sampler2D tShadow; uniform vec4 uShadow;   // near, far, bias, one shadow pixel up
uniform vec4 uFire; uniform vec3 uFireCol;          // fire place, w = 1 when marched with shadows
uniform vec4 uLP[4]; uniform vec3 uLC[4];           // lights without shadows: place, w = how much they light the air
uniform sampler3D tNoise; uniform vec4 uSmoke;      // x thickness, y how uneven, z time, w how far to look
varying vec2 vUv;
vec2 cubeToUV(vec3 v, float texelSizeY) {
  vec3 absV = abs(v);
  float scaleToCube = 1.0 / max(absV.x, max(absV.y, absV.z));
  absV *= scaleToCube;
  v *= scaleToCube * (1.0 - 2.0 * texelSizeY);
  vec2 planar = v.xy;
  float almostATexel = 1.5 * texelSizeY;
  float almostOne = 1.0 - almostATexel;
  if (absV.z >= almostOne) { if (v.z > 0.0) planar.x = 4.0 - v.x; }
  else if (absV.x >= almostOne) { float signX = sign(v.x); planar.x = v.z * signX + 2.0 * signX; }
  else if (absV.y >= almostOne) { float signY = sign(v.y); planar.x = v.x + 2.0 * signY + 2.0; planar.y = v.z * signY - 2.0; }
  return vec2(0.125, 0.25) * planar + vec2(0.375, 0.75);
}
float smoke(vec3 p) {
  float a = texture(tNoise, p * 0.085 + vec3(0.13, -uSmoke.z * 0.022, 0.31)).r;
  float b = texture(tNoise, p * 0.23 + vec3(-uSmoke.z * 0.011, -uSmoke.z * 0.05, 0.7)).r;
  float n = a * 0.68 + b * 0.32;
  return uSmoke.x * max(0.0, 1.0 + uSmoke.y * (n - 0.5) * 2.4);
}
// Light from a point that the air along the ray picks up, if nothing is in the way (closed form).
float pointIn(vec3 ro, vec3 rd, float T, vec3 L) {
  vec3 q = L - ro; float a = dot(q, rd);
  float h = sqrt(max(dot(q, q) - a * a, 0.09));
  return (atan((T - a) / h) - atan(-a / h)) / h;
}
void main() {
  float d = texture2D(tDepth, inScene(vUv)).x;
  float z = d > 0.99999 ? -uSmoke.w : viewZ(vUv);
  vec3 Pw = (uCamMat * vec4(viewPos(vUv, z), 1.0)).xyz;
  vec3 rd = Pw - uCamPos; float T = length(rd); rd /= T; T = min(T, uSmoke.w);
  vec3 acc = vec3(0.0);
  if (uFire.w > 0.5) {
    float dt = T / float(NV), j = ign(gl_FragCoord.xy);
    for (int i = 0; i < NV; i++) {
      vec3 p = uCamPos + rd * ((float(i) + j) * dt);
      vec3 L = p - uFire.xyz; float r = length(L); vec3 l = L / r;
      float vis = 1.0;
      if (r > uShadow.x && r < uShadow.y) {
        float dp = (r - uShadow.x) / (uShadow.y - uShadow.x) + uShadow.z;
        vis = step(dp, unpackRGBAToDepth(texture2D(tShadow, cubeToUV(l, uShadow.w))));
      }
      float ph = 0.55 + 1.1 * pow(max(dot(l, -rd), 0.0), 5.0);
      acc += uFireCol * (vis * smoke(p) * ph / (pow(r, 1.45) + 0.8)) * dt;
    }
  }
  for (int k = 0; k < 4; k++) if (uLP[k].w > 0.0) acc += uLC[k] * (uLP[k].w * pointIn(uCamPos, rd, T, uLP[k].xyz));
  gl_FragColor = vec4(acc, -z);
}`;

const VOL_BLUR = /* glsl */`
uniform sampler2D tVol; uniform vec2 uT;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tVol, vUv);
  vec3 s = vec3(0.0); float w = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 t = texture2D(tVol, vUv + vec2(float(x), float(y)) * uT);
    float k = 1.0 / (0.03 + abs(t.a - c.a) / max(c.a, 0.1));
    s += t.rgb * k; w += k;
  }
  gl_FragColor = vec4(s / w, c.a);
}`;

// ---------------------------------------------------------------- glow
// First step down from the full picture, with each group of pixels weighted so a single very bright pixel
// cannot flicker.
const DOWN0 = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uT; uniform float uEx; uniform vec4 uSc;
varying vec2 vUv;
// (the curve functions come from the shared code patched in above)
vec3 at(vec2 uv) { return lookUnDisplay(texture2D(tSrc, min(uv * uSc.xy, uSc.zw)).rgb, uEx); }
void main() {
  vec3 a = at(vUv + vec2(-uT.x, -uT.y)), b = at(vUv + vec2(uT.x, -uT.y));
  vec3 c = at(vUv + vec2(-uT.x, uT.y)), d = at(vUv + vec2(uT.x, uT.y));
  float wa = 1.0 / (1.0 + max(a.r, max(a.g, a.b))), wb = 1.0 / (1.0 + max(b.r, max(b.g, b.b)));
  float wc = 1.0 / (1.0 + max(c.r, max(c.g, c.b))), wd = 1.0 / (1.0 + max(d.r, max(d.g, d.b)));
  gl_FragColor = vec4(min((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), vec3(60.0)), 1.0);
}`;
const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uT;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv + vec2(-uT.x, -uT.y)).rgb + texture2D(tSrc, vUv + vec2(uT.x, -uT.y)).rgb
         + texture2D(tSrc, vUv + vec2(-uT.x, uT.y)).rgb + texture2D(tSrc, vUv + vec2(uT.x, uT.y)).rgb;
  gl_FragColor = vec4(s * 0.25, 1.0);
}`;
const UP = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uT;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += (texture2D(tSrc, vUv + vec2(uT.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(uT.x, 0.0)).rgb
      + texture2D(tSrc, vUv + vec2(0.0, uT.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, uT.y)).rgb) * 2.0;
  s += texture2D(tSrc, vUv + uT).rgb + texture2D(tSrc, vUv - uT).rgb
     + texture2D(tSrc, vUv + vec2(uT.x, -uT.y)).rgb + texture2D(tSrc, vUv + vec2(-uT.x, uT.y)).rgb;
  gl_FragColor = vec4(s / 16.0 * 0.62, 1.0);
}`;

// ---------------------------------------------------------------- putting it together
const COMPOSITE = /* glsl */`
${DEPTH_GLSL}
uniform sampler2D tScene, tAO, tVol, tBloom;
uniform vec2 uAOSize, uVolSize;
uniform vec4 uOn;                       // x contact shade, y lit smoke, z glow softness, w glow from bright things
uniform mat4 uCamMat; uniform vec3 uCamPos;
uniform vec3 uFog, uHzSun, uHzAnti, uSunDir, uSunCol;
uniform vec4 uHaze;                     // x thickness, y height scale, z, w the old fog's near and far
uniform float uHazeFrom;
uniform vec4 uGrade;                    // x exposure, y color amount, z contrast, w corner darkening
uniform vec3 uWarm, uCool;
uniform float uRedPull, uGlowFrom, uDebug, uFxaa;
uniform vec2 uRcp;
uniform mat4 uPrevVP;                   // the camera's view and projection in the last frame
uniform vec4 uBlur;                     // x share of a frame's motion to smear (0 none), y longest smear (share of the screen height), z distance (m) within which nothing smears, w width over height
uniform vec4 uFocus;                    // speaker depth, eased amount, blur radius in pixels, aspect
uniform vec4 uShaft;                    // sun in screen coordinates, strength, aspect
uniform float uFresco;                  // optional pigment palette; no extra render pass or texture
// The scene picture at this pixel. When the frame-rate guard draws the scene smaller than the screen, it is
// stretched back up with plain smoothing. (A sharpening step was tried here and taken out on 2026-11-15: measured
// against a picture drawn at twice the size, it nearly doubled the shimmer on cloth and walls while turning.)
vec3 sceneAt(vec2 p) { return texture2D(tScene, p).rgb; }
// Edge smoothing (FXAA, after Timothy Lottes), on the scene picture, which holds screen colors.
// FXAA reads only inside the part of the scene picture in use (when it is drawn smaller than the screen, the rest
// holds only the clear color, and a read there left a faint dark line along the top and right edges).
vec3 fxS(vec2 p) { return texture2D(tScene, min(p, uSc.zw)).rgb; }
vec3 fxaa(vec2 uv) {
  const vec3 LU = vec3(0.299, 0.587, 0.114);
  vec3 nw = fxS(uv + vec2(-1.0, -1.0) * uRcp), ne = fxS(uv + vec2(1.0, -1.0) * uRcp);
  vec3 sw = fxS(uv + vec2(-1.0, 1.0) * uRcp), se = fxS(uv + vec2(1.0, 1.0) * uRcp);
  vec3 m = fxS(uv);
  float lnw = dot(nw, LU), lne = dot(ne, LU), lsw = dot(sw, LU), lse = dot(se, LU), lm = dot(m, LU);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (lmax - lmin < max(0.0312, lmax * 0.125)) return m;
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2(-8.0), vec2(8.0)) * uRcp;
  vec3 a = 0.5 * (fxS(uv + dir * (1.0 / 3.0 - 0.5)) + fxS(uv + dir * (2.0 / 3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (fxS(uv - dir * 0.5) + fxS(uv + dir * 0.5));
  float lb = dot(b, LU);
  return (lb < lmin || lb > lmax) ? a : b;
}
varying vec2 vUv;
// (the curve functions come from the shared code patched in above)
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(vec3(0.0031308), c)); }
// Read a smaller picture whose alpha (or green) holds distance, taking the four nearest pixels and
// trusting those at about the same distance as this pixel.
vec4 upVol(sampler2D t, vec2 size, float zf) {
  vec2 h = vUv * size - 0.5; vec2 b = floor(h); vec2 f = h - b;
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float(k >> 1));
    vec4 r = texture2D(t, (b + o + 0.5) / size);
    float bw = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y);
    float w = (bw + 0.02) / (0.02 + abs(r.a - zf) / zf);
    acc += r * w; ws += w;
  }
  return acc / ws;
}
float upAO(vec2 size, float zf) {
  vec2 h = vUv * size - 0.5; vec2 b = floor(h); vec2 f = h - b;
  float acc = 0.0, ws = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float(k >> 1));
    vec2 r = texture2D(tAO, (b + o + 0.5) / size).rg;
    float bw = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y);
    float w = (bw + 0.02) / (0.02 + abs(r.g - zf) / zf);
    acc += r.r * w; ws += w;
  }
  return acc / ws;
}
// Camera motion blur. Where this pixel's point was on the screen in the last frame, if the world stood still: the
// picture is smeared along that line by a share of it, so a fast turn at 30 frames a second shows a short streak
// between frames instead of a jump. Things as near as the player (uBlur.z) stay sharp, since the camera follows
// them, and the smear leaves out anything that near, so the player does not run into what lies behind.
vec2 blurStep(vec2 uv, bool sky, vec3 Pv, float z) {
  vec4 wp = sky ? vec4(mat3(uCamMat) * normalize(Pv), 0.0) : uCamMat * vec4(Pv, 1.0);
  vec4 pc = uPrevVP * wp;
  if (pc.w <= 1e-4) return vec2(0.0);
  vec2 v = (uv - (pc.xy / pc.w * 0.5 + 0.5)) * uBlur.x;
  v *= smoothstep(uBlur.z, uBlur.z + 2.5, -z);
  float L = length(v * vec2(uBlur.w, 1.0));
  if (L > uBlur.y) v *= uBlur.y / L;
  return v;
}
vec3 blurred(vec2 uv, vec2 v, float z) {
  float j = ign(gl_FragCoord.xy), near = uBlur.z + 1.0; bool far = -z > uBlur.z + 2.5;
  vec3 s = vec3(0.0); float w = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 p = uv + v * ((float(i) + j) / 8.0 - 0.5);
    if (far && -viewZ(p) < near) continue;
    s += texture2D(tScene, inScene(p)).rgb; w += 1.0;
  }
  return w > 0.0 ? s / w : texture2D(tScene, inScene(uv)).rgb;
}
// Background-only focus: the player and the speaker remain sharp. Depth rejection keeps
// foreground silhouettes from bleeding into the harbor behind a person.
vec3 focusBackground(vec2 uv, vec3 original, float depth) {
  float amount = uFocus.y * smoothstep(uFocus.x + 1.3, uFocus.x + 9.0, depth);
  if (amount < 0.01) return original;
  float radius = uFocus.z * amount;
  vec3 total = original; float weight = 1.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.399963;
    float r = sqrt((float(i) + 0.5) / 12.0);
    vec2 sampleUv = clamp(uv + vec2(cos(a), sin(a)) * r * radius * uRcp / uSc.xy, vec2(0.0), vec2(1.0));
    float sampleDepth = -viewZ(sampleUv);
    float accept = smoothstep(uFocus.x + 0.6, uFocus.x + 1.5, sampleDepth);
    total += sceneAt(inScene(sampleUv)) * accept; weight += accept;
  }
  return mix(original, total / weight, amount);
}
// Radial light scattering from an occluded sun mask. Only runs while the sun is near
// the view and depth is available. Solid roofs and leaves interrupt the source.
vec3 sunlight(vec2 uv, float depth) {
  if (uShaft.z < 0.002) return vec3(0.0);
  vec2 delta = (uShaft.xy - uv) * 0.94 / 16.0;
  vec2 p = uv; float light = 0.0, decay = 1.0;
  for (int i = 0; i < 16; i++) {
    p += delta;
    vec2 q = (p - uShaft.xy) * vec2(uShaft.w, 1.0);
    float open = step(0.99998, texture2D(tDepth, inScene(clamp(p, vec2(0.0), vec2(1.0)))).x);
    light += exp(-dot(q, q) * 90.0) * open * decay;
    decay *= 0.96;
  }
  return vec3(1.0, 0.77, 0.44) * (light / 16.0) * uShaft.z * smoothstep(2.0, 12.0, depth);
}
void main() {
  float d = texture2D(tDepth, inScene(vUv)).x;
  bool sky = d > 0.99999;
  float z = sky ? -uProj.w : viewZ(vUv);
  vec3 Pv = viewPos(vUv, z);
  vec3 sc = uFxaa > 0.5 ? fxaa(inScene(vUv)) : sceneAt(inScene(vUv));
  if (uBlur.x > 0.0) {
    vec2 v = blurStep(vUv, sky, Pv, z);
    float px = length(v / uRcp);
    if (px > 1.0) sc = mix(sc, blurred(vUv, v, z), smoothstep(1.0, 3.0, px));
  }
  if (uFocus.y > 0.01) sc = focusBackground(vUv, sc, -z);
  sc += sunlight(vUv, -z);
  vec3 c = lookUnDisplay(sc, uGrade.x);
  if (uDebug > 2.5) { gl_FragColor = vec4(toSRGB(lookAces(c * uGrade.x)), 1.0); return; }
  float dist = length(Pv);
  vec3 rd = mat3(uCamMat) * (Pv / dist);
  float ao = (!sky && uOn.x > 0.5) ? upAO(uAOSize, -z) : 1.0;
  if (uDebug > 0.5 && uDebug < 1.5) { gl_FragColor = vec4(vec3(ao), 1.0); return; }
  c *= ao;
  if (!sky && uHaze.x > 0.0) {
    float y0 = max(uCamPos.y, -5.0), y1 = max(y0 + rd.y * dist, -5.0), H = uHaze.y;
    float a0 = exp(-y0 / H), a1 = exp(-y1 / H), dy = (y1 - y0) / H;
    float avg = abs(dy) > 0.01 ? (a0 - a1) / dy : a0;
    float amt = (1.0 - exp(-uHaze.x * max(dist - uHazeFrom, 0.0) * avg)) * (1.0 - smoothstep(uHaze.z, uHaze.w, -z));
    vec2 hd = normalize(rd.xz + vec2(1e-5, 0.0)), sd = normalize(uSunDir.xz + vec2(1e-5, 0.0));
    float a = dot(hd, sd), w = abs(a); w = w * w * (3.0 - 2.0 * w);
    vec3 hc = mix(uFog, a > 0.0 ? uHzSun : uHzAnti, w);
    float mu = max(dot(rd, uSunDir), 0.0);
    hc += uSunCol * (0.04 * mu * mu + 0.22 * pow(mu, 10.0));
    c = mix(c, hc, amt);
  }
  if (uOn.y > 0.5) c += upVol(tVol, uVolSize, -z).rgb;
  if (uDebug > 1.5) { gl_FragColor = vec4(sqrt(uOn.y > 0.5 ? upVol(tVol, uVolSize, -z).rgb : vec3(0.0)), 1.0); return; }
  vec3 bl = texture2D(tBloom, vUv).rgb;
  c = mix(c, bl, uOn.z) + max(bl - uGlowFrom, vec3(0.0)) * uOn.w;
  c *= uGrade.x;
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * uGrade.w;
  c = toSRGB(lookAces(c));
  // grade
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  float l = dot(c, LW);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), ch = mx - mn;
  float red = (c.r >= mx - 1e-4 && c.b <= c.g + 1e-4) ? 1.0 - smoothstep(0.25, 0.6, (c.g - c.b) / max(ch, 1e-4)) : 0.0;
  float sat = uGrade.y * (1.0 - uRedPull * red * smoothstep(0.15, 0.45, ch));
  c = mix(vec3(l), c, sat);
  c *= mix(uCool, uWarm, smoothstep(0.05, 0.85, l));
  float l2 = dot(c, LW);
  float lc = mix(l2, l2 * l2 * (3.0 - 2.0 * l2), uGrade.z);
  c *= lc / max(l2, 1e-4);
  if (uFresco > 0.5) {
    float pigmentLight = dot(c, LW);
    vec3 pigment = mix(vec3(pigmentLight), c, 0.72) * vec3(1.07, 1.0, 0.86);
    // Broad pigment values and fixed plaster grain, with enough continuous color left for skies.
    float band = floor(pigmentLight * 12.0 + 0.5) / 12.0;
    pigment *= mix(1.0, (band + 0.10) / (pigmentLight + 0.10), 0.3);
    float plaster = ign(floor(gl_FragCoord.xy * 0.45));
    c = mix(pigment, vec3(0.96, 0.90, 0.76), 0.045) + (plaster - 0.5) * 0.018;
  }
  c += (ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + 37.0) - 1.0) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- the look settings
// One set of numbers for the whole game, so every place shares one color key.
export const LOOK = {
  aoReach: 0.9, aoStrength: 2.4, aoFadeFrom: 30, aoFadeTo: 65,
  hazeThick: 0.0017, hazeHeight: 70, hazeFrom: 20,   // starts beyond hazeFrom meters, so the middle distance keeps its color         // per meter at sea level; meters over which it thins by e
  softness: 0.045, glow: 0.22, glowFrom: 1.15,
  color: 0.9, redPull: 0.4, contrast: 0.3, corners: 0.5,
  warm: [1.05, 1.0, 0.94], cool: [0.965, 0.99, 1.035],   // cool was [0.95, 0.99, 1.06]: shade read as flat slate-blue
  caveSmoke: 0.04, caveUneven: 1.15, caveFire: 0.008, caveDay: 0.002, nightHalo: 0.0,
  // motion blur: 30% of each frame's motion, at most 2.5% of the screen's height (27 pixels at 1080). It was half of
  // the motion and 4% (as a film camera with a half-open shutter) until Roman asked for it weaker on 2026-11-15.
  blurShare: 0.3, blurMax: 0.025,
};

function noise3D(n) {
  // Tiling smooth noise, one channel, for the smoke.
  const g = new Float32Array(n * n * n), rnd = (() => { let s = 1234567; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Uint8Array(n * n * n);
  const at = (x, y, z) => g[((z % n + n) % n) * n * n + ((y % n + n) % n) * n + ((x % n + n) % n)];
  const sm = (t) => t * t * (3 - 2 * t);
  const oct = (x, y, z, p) => {
    const s = n / p, fx = x / s, fy = y / s, fz = z / s, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const ux = sm(fx - ix), uy = sm(fy - iy), uz = sm(fz - iz), P = (a, b, c) => at(((a % p) + p) % p * s, ((b % p) + p) % p * s, ((c % p) + p) % p * s);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(P(ix, iy, iz), P(ix + 1, iy, iz), ux), l(P(ix, iy + 1, iz), P(ix + 1, iy + 1, iz), ux), uy),
      l(l(P(ix, iy, iz + 1), P(ix + 1, iy, iz + 1), ux), l(P(ix, iy + 1, iz + 1), P(ix + 1, iy + 1, iz + 1), ux), uy), uz);
  };
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.55 * oct(x, y, z, 4) + 0.3 * oct(x, y, z, 8) + 0.15 * oct(x, y, z, 16);
    out[z * n * n + y * n + x] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  const t = new THREE.Data3DTexture(out, n, n, n);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// The filmic curve run backward: the color that comes out as `out` (linear, before the screen's gamma).
const _uv = new THREE.Vector3();
function rrtInv(y) {
  y = Math.min(Math.max(y, 0), 1.0);
  const a = 0.0245786, b = 0.000090537, c = 0.983729, d = 0.4329510, e = 0.238081;
  const A = y * c - 1, B = y * d - a, C = y * e + b;
  if (Math.abs(A) < 1e-6) return -C / B;
  const disc = Math.max(B * B - 4 * A * C, 0);
  return (-B - Math.sqrt(disc)) / (2 * A);
}
export function untone(col, exposure, out) {
  _uv.set(col.r, col.g, col.b).applyMatrix3(AOUT_INV);
  _uv.set(rrtInv(_uv.x), rrtInv(_uv.y), rrtInv(_uv.z)).applyMatrix3(AIN_INV).multiplyScalar(1 / exposure);
  return out.setRGB(Math.max(0, _uv.x), Math.max(0, _uv.y), Math.max(0, _uv.z));
}

export class Post {
  constructor(renderer, game) {
    this.r = renderer; this.g = game; this.enabled = true; this.ao = true; this.glow = true; this.forceDepth = false;
    this.ok = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    if (!this.ok) { this.enabled = false; return; }
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo); this.quad.frustumCulled = false;
    this.fs = new THREE.Scene(); this.fs.add(this.quad);
    const M = (frag, uniforms, defines, extra) => new THREE.ShaderMaterial(Object.assign({ vertexShader: VERT, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, toneMapped: false }, extra || {}));
    const proj = { value: new THREE.Vector4() }, depth = { value: null }, sc = { value: new THREE.Vector4(1, 1, 1, 1) };
    this.u = { proj, depth, sc };
    this.mAO = M(AO_FRAG, { tDepth: depth, uProj: proj, uSc: sc, uTexel: { value: new THREE.Vector2() }, uAO: { value: new THREE.Vector4() } }, { NS: 10 });
    this.mAOBlur = M(AO_BLUR, { tAO: { value: null }, uT: { value: new THREE.Vector2() } });
    this.noise = noise3D(32);
    this.mVol = M(VOL_FRAG, {
      tDepth: depth, uProj: proj, uSc: sc, uCamMat: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      tShadow: { value: null }, uShadow: { value: new THREE.Vector4() }, uFire: { value: new THREE.Vector4() }, uFireCol: { value: new THREE.Color() },
      uLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uLC: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
      tNoise: { value: this.noise }, uSmoke: { value: new THREE.Vector4() },
    }, { NV: 28 });
    this.mVolBlur = M(VOL_BLUR, { tVol: { value: null }, uT: { value: new THREE.Vector2() } });
    this.mDown0 = M(DOWN0, { tSrc: { value: null }, uT: { value: new THREE.Vector2() }, uEx: { value: 1 }, uSc: sc });
    this.mDown = M(DOWN, { tSrc: { value: null }, uT: { value: new THREE.Vector2() } });
    this.mUp = M(UP, { tSrc: { value: null }, uT: { value: new THREE.Vector2() } }, null, { blending: THREE.AdditiveBlending, transparent: true });
    this.mComp = M(COMPOSITE, {
      tDepth: depth, uProj: proj, uSc: sc, tScene: { value: null }, tAO: { value: null }, tVol: { value: null }, tBloom: { value: null },
      uAOSize: { value: new THREE.Vector2() }, uVolSize: { value: new THREE.Vector2() }, uOn: { value: new THREE.Vector4() },
      uCamMat: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Color() }, uHzSun: { value: new THREE.Color() }, uHzAnti: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uHaze: { value: new THREE.Vector4() }, uGrade: { value: new THREE.Vector4() }, uWarm: { value: new THREE.Vector3() }, uCool: { value: new THREE.Vector3() },
      uRedPull: { value: 0 }, uGlowFrom: { value: 1 }, uHazeFrom: { value: 20 }, uDebug: { value: 0 }, uFxaa: { value: 1 }, uRcp: { value: new THREE.Vector2() },
      uPrevVP: { value: new THREE.Matrix4() }, uBlur: { value: new THREE.Vector4() },
      uFocus: { value: new THREE.Vector4(6, 0, 5.5, 1) }, uShaft: { value: new THREE.Vector4(0.5, 0.5, 0, 1) },
      uFresco: { value: 0 },
    });
    // Camera motion blur (see blurStep in COMPOSITE). It needs the depth picture, which the town has whenever it is
    // drawn without edge samples; ?blur=0 or F7 turns it off.
    this.blur = !/[?&]blur=0/.test((typeof location !== 'undefined' && location.search) || '');
    this.prevVP = new THREE.Matrix4(); this.prevPos = new THREE.Vector3(); this.prevDir = new THREE.Vector3(); this.havePrev = false;
    this._vp = new THREE.Matrix4(); this._dir = new THREE.Vector3(); this._chest = new THREE.Vector3();
    this.size = new THREE.Vector2(); this.targets = [];
    this.debug = 0;   // 1 shows the contact shade alone, 2 the lit smoke alone, 3 the old picture passed straight through
    this.neutral = false;   // true (F9) shows the old look through the same anti-aliased path
    this.scale = 1;         // how large the scene is drawn, as a share of the screen (set by the frame-rate guard, game.govern)
    this.samples = 4;       // anti-aliasing samples for the town (the guard may lower this to 2 before it lowers the size)
    this.timer = new GpuTimer(renderer.getContext());
    this._v = new THREE.Vector3(); this._c = new THREE.Color(); this._f = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  }

  setSize(w, h) {
    if (!this.ok) return;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (w === this.size.x && h === this.size.y) return;
    this.size.set(w, h);
    for (const t of this.targets) t.dispose();
    const HF = THREE.HalfFloatType, opt = (o) => Object.assign({ type: HF, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }, o || {});
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    // The scene picture holds what the old game put on screen (already through the curve and gamma-encoded),
    // so 8 bits a channel are enough, as on the old canvas; that keeps four-sample anti-aliasing affordable.
    // Two scene pictures. The town is drawn with four-sample anti-aliasing, as the old game was, and gets only
    // the effects that need no depth (reading back anti-aliased depth costs about 7 ms on Intel UHD 620). The
    // cave is drawn single-sample with a depth picture, for the lit smoke, and smoothed with FXAA.
    this.sceneMS = new THREE.WebGLRenderTarget(w, h, opt({ type: THREE.UnsignedByteType, depthBuffer: true, samples: this.samples }));
    this.sceneD = new THREE.WebGLRenderTarget(w, h, opt({ type: THREE.UnsignedByteType, depthBuffer: true, depthTexture: dt }));
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), qw = Math.ceil(w / 4), qh = Math.ceil(h / 4);
    this.aoA = new THREE.WebGLRenderTarget(hw, hh, opt({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.aoB = new THREE.WebGLRenderTarget(hw, hh, opt({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.volA = new THREE.WebGLRenderTarget(qw, qh, opt({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.volB = new THREE.WebGLRenderTarget(qw, qh, opt({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.bloom = [];
    // The glow starts from a quarter-size picture (the first step reads 4 points spread over 4 by 4 pixels).
    for (let i = 0, bw = w / 2, bh = h / 2; i < 5; i++) { bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2)); this.bloom.push(new THREE.WebGLRenderTarget(bw, bh, opt())); }
    this.targets = [this.sceneMS, this.sceneD, this.aoA, this.aoB, this.volA, this.volB, ...this.bloom];
    this.u.depth.value = dt;
  }

  // Fewer anti-aliasing samples for the town picture. Only the picture is remade; the canvas is untouched, so the
  // screen does not blink.
  setSamples(k) {
    if (k === this.samples) return;
    this.samples = k;
    if (this.sceneMS) { this.sceneMS.dispose(); this.sceneMS.samples = k; }
  }

  pass(mat, target, clear = true) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    if (clear) this.r.clear(true, false, false);
    this.r.render(this.fs, this.cam);
  }

  render(scene, camera) {
    const r = this.r, g = this.g, L = LOOK, sky = g.sky, cur = sky.cur, inCave = g.space === 'cave';
    r.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2()));
    this.setSize(this._sz.x, this._sz.y);
    const auto = r.autoClear;
    const ex = r.toneMappingExposure, deep = inCave || this.forceDepth;
    // Without edge samples the town is drawn into the picture that keeps depth (the same cost), for FXAA and the
    // motion blur. The contact shade, the lit smoke, and the near haze still need `deep` (the cave, or forceDepth).
    // The conversation focus and the sunlight shafts (polish.js) read this depth picture, but they never ask for it:
    // drawing the town without edge samples just for them brought back the shimmer on clothes.
    const useD = deep || this.samples === 0;
    if (g.polish) g.polish.prepare(camera);
    const S = this.scene = useD ? this.sceneD : this.sceneMS;
    const W = this.size.x, H = this.size.y;
    // The scene is drawn into the lower left part of its picture when the guard asks for a smaller size; the
    // passes read only that part.
    const s = Math.min(1, Math.max(0.5, this.scale)), sw = Math.max(2, Math.round(W * s)), sh = Math.max(2, Math.round(H * s));
    S.viewport.set(0, 0, sw, sh); S.scissor.set(0, 0, sw, sh);
    this.u.sc.value.set(sw / W, sh / H, (sw - 0.5) / W, (sh - 0.5) / H);
    this.timer.begin();
    r.toneMappingExposure = -(ex + (this.neutral ? 100 : 0)); r.setRenderTarget(S); r.render(scene, camera); r.toneMappingExposure = ex;
    r.autoClear = false;
    // Values every pass shares.
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.u.proj.value.set(ty * camera.aspect, ty, camera.near, camera.far);
    // contact shade
    const aoOn = this.ao && deep;
    if (aoOn) {
      const m = this.mAO.uniforms; m.uTexel.value.set(1 / W, 1 / H); m.uAO.value.set(L.aoReach, L.aoStrength, L.aoFadeFrom, L.aoFadeTo);
      this.pass(this.mAO, this.aoA);
      this.mAOBlur.uniforms.tAO.value = this.aoA.texture; this.mAOBlur.uniforms.uT.value.set(1 / this.aoA.width, 1 / this.aoA.height);
      this.pass(this.mAOBlur, this.aoB);
    }
    // lit smoke: the cave fire with its shadows, and soft halos round other lights
    const v = this.mVol.uniforms; let volOn = false, nl = 0;
    v.uFire.value.w = 0;
    for (const p of v.uLP.value) p.w = 0;
    if (inCave && g.cave) {
      const fl = g.cave.light, sm = fl.shadow.map;
      fl.getWorldPosition(this._v);
      if (sm && fl.castShadow) {
        v.uFire.value.set(this._v.x, this._v.y, this._v.z, 1);
        v.tShadow.value = sm.texture;
        v.uShadow.value.set(fl.shadow.camera.near, fl.shadow.camera.far, fl.shadow.bias, 1 / (fl.shadow.mapSize.y * 2));
        v.uFireCol.value.copy(fl.color).multiplyScalar(fl.intensity * L.caveFire);
        volOn = true;
      }
      const day = g.cave.day;
      if (day && day.intensity > 0) { day.getWorldPosition(this._v); v.uLP.value[nl].set(this._v.x, this._v.y, this._v.z, L.caveDay); v.uLC.value[nl].copy(day.color).multiplyScalar(day.intensity); nl++; volOn = true; }
      v.uSmoke.value.set(L.caveSmoke, L.caveUneven, g.time, 60);
    } else if (g.fireLights) {
      for (const fl of g.fireLights) {
        if (fl.intensity <= 0.01 || nl >= 4) continue;
        fl.getWorldPosition(this._v);
        v.uLP.value[nl].set(this._v.x, this._v.y, this._v.z, L.nightHalo); v.uLC.value[nl].copy(fl.color).multiplyScalar(fl.intensity); nl++; volOn = true;
      }
      v.uSmoke.value.set(0, 0, g.time, 80);
    }
    if (!deep) volOn = false;
    if (volOn) {
      v.uCamMat.value.copy(camera.matrixWorld); v.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      this.pass(this.mVol, this.volA);
      this.mVolBlur.uniforms.tVol.value = this.volA.texture; this.mVolBlur.uniforms.uT.value.set(1 / this.volA.width, 1 / this.volA.height);
      this.pass(this.mVolBlur, this.volB);
    }
    // glow: step down five times, then back up, adding as it goes
    const B = this.bloom;
    if (this.glow && !this.neutral) {
    this.mDown0.uniforms.tSrc.value = this.scene.texture; this.mDown0.uniforms.uT.value.set(1.5 / W, 1.5 / H); this.mDown0.uniforms.uEx.value = ex / 0.6;
    this.pass(this.mDown0, B[0]);
    for (let i = 1; i < B.length; i++) { this.mDown.uniforms.tSrc.value = B[i - 1].texture; this.mDown.uniforms.uT.value.set(1 / B[i - 1].width, 1 / B[i - 1].height); this.pass(this.mDown, B[i]); }
    for (let i = B.length - 1; i > 0; i--) { this.mUp.uniforms.tSrc.value = B[i].texture; this.mUp.uniforms.uT.value.set(1 / B[i].width, 1 / B[i].height); this.pass(this.mUp, B[i - 1], false); }
    }
    // put it together on screen
    const c = this.mComp.uniforms;
    c.uFresco.value = !this.neutral && g.polish?.options.fresco ? 1 : 0;
    if (g.polish && !this.neutral && useD && !this.lite) { c.uFocus.value.copy(g.polish.focus); c.uShaft.value.copy(g.polish.sun); }   // (lite: the guard's last steps, game.js RUNGS)
    else { c.uFocus.value.y = 0; c.uShaft.value.z = 0; }
    c.tScene.value = this.scene.texture; c.tAO.value = this.aoB.texture; c.tVol.value = this.volB.texture; c.tBloom.value = B[0].texture;
    c.uAOSize.value.set(this.aoB.width, this.aoB.height); c.uVolSize.value.set(this.volB.width, this.volB.height);
    const night = cur.stars > 0.5 || inCave;
    // With the glow off its pictures are not redrawn, so they still hold the last frame that had it. They must not be
    // read then: on 2026-11-15 they were, and a faint ghost of the view at the moment the frame-rate guard turned the
    // glow off stayed fixed on the screen (Roman saw it as dim rectangles that followed the camera).
    const glowOn = this.glow && !this.neutral;
    c.uOn.value.set(aoOn ? 1 : 0, volOn ? 1 : 0, glowOn ? L.softness : 0, glowOn ? L.glow * (inCave ? 0.1 : night ? 0.35 : 1) : 0); c.uHazeFrom.value = L.hazeFrom;
    c.uGlowFrom.value = L.glowFrom * (inCave ? 2.2 : night ? 1.3 : 1); c.uDebug.value = this.neutral ? 3 : this.debug;
    c.uCamMat.value.copy(camera.matrixWorld); c.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    // The near haze is mixed before the curve, so its colors are run backward through the curve first; fully
    // thick near haze then shows the profile's haze color as written.
    const exs = ex / 0.6;
    untone(cur.fog, exs, this._f[0]); untone(cur.hzSun, exs, this._f[1]); untone(cur.hzAnti, exs, this._f[2]);
    c.uFog.value.copy(this._f[0]); c.uHzSun.value.copy(this._f[1]); c.uHzAnti.value.copy(this._f[2]); c.uSunDir.value.copy(sky.sunDir);
    c.uSunCol.value.copy(cur.sun).multiplyScalar(cur.sunI);
    c.uHaze.value.set(inCave || !deep ? 0 : L.hazeThick * cur.haze, L.hazeHeight, cur.fogN, cur.fogF);   // in the town the near haze is in the materials' fog (see fog_fragment above)
    const un = this.unseen || 0;   // 0..1: the player wears the ring turned in. Less color, cooler, darker corners.
    c.uGrade.value.set(exs, L.color * (night && !inCave ? 0.78 : 1) * (1 - 0.55 * un), L.contrast * (inCave ? 1.25 : 1), L.corners * (inCave ? 1.2 : 1) + 1.1 * un);   // less color at night
    if (night && !inCave) { c.uWarm.value.set(1, 1, 1); c.uCool.value.set(0.94, 0.98, 1.08); }   // at night the shade goes cool and nothing is warmed
    else { c.uWarm.value.fromArray(L.warm); c.uCool.value.fromArray(L.cool); }
    if (un > 0.001) { c.uWarm.value.lerp(this._unW || (this._unW = new THREE.Vector3(0.93, 0.98, 1.06)), un); c.uCool.value.lerp(this._unC || (this._unC = new THREE.Vector3(0.9, 0.97, 1.1)), un); }
    // The district the player is in shifts the light, the color and the far haze a little (places.js sets this.place
    // and moves it slowly as the player crosses from one to the next). At night the shift is less than half as strong.
    const pl = this.place;
    if (pl && !inCave && !this.neutral) {
      const pk = night ? 0.4 : 1, m = (v) => 1 + (v - 1) * pk, G = c.uGrade.value, W = c.uWarm.value, K = c.uCool.value;
      G.x *= m(pl.ex); G.y *= m(pl.color); G.z *= m(pl.contrast); c.uHaze.value.x *= m(pl.haze);
      W.set(W.x * m(pl.wr), W.y * m(pl.wg), W.z * m(pl.wb)); K.set(K.x * m(pl.cr), K.y * m(pl.cg), K.z * m(pl.cb));
    }
    c.uRedPull.value = L.redPull; c.uFxaa.value = useD ? 1 : 0; c.uRcp.value.set(1 / W, 1 / H);
    // Motion blur: the camera of the last frame, and none on the first frame after a cut (a jump of more than 3 m or
    // a turn of more than half a radian in one frame), in the old look (F9), or without the depth picture.
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    camera.getWorldDirection(this._dir);
    const cut = !this.havePrev || camera.position.distanceTo(this.prevPos) > 3 || this._dir.dot(this.prevDir) < 0.88;
    this.blurOn = this.blur && useD && !this.neutral && !this.lite && !cut;
    const p = g.player, keep = g.mode === 'play' && g.cam && g.cam.mode === 'follow' && p ? camera.position.distanceTo(this._chest.set(p.x, p.y + 1.2, p.z)) + 0.6 : 0;
    c.uPrevVP.value.copy(this.prevVP);
    c.uBlur.value.set(this.blurOn ? L.blurShare : 0, L.blurMax, keep, camera.aspect);
    this.prevVP.copy(this._vp); this.prevPos.copy(camera.position); this.prevDir.copy(this._dir); this.havePrev = true;
    this.pass(this.mComp, null);
    this.timer.end();
    r.autoClear = auto;
  }
  // The graphics chip's time for recent frames (median, ms), or null where the browser does not report it.
  gpuMs() { return this.timer ? this.timer.median() : null; }
}

// Times the graphics chip's work on each frame, read back a few frames later (EXT_disjoint_timer_query_webgl2).
class GpuTimer {
  constructor(gl) { this.gl = gl; this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); this.wait = []; this.ms = []; this.on = null; }
  begin() { if (!this.ext || this.on || this.wait.length > 5) return; this.on = this.gl.createQuery(); this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.on); }
  end() {
    const gl = this.gl;
    if (this.on) { gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.wait.push(this.on); this.on = null; }
    while (this.wait.length && gl.getQueryParameter(this.wait[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.wait.shift(), bad = gl.getParameter(this.ext.GPU_DISJOINT_EXT), ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q); if (!bad) this.ms.push(ns / 1e6);
    }
    if (this.ms.length > 30) this.ms.splice(0, this.ms.length - 30);
  }
  median() { if (!this.ext || this.ms.length < 5) return null; const a = this.ms.slice(-15).sort((x, y) => x - y); return +a[a.length >> 1].toFixed(2); }
}
