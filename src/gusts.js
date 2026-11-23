// Gusts of wind (2026-11-19). Until today the gusts were only a sound (audio.js), and nothing moved when one blew.
// This clock now times them for everything: the sound follows it, and so do the dry leaves and dust on the paving
// (leaves.js) and the cloth over the stalls and lanes (places.js). It runs whether or not the sound is on.
// Each gust rises for 2 to 3.5 s, holds for up to 2 s, and dies away over 3 to 6 s, peaking at 55 to 100%. Then
// there is nothing for 20 to 60 s in the town's streets, or 10 to 35 s in the open, and less in a strong wind.
// The wind blows the way the clouds drift (west and a little south: world.js, Sky.update); each gust is turned
// from that by up to 25 degrees either way.
const BASE = Math.atan2(-0.938, -0.347);   // heading of the cloud drift (x, z)

export class Gusts {
  constructor(g) {
    this.g = g; this.t = 0; this.open = 0; this.windK = 1;
    this.next = 6 + Math.random() * 10;       // the first gust comes soon after the start
    this.cur = null; this.v = 0; this.dx = Math.sin(BASE); this.dz = Math.cos(BASE);
    g.tickers.push((dt) => this.update(dt));
  }
  // Called by places.js twice a second: whether the player is in the open, and the sky's wind (1 is normal).
  place(open, windK) { this.open = open; this.windK = windK; }
  // How strong the gust is at time t (0 to 1). Rises and falls the way the sound's gain did when audio.js timed it.
  at(t) {
    const c = this.cur; if (!c || t < c.t0) return 0;
    const t1 = c.t0 + c.rise + c.hold;
    if (t <= t1) return c.peak * (1 - Math.exp(-(t - c.t0) * 3 / c.rise));
    return c.peak * (1 - Math.exp(-(c.rise + c.hold) * 3 / c.rise)) * Math.exp(-(t - t1) * 3 / c.fall);
  }
  update(dt) {
    this.t += Math.min(dt, 0.1);
    const t = this.t;
    if (t >= this.next) {
      const rise = 2 + Math.random() * 1.5, hold = Math.random() * 2, fall = 3 + Math.random() * 3, peak = 0.55 + Math.random() * 0.45;
      const a = BASE + (Math.random() - 0.5) * 0.87;
      this.cur = { t0: t, rise, hold, fall, peak, dx: Math.sin(a), dz: Math.cos(a) };
      const gap = this.open > 0.5 ? 10 + Math.random() * 25 : 20 + Math.random() * 40;
      this.next = t + rise + hold + fall + gap / Math.max(0.7, Math.min(2, this.windK));
    }
    this.v = this.at(t);
    if (this.cur) { this.dx = this.cur.dx; this.dz = this.cur.dz; }
    // The wind over the ground in m/s: a light air between gusts, 3 to 5 m/s at the height of one.
    this.speed = (0.5 + 4.2 * this.v) * Math.max(0.5, Math.min(1.6, this.windK));
  }
}
