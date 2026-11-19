// The people of the harbor and the order of events. The game is set the day after the conversation,
// which is how the Republic itself is told ("I went down yesterday to the Piraeus").
import * as THREE from 'three';
import { $, clamp } from './util.js';
import { CARDS, CARD_BY_ID } from './cards.js';
import { READERS } from './content.js';
import { runDispute, renderJournal, showDebrief } from './dispute.js';
import { Cave } from './cave.js';
import { setupRing } from './story_ring.js';
import { setupPoetry } from './story_poetry.js';
import { setupCave } from './story_cave.js';
import { setupEnd } from './story_end.js';

const PI = Math.PI;
export const LOOKS = {
  socrates: { skin: 'tan', hair: 0x8a8378, hairStyle: 'bald', beard: 'full', robe: 0x8a765a, bare: true, shoes: false, build: 1.12, height: 0.97 },
  cephalus: { skin: 'pale', hair: 0xe6e2da, beard: 'long', robe: 0xefe9dc, robe2: 0xe3d9c2, hat: 'wreath', height: 0.95 },
  polemarchus: { skin: 'tan', hair: 0x2a221c, beard: 'short', robe: 0xe6dcc0, robe2: 0x8a3b2e, height: 1.02 },
  thrasymachus: { skin: 'olive', hair: 0x15110e, beard: 'full', robe: 0xe0c98a, robe2: 0xc27a2a, build: 1.2, height: 1.06, gesture: 1.6 },
  clitophon: { skin: 'tan', hair: 0x4a3a2a, robe: 0xd9d2bd, robe2: 0x6f7f6a },
  glaucon: { skin: 'tan', hair: 0x1f1813, beard: 'short', robe: 0xe6dcc0, robe2: 0x2f5f7a, height: 1.03 },
  adeimantus: { skin: 'tan', hair: 0x2a2018, beard: 'short', robe: 0xe6dcc0, robe2: 0x4d6a4a, height: 1.01 },
  dromon: { skin: 'dark', hair: 0x2a221c, beard: 'short', robe: 0x2f5f7a, length: 'short', hat: 'none', build: 1.12 },
  kleio: { skin: 'fair', hair: 0x3a2a1c, hairStyle: 'veil', robe: 0xe6dcc0, robe2: 0x8a3522, height: 0.94, build: 0.92 },
  sannion: { skin: 'olive', hair: 0x6a5a48, hairStyle: 'bald', beard: 'short', robe: 0xe3d5a8, robe2: 0xb98a2a, build: 1.08, gesture: 1.5 },
  archedemos: { skin: 'tan', hair: 0x3a3028, beard: 'short', robe: 0x4d7a69, length: 'short', hat: 'petasos' },
  phanias: { skin: 'pale', hair: 0x8a7a68, beard: 'full', robe: 0xe3d5a8, robe2: 0x6b4a32, height: 0.98 },
  theano: { skin: 'olive', hair: 0x2a1c14, hairStyle: 'veil', robe: 0xe9e2d0, robe2: 0x7a5a8a, height: 0.95, build: 0.92 },
  terpes: { skin: 'tan', hair: 0x1c1612, hairStyle: 'long', beard: 'full', robe: 0x7a2f2a, robe2: 0xd9a93c, hat: 'goldWreath', gesture: 1.8 },
  boy: { skin: 'tan', hair: 0x2a221c, robe: 0xc2b08a, length: 'short', height: 0.68, shoes: false },
};

// Ordinary people for the streets.
function crowdLook(i) {
  const robes = [0xe6dcc0, 0xd9c4a3, 0xcfc0a0, 0xe9e2d0, 0xbfae86], overs = [0x8a3b2e, 0x2f5f7a, 0x6f7f6a, 0xb98a2a, 0x6b4a32, 0x7a5a8a, null, null];
  const thracian = i % 4 === 0;
  return { skin: ['tan', 'olive', 'fair', 'dark', 'tan'][i % 5], hair: [0x2a221c, 0x4a3a2a, 0x15110e, 0x8a7a68][i % 4], hairStyle: i % 7 === 3 ? 'bald' : i % 5 === 2 ? 'veil' : 'full', beard: i % 5 === 2 ? 'none' : ['short', 'none', 'full'][i % 3],
    robe: thracian ? [0x8a3b2e, 0x2f5f7a, 0xb98a2a][i % 3] : robes[i % 5], robe2: thracian ? null : overs[i % 8], length: thracian || i % 6 === 1 ? 'short' : 'long', hat: thracian ? 'phrygian' : i % 9 === 5 ? 'petasos' : 'none', hatColor: [0xa33b2e, 0x2f5f7a, 0xd1a23a][i % 3], height: 0.94 + (i % 5) * 0.03, build: 0.94 + (i % 4) * 0.05 };
}

export const HOMES = {
  kleio: [-10.5, 6.6, PI], sannion: [-22.5, -17.2, 0.6], archedemos: [5, -93.5, 0], theano: [-12.2, -8.2, 2.2], dromon: [-56.6, 60.4, PI / 2], phanias: [23.6, 3.5, -PI / 2],
};

export async function setup(g) {
  const S = g.sites;
  g.cardsById = CARD_BY_ID;
  g.renderJournal = () => renderJournal(g);
  g.cave = new Cave(g); g.spaces.cave = g.cave.space;
  g.tickers.push((dt) => g.cave.update(dt));
  g.onSpace = (space) => {
    g.world.group.visible = space !== 'cave'; g.sea.mesh.visible = space !== 'cave'; g.cave.group.visible = space === 'cave';
    g.kit.zone('lydia').visible = space === 'lydia'; g.kit.zone('town').visible = space === 'world'; g.kit.zone('north').visible = space === 'world';
    g.ui.clearBubbles();
  };
  g.peopleNotes = [
    { id: 'socrates', name: 'Socrates', color: '#8a765a', about: 'The one everybody is arguing about. He talked all night at the house of Cephalus, and says he was only telling what seemed true to him.' },
    { id: 'glaucon', name: 'Glaucon', color: '#2f5f7a', about: 'A brave young Athenian, and Plato’s brother. He restarted the argument when Thrasymachus gave up, and told the story of the ring.' },
    { id: 'adeimantus', name: 'Adeimantus', color: '#4d6a4a', about: 'Glaucon’s brother. He pressed Socrates about what the poets teach, and went through Homer with him line by line.' },
    { id: 'cephalus', name: 'Cephalus', color: '#efe9dc', about: 'A rich old man from Syracuse who lives at the harbor. The talk began with him, and he left it early to see to a sacrifice.' },
    { id: 'polemarchus', name: 'Polemarchus', color: '#8a3b2e', about: 'Cephalus’ son and the host. He took over his father’s side of the argument.' },
    { id: 'thrasymachus', name: 'Thrasymachus', color: '#c27a2a', about: 'A teacher of speaking from Chalcedon who says that justice is whatever suits the stronger.' },
    { id: 'terpes', name: 'Terpes', color: '#7a2f2a', about: 'A rhapsode, a professional reciter of Homer, here for the festival. He is invented.' },
  ];

  // ---- the house: people who were there last night
  const C = { x: S.cephalus.x, z: S.cephalus.z }, seat = (deg, r = 2.2) => [C.x - 1.5 + Math.cos(deg * PI / 180) * r, C.z + Math.sin(deg * PI / 180) * r];
  const face = (p) => Math.atan2(C.x - 1.5 - p[0], C.z - p[1]);
  const sC = seat(180), sT = seat(238), sK = seat(128);
  for (const p of [sC, sT, sK]) g.kit.spawn('stool', p[0], p[1], 0, { noCollide: true });
  g.addNPC({ id: 'cephalus', name: 'Cephalus', role: 'the old master of the house', color: '#efe9dc', look: LOOKS.cephalus, x: sC[0], z: sC[1], h: face(sC), pose: 'sit', prop: 'staff', propHand: 'handL' });
  g.addNPC({ id: 'thrasymachus', name: 'Thrasymachus', role: 'teacher of speaking', color: '#c27a2a', look: LOOKS.thrasymachus, x: sT[0], z: sT[1], h: face(sT), pose: 'sit' });
  g.addNPC({ id: 'clitophon', name: 'Clitophon', role: 'a friend of Thrasymachus', look: LOOKS.clitophon, x: sK[0], z: sK[1], h: face(sK), pose: 'sit' });
  g.addNPC({ id: 'polemarchus', name: 'Polemarchus', role: 'the host', color: '#8a3b2e', look: LOOKS.polemarchus, x: C.x + 2.6, z: C.z + 1.8, h: PI / 2 });
  g.addNPC({ id: 'glaucon', name: 'Glaucon', role: 'brother of Plato', color: '#2f5f7a', look: LOOKS.glaucon, x: C.x - 0.6, z: C.z - 3.1, h: 0.3 });
  // ---- the readers
  const reader = (id, x, z, h, extra) => g.addNPC(Object.assign({ id, name: READERS[id].name, role: READERS[id].role, color: READERS[id].color, look: LOOKS[id], x, z, h }, extra || {}));
  reader('kleio', C.x + 0.8, C.z - 3.4, 0.1); reader('sannion', C.x + 2.4, C.z - 3.0, -0.3); reader('archedemos', C.x - 2.4, C.z - 3.3, 0.5, { prop: 'staff', propHand: 'handL' });
  reader('dromon', ...HOMES.dromon); reader('theano', ...HOMES.theano);
  const bk = S.bookstall.anchor('keeper'), bkOK = Math.hypot(bk.x - S.bookstall.x, bk.z - S.bookstall.z) > 0.3;
  if (bkOK) { HOMES.phanias[0] = bk.x; HOMES.phanias[1] = bk.z; }
  reader('phanias', ...HOMES.phanias, { prop: 'scroll' });
  // ---- the agora and the hill
  const sp = S.bema.anchor('speaker'), spOK = Math.abs(sp.y - S.bema.y) > 0.3;
  g.addNPC({ id: 'terpes', name: 'Terpes', role: 'rhapsode', color: '#7a2f2a', look: LOOKS.terpes, x: S.bema.x, z: S.bema.z, h: 0, prop: 'staff', propHand: 'handL', pose: 'staff' });
  g.addNPC({ id: 'adeimantus', name: 'Adeimantus', role: 'brother of Glaucon', color: '#4d6a4a', look: LOOKS.adeimantus, x: S.bema.x - 4.2, z: S.bema.z + 4.6, h: 2.2, prop: 'scroll' });
  const ex = S.exedra;
  g.addNPC({ id: 'socrates', name: 'Socrates', role: '', color: '#8a765a', look: LOOKS.socrates, x: ex.x, z: ex.z - 0.4, h: 0.25, pose: 'sit', y: null });
  g.addNPC({ id: 'listener1', name: 'A young man', look: crowdLook(11), x: ex.x - 2.2, z: ex.z + 3.4, h: 2.6, pose: 'ground' });
  g.addNPC({ id: 'listener2', name: 'A young man', look: crowdLook(13), x: ex.x + 2.4, z: ex.z + 3.0, h: -2.6, pose: 'ground' });
  g.addNPC({ id: 'boy', name: 'A slave boy', look: LOOKS.boy, x: -40, z: 44, h: 0, hidden: true });
  // pupils around Theano
  g.addNPC({ id: 'pupil1', name: 'A pupil', look: Object.assign(crowdLook(3), { height: 0.6, beard: 'none', hat: 'none' }), x: HOMES.theano[0] + 1.3, z: HOMES.theano[1] + 0.9, h: -2.2, pose: 'ground' });
  g.addNPC({ id: 'pupil2', name: 'A pupil', look: Object.assign(crowdLook(6), { height: 0.56, beard: 'none', hat: 'none', hairStyle: 'full' }), x: HOMES.theano[0] + 0.2, z: HOMES.theano[1] + 1.7, h: 3.0, pose: 'ground' });
  // gate guards and sailors
  g.addNPC({ id: 'guard1', name: 'Gate guard', look: { skin: 'tan', robe: 0x8a3b2e, length: 'short', hat: 'helmet', beard: 'short' }, x: -3.4, z: -76.4, h: 0, prop: 'spear', pose: 'guard' });
  g.addNPC({ id: 'guard2', name: 'Gate guard', look: { skin: 'olive', robe: 0x8a3b2e, length: 'short', hat: 'helmet' }, x: 3.4, z: -76.4, h: 0, prop: 'spear', pose: 'guard' });
  g.addNPC({ id: 'sailor1', name: 'Sailor', look: { skin: 'dark', robe: 0xcfc0a0, length: 'short', hair: 0x15110e, beard: 'short' }, x: -58.4, z: 62.3, h: -0.9 });
  g.addNPC({ id: 'sailor2', name: 'Sailor', look: { skin: 'tan', robe: 0x6f7f6a, length: 'short', hair: 0x4a3a2a, hairStyle: 'bald' }, x: -54.6, z: 62.0, h: -2.2, pose: 'ground' });
  // the festival crowd
  const spots = [[2, 46, 9], [-12, 42, 8], [18, 44, 8], [0, 26, 6], [-6, 4, 9], [8, 0, 9], [-14, -6, 7], [14, 6, 7], [2, -16, 6], [0, -34, 7], [-3, -58, 6], [30, 20, 8], [-34, 20, 8], [44, 46, 7], [-70, 46, 6], [24, -8, 5], [62, -10, 6], [-66, -46, 5]];
  spots.forEach(([x, z, r], i) => g.addNPC({ id: 'crowd' + i, name: i % 4 === 0 ? 'A Thracian' : 'A festival-goer', look: crowdLook(i + 2), x, z, h: i * 1.3, behavior: 'wander', radius: r, speed: 0.9 + (i % 3) * 0.15 }));
  [['stallA', 0], ['stallB', 4], ['stallC', 8]].forEach(([k, n]) => { const a = S[k].anchor('keeper'), ok = Math.hypot(a.x - S[k].x, a.z - S[k].z) > 0.3; g.addNPC({ id: 'keeper' + n, name: 'A stallkeeper', look: crowdLook(20 + n), x: ok ? a.x : S[k].x, z: ok ? a.z : S[k].z + 1.6, h: PI }); });

  // ---- talk in the streets
  g.chatter.push({ x: -56.5, z: 61.5, r: 11, members: ['dromon', 'sailor1', 'sailor2'], lines: [
    ['sailor1', 'They say he wants philosophers for kings.'], ['dromon', 'On my ship the crew can put me ashore at the next harbor. Ask him if his kings can be put ashore.'],
    ['sailor2', 'He told a story about a ship. The crew drug the owner and call the real navigator a stargazer.'], ['dromon', 'I am the one who watches the stars, and I still answer to the crew.'], ['sailor1', 'You answer to the owner, Dromon.'], ['dromon', 'Him too. That is my point.']] });
  g.chatter.push({ x: 2, z: 2, r: 12, members: ['crowd4', 'crowd5'], when: (gg) => gg.flags.book1, lines: [
    ['crowd4', 'A city with no poets. What would we do at a festival?'], ['crowd5', 'Sing hymns. He left us the hymns.'], ['crowd4', 'And women training naked with the men.'], ['crowd5', 'He said people would laugh. He was right about that part.']] });
  g.chatter.push({ x: HOMES.theano[0], z: HOMES.theano[1], r: 9, members: ['theano', 'pupil1', 'pupil2'], lines: [
    ['theano', 'Again. What did the freed man see first, when he came out?'], ['pupil1', 'The sun!'], ['theano', 'No. He could not bear it. Shadows first.'], ['pupil2', 'Then pictures in the water.'], ['theano', 'Good. Then the things themselves, then the night sky, and the sun last of all.']] });
  g.chatter.push({ x: 0, z: -78, r: 9, members: ['guard1', 'guard2'], lines: [['guard1', 'Guardians, he calls them. Bred like dogs, gentle to friends and fierce to strangers.'], ['guard2', 'No house, no gold, no wife of your own.'], ['guard1', 'I would take the pay we have.']] });

  // ---- episodes
  const api = { gather, meet, relocate, refreshObjective, giveCards };
  setupBook1(g, api); setupRing(g, api); setupPoetry(g, api); setupCave(g, api); setupEnd(g, api);

  // Readers can be asked who they are at any time.
  for (const id of Object.keys(READERS)) {
    const n = g.npc(id); if (n.talk) continue;
    n.talk = async (gg) => {
      const R = READERS[id];
      if (!gg.flags['met_' + id]) { meet(gg, id); await gg.say(id, { dromon: 'I am Dromon. I steer ships, and I have opinions about people who want to steer cities.', kleio: 'Kleio. I keep the accounts for a shipping house. I heard most of last night, and I have been checking it since.', sannion: 'Sannion. I write comedies, so I went for the jokes. There were more than you would think.', archedemos: 'Archedemos. I lay out ground for builders. They talked about founding a city last night, and I listened as a man who founds them.', phanias: 'Phanias. I sell books, in a town that mostly still learns by ear.', theano: 'Theano. I keep a school. I was not at the house, but I have read what the newest scholars make of it.' }[id]); }
      else await gg.say(id, { dromon: 'Come back when you have heard more. I will be easier to argue with.', kleio: 'I am still going through it step by step. Find me when people start disagreeing.', sannion: 'Watch what people do when they lose an argument. That is my whole method.', archedemos: 'I am waiting on the founders. When you have heard the ring, the poets, and the cave, come and find me where the stakes are.', phanias: 'Buy something, or ask me something.', theano: 'When you have been up the hill, come and tell me what you made of it.' }[id]);
    };
  }
}

function meet(g, id) { if (!g.flags['met_' + id]) { g.flags['met_' + id] = true; } }
function giveCards(g, ids) { for (const id of ids) g.giveCard(id); }

// Bring people to stand in an arc in front of the player.
async function gather(g, ids, quiet) {
  if (!quiet) await g.ui.fade(1, 0.35);
  const p = g.player, sp = g.spaces[g.space], n = ids.length;
  ids.forEach((id, i) => {
    const npc = g.npc(id); if (!npc) return;
    meet(g, id);
    for (let r = 3.4; r > 1.2; r -= 0.5) {
      const a = p.heading + (n > 1 ? (i / (n - 1) - 0.5) * 1.9 : 0), x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      if (sp.walkable(x, z) && !sp.solidAt(x, 1, z, 0.35)) { npc.space = g.space; npc.show(true); npc.put(x, z, Math.atan2(p.x - x, p.z - z), 'stand'); npc.behavior = 'idle'; break; }
    }
  });
  if (!quiet) await g.ui.fade(0, 0.35);
}

// Send a person to a new standing place once the player is not looking.
function relocate(g, id, x, z, h, space = 'world') {
  const npc = g.npc(id); if (!npc) return;
  npc.pending = { x, z, h, space };
}

export function refreshObjective(g) {
  const f = g.flags, S = g.sites;
  if (!f.intro) return;
  if (!f.book1) { g.objective(f.atHouse ? (f.ceph ? (f.pole ? 'Hear Thrasymachus out' : 'Ask Polemarchus what happened next') : 'Talk to Cephalus') : 'Go to the house of Cephalus', f.atHouse ? null : { x: S.cephalus.x + 10.5, z: S.cephalus.z, label: 'House of Cephalus' }); return; }
  const left = [];
  if (!f.ring) left.push(['Glaucon has a story about a ring (at the house)', { x: S.cephalus.x + 10.5, z: S.cephalus.z, label: 'Glaucon' }]);
  if (!f.poetry) left.push(['A rhapsode is reciting Homer in the agora', { x: S.bema.x, z: S.bema.z + 4, label: 'The rhapsode' }]);
  if (!f.cave) left.push(['Socrates is on the hill beyond the north gate', { x: S.exedra.x, z: S.exedra.z + 3, label: 'Socrates' }]);
  if (left.length) {
    const p = g.player; left.sort((a, b) => Math.hypot(a[1].x - p.x, a[1].z - p.z) - Math.hypot(b[1].x - p.x, b[1].z - p.z));
    g.objective(left.length === 3 ? 'Hear the rest of last night, in any order: the ring, the poets, the cave' : left.map((l) => l[0]).join('. '), left[0][1]);
  } else if (!f.city) g.objective('Find Archedemos where the new city is staked out, east of the north road', { x: S.citySite.x - 6, z: S.citySite.z + 6, label: 'The city site' });
  else g.objective('You have heard the first part. Walk where you like.', null);
  const done = (f.ring ? 1 : 0) + (f.poetry ? 1 : 0) + (f.cave ? 1 : 0);
  const want = f.city ? 'night' : done >= 2 ? 'dusk' : 'afternoon';
  if (g.space === 'world' && g.envName !== want && !g.busyEnv) g.env(want, 20);
}

export function begin(g, save) {
  const S = g.sites;
  g.tickers.push(() => {
    // People who were asked to move do so when the player is far away.
    for (const n of g.npcs.values()) if (n.pending && (n.space !== g.space || Math.hypot(n.x - g.player.x, n.z - g.player.z) > 34)) { const q = n.pending; n.pending = null; n.space = q.space; n.put(q.x, q.z, q.h, 'stand'); n.behavior = 'idle'; }
  });
  if (save) {
    g.flags = save.flags || {}; g.cards = save.cards || []; g.disputeState = save.disputes || {}; g.stats = Object.assign(g.stats, save.stats || {});
    for (const id in g.disputeState) g.disputeState[id].started = g.disputeState[id].started || false;
    // Put people where the saved story left them.
    if (g.flags.book1) for (const id of ['kleio', 'sannion', 'archedemos']) g.npc(id).put(...HOMES[id]);
    if (g.flags.cave) g.npc('archedemos').put(S.citySite.x - 5, S.citySite.z + 5, -2.2);
    for (const id of Object.keys(READERS)) if (g.flags['met_' + id] === undefined && g.disputeState) { /* unmet readers stay unmet */ }
    // A save made inside a story or the cave puts you back at a safe place nearby.
    let pos = save.pos || {};
    if (pos.space !== 'world' || g.flags.inStory) { pos = { x: S.cephalus.x + 12, z: S.cephalus.z, h: -PI / 2 }; g.flags.inStory = false; }
    g.teleport('world', pos.x, pos.z, pos.h);
    g.env('afternoon', 0); refreshObjective(g);
    g.ui.area('The Piraeus', 'The day after');
    return;
  }
  g.teleport('world', -60, 66, PI);
  g.env('afternoon', 0);
  g.ui.area('The Piraeus', 'The harbor of Athens, the day after the festival began');
  g.run(async () => {
    await g.wait(1.2);
    await g.say('', 'You have come down to the Piraeus, the harbor of Athens, a day late. The new festival for the goddess Bendis began yesterday.');
    meet(g, 'dromon');
    await g.say('dromon', 'You missed the best of it. Socrates was at the house of old Cephalus all night. Half the harbor is still arguing about what he said.');
    await g.say('dromon', 'They began with one question. Is it better to be just, or only to look it? By morning they had built a whole city out of talk.');
    const c = await g.choose(['What did he say?', 'Who is Socrates?']);
    if (c === 1) await g.say('dromon', 'An Athenian who asks people questions until they are sorry they answered. Barefoot, with a snub nose. You will know him.');
    await g.say('dromon', 'Ask five people what he meant and you will get five answers. I have my own. I will give it to you when you know enough to argue with me.');
    const boy = g.npc('boy'); boy.show(true); boy.put(g.player.x + 5, g.player.z - 9, 0);
    await boy.moveTo(g.player.x + 0.7, g.player.z + 0.8, 4.5);
    await g.say('boy', 'Polemarchus saw your ship come in. He says anyone who wants to hear about last night should come up to the house.');
    await g.say('', 'The boy has hold of your cloak from behind. Polemarchus stopped Socrates on the road the same way yesterday.');
    g.flags.intro = true; refreshObjective(g);
    boy.moveTo(-30, 36, 4).then(() => boy.show(false));
    g.ui.hint('W and S walk. A and D turn. Drag the mouse to look. Hold Shift to run. The gold marker and the arrow at the top left show where to go.');
    setTimeout(() => g.ui.hint(null), 9000);
  });
}

// ------------------------------------------------------------------ Book 1 at the house
function setupBook1(g, api) {
  const S = g.sites, C = { x: S.cephalus.x, z: S.cephalus.z };
  g.addTrigger({ x: C.x + 10.5, z: C.z, r: 3.2, once: true, when: (gg) => gg.flags.intro && !gg.flags.atHouse, run: async (gg) => {
    const pol = gg.npc('polemarchus'); pol.put(C.x + 10.4, C.z + 1.7, PI / 2);
    gg.flags.met_polemarchus = true;
    await gg.say('polemarchus', 'Come in. Yesterday I caught Socrates on the road home and told him he could stay, or prove himself stronger than all of us.');
    await gg.say('polemarchus', 'He said there was a third way. He could persuade us to let him go. I asked how he would persuade men who will not listen.');
    gg.giveCard('persuade');
    await gg.say('polemarchus', 'He stayed. My father is in the courtyard, back from his sacrifice. Start with him. Socrates did.');
    gg.flags.atHouse = true; api.refreshObjective(gg);
    pol.moveTo(C.x + 2.6, C.z + 1.8, 1.6, -PI / 2);
  } });

  g.npc('cephalus').talk = async (gg) => {
    if (gg.flags.ceph) { await gg.say('cephalus', 'I have said my part. At my age a man is glad to leave the rest to his heirs.'); return; }
    if (!gg.flags.atHouse) gg.flags.atHouse = true;
    gg.flags.met_cephalus = true;
    await gg.say('cephalus', 'Sit, stranger. At my age the pleasures of the body wither and the wish for talk grows. I told Socrates so yesterday.');
    await gg.say('cephalus', 'He asked what my money had been good for. I said that a man with enough need never cheat or lie, and can die owing nothing to any god or man. That lets him sleep.');
    gg.giveCard('cephalus');
    await gg.say('cephalus', 'Then he asked whether that is what justice is: tell the truth, and give back what you have taken. I said it would do.');
    await gg.say('cephalus', 'He put one case to me and I had no answer. See whether you can guess the case.');
    for (;;) {
      const c = await gg.choose(['A friend lends you his weapons. Later he goes mad and asks for them back.', 'A merchant charges you double, and you pay it.', 'You owe a man money and cannot pay.'], { prompt: 'Which case shows that giving back what you owe is not always just?', name: 'Cephalus' });
      gg.log.push({ t: 'attempt', skill: 'counterexample', correct: c === 0 });
      if (c === 0) break;
      await gg.say('cephalus', c === 1 ? 'No. There the merchant is the cheat. I pay what I agreed, and that is still just. Socrates wanted a case where giving back what you owe is the wrong thing to do.' : 'No. That is a man failing to do what my rule says. Socrates wanted a case where a man does exactly what the rule says, and it is wrong.');
    }
    await gg.say('cephalus', 'That is the one. Nobody would call it just to hand a madman his sword, or to tell him the whole truth. So my rule cannot be what justice is.');
    gg.giveCard('madman');
    await gg.say('cephalus', 'I laughed, left the argument to my son, and went to see to the sacrifice.');
    gg.flags.ceph = true; api.refreshObjective(gg);
  };

  g.npc('polemarchus').talk = async (gg) => {
    if (!gg.flags.ceph) { await gg.say('polemarchus', 'Talk to my father first. It began with him.'); return; }
    if (gg.flags.pole) { await gg.say('polemarchus', gg.flags.book1 ? 'I still think it is never just to harm anyone. I have not found the hole in it.' : 'Thrasymachus is the one who would not agree. Ask him.'); return; }
    await gg.say('polemarchus', 'I am heir to his argument as well as his money. And I had a poet on my side. Simonides says justice is giving each man what he is owed.');
    await gg.say('polemarchus', 'What is owed is good to your friends and harm to your enemies. Every Greek boy knows that much.');
    await gg.say('polemarchus', 'Socrates asked me two things I could not get past. Guess the first.');
    for (;;) {
      const c = await gg.choose(['Are you ever wrong about who your friends are?', 'What if your enemy is stronger than you?', 'Is a just man good at keeping money safe?'], { prompt: 'Which question troubles "help your friends and harm your enemies"?', name: 'Polemarchus' });
      gg.log.push({ t: 'attempt', skill: 'counterexample', correct: c === 0 });
      if (c === 0) break;
      await gg.say('polemarchus', c === 1 ? 'That is a soldier’s worry, and he did not raise it. He asked something about my friends.' : 'He did ask that, and concluded that a good guard is also a good thief. I did not think he was serious. The question that hurt was about my friends.');
    }
    await gg.say('polemarchus', 'Yes. And if I am wrong, then by my own rule I am helping bad men and harming good ones. I had to change it: help the friend who really is good.');
    gg.giveCard('friends');
    await gg.say('polemarchus', 'The second was worse. When you harm a horse, does it become a better horse or a worse one?');
    const h = await gg.choose(['A worse one.', 'A better one, if you train it hard.']);
    if (h === 1) await gg.say('polemarchus', 'Training is not harm. He meant real harm, the kind that damages.');
    await gg.say('polemarchus', 'And a man who is harmed becomes a worse man, which means a more unjust one. So a just man, by being just, would be making people unjust. He said that cannot be, and that it is never just to harm anyone.');
    gg.giveCard('harm');
    await gg.say('polemarchus', 'I agreed. Thrasymachus over there did not.');
    gg.flags.pole = true; api.refreshObjective(gg);
  };

  g.npc('clitophon').talk = async (gg) => { await gg.say('clitophon', gg.flags.book1 ? 'I offered him a way out and he would not take it. I still think it was a fair one.' : 'I spoke once last night. Ask Thrasymachus.'); };

  g.npc('thrasymachus').talk = async (gg) => {
    if (!gg.flags.pole) { await gg.say('thrasymachus', 'Hear the old man and his son first. Then come and hear someone who knows what he is talking about.'); return; }
    if (gg.flags.book1) { await gg.say('thrasymachus', 'I have nothing to add. Go and admire Socrates with the rest of them.'); return; }
    const T = gg.npc('thrasymachus'); gg.flags.met_thrasymachus = true;
    T.actor.pose = 'stand';
    await gg.say('thrasymachus', 'You want to hear how Socrates made a fool of me. He did not. He asks and never answers, and he calls that wisdom.');
    await gg.say('thrasymachus', 'I gave him an answer. In every city the rulers make laws to suit themselves and call it just to obey. Justice is whatever is good for the stronger.');
    gg.giveCard('stronger');
    await gg.say('thrasymachus', 'Go on. Ask me what he asked. Everyone else has.');
    for (;;) {
      const c = await gg.choose(['Do rulers ever get their own advantage wrong?', 'So if a wrestler is stronger than I am, his dinner is justice for me?', 'What if the weak join together?'], { prompt: 'Which question troubles "justice is what is good for the stronger"?', name: 'Thrasymachus' });
      gg.log.push({ t: 'attempt', skill: 'counterexample', correct: c === 0 });
      if (c === 0) break;
      await gg.say('thrasymachus', c === 1 ? 'That is the joke he made, and it is as cheap from you. I said rulers, not wrestlers.' : 'Then they are the stronger, and the laws they make are for their own good. You have helped my case.');
    }
    await gg.say('thrasymachus', 'Yes, that one. If rulers can be wrong, then the weak, obeying, sometimes do what harms the stronger. Clitophon tried to help me out of it.');
    await gg.say('clitophon', 'I said he meant what the stronger believes is good for him. It was a fair way out.');
    await gg.say('thrasymachus', 'I did not take it. A ruler, to speak strictly, makes no mistakes, any more than a doctor does while he is being a doctor.');
    gg.giveCard('err');
    await gg.say('thrasymachus', 'So he said a doctor, as a doctor, looks to the good of the sick man and not to his own. And a ruler, as a ruler, to the good of the ruled.');
    await gg.say('thrasymachus', 'I asked whether he still had a nurse. Does a shepherd fatten sheep for the good of the sheep? Justice is another man’s good. The just man loses on every deal, and the man who robs a whole city at once is called happy.');
    gg.giveCard('shepherd');
    await gg.choose(['And then?', 'I hear he made you blush.']);
    await gg.say('thrasymachus', 'It was a hot night.');
    await gg.say('polemarchus', 'He blushed. Socrates said he had never seen it before.');
    gg.giveCard('blush');
    await gg.say('thrasymachus', 'I let him have his feast. I nodded along the way you nod at old women telling stories. And at the end he said himself that he knew nothing.');
    gg.giveCard('nothing');
    await gg.say('thrasymachus', 'So you tell me who won.');
    const v = await gg.choose(['Socrates. You were shown to be wrong.', 'Nobody. You were shamed, but you were not answered.', 'I cannot tell yet.']);
    gg.flags.book1view = v;
    T.actor.pose = 'sit';
    await api.gather(gg, ['kleio', 'sannion', 'archedemos'], true);
    await gg.say('kleio', (v === 0 ? 'I would not be so sure. ' : v === 1 ? 'I agree. ' : 'A fair place to stop. ') + 'I keep accounts, and those last arguments do not add up. Annas calls them weak to an amazing degree, and says nobody listening is convinced. She thinks Plato knew it.');
    await gg.say('sannion', 'He was tamed more than refuted. Bloom says the blush matters as much as any argument. I watch what people do when they lose.');
    await gg.say('archedemos', 'Under the bluster there is a real theory. A city is a machine the rulers run for themselves, and it trains the ruled to call that justice. Reeve says Socrates’ small questions cannot touch it, and that is why the talk had to begin again.');
    await gg.say('', 'These three, and others like them, turn up wherever people are arguing about last night. Each of them speaks for a real book. Your journal (J) keeps what they say and where it comes from.');
    await gg.say('glaucon', 'It did begin again, and I began it. I have a story for you. Come and talk to me when you are ready.');
    gg.flags.book1 = true; gg.flags.met_glaucon = true; gg.audio.phrase([294, 349, 392, 440]);
    api.relocate(gg, 'kleio', ...HOMES.kleio); api.relocate(gg, 'sannion', ...HOMES.sannion); api.relocate(gg, 'archedemos', ...HOMES.archedemos);
    api.refreshObjective(gg);
    gg.ui.area('The talk began again', 'The ring, the poets, the cave: hear them in any order');
  };
}

export { runDispute, showDebrief };
