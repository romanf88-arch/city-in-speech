// The stranger's errand, part 4: Glaucon is outside the north gate with his hounds, and one of them has slipped her
// leash. The player takes another hound and follows it to her. Then Glaucon tells his part (the ring nights), and
// afterwards which road Bion took.
//
// From the texts:
//   Republic 459a, tr. Shorey: "Glaucon. I see that you have in your house hunting-dogs and a number of pedigree
//       cocks", and he breeds "from the best".
//   Xenophon, On Hunting, tr. Marchant (research/ancient/xenophon-hunting-4-7.txt):
//       4.3  hounds on a trail "hold their heads well down and aslant ... lowering their ears", go forward
//            "circling frequently ... and tails wagging";
//       4.4  close to the hare they "let the huntsman know, quickening the pace";
//       4.5  "giving tongue and barking freely"; "frequently casting about";
//       6.15 tracks are "interlaced or circular, straight or crooked, close or scattered, clear or obscure";
//       7.5  "Give the hounds short names": Phylax and Horme are two on his list.
// Invented: that a hound was lost and that a stranger went after her, the path she took, the dead fire by the thorn
// bush, and everything Glaucon says about the man with the sack. Xenophon writes about hounds after a hare; the game
// has one hound following another.
import * as THREE from 'three';
import { Animal } from './animals.js';

const HOME = { x: 14, z: -98 };          // where Glaucon stands, outside the north gate, east of the road
// The trail: x, z, and how near the player must be before the hound has the scent of that stretch.
// Each stretch but the fourth can be smelled from farther off than it is long, so the hound keeps the scent from one
// to the next. The fourth is the broken one: 19 m on from the third, with scent only from 10 m.
const TRAIL = [[30, -112, 28], [44, -128, 27], [24, -140, 29], [8, -150, 10], [-6, -164, 25]];
const END = { x: TRAIL[4][0], z: TRAIL[4][1] };

export function setupHound(g, api) {
  if (!g.errand) return;
  const w = g.world, dist = (a, x, z) => Math.hypot(a.x - x, a.z - z), yAt = (x, z) => w.standY(x, z);
  // the thorn bush where she is caught, and the dead fire beside it
  g.kit.spawn('bush_b', END.x + 0.9, END.z - 0.4, 0.4);
  const ash = new THREE.MeshLambertMaterial({ color: 0x2a2622 }), stone = new THREE.MeshLambertMaterial({ color: 0x6f675c });
  const fire = new THREE.Group();
  { const bed = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), ash); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.02; fire.add(bed);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + 0.03 * (i % 3), 0), stone); s.position.set(Math.cos(a) * 0.5, 0.07, Math.sin(a) * 0.5); s.castShadow = true; fire.add(s); } }
  fire.position.set(END.x - 1.6, yAt(END.x - 1.6, END.z + 1.1), END.z + 1.1); w.group.add(fire);

  let phylax = null, horme = null, state = 0, k = 0, barkT = 0, castA = 0, castT = 0, anchor = null, lock = 0, broke = false, castTold = false;
  function build() {
    if (phylax) return;
    phylax = new Animal('dog', 311); horme = new Animal('dog', 317);
    for (const d of [phylax, horme]) { w.group.add(d.group); d.state = 'sit'; }
  }
  const sit = (d, x, z, h) => { d.state = 'sit'; d.speed = 0; d.place(x, z, h, yAt(x, z)); for (let i = 0; i < 10; i++) d.update(0.1); };
  function move(d, tx, tz, dt, vmax = 5.2) {
    const dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz), v = Math.min(dd * 3, vmax);
    if (dd > 0.05) { d.x += dx / dd * v * dt; d.z += dz / dd * v * dt; d.heading = Math.atan2(dx, dz); }
    d.speed = v; d.state = v > 0.25 ? 'walk' : 'idle'; d.place(d.x, d.z, d.heading, yAt(d.x, d.z)); d.update(dt);
  }
  // Glaucon and his hounds go out through the north gate once Thrasymachus has had his say.
  g.errand.glauconSpot = HOME;
  g.errand.placeGlaucon = () => {
    if (!g.flags.book1) return;
    build();
    const gl = g.npc('glaucon'); gl.put(HOME.x, HOME.z, Math.PI, 'stand');
    if (state === 0 || state === 3) { sit(phylax, HOME.x + 1.1, HOME.z + 0.5, Math.PI); if (g.flags.hound) sit(horme, HOME.x - 1.0, HOME.z + 0.6, Math.PI); else sit(horme, END.x, END.z, 2.2); }
  };

  g.tickers.push((dt) => {
    if (!phylax || g.space !== 'world' || (state !== 1 && state !== 2)) return;
    const p = g.player;
    if (state === 2) {   // both hounds come home at the player's heels
      move(phylax, p.x - Math.sin(p.heading - 0.6) * 1.3, p.z - Math.cos(p.heading - 0.6) * 1.3, dt);
      move(horme, p.x - Math.sin(p.heading + 0.6) * 1.5, p.z - Math.cos(p.heading + 0.6) * 1.5, dt);
      return;
    }
    if (g.busy) { phylax.update(dt); return; }
    const n = TRAIL[Math.min(k, TRAIL.length - 1)], d = dist(p, n[0], n[1]);
    if (d < 3.4 && k < TRAIL.length - 1) {
      k++; lock = 0; castT = 0; anchor = null; g.audio.bark();
      if (k === 3 && !broke) { broke = true; g.run(async (gg) => { await gg.say('', 'Phylax stops, lifts his head, and begins to circle. The trail is broken here.'); }); }
      return;
    }
    // The longer he casts about, the farther off he picks the scent up again, so nobody is left walking in circles
    // (in the first test the player's ring was too tight to find the broken stretch).
    // Once he has it again he keeps it for that stretch, unless the player drags him well away from it.
    if (!lock && d < n[2] + Math.max(0, castT - 10) * 1.3) lock = d + 12;
    if (lock && d > lock) lock = 0;
    if (lock) {      // he has the scent: he pulls toward it, and gives tongue more often as he gets near
      move(phylax, p.x + (n[0] - p.x) / d * 1.8, p.z + (n[1] - p.z) / d * 1.8, dt);
      barkT -= dt; if (barkT <= 0) { g.audio.bark(); barkT = 1.1 + d * 0.2; }
      castA = 0; castT = 0; anchor = null;
    } else {             // no scent: he casts about in a ring round the player
      // He circles the place where he lost it, as far as the leash lets him; if the player walks off, he circles the player.
      if (!anchor) anchor = { x: p.x, z: p.z };
      const c = Math.hypot(p.x - anchor.x, p.z - anchor.z) < 5 ? anchor : p;
      castA += dt * 1.7; castT += dt; move(phylax, c.x + Math.sin(castA) * 2.3, c.z + Math.cos(castA) * 2.3, dt);
      if (!castTold && k > 0) { castTold = true; g.ui.hint('Phylax is circling. He has lost the scent.'); setTimeout(() => g.ui.hint(null), 6000); }
    }
  });

  g.addSpot({ x: END.x, z: END.z, r: 2.6, label: 'Free the hound', when: () => state === 1, run: async (gg) => {
    await gg.say('', 'Horme is lying under a thorn bush with her leash wound twice round a branch. She thumps her tail when she sees Phylax. You work the leash free.');
    await gg.say('', 'Beside the bush is a ring of blackened stones. Somebody has slept here, and not long ago.');
    gg.flags.campSeen = true; state = 2; gg.audio.bark();
    gg.objective('Take the hounds back to Glaucon, outside the north gate', { x: HOME.x, z: HOME.z, label: 'Glaucon' });
  } });

  // Returns true when the hound is home and Glaucon is ready to tell his part.
  g.errand.hound = async (gg) => {
    const f = gg.flags; build();
    if (state === 0) {
      await gg.lines([
        ['glaucon', 'Good, you came. Before anything else: one of my hounds has slipped her leash. Horme. She has the best nose I own.', 'sad'],
        ['glaucon', 'I can’t leave the others. Take Phylax. Keep him on the leash, watch his head and his tail, and go where he pulls.'],
        ['glaucon', 'If he starts to circle, the trail is broken. Walk a wide ring until he pulls again.'],
        ['glaucon', 'Bring her back, and you can have what I said to Socrates last night, and the road your man took.', 'happy']]);
      state = 1; k = 0; barkT = 0; castT = 0; anchor = null; lock = 0; broke = false; castTold = false; sit(horme, END.x, END.z, 2.2);
      gg.objective('Follow the hound.', null);
      return false;
    }
    if (state === 1) { await gg.say('glaucon', 'Go where Phylax pulls. If he circles, walk a wide ring until he has it again.'); return false; }
    if (state === 2) {
      if (dist(gg.player, HOME.x, HOME.z) > 9) return false;
      state = 3; f.hound = true; sit(phylax, HOME.x + 1.1, HOME.z + 0.5, Math.PI); sit(horme, HOME.x - 1.0, HOME.z + 0.6, Math.PI);
      await gg.say('glaucon', 'Horme! Where was she?', { mood: 'happy' });
      await gg.say('', 'You tell him: on the hill road, caught by her leash in a thorn bush, next to a dead fire.');
      await gg.lines([
        ['glaucon', 'A fire. Hm.', 'think'],
        ['glaucon', 'I breed from her. I would not have lost her for a talent. Now, what I promised you.', 'happy']]);
      api.note(gg, 'The lost hound'); api.refreshObjective(gg);
      return true;
    }
    return true;
  };

  // The fourth lead, after the story of the ring.
  g.errand.roadLead = async (gg) => {
    const f = gg.flags; if (f.errand0 == null) return;
    await gg.lines([
      ['glaucon', 'Now the man with the sack. I was coming in late with the dogs, and he was going out.'],
      ['glaucon', (f.campSeen ? 'That fire you found by the thorn bush would be his. ' : '') + 'He took the hill road, north, the one that goes up past the cave. He carried no torch.'],
      ['glaucon', 'I thought: there goes a man who does not want to be seen. And I had spent that whole night arguing that nobody does right unless he is seen. So I looked the other way.', 'think'],
      ['glaucon', 'There are people up by the cave who want nothing to do with the harbor. Ask there.']]);
    f.lead4 = true; api.note(gg, 'Bion: the road he took');
  };
}
