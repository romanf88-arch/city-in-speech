// Background music: quiet, sparse, made in the browser, no audio files.
//
// It follows the rules Socrates and Glaucon agree on in Book 3 (Reeve's translation, 398e-399e, pp. 81-82):
// the soft Ionian and Lydian harmonies go, and the Dorian and Phrygian stay; the city keeps no harps or other
// many-stringed instruments, and no aulos; it keeps the lyre and the kithara, and in the countryside "a sort of
// pipe for the herdsman". So:
//   in the town     a lyre, Dorian by day, Phrygian at night; now and then the kithara sounds a fourth or fifth
//   in the fields   a herdsman's pipe, Phrygian
//   in Lydia        (Glaucon's story of Gyges) a harp in the Lydian mode, the kind of music the city sends away
//   in the cave     nothing
// Rhythms are plain feet (long-short-short, short-long, long-long), which fits 400a-c, where Socrates wants
// simple rhythms and leaves the details to Damon.
// The modes are the ancient octave species, not the later church modes that took their names: Dorian is
// E-F-G-A-B-C-D-E, Phrygian D-E-F-G-A-B-C-D, Lydian C-D-E-F-G-A-B-C, tuned by Pythagorean ratios
// (whole tone 9:8, the small semitone 256:243).
const R = {
  dorian: [1, 256 / 243, 32 / 27, 4 / 3, 3 / 2, 128 / 81, 16 / 9],
  phrygian: [1, 9 / 8, 32 / 27, 4 / 3, 3 / 2, 27 / 16, 16 / 9],
  lydian: [1, 9 / 8, 81 / 64, 4 / 3, 3 / 2, 27 / 16, 243 / 128],
};
// Two octaves of a mode from a base frequency, as a list of pitches (index 0 the lowest).
const scale = (mode, base) => { const out = []; for (let o = 0; o < 2; o++) for (const r of R[mode]) out.push(base * r * (1 << o)); out.push(base * 4); return out; };
// Feet, in beats: dactyl, spondee, iamb, trochee.
const FEET = [[2, 1, 1], [2, 2], [1, 2], [2, 1]];
const VOICES = {
  lyre:  { mode: 'dorian', base: 164.81, beat: 0.42, homes: [0, 3, 7, 10], vol: 1.0 },      // E3; mese A
  night: { mode: 'phrygian', base: 146.83, beat: 0.6, homes: [0, 3, 7], vol: 0.8 },         // D3, slower and lower
  pipe:  { mode: 'phrygian', base: 293.66, beat: 0.36, homes: [0, 4, 7], vol: 0.55 },       // D4
  harp:  { mode: 'lydian', base: 261.63, beat: 0.3, homes: [0, 4, 7, 11], vol: 0.75 },      // C4
};

export class Music {
  constructor(audio) {
    this.a = audio; this.on = true; this.vol = 1; this.voice = null; this.next = 0; this.cache = new Map(); this.level = 0.16; this.duck = 1;
    this.rng = (() => { let s = 99173; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  }
  setup() {
    const ctx = this.a.ctx; if (!ctx || this.bus) return !!this.bus;
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    // A small stone courtyard: a short reverb built from decaying noise.
    const len = Math.floor(ctx.sampleRate * 1.7), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (this.rng() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 200 ? i / 200 : 1); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    // The body of the instrument: a little warmth low down, the top softened.
    this.body = ctx.createBiquadFilter(); this.body.type = 'peaking'; this.body.frequency.value = 260; this.body.gain.value = 4; this.body.Q.value = 0.9;
    const top = ctx.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 3600;
    this.body.connect(top); top.connect(this.bus); top.connect(this.verb); this.verb.connect(wet); wet.connect(this.bus);
    // Music has its own volume (the Music slider, volume.js) and goes straight out, so turning Sound down leaves it.
    // (Until 2026-11-19 it went through the sound's master, so "Sound off" silenced the music too.)
    this.out = ctx.createGain(); this.out.gain.value = 0.8 * this.vol * this.vol;
    this.bus.connect(this.out); this.out.connect(ctx.destination);
    return true;
  }
  setVolume(v) { this.vol = Math.min(1, Math.max(0, v)); this.on = this.vol > 0; if (this.out) this.out.gain.setTargetAtTime(0.8 * this.vol * this.vol, this.a.ctx.currentTime, 0.05); }
  setOn(on) { this.setVolume(on ? 1 : 0); }

  // Called every frame. where: 'town' | 'fields' | 'lydia' | 'cave'; night: boolean; quiet: 0..1 (1 silences).
  update(where, night, quiet) {
    if (!this.a.ctx || !this.setup()) return;
    const ctx = this.a.ctx, t = ctx.currentTime;
    const want = !this.on || where === 'cave' ? null : where === 'fields' ? (night ? null : 'pipe') : where === 'lydia' ? 'harp' : night ? 'night' : 'lyre';
    const level = want ? this.level * VOICES[want].vol * (1 - 0.65 * quiet) : 0;
    this.bus.gain.setTargetAtTime(level, t, want === this.voice ? 0.6 : 1.5);
    if (want !== this.voice) { this.voice = want; this.next = Math.max(this.next, t + 2.5); }
    if (!want || t < this.next) return;
    this.next = t + this.phrase(want, t + 0.05) + 3.5 + this.rng() * 6 + (this.rng() < 0.18 ? 14 + this.rng() * 16 : 0);
  }

  // One phrase: mostly steps, a leap now and then, ending on a resting note of the mode. Returns its length.
  phrase(name, t0) {
    const V = VOICES[name], sc = scale(V.mode, V.base), rng = this.rng, homes = V.homes;
    let i = homes[1 + Math.floor(rng() * (homes.length - 1))] + Math.floor(rng() * 3) - 1;
    const n = 4 + Math.floor(rng() * 4), beats = [];
    while (beats.length < n) beats.push(...FEET[Math.floor(rng() * FEET.length)]);
    beats.length = n; beats[n - 1] = Math.max(beats[n - 1], 2) * 1.6;
    let t = t0;
    // Sometimes the kithara sounds a fourth or a fifth under the start of the phrase.
    if ((name === 'lyre' || name === 'night') && rng() < 0.35) { const low = Math.max(0, i - (rng() < 0.5 ? 3 : 4)); this.pluck(sc[low], t, 0.5, 2.6); this.pluck(sc[i], t + 0.03, 0.42, 2.4); }
    for (let k = 0; k < n; k++) {
      const dur = beats[k] * V.beat;
      if (name === 'pipe') this.pipe(sc[i], t, dur * 0.95, k === n - 1);
      else this.pluck(sc[i], t, k === 0 ? 0.85 : 0.7, name === 'harp' ? 3.2 : 2.4, name === 'harp');
      t += dur;
      if (k === n - 2) { // the last note is the nearest resting note of the mode
        let best = homes[0]; for (const h of homes) if (Math.abs(h - i) < Math.abs(best - i)) best = h;
        i = best;
      } else {
        const r = rng();
        i += r < 0.36 ? 1 : r < 0.72 ? -1 : r < 0.8 ? 0 : r < 0.9 ? (rng() < 0.5 ? 3 : -3) : (rng() < 0.5 ? 2 : -2);
      }
      i = Math.max(0, Math.min(sc.length - 1, i));
    }
    return t - t0;
  }

  // A plucked string (Karplus-Strong), the buffer made once per pitch.
  pluck(freq, t, vol, len, bright = false) {
    const ctx = this.a.ctx, key = Math.round(freq * 10) + (bright ? 'b' : '');
    let buf = this.cache.get(key);
    if (!buf) {
      // The loop is a whole number of samples long and its averaging takes off half a sample, so the buffer gets its own
      // sample rate, (period - 0.5) times the pitch, which keeps the Pythagorean tuning exact.
      const period = Math.max(2, Math.round(ctx.sampleRate / freq)), sr = (period - 0.5) * freq, n = Math.floor(sr * len), d = new Float32Array(n), ring = new Float32Array(period);
      let prev = 0; for (let k = 0; k < period; k++) { const w = this.rng() * 2 - 1; prev = bright ? w : prev * 0.55 + w * 0.45; ring[k] = prev; }   // softer pluck for the lyre
      const keep = bright ? 0.4992 : 0.4986;
      for (let k = 0; k < n; k++) { const a = k % period, b = (a + 1) % period; ring[a] = (ring[a] + ring[b]) * keep; d[k] = ring[a]; }
      buf = ctx.createBuffer(1, n, sr); buf.copyToChannel(d, 0); this.cache.set(key, buf);
    }
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; g.gain.value = vol;
    src.connect(g); g.connect(this.body); src.start(t);
  }

  // A herdsman's pipe: a soft, breathy tone with a slow waver.
  pipe(freq, t, dur, last) {
    const ctx = this.a.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = freq; o2.frequency.value = freq * 2; g2.gain.value = 0.08;
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.6; vg.gain.value = freq * 0.006; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const br = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); br.buffer = this.a.noise; bf.type = 'bandpass'; bf.frequency.value = freq * 2; bf.Q.value = 6; bg.gain.value = 0.05;
    const end = t + dur + (last ? 0.6 : 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.09); g.gain.setValueAtTime(0.5, Math.max(t + 0.1, end - 0.25)); g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g); o2.connect(g2); g2.connect(g); br.connect(bf); bf.connect(bg); bg.connect(g); g.connect(this.bus); g.connect(this.verb);
    for (const s of [o, o2, vib]) { s.start(t); s.stop(end + 0.05); }
    br.start(t, this.rng() * 1.5, dur + 0.7);
  }
}
