// Presentation settings: conversation focus, sunlight shafts, and harbor detail (from the Codex copy, 2026-11-19).
// Focus and shafts need the depth picture, so they show only when the town is already drawn with one (the cave,
// or a frame-rate step without edge samples). They never switch the town off its edge samples by themselves:
// that switch brought back the shimmer on clothes that Roman reported on 2026-11-15. See post.js.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

const SETTINGS = 'city-in-speech-presentation-v1';
const DEFAULTS = { focus: true, rays: true, harbor: false };   // harbor detail costs about 3 ms on Intel UHD 620 and is hard to see

export class Polish {
  constructor(g) {
    this.g = g;
    this.options = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS));
      for (const k of Object.keys(DEFAULTS)) if (typeof saved?.[k] === 'boolean') this.options[k] = saved[k];
    } catch { /* A private browser can still play with the defaults. */ }
    this.focus = new THREE.Vector4(6, 0, 5.5, 1);   // speaker depth, eased amount, blur radius in pixels, aspect
    this.sun = new THREE.Vector4(0.5, 0.5, 0, 1);   // sun on screen, strength, aspect
    this._point = new THREE.Vector3(); this._sun = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this._last = performance.now();
    this.addControls();
  }

  addControls() {
    const panel = document.querySelector('#pause .panel');
    if (!panel) return;
    const field = document.createElement('fieldset'); field.className = 'presentation-settings';
    const legend = document.createElement('legend'); legend.textContent = 'Presentation'; field.append(legend);
    const labels = {
      focus: ['Conversation focus', 'Soften distant scenery while someone speaks.'],
      rays: ['Sunlight shafts', 'Warm light through gaps in trees and buildings.'],
      harbor: ['Harbor detail', 'Lapping foam around hulls and light patterns below the waterline.'],
    };
    this.controls = {};
    for (const [key, [label, help]] of Object.entries(labels)) {
      const row = document.createElement('label');
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = this.options[key];
      input.id = 'presentation-' + key;
      const text = document.createElement('span'); text.textContent = label;
      const note = document.createElement('small'); note.textContent = help; text.append(note);
      input.addEventListener('change', () => this.set(key, input.checked));
      row.append(input, text); field.append(row); this.controls[key] = input;
      if (!this.g.post.ok) { input.disabled = true; note.textContent = 'Unavailable with this browser’s graphics support.'; }
    }
    panel.insertBefore(field, document.getElementById('restartAsk'));
  }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this.options[key] = !!value;
    if (this.controls && this.controls[key]) this.controls[key].checked = !!value;
    try { localStorage.setItem(SETTINGS, JSON.stringify(this.options)); } catch { /* Optional preferences. */ }
  }

  // Called by the finishing pass before each frame. It eases the focus toward the speaker and finds the sun on
  // screen; the finishing pass uses the result only when it has the depth picture.
  prepare(camera) {
    const g = this.g, now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    const target = g.focus;
    const talking = this.options.focus && g.busy > 0 && target && g.cam.mode === 'follow'
      && !g.overlayOpen() && !g.ui.auto && g.mode === 'play';
    if (talking) {
      if (target.headWorld) target.headWorld(this._point);
      else this._point.set(target.x, (target.y || 0) + 1.5, target.z);
      this._point.applyMatrix4(camera.matrixWorldInverse);
      this.focus.x = damp(this.focus.x, clamp(-this._point.z, 0.8, 80), 9, dt);
    }
    this.focus.y = damp(this.focus.y, talking ? 1 : 0, 5, dt);
    this.focus.z = g.post.scale < 0.85 ? 3.5 : 5.5;
    this.focus.w = camera.aspect;
    const sky = g.sky, daytime = g.space !== 'cave' && sky.cur.stars < 0.2 && sky.sunDir.y > 0.06 && sky.cur.cov < 0.75;
    camera.getWorldDirection(this._dir);
    const facing = this._dir.dot(sky.sunDir);
    const indoor = g.space === 'world' && g.world.indoor(g.player.x, g.player.z);
    let shafts = this.options.rays && daytime && !indoor && g.post.scale >= 0.85 && !g.post.neutral && facing > 0.2;
    if (shafts) {
      this._sun.copy(sky.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
      const x = this._sun.x * 0.5 + 0.5, y = this._sun.y * 0.5 + 0.5;
      const edge = Math.max(Math.abs(x - 0.5) / 0.9, Math.abs(y - 0.5) / 0.9);
      shafts = edge < 1 && this._sun.z < 1;
      this.sun.x = x; this.sun.y = y;
      this.sun.z = damp(this.sun.z, shafts ? 0.22 * (1 - edge * edge) * clamp(sky.sunDir.y * 5, 0, 1) : 0, 4, dt);
    } else this.sun.z = damp(this.sun.z, 0, 6, dt);
    this.sun.w = camera.aspect;
  }
}
