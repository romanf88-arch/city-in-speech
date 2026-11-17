// Sound made in the browser: no audio files. Sea, wind, fire, footsteps, a plucked lyre, and small interface tones.
import { clamp } from './util.js';

export class Audio {
  constructor() { this.ctx = null; this.on = true; this.beds = {}; this.levels = {}; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(this.ctx.destination);
      // One shared noise buffer for sea, wind, fire, and footsteps.
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 6; }
      this.noise = buf;
      this.bed('sea', 420, 0.7, 0.13); this.bed('wind', 900, 0.4, 0.2); this.bed('fire', 2600, 1.2, 0); this.bed('crowd', 520, 2.2, 0.0); this.bed('cave', 160, 0.9, 0);
    } catch (e) { this.ctx = null; }
  }
  bed(name, freq, q, level) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = 0;
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 0.08 + Math.random() * 0.12; lg.gain.value = freq * 0.25; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.beds[name] = g; this.levels[name] = level;
  }
  // Set how loud each background layer is (0..1). Called every so often with values for where the player stands.
  mix(levels) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const k in this.beds) { const v = clamp(levels[k] != null ? levels[k] : 0, 0, 1); this.beds[k].gain.setTargetAtTime(v, t, 0.8); }
  }
  setOn(on) { this.on = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05); }
  tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of the shared noise through two filters that slide from f0 to f1. Thunder and the earthquake are made
  // of these. (They used to be one low sawtooth tone, which Roman said "sounds like a fart", 2026-11-15: a laptop's
  // speakers cannot play a 55 Hz tone, so only its buzz came through.)
  burst(at, dur, f0, f1, vol, type = 'lowpass', q = 0.7, attack = 0.02, buf = this.noise) {
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; s.loop = true;
    for (const x of [f, f2]) { x.type = type; x.Q.value = q; x.frequency.setValueAtTime(f0, t); x.frequency.exponentialRampToValueAtTime(f1, t + dur); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(f2); f2.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.1);
  }
  // Plain hiss, with as much high sound as low (the shared buffer is mostly low). Thunder is made from this, so that
  // its crack and the upper part of its roll come through small speakers.
  whiteNoise() {
    if (!this.white) { const n = this.ctx.sampleRate, b = this.ctx.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.white = b; }
    return this.white;
  }
  // Thunder: a sharp crack, a clap, and then a roll that swells and fades several times as it dies away.
  thunder(vol = 1) {
    if (!this.ctx || !this.on) return;
    const W = this.whiteNoise();
    this.burst(0, 0.2, 4200, 1300, 0.7 * vol, 'bandpass', 0.6, 0.003, W);          // the crack
    this.burst(0.015, 1.0, 2600, 320, 0.75 * vol, 'lowpass', 0.6, 0.01, W);        // the clap
    let at = 0.2, v = 1.5 * vol;                                                   // the roll
    for (let i = 0; i < 7; i++) { const d = 0.8 + Math.random() * 0.9; this.burst(at, d, 650 + Math.random() * 450, 170, v, 'lowpass', 0.7, 0.1 + Math.random() * 0.16, W); at += d * (0.32 + Math.random() * 0.3); v *= 0.74; }
  }
  // A hound giving tongue: two short rough notes.
  bark() {
    if (!this.ctx || !this.on) return;
    for (const at of [0, 0.17]) {
      const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(190, t + 0.11);
      f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.15);
    }
    this.burst(0, 0.1, 2200, 700, 0.07, 'bandpass', 1.2, 0.005);
  }
  // A sheep's bleat: a reedy tone with a tremble in it.
  baa() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), l = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(430, t); o.frequency.linearRampToValueAtTime(350, t + 0.5);
    l.frequency.value = 23; lg.gain.value = 30; l.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.05); g.gain.setValueAtTime(0.1, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); l.start(t); o.stop(t + 0.66); l.stop(t + 0.66);
  }
  // An earthquake: a deep rumble that builds, shakes, and dies away, with loose stones rattling over it.
  quake(vol = 1) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain(), trem = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    s.buffer = this.noise; s.loop = true;
    for (const x of [f, f2]) { x.type = 'lowpass'; x.Q.value = 0.8; x.frequency.setValueAtTime(240, t); x.frequency.linearRampToValueAtTime(420, t + 1.0); x.frequency.exponentialRampToValueAtTime(130, t + 3.8); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.62 * vol, t + 0.9); g.gain.setValueAtTime(0.62 * vol, t + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.0);
    lfo.type = 'triangle'; lfo.frequency.setValueAtTime(13, t); lfo.frequency.linearRampToValueAtTime(7, t + 3.8); lg.gain.value = 0.4; trem.gain.value = 0.6;
    lfo.connect(lg); lg.connect(trem.gain);
    s.connect(f); f.connect(f2); f2.connect(trem); trem.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 4.2); lfo.start(t); lfo.stop(t + 4.2);
    for (let i = 0; i < 16; i++) this.burst(0.3 + Math.random() * 2.8, 0.05 + Math.random() * 0.07, 1500 + Math.random() * 2200, 600, 0.03 + 0.1 * vol * Math.random(), 'bandpass', 2.5, 0.003);
  }
  blip(kind) {
    if (kind === 'next') this.tone(520, 0.07, 'triangle', 0.05);
    else if (kind === 'pick') this.tone(660, 0.09, 'triangle', 0.07);
    else if (kind === 'good') { this.pluck(392, 0.5); setTimeout(() => this.pluck(523, 0.6), 110); setTimeout(() => this.pluck(659, 0.8), 230); }
    else if (kind === 'bad') this.tone(170, 0.28, 'sawtooth', 0.06, -60);
    else if (kind === 'card') { this.pluck(587, 0.5); setTimeout(() => this.pluck(784, 0.7), 120); }
    else if (kind === 'ring') { this.tone(1320, 0.5, 'sine', 0.07); this.tone(1980, 0.7, 'sine', 0.04); }
    else if (kind === 'pebble') this.tone(240, 0.12, 'square', 0.06, -120);
    else if (kind === 'quake') this.quake();
    else if (kind === 'thunder') this.thunder();
  }
  // A plucked string (Karplus-Strong), used for the lyre.
  pluck(freq, dur = 0.9, vol = 0.22) {
    if (!this.ctx || !this.on) return;
    const sr = this.ctx.sampleRate, n = Math.floor(sr * dur), buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    for (let i = 0; i < n; i++) { const k = i % period, nx = (k + 1) % period; ring[k] = (ring[k] + ring[nx]) * 0.4975; d[i] = ring[k]; }
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); src.buffer = buf; g.gain.value = vol; src.connect(g); g.connect(this.master); src.start();
  }
  // A short modal phrase on the lyre.
  phrase(notes, gap = 260) { notes.forEach((f, i) => setTimeout(() => this.pluck(f, 1.1), i * gap)); }
  step(surface) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = surface === 'stone' ? 1500 : surface === 'cave' ? 700 : 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(surface === 'cave' ? 0.16 : 0.09, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random() * 1.5, 0.13);
  }
}
