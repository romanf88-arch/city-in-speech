// People at work around the town and the fields: where each small scene stands, and when it is drawn and animated.
// The scenes themselves (people, animals, props, motion) are made in vignettes.js.
import { makeVignette } from './vignettes.js';

const PI = Math.PI, E = PI / 2, W = -PI / 2, N = PI, S = 0;   // which way a scene faces (its local +z)

// [name, x, z, facing, options]. A path is given in the scene's own coordinates: x to its left-right, z in front of it.
const PLACES = [
  // ---- the harbor
  ['porters', -57.5, 60, N, { path: [[0, 0], [-1.5, 10], [-7, 22]] }],
  // ---- where the player lands (layout.js, the ship at the middle of the quay): the cargo coming off, children,
  // gulls over the mast, and buyers at the two stalls at the mouth of the main street
  ['porters', 7.4, 56.4, N, { path: [[0, 0], [-3, 4.5], [-9.5, 9.5]] }],
  ['gulls', 2, 73, 1],
  ['children_chasing', -17, 45.6, 0],
  ['stall_seller', -8.4, 36.6, E],
  ['shoppers', -4.2, 36.6, W],
  ['stall_seller', 8.8, 37.2, W],
  ['shoppers', 4.6, 37.2, E],
  ['net_menders', 71, 47.5, S],
  ['fishmonger', 24, 50.5, N],
  ['shipwright', 86, 47, W],
  ['drinkers', -21, 36.6, S],
  ['dozer', 57, 35.4, S],
  ['dog', 8, 45, 0.6],
  ['gulls', -20, 78, 0],
  ['gulls', 55, 92, 2],
  ['porters', 57.5, 60, N, { path: [[0, 0], [1.5, 10], [7, 22]] }],
  ['net_menders', -82, 48, S],
  ['fishmonger', -12, 50.5, N],
  ['cook', -9.5, 42, S],
  ['musicians', 41, 46.5, N],
  ['children_chasing', 62, 44.5, 0],
  ['donkey_driver', -40, 39.5, E, { path: [[0, 0], [0, 70]] }],
  // ---- the market square
  ['shoppers', -15, 7.9, S],
  ['shoppers', 14, 7.9, S],
  ['griller', 8.5, 11.6, N],
  ['moneychanger', -27.8, 7.6, E],
  ['barber', -27.8, -17, E],
  ['well_drawers', -15, -12, 0.3],
  ['washers', -9, -18.5, N],
  ['knucklebones', 17, -17.5, 0.8],
  ['children_chasing', -3, -3, 0],
  ['musicians', 29.5, 2.5, W],
  ['worshippers', 34.5, -6, E],
  ['cook', -21, 7.5, E],
  ['stonemason', 52, 4.5, N],
  ['dog', -6, -14, 2.2],
  ['shoppers', -8.5, 8.3, S],
  ['stall_seller', 24.6, -16, W],
  ['shoppers', 20.4, -16, E],
  ['drinkers', 31, 12.6, N],
  ['spinners', -19, -16.5, E],
  ['worshippers', 29.6, -7.2, E],
  ['knucklebones', -70, 23.5, 2],
  // ---- the streets and houses
  ['donkey_driver', -88, 20, E, { path: [[0, 0], [0, 76]] }],
  ['spinners', -24, 24.2, N],
  ['weaver', -57, 3, W],
  ['miller', -65.5, -12, E],
  ['potter', 66.8, -4, W],
  ['smithy', 57.2, -27, E],
  ['baker', 30, -41.6, N],
  ['chicken_yard', -62, -31, S],
  ['dozer', -43, -33.2, N],
  // ---- the fields north of the wall
  ['gardener', 24, -98, N],
  ['reapers', 50, -101, N],
  ['thresher', 80, -105, 0],
  ['milker', -36, -101, S],
  ['goatherd', -52, -100, N, { path: [[0, 0], [-10, 14], [-26, 20], [-12, 6]] }],
  ['donkey_driver', 2.2, -86, N, { path: [[0, 0], [0, 22], [6, 50]] }],
];

// What Mika says the first time the player walks up to each kind of scene.
const REMARKS = {
  smithy: 'That’s a bronze-smith. A lot of the tools and armor in town come out of workshops like his.',
  potter: 'Athens sells its pots all over the sea. The best ones are painted with stories.',
  weaver: 'Nearly every house has a loom like that. The stones at the bottom keep the threads tight.',
  spinners: 'They’re spinning wool into thread. You see women doing it everywhere, even while they walk.',
  miller: 'She’s grinding barley for today’s bread. It takes hours, and it has to be done every day.',
  baker: 'Fresh loaves. The oven is clay, and it’s been hot since before dawn.',
  cook: 'Lentil soup, by the smell. Most people here eat barley, beans, olives, and fish. Meat is for festivals.',
  griller: 'Festival food. After a sacrifice the meat is shared out, so there is plenty this week.',
  gardener: 'Onions, garlic, and greens. The plots just outside the wall feed half the town.',
  reapers: 'It’s harvest time. The barley comes in at the start of summer.',
  thresher: 'They’re threshing. The donkey walks over the cut barley to shake the grain loose.',
  milker: 'Goat’s milk, for cheese. Hardly anyone here keeps cows.',
  chicken_yard: 'Hens. People call them Persian birds, because that is where they first came from.',
  well_drawers: null,
  washers: 'Washing day. The clothes dry fast in this sun.',
  fishmonger: 'The fish came in this morning. If you want the good ones you have to be here early.',
  net_menders: 'They mend the nets every day. One tear and the whole catch swims off.',
  porters: 'Those jars hold wine and oil. A full one weighs as much as I do.',
  shipwright: 'Athens lives by its ships. Round the headland there are sheds for hundreds of warships.',
  stonemason: 'He’s cutting stone for the new shrine. Bendis is getting a proper home here.',
  moneychanger: 'Every city has its own coins, so the money-changers do well in a port like this.',
  barber: 'The barber’s is where you go to hear the news. Half of what I know about last night comes from there.',
  knucklebones: 'Knucklebones. They’re the ankle bones of a sheep. You toss them up and catch them on the back of your hand.',
  musicians: 'That pipe is called an aulos. You hear it at every festival and every party.',
  drinkers: 'The wine is mixed with water. Drinking it straight is for barbarians, people say.',
  worshippers: 'They’re praying. Here you pray standing up, with your hands raised.',
  goatherd: 'He takes the goats up the hill every morning and brings them back at dusk.',
  donkey_driver: 'Everything that can’t go by ship goes by donkey.',
};

// Flames for the scenes that have a fire: [width, height, how far below the top of the coals the flame starts, smoke, sparks].
const FIRE = { cook: [0.55, 0.5, 0.1, 1, 0.6], griller: [0.6, 0.26, 0.04, 1.3, 0.5], baker: [0.36, 0.32, 0.12, 0.8, 0.3], smithy: [0.55, 0.5, 0.08, 0.9, 1.6] };

export function setupLife(g) {
  const w = g.world, list = [], problems = [];
  PLACES.forEach(([name, x, z, rot, opts], i) => {
    const y0 = w.standY(x, z), cos = Math.cos(rot), sin = Math.sin(rot);
    const toWorld = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
    let v;
    try { v = makeVignette(name, 500 + i * 7, Object.assign({ heightAt: (lx, lz) => { const p = toWorld(lx, lz); return w.standY(p[0], p[1]) - y0; } }, opts || {})); }
    catch (e) { problems.push(name + ': ' + (e && e.message)); return; }
    if (!v) { problems.push(name + ': no such scene'); return; }
    v.group.position.set(x, y0, z); v.group.rotation.y = rot;
    w.group.add(v.group);
    for (const c of (v.colliders || [])) { const p = toWorld(c.x, c.z); w.addCircle(p[0], p[1], c.r, 2); }
    // Scenes with a hearth, a grill, an oven, or a forge get real flames over their coals.
    if (v.glow && g.fires && FIRE[name]) {
      v.glow.geometry.computeBoundingBox(); const b = v.glow.geometry.boundingBox, p = toWorld((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2), f = FIRE[name];
      g.fires.add(p[0], y0 + b.max.y - f[2], p[1], { w: f[0], h: f[1], smoke: f[3], sparks: f[4] });
    }
    // Note ground that is too steep or already occupied, so the placement can be corrected.
    const r = Math.min(v.radius || 2, 4), hs = [[r, 0], [-r, 0], [0, r], [0, -r]].map(([a, b]) => { const p = toWorld(a, b); return w.groundY(p[0], p[1]); });
    if (name !== 'gulls' && (!opts || !opts.path)) { if (Math.max(...hs) - Math.min(...hs) > 0.5) problems.push(name + ' at ' + x + ',' + z + ': ground uneven by ' + (Math.max(...hs) - Math.min(...hs)).toFixed(2)); }
    list.push({ v, x, z, name, near: false, shadows: null });
  });
  g.life = list; g.lifeProblems = problems;
  if (problems.length) console.warn('Scenes of people at work:', problems);
  const setShadows = (it, on) => { if (it.shadows === on) return; it.shadows = on; it.v.group.traverse((o) => { if (o.isMesh) o.castShadow = on; }); };
  let scan = 0, remarkWait = 6;
  g.tickers.push((dt) => {
    if (g.space !== 'world') return;
    const p = g.player; scan -= dt;
    if (scan <= 0) {
      scan = 0.4;
      for (const it of list) {
        const d = Math.hypot(it.x - p.x, it.z - p.z) - (it.v.radius || 2);
        it.v.group.visible = d < 150; it.near = d < 52; setShadows(it, d < 26); if (d < 40) for (const q of it.v.people) { const a = q.actor || q, m = a.group.matrixWorld.elements; a.setDistance(Math.hypot(m[12] - p.x, m[14] - p.z)); } else if (!it.farSet || it.v.group.visible) { it.farSet = true; for (const q of it.v.people) (q.actor || q).setDistance(99); }
      }
    }
    for (const it of list) if (it.near) it.v.update(dt);
    // Mika says what people are doing, once for each kind of work, and not too often.
    remarkWait -= dt;
    if (remarkWait <= 0 && g.flags.mikaWith && !g.busy && !g.frozen) {
      const said = g.flags.seenWork || (g.flags.seenWork = {}), m = g.npc('mika');
      for (const it of list) {
        const text = REMARKS[it.name]; if (!text || said[it.name] || !it.near) continue;
        if (Math.hypot(it.x - p.x, it.z - p.z) < Math.min(it.v.radius || 2, 4) + 4.5 && m && !m.hidden) {
          said[it.name] = 1; remarkWait = 14; g.ui.bubble('mika', 'Mika', text, 4.5 + text.length * 0.05);
          m.actor.speaking = true; setTimeout(() => { m.actor.speaking = false; }, 2800); break;
        }
      }
    }
  });
}
