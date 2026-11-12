// The people of the harbor and the order of events. The game is set the day after the conversation,
// which is how the Republic itself is told ("I went down yesterday to the Piraeus").
// The player is a visitor. Mika, a girl who sells garlands, walks with the player, explains things, and has a
// question of her own: she found a purse nobody saw her pick up. Mika and her purse are invented for the game.
import { CARD_BY_ID } from './cards.js';
import { READERS } from './content.js';
import { runDispute, renderJournal, showDebrief } from './dispute.js';
import { Cave } from './cave.js';
import { setupRing, setLook, VISITOR } from './story_ring.js';
import { setupPoetry } from './story_poetry.js';
import { setupCave } from './story_cave.js';
import { setupEnd } from './story_end.js';
import { $ } from './util.js';

const PI = Math.PI;
export const LOOKS = {
  socrates: { skin: 'tan', hair: 0x8a8378, hairStyle: 'bald', beard: 'full', robe: 0x8a765a, bare: true, shoes: false, build: 1.12, height: 0.97, nose: 'snub', age: 'old' },
  cephalus: { skin: 'pale', hair: 0xe6e2da, beard: 'long', robe: 0xefe9dc, robe2: 0xe3d9c2, hat: 'wreath', height: 0.95, age: 'old' },
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
  mika: { skin: 'tan', hair: 0x2a1c14, hairStyle: 'long', beard: 'none', woman: true, dress: 'peplos', robe: 0x6f9a7a, trim: 0xe9e2d0, length: 'long', hat: 'wreath', height: 0.86, build: 0.88, shoes: false, gesture: 1.4 },
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

// ------------------------------------------------------------------ small helpers shared by the chapters
function meet(g, id) { if (!g.flags['met_' + id]) g.flags['met_' + id] = true; }

// Add passages to the journal with one notice, however many there are.
function giveCards(g, ids) {
  const fresh = ids.filter((id) => !g.cards.includes(id) && g.cardsById[id]);
  if (!fresh.length) return;
  for (const id of fresh) g.cards.push(id);
  g.audio.blip('card');
  if (fresh.length === 1) { const c = g.cardsById[fresh[0]]; g.ui.toast(c.title, (/^[0-9]/.test(c.ref) ? 'Republic ' : '') + c.ref, 'New passage in your journal'); }
  else g.ui.toast(fresh.length + ' new passages', fresh.map((id) => g.cardsById[id].title).join(' · '), 'Added to your journal');
}

// Tell the player that the plain summary in the journal has a new entry.
function note(g, title) { g.ui.toast(title, 'Press J to read it', 'The story so far'); }

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

// Mika starts walking with the player.
function joinMika(g) {
  const m = g.npc('mika'); if (!m) return;
  m.show(true); m.behavior = 'follow'; g.flags.mikaWith = true; meet(g, 'mika');
  $('btnGuide').classList.remove('hidden');
}

// ------------------------------------------------------------------ what Mika says when asked (H)
function guideNow(g) {
  const f = g.flags;
  if (!f.atHouse) return ['We’re going to the house of Cephalus. It’s the big house with the courtyard, west of the main street. Follow the gold marker, or the arrow at the top left.'];
  if (!f.ceph) return ['Talk to Cephalus. He’s the old man with the white beard, sitting in the courtyard. Walk up to him and press E.'];
  if (!f.pole) return ['Polemarchus took over from his father last night. He’s the one standing, with the red cloak.'];
  if (!f.book1) return ['Thrasymachus is next. Big man, yellow cloak, bad temper. Please don’t mention the purse.'];
  if (!f.ring) return ['Glaucon is in the courtyard, in the blue cloak. He asked the question that everyone else spent the night trying to answer, so we should hear him first.'];
  if (!f.poetry && !f.cave) return ['Two big things are left from last night. One is what Socrates said about the poets. For that we go to the man reciting Homer in the market square.', 'The other is a story about a cave. Socrates himself is sitting on the hill beyond the north gate, and he’ll tell it. We can do them in either order.'];
  if (!f.poetry) return ['We still haven’t heard what Socrates said about the poets. The man reciting Homer in the market square is where to start.'];
  if (!f.cave1) return ['We still haven’t heard the story about the cave. Socrates is on the hill beyond the north gate.'];
  if (!f.cave) return ['Socrates said there was one more part to the cave story. He’s still on the hill.'];
  if (!f.city) return [(f.writing ? '' : 'The bookseller in the market square has a story about writing, if you want to hear it. ') + 'The last thing is the city they built out of words. Archedemos is marking it out with stakes, east of the road north of the gate.'];
  return ['We’ve heard all of it. Walk wherever you like.'];
}
const RECAPS = {
  ceph: ['Cephalus said doing right means telling the truth and giving back what you owe.', 'Then Socrates asked about a friend who goes mad and wants his sword back. You shouldn’t hand it over. So the rule doesn’t always work.'],
  pole: ['Polemarchus said doing right means helping your friends and hurting your enemies.', 'Socrates had two problems with that. You can be wrong about who your friends are. And really harming someone makes them a worse person, which isn’t something a good person would do.'],
  book1: ['Thrasymachus said “right” is whatever suits the people in charge, and that honest people always lose.', 'Socrates got him tangled up, because rulers sometimes make laws that are bad for themselves. But nobody really answered his bigger point: people who do wrong and get away with it seem to do better.'],
  ringHeard: ['Glaucon said most people only do right because they’re afraid of getting caught.', 'He told the story of the shepherd with the ring that made him invisible. And he dared Socrates to show that doing right is worth it even if nobody will ever know.'],
  ring: ['Three people took the ring story three ways. Kleio thinks it’s a fair test that Socrates has to pass. Dromon thinks it was told to make a good idea about law look selfish. Sannion thinks it shows what Glaucon himself wants.', 'Then Socrates said he’d look at a whole city first, because what doing right is would be easier to see there. That’s why they spent the night building a city out of words.'],
  poetry: ['Socrates went through Homer and cut the parts where heroes are afraid of death or fall apart, because children copy what they hear.', 'He also said that acting a part rubs off on you, and near dawn he said a poem is only a copy of a copy. The four of them couldn’t agree what he was really after.'],
  writing: ['Phanias told a story Socrates tells in another place. A king says writing will make people forget, and that a page can’t answer questions.', 'They argued about whether a book helps you think or only makes you look as if you know things.'],
  cave1: ['The cave was a picture. People who have only ever seen shadows on a wall take the shadows for the real thing. One gets free and slowly learns to see what’s really there.', 'Then Socrates described four levels of knowing: hearing about a thing, seeing it for yourself, working it out, and really understanding it.'],
  cave: ['In Socrates’ city the people who get out of the cave are sent back down to rule. Glaucon said that isn’t fair to them.', 'They argued about whether going back is fair, whether it’s good for the person who goes, and Dromon asked who gets to check a ruler who says he has seen the truth.'],
  city: ['The city has three groups, a story about metals that its rulers know isn’t true, soldiers with no families of their own, and philosophers for kings.', 'They couldn’t agree whether Socrates meant it as a real plan, an impossible one on purpose, a picture of one person, or a way of talking about school.'],
};
function guidePurse(g) {
  const f = g.flags;
  if (f.purseEnd) return ['It’s done. Ask me in a year whether I chose right.'];
  if (!f.owner) return ['I don’t know what to do yet. That’s why I want to hear what Socrates said.'];
  if (!f.book1) return ['It’s his. Thrasymachus. I keep hoping one of them will say something that settles it.'];
  if (!f.ringHeard) return ['Cephalus’s rule says give it back. Polemarchus started out saying you owe an enemy nothing. And Thrasymachus would call me a fool for returning it.', 'Three men, three answers. I’m no further on.'];
  if (!f.poetry && !f.cave1) return ['Glaucon’s story is my morning. Nobody saw me. If the only reason to be honest is that you might get caught, then I’m free to keep it.', 'I want to hear someone answer him.'];
  if (!f.city) return [f.poetry ? 'Half the stories I grew up on are about clever thieves who get away with it. I’m starting to wonder where I got my ideas from.' : 'Maybe “it’s only wrong if you’re caught” is one of my shadows. Something I was handed and never looked at.', 'I’ll decide when we’ve heard everything.'];
  return ['I’ve heard all of it now. I’ll decide tonight.'];
}
function lastRecap(g) { const f = g.flags; for (const k of ['city', 'cave', 'cave1', 'writing', 'poetry', 'ring', 'ringHeard', 'book1', 'pole', 'ceph']) if (f[k] && RECAPS[k]) return RECAPS[k]; return null; }

async function askGuide(g) {
  const m = g.npc('mika');
  if (!g.flags.mikaWith || !m || m.hidden || m.space !== g.space) { g.ui.hint('Mika is not with you here.'); setTimeout(() => g.ui.hint(null), 2500); return; }
  const rec = lastRecap(g), opts = ['What are we doing now?'];
  if (rec) opts.push('Tell me again what just happened.');
  opts.push('What are you thinking about the purse?', 'Never mind.');
  const c = opts[await g.choose(opts, { prompt: 'What do you want to ask her?', name: 'Mika' })];
  if (c === 'What are we doing now?') for (const t of guideNow(g)) await g.say('mika', t);
  else if (c === 'Tell me again what just happened.') for (const t of rec) await g.say('mika', t, { mood: 'think' });
  else if (c === 'What are you thinking about the purse?') for (const t of guidePurse(g)) await g.say('mika', t, { mood: 'think' });
}

// Things Mika points out the first time the player walks past them.
const REMARKS = [
  { x: -30, z: 50, r: 16, text: 'Those big ships carry grain. Athens can’t grow enough to feed itself, so nearly everything comes in through this harbor.' },
  { x: 0, z: 28, r: 9, text: 'Straight up this street is the market square. The house is past it, on the left.' },
  { x: 0, z: 6, r: 10, text: 'This is the agora, the market square. You can buy anything here, and hear every rumor in town.' },
  { x: 7, z: -9, r: 9, text: 'That’s Terpes on the platform. He recites Homer from memory, for hours at a time. We’ll come back for him.', when: (f) => !f.poetry },
  { x: 0, z: -44, r: 6, text: 'Left here. It’s the big house at the end of this street.', when: (f) => !f.atHouse },
  { x: 40, z: -6, r: 10, text: 'That’s the new shrine to Bendis. Yesterday’s parade ended here.' },
  { x: 0, z: -74, r: 7, text: 'This is the north gate. The road goes up into the hills, and on to Athens.' },
  { x: -15, z: -12, r: 6, text: 'Everyone on this side of town draws their water from that well. I’m here every morning.' },
  { x: -8, z: -140, r: 14, text: 'People say there’s a cave up near the top of this hill. I’ve never been inside. It’s too dark.', when: (f) => !f.cave1 },
];

export async function setup(g) {
  const S = g.sites;
  g.cardsById = CARD_BY_ID;
  g.renderJournal = () => renderJournal(g);
  g.cave = new Cave(g); g.spaces.cave = g.cave.space;
  g.tickers.push((dt) => g.cave.update(dt));
  g.onSpace = (space) => {
    g.world.group.visible = space !== 'cave'; g.sea.mesh.visible = space !== 'cave'; g.cave.group.visible = space === 'cave';
    if (g.backdrop) g.backdrop.group.visible = space !== 'cave';
    g.kit.zone('lydia').visible = space === 'lydia'; g.kit.zone('town').visible = space === 'world'; g.kit.zone('north').visible = space === 'world';
    g.ui.clearBubbles();
  };
  g.peopleNotes = [
    { id: 'mika', name: 'Mika', color: '#6f9a7a', about: 'She sells garlands at the harbor and is showing you around. She found a purse this morning and is trying to decide whether to give it back. She is invented for the game.' },
    { id: 'socrates', name: 'Socrates', color: '#8a765a', about: 'The man everybody is arguing about. He kept a room full of people talking all night at the house of Cephalus, and says he was only telling them how things seemed to him.' },
    { id: 'cephalus', name: 'Cephalus', color: '#efe9dc', about: 'A rich old man, originally from Syracuse, who lives at the harbor. The talk began with him, and he left it early to see to a sacrifice.' },
    { id: 'polemarchus', name: 'Polemarchus', color: '#8a3b2e', about: 'The son of Cephalus, and the one who made Socrates stay. He took over his father’s side of the argument.' },
    { id: 'thrasymachus', name: 'Thrasymachus', color: '#c27a2a', about: 'A teacher of public speaking from Chalcedon. He says “right” is whatever suits the people in charge. In the game the purse Mika found is his.' },
    { id: 'glaucon', name: 'Glaucon', color: '#2f5f7a', about: 'A brave young Athenian, and Plato’s brother. When Thrasymachus gave up, Glaucon restarted the argument and told the story of the ring.' },
    { id: 'adeimantus', name: 'Adeimantus', color: '#4d6a4a', about: 'Glaucon’s brother, and Plato’s. He went through Homer with Socrates, deciding what children should hear.' },
    { id: 'terpes', name: 'Terpes', color: '#7a2f2a', about: 'A rhapsode: he recites Homer from memory at festivals. He is invented for the game.' },
  ];

  // ---- the house: people who were there last night
  const C = { x: S.cephalus.x, z: S.cephalus.z }, seat = (deg, r = 2.2) => [C.x - 1.5 + Math.cos(deg * PI / 180) * r, C.z + Math.sin(deg * PI / 180) * r];
  const face = (p) => Math.atan2(C.x - 1.5 - p[0], C.z - p[1]);
  const sC = seat(180), sT = seat(238), sK = seat(128), sS = seat(0);
  for (const p of [sC, sT, sK, sS]) g.kit.spawn('stool', p[0], p[1], 0, { noCollide: true });
  // A fire in the middle of the circle of seats, for the scenes that are remembered from last night.
  g.kit.spawn('brazier', C.x - 1.5, C.z, 0);
  g.addFlame(C.x - 1.5, g.world.groundY(C.x - 1.5, C.z) + 1.2, C.z, { power: 30 });
  g.addNPC({ id: 'cephalus', name: 'Cephalus', role: 'the old master of the house', color: '#efe9dc', look: LOOKS.cephalus, x: sC[0], z: sC[1], h: face(sC), pose: 'sit', prop: 'staff', propHand: 'handL' });
  g.addNPC({ id: 'thrasymachus', name: 'Thrasymachus', role: 'teacher of public speaking', color: '#c27a2a', look: LOOKS.thrasymachus, x: sT[0], z: sT[1], h: face(sT), pose: 'sit', mood: 'angry' });
  g.addNPC({ id: 'clitophon', name: 'Clitophon', role: 'a friend of Thrasymachus', look: LOOKS.clitophon, x: sK[0], z: sK[1], h: face(sK), pose: 'sit' });
  g.addNPC({ id: 'polemarchus', name: 'Polemarchus', role: 'son of Cephalus', color: '#8a3b2e', look: LOOKS.polemarchus, x: C.x + 2.6, z: C.z + 1.8, h: PI / 2 });
  g.addNPC({ id: 'glaucon', name: 'Glaucon', role: 'brother of Plato', color: '#2f5f7a', look: LOOKS.glaucon, x: C.x - 0.6, z: C.z - 3.1, h: 0.3 });
  // ---- the readers
  const reader = (id, x, z, h, extra) => g.addNPC(Object.assign({ id, name: READERS[id].name, role: READERS[id].role, color: READERS[id].color, look: LOOKS[id], x, z, h }, extra || {}));
  reader('kleio', C.x + 0.8, C.z - 3.4, 0.1); reader('sannion', C.x + 2.4, C.z - 3.0, -0.3); reader('archedemos', C.x - 2.4, C.z - 3.3, 0.5, { prop: 'staff', propHand: 'handL' });
  reader('dromon', ...HOMES.dromon); reader('theano', ...HOMES.theano);
  const bk = S.bookstall.anchor('keeper'), bkOK = Math.hypot(bk.x - S.bookstall.x, bk.z - S.bookstall.z) > 0.3;
  if (bkOK) { HOMES.phanias[0] = bk.x; HOMES.phanias[1] = bk.z; }
  reader('phanias', ...HOMES.phanias, { prop: 'scroll' });
  // ---- the agora and the hill
  g.addNPC({ id: 'terpes', name: 'Terpes', role: 'recites Homer', color: '#7a2f2a', look: LOOKS.terpes, x: S.bema.x, z: S.bema.z, h: 0, prop: 'staff', propHand: 'handL', pose: 'staff' });
  g.addNPC({ id: 'adeimantus', name: 'Adeimantus', role: 'brother of Glaucon', color: '#4d6a4a', look: LOOKS.adeimantus, x: S.bema.x - 4.2, z: S.bema.z + 4.6, h: 2.2, prop: 'scroll' });
  const ex = S.exedra;
  g.addNPC({ id: 'socrates', name: 'Socrates', role: '', color: '#8a765a', look: LOOKS.socrates, x: ex.x, z: ex.z - 0.4, h: 0.25, pose: 'sit', y: null });
  g.addNPC({ id: 'listener1', name: 'A young man', look: crowdLook(11), x: ex.x - 2.2, z: ex.z + 3.4, h: 2.6, pose: 'ground' });
  g.addNPC({ id: 'listener2', name: 'A young man', look: crowdLook(13), x: ex.x + 2.4, z: ex.z + 3.0, h: -2.6, pose: 'ground' });
  g.addNPC({ id: 'mika', name: 'Mika', role: 'sells garlands', color: '#6f9a7a', look: LOOKS.mika, x: -56.5, z: 57.6, h: 0, ghost: true, seed: 41 });
  // pupils around Theano
  g.addNPC({ id: 'pupil1', name: 'A pupil', look: Object.assign(crowdLook(3), { height: 0.6, beard: 'none', hat: 'none', age: 'child' }), x: HOMES.theano[0] + 1.3, z: HOMES.theano[1] + 0.9, h: -2.2, pose: 'ground' });
  g.addNPC({ id: 'pupil2', name: 'A pupil', look: Object.assign(crowdLook(6), { height: 0.56, beard: 'none', hat: 'none', hairStyle: 'full', age: 'child' }), x: HOMES.theano[0] + 0.2, z: HOMES.theano[1] + 1.7, h: 3.0, pose: 'ground' });
  // gate guards and sailors
  g.addNPC({ id: 'guard1', name: 'Gate guard', look: { skin: 'tan', robe: 0x8a3b2e, length: 'short', hat: 'helmet', beard: 'short' }, x: -3.4, z: -76.4, h: 0, prop: 'spear', pose: 'guard' });
  g.addNPC({ id: 'guard2', name: 'Gate guard', look: { skin: 'olive', robe: 0x8a3b2e, length: 'short', hat: 'helmet' }, x: 3.4, z: -76.4, h: 0, prop: 'spear', pose: 'guard' });
  g.addNPC({ id: 'sailor1', name: 'Sailor', look: { skin: 'dark', robe: 0xcfc0a0, length: 'short', hair: 0x15110e, beard: 'short' }, x: -58.4, z: 62.3, h: -0.9 });
  g.addNPC({ id: 'sailor2', name: 'Sailor', look: { skin: 'tan', robe: 0x6f7f6a, length: 'short', hair: 0x4a3a2a, hairStyle: 'bald' }, x: -54.6, z: 62.0, h: -2.2, pose: 'ground' });
  // the festival crowd
  const spots = [[2, 46, 9], [-12, 42, 8], [18, 44, 8], [0, 26, 6], [-6, 4, 9], [8, 0, 9], [-14, -6, 7], [14, 6, 7], [2, -16, 6], [0, -34, 7], [-3, -58, 6], [30, 20, 8], [-34, 20, 8], [44, 46, 7], [-70, 46, 6], [24, -8, 5], [62, -10, 6], [-66, -46, 5], [70, 44, 8], [-40, 48, 7], [30, -28, 6], [-30, -28, 6], [62, -40, 6], [-66, 0, 5], [40, 22, 7], [-50, 20, 7], [84, 20, 6], [-84, -46, 5], [-80, 46, 6], [12, 40, 6]];
  spots.forEach(([x, z, r], i) => g.addNPC({ id: 'crowd' + i, name: i % 4 === 0 ? 'A Thracian visitor' : 'A festival-goer', look: crowdLook(i + 2), x, z, h: i * 1.3, behavior: 'wander', radius: r, speed: 0.9 + (i % 3) * 0.15 }));
  [['stallA', 0], ['stallB', 4], ['stallC', 8]].forEach(([k, n]) => { const a = S[k].anchor('keeper'), ok = Math.hypot(a.x - S[k].x, a.z - S[k].z) > 0.3; g.addNPC({ id: 'keeper' + n, name: 'A stallkeeper', look: crowdLook(20 + n), x: ok ? a.x : S[k].x, z: ok ? a.z : S[k].z + 1.6, h: PI }); });

  // ---- talk in the streets
  g.chatter.push({ x: -56.5, z: 61.5, r: 11, members: ['dromon', 'sailor1', 'sailor2'], when: (gg) => gg.flags.intro, lines: [
    ['sailor1', 'They say he wants philosophers to be kings.'], ['dromon', 'On my ship, if the crew don’t trust me, they can put me ashore at the next harbor. Can anyone put his kings ashore?'],
    ['sailor2', 'He told a story about a ship, too. The crew drug the owner, and they call the real navigator a stargazer.'], ['dromon', 'I’m the one who watches the stars on our ship. I still answer to the crew.'], ['sailor1', 'You answer to the owner, Dromon.'], ['dromon', 'Him as well. That’s the whole idea.']] });
  g.chatter.push({ x: 2, z: 2, r: 12, members: ['crowd4', 'crowd5'], when: (gg) => gg.flags.book1, lines: [
    ['crowd4', 'A city with no poets! What would we do at festivals?'], ['crowd5', 'Sing hymns. He said we could keep the hymns.'], ['crowd4', 'And women training for war alongside the men.'], ['crowd5', 'He said people would laugh at that. He was right about the laughing.']] });
  g.chatter.push({ x: HOMES.theano[0], z: HOMES.theano[1], r: 9, members: ['theano', 'pupil1', 'pupil2'], lines: [
    ['theano', 'Once more. When the freed man came out of the cave, what could he look at first?'], ['pupil1', 'The sun!'], ['theano', 'No. It was far too bright for him. Shadows first.'], ['pupil2', 'Then reflections in the water.'], ['theano', 'Good. Then real things, then the night sky, and the sun last of all.']] });
  g.chatter.push({ x: 0, z: -78, r: 9, members: ['guard1', 'guard2'], lines: [['guard1', 'He calls his soldiers guardians. Raised like guard dogs: gentle with their own people, fierce with strangers.'], ['guard2', 'And no house, no gold, and no wife of your own.'], ['guard1', 'I’ll keep the pay we’ve got, thanks.']] });

  // ---- Mika points things out as you pass them, and can be asked for help with H
  g.tickers.push(() => {
    if (!g.flags.mikaWith || g.busy || g.space !== 'world') return;
    const p = g.player, seen = g.flags.seen || (g.flags.seen = {});
    for (let i = 0; i < REMARKS.length; i++) {
      const r = REMARKS[i]; if (seen[i] || (r.when && !r.when(g.flags))) continue;
      if (Math.hypot(p.x - r.x, p.z - r.z) < r.r) { seen[i] = 1; g.ui.bubble('mika', 'Mika', r.text, 4 + r.text.length * 0.05); const m = g.npc('mika'); m.actor.speaking = true; setTimeout(() => { m.actor.speaking = false; }, 2600); break; }
    }
  });
  g.onGuide = () => g.run((gg) => askGuide(gg));
  $('btnGuide').onclick = () => { if (g.mode === 'play' && !g.busy && !g.overlayOpen()) g.onGuide(); };

  // ---- chapters
  const api = { gather, meet, relocate, refreshObjective, giveCards, note, joinMika };
  setupBook1(g, api); setupRing(g, api); setupPoetry(g, api); setupCave(g, api); setupEnd(g, api);

  // The readers can be spoken to at any time.
  const later = { dromon: 'Come back when you’ve heard what was said last night. Then we can argue properly.', kleio: 'I’m still going through it one step at a time. Find me when people start disagreeing.', sannion: 'Watch what people do when they lose an argument. You learn more from that than from what they say.', archedemos: 'I’m waiting for the builders. When you’ve heard about the ring, the poets, and the cave, come and find me by the stakes north of the gate.', phanias: 'Buy something, or ask me something. I don’t mind which.', theano: 'When you’ve been up the hill, come and tell me what you made of it.' };
  for (const id of Object.keys(READERS)) {
    const n = g.npc(id); if (n.talk) continue;
    n.talk = async (gg) => {
      if (!gg.flags['said_' + id]) { gg.flags['said_' + id] = true; meet(gg, id); await gg.say(id, READERS[id].intro, { mood: 'happy' }); }
      await gg.say(id, later[id]);
    };
  }
}

export function refreshObjective(g) {
  const f = g.flags, S = g.sites;
  if (!f.intro) return;
  g.wantTalk = !f.atHouse ? null : !f.ceph ? 'cephalus' : !f.pole ? 'polemarchus' : !f.book1 ? 'thrasymachus' : !f.ring ? 'glaucon' : null;
  const house = { x: S.cephalus.x + 10.5, z: S.cephalus.z, label: 'House of Cephalus' };
  if (!f.book1) { g.objective(!f.atHouse ? 'Walk with Mika to the house of Cephalus' : !f.ceph ? 'Talk to Cephalus, the old man sitting in the courtyard' : !f.pole ? 'Ask Polemarchus what happened next' : 'Hear what Thrasymachus told them', f.atHouse ? null : house); return; }
  if (!f.ring) { g.objective('Talk to Glaucon in the courtyard. He has a story.', Math.hypot(g.player.x - S.cephalus.x, g.player.z - S.cephalus.z) > 14 ? Object.assign({}, house, { label: 'Glaucon' }) : null); return; }
  const left = [];
  if (!f.poetry) left.push(['Go to the man reciting Homer in the market square', { x: S.bema.x, z: S.bema.z + 4, label: 'The poets' }]);
  if (!f.cave) left.push([f.cave1 ? 'Go back to Socrates for the last part of the cave' : 'Find Socrates on the hill beyond the north gate', { x: S.exedra.x, z: S.exedra.z + 3, label: 'Socrates' }]);
  if (left.length) {
    const p = g.player; left.sort((a, b) => Math.hypot(a[1].x - p.x, a[1].z - p.z) - Math.hypot(b[1].x - p.x, b[1].z - p.z));
    g.objective(left.length === 2 ? 'Two things are left from last night: the poets (market square) and the cave (the hill to the north). Take them in either order.' : left[0][0], left[0][1]);
  } else if (!f.city) g.objective('Find Archedemos at the stakes, east of the road north of the gate', { x: S.citySite.x - 6, z: S.citySite.z + 6, label: 'The city in words' });
  else g.objective('You have reached the end of the first part. Walk where you like.', null);
  const done = (f.ring ? 1 : 0) + (f.poetry ? 1 : 0) + (f.cave ? 1 : 0);
  const want = f.city ? 'night' : done >= 3 ? 'dusk' : 'afternoon';
  if (g.space === 'world' && g.envName !== want && !g.busyEnv) g.env(want, 20);
}

export function begin(g, save) {
  const S = g.sites, mika = g.npc('mika');
  g.tickers.push(() => {
    // People who were asked to move do so when the player is far away.
    for (const n of g.npcs.values()) if (n.pending && (n.space !== g.space || Math.hypot(n.x - g.player.x, n.z - g.player.z) > 34)) { const q = n.pending; n.pending = null; n.space = q.space; n.put(q.x, q.z, q.h, 'stand'); n.behavior = 'idle'; }
  });
  if (save) {
    g.flags = save.flags || {}; g.cards = save.cards || []; g.disputeState = save.disputes || {}; g.stats = Object.assign(g.stats, save.stats || {});
    // Put people where the saved story left them.
    if (g.flags.ring) for (const id of ['kleio', 'sannion', 'archedemos']) g.npc(id).put(...HOMES[id]);
    if (g.flags.cave) g.npc('archedemos').put(S.citySite.x - 5, S.citySite.z + 5, -2.2);
    // A save made inside a story or the cave puts you back at a safe place nearby.
    let pos = save.pos || {};
    if (pos.space !== 'world' || g.flags.inStory) { pos = { x: S.cephalus.x + 12, z: S.cephalus.z, h: -PI / 2 }; g.flags.inStory = false; }
    g.teleport('world', pos.x, pos.z, pos.h);
    if (g.flags.intro) setLook(g, VISITOR);
    if (g.flags.mikaWith && !g.flags.purseGone) { mika.put(pos.x - Math.sin(pos.h) * 1.4, pos.z - Math.cos(pos.h) * 1.4, pos.h); joinMika(g); }
    g.env('afternoon', 0); refreshObjective(g);
    g.ui.area('The Piraeus', 'The day after');
    return;
  }
  g.teleport('world', -60, 66, PI);
  g.env('afternoon', 0);
  g.ui.area('The Piraeus', 'The harbor of Athens, about 2,400 years ago');
  g.run(async () => {
    await g.wait(1.4);
    await g.say('', 'You have just come off a ship at the Piraeus, the harbor town of Athens. The town is celebrating a festival, and the streets are full of people.');
    await mika.moveTo(g.player.x + 0.8, g.player.z - 1.9, 3.4, 0);
    await g.say('mika', 'Garland? You can’t go to a festival bare-headed. One obol.', { mood: 'happy', play: 'wave' });
    const c0 = await g.choose(['I’ll take one.', 'What is the festival for?']);
    if (c0 === 1) await g.lines([
      ['mika', 'It’s for Bendis. She’s a goddess from Thrace, up north, and this is the first year Athens has held her festival.', 'happy'],
      ['mika', 'The big day was yesterday. There was a parade, and after dark a horse race where the riders pass torches to each other. People are still celebrating, so I’m still selling.', 'happy']]);
    await g.say('', 'You hand over a small coin, and she sets a garland of leaves on your head.');
    setLook(g, VISITOR);
    await g.lines([
      ['mika', 'I’m Mika. You’re not from here, are you? Then you won’t have heard. Everybody is talking about last night.'],
      ['mika', 'A man called Socrates got into an argument at old Cephalus’s house, and it went on until the sun came up. I was at the door selling garlands, so I heard some of it.']]);
    const c1 = await g.choose(['What were they arguing about?', 'Who is Socrates?']);
    if (c1 === 1) await g.lines([
      ['mika', 'He’s from Athens. He walks around barefoot asking people questions, and he keeps asking until they run out of answers.'],
      ['mika', 'Some people love him for it. Some can’t stand him.', 'happy']]);
    await g.lines([
      ['mika', 'It all came down to one question. Why should you do the right thing, if you could do the wrong thing and never get caught?', 'think'],
      ['mika', 'I can’t stop thinking about it. Can I tell you something? You’re a stranger, so it’s safe.', 'afraid'],
      ['mika', 'This morning, before it was light, I found a purse on the harbor steps. It’s full of silver. More than I’d make in a year of selling garlands.', 'afraid'],
      ['mika', 'Nobody saw me pick it up.', 'afraid']]);
    const c2 = await g.choose(['You should give it back.', 'Keep it. Whoever lost that much can afford to.', 'I don’t know. Whose is it?'], { prompt: 'What do you tell her?', name: 'Mika' });
    g.flags.purse0 = c2;
    await g.say('mika', ['That’s what my mother would say. But why? Nobody saw me. And we need the money.', 'That’s what I want to hear. So why do I feel sick about it?', 'I don’t know. There’s no name on it.'][c2], { mood: 'sad' });
    await g.lines([
      ['mika', 'That’s why I want to know what Socrates said. People say he had an answer.', 'think'],
      ['mika', 'Come to the house with me? They’ll let a visitor in, and I can slip in behind you. It isn’t far.', 'happy', 'beckon']]);
    g.flags.intro = true; joinMika(g); note(g, 'Mika’s purse');
    refreshObjective(g);
    g.ui.hint('W and S walk. A and D turn. Drag the mouse to look around. Hold Shift to run. Follow the gold marker. Press H at any time to ask Mika for help.');
    setTimeout(() => g.ui.hint(null), 12000);
  });
}

// ------------------------------------------------------------------ Chapter 1: the first hour of last night (Republic, Book 1)
function setupBook1(g, api) {
  const S = g.sites, C = { x: S.cephalus.x, z: S.cephalus.z };
  const seat0 = [C.x + 0.7, C.z];            // the stool where Socrates sat
  const watch = [C.x + 0.4, C.z + 3.0];      // where the player stands while a scene from last night plays

  // Play a scene from last night: the light changes to night, Socrates is in the room, and the edges of the picture darken.
  async function remember(gg, label, fn) {
    const soc = gg.npc('socrates'), mika = gg.npc('mika'), was = { x: soc.x, z: soc.z, h: soc.actor.heading }, envWas = gg.envName;
    await gg.ui.fade(1, 0.7);
    gg.busyEnv = true; gg.env('night', 0); gg.ui.memory(label);
    soc.put(seat0[0], seat0[1], -PI / 2, 'sit'); mika.show(false);
    gg.player.place(watch[0], watch[1], PI * 0.92); gg.cam.yaw = gg.player.heading; gg.snapCam = true;
    await gg.ui.fade(0, 0.9);
    try { await fn(); } finally {
      await gg.ui.fade(1, 0.7);
      gg.ui.memory(null); gg.env(envWas || 'afternoon', 0); gg.busyEnv = false;
      soc.put(was.x, was.z, was.h, 'sit');
      if (gg.flags.mikaWith) { mika.show(true); mika.put(watch[0] + 1.2, watch[1] + 0.8, PI); }
      await gg.ui.fade(0, 0.7);
    }
  }

  // At the door.
  g.addTrigger({ x: C.x + 10.5, z: C.z, r: 3.2, once: true, when: (gg) => gg.flags.intro && !gg.flags.atHouse, run: async (gg) => {
    const pol = gg.npc('polemarchus'); pol.put(C.x + 10.4, C.z + 1.7, PI / 2);
    gg.flags.met_polemarchus = true;
    await gg.lines([
      ['mika', 'This is it. Cephalus owns a workshop that makes shields, and he’s one of the richest men in the harbor.'],
      ['polemarchus', 'Visitors! Come in, come in. I’m Polemarchus. This is my father’s house.', 'happy', 'wave'],
      ['polemarchus', 'You’ve heard about last night, I suppose. Everyone has. It started right here in the courtyard.'],
      ['polemarchus', 'I met Socrates on the road after the parade, and I told him he wasn’t going home. There were more of us than of him.', 'laugh'],
      ['polemarchus', 'He asked whether he could talk us into letting him go. I asked how he’d manage that if we refused to listen.', 'happy'],
      ['polemarchus', 'So he stayed. My father is inside. Start with him. Socrates did.']]);
    api.giveCards(gg, ['persuade']);
    await gg.say('', 'You make a note of that. Whenever you hear something that was said last night, a short version goes into your journal. Press J to read it at any time.');
    gg.flags.atHouse = true; gg.ui.area('The first hour', 'Three answers to one question'); api.refreshObjective(gg);
    pol.moveTo(C.x + 2.6, C.z + 1.8, 1.6, -PI / 2);
  } });

  // Inside: the owner of the purse is complaining about it.
  g.addTrigger({ x: C.x + 3.5, z: C.z, r: 4.4, once: true, when: (gg) => gg.flags.atHouse && !gg.flags.owner, run: async (gg) => {
    const T = gg.npc('thrasymachus'); T.actor.pose = 'stand'; gg.flags.met_thrasymachus = true;
    await gg.lines([
      ['thrasymachus', 'A hundred drachmas. Gone! I had it on my belt when I left here this morning.', { mood: 'angry', to: 'clitophon', play: 'fistShake' }],
      ['clitophon', 'You probably dropped it down at the harbor.', { to: 'thrasymachus' }],
      ['thrasymachus', 'Then somebody picked it up. And whoever picked it up is a thief.', { mood: 'angry', to: 'clitophon' }]]);
    await gg.say('', 'Mika has gone very still beside you. She whispers.');
    await gg.lines([
      ['mika', 'That’s Thrasymachus. He teaches rich men’s sons how to win arguments.', 'afraid'],
      ['mika', 'It’s his purse. Of all the people in this harbor, it had to be his.', 'afraid'],
      ['mika', 'He was horrible to everyone last night. I want to hear what was said before I do anything.', 'sad']]);
    T.actor.pose = 'sit'; gg.flags.owner = true; api.note(gg, 'Whose purse it is'); api.refreshObjective(gg);
  } });

  g.npc('cephalus').talk = async (gg) => {
    if (gg.flags.ceph) { await gg.say('cephalus', 'I’ve told you my part. I’m too old to start again on a question like that. But I’ll admit it has stayed with me all day.'); return; }
    gg.flags.atHouse = true; gg.flags.met_cephalus = true; gg.flags.met_socrates = true;
    await gg.lines([
      ['cephalus', 'Welcome, welcome. Sit with me. The older I get, the less I care about food and wine, and the more I like a good talk.', 'happy'],
      ['cephalus', 'You want to know how it started last night? It started with me. And my part was over very quickly.', 'laugh'],
      ['cephalus', 'Socrates sat on that stool, there. I’ll tell it the way it happened. Picture yourself in the room with us.']]);
    await remember(gg, 'Last night, as Cephalus tells it', async () => {
      await gg.lines([
        ['socrates', 'Cephalus, may I ask you something? You’re a rich man. What is the best thing your money has done for you?', { to: 'cephalus', mood: 'happy' }],
        ['cephalus', 'I’ll tell you, though not many people believe it. When you get old, you start to worry about the things you’ve done.', { to: 'socrates', mood: 'think' }],
        ['cephalus', 'Because I had money, I never had to cheat anyone, and I never had to lie. I don’t owe anything to any person or to any god. So I sleep well.', { to: 'socrates' }],
        ['socrates', 'That’s a fine answer. So is that what doing right comes down to? Tell the truth, and give back whatever you owe?', { to: 'cephalus', mood: 'think' }],
        ['cephalus', 'I’d say so, yes.', { to: 'socrates' }],
        ['socrates', 'Let me try an example. Suppose a friend lends you his sword while he is in his right mind.', { to: 'cephalus' }],
        ['socrates', 'Later he goes mad. He turns up at your door in a rage and asks for his sword back.', { to: 'cephalus' }],
        ['socrates', 'You, our guest. What do you think? Should he hand it over?', { mood: 'happy' }]]);
      const c = await gg.choose(['No. He might hurt someone.', 'Yes. It’s his sword.'], { prompt: 'A friend who has gone mad asks for his sword back. Should you give it to him?', name: 'Socrates' });
      gg.log.push({ t: 'attempt', skill: 'counterexample', correct: c === 0 });
      if (c === 1) { await gg.say('socrates', 'It is his. And suppose he runs his neighbor through with it ten minutes later. Did you do the right thing by handing it over?', { mood: 'think' }); await gg.choose(['No. I suppose not.']); }
      await gg.lines([
        ['socrates', 'I think everyone would agree with you.', 'happy'],
        ['socrates', 'But giving it back is exactly what the rule tells you to do. “Give back what you owe.” So the rule can’t be the whole story of what doing right is.', { to: 'cephalus', mood: 'think' }],
        ['cephalus', 'Well. I have a sacrifice to see to. My son can take over my side of the argument. He gets everything else of mine in the end.', { to: 'socrates', mood: 'laugh' }]]);
    });
    await gg.lines([
      ['cephalus', 'And off I went. That was all there was to my part.', 'happy'],
      ['cephalus', 'My son Polemarchus took over. Ask him what happened next.']]);
    api.giveCards(gg, ['cephalus', 'madman']);
    gg.flags.ceph = true; api.note(gg, 'First answer: pay what you owe');
    await gg.lines([
      ['mika', 'So giving something back isn’t always right. It depends who is asking, and what they’ll do with it.', 'think'],
      ['mika', 'That doesn’t help me much, though. Thrasymachus isn’t mad. He’s only nasty.', 'sad']]);
    api.refreshObjective(gg);
  };

  g.npc('polemarchus').talk = async (gg) => {
    if (!gg.flags.ceph) { await gg.say('polemarchus', 'Talk to my father first. It all started with him.'); return; }
    if (gg.flags.pole) { await gg.say('polemarchus', gg.flags.book1 ? 'I still think it’s never right to harm anyone. I’ve been looking for the hole in that all day, and I can’t find one.' : 'Thrasymachus was the one who wouldn’t agree. Ask him. He’s in a temper today, though.'); return; }
    await gg.lines([
      ['polemarchus', 'So I took over from my father. I thought I had a better answer than his.', 'happy'],
      ['polemarchus', 'I’ll tell you how it went. I’m afraid I don’t come out of it very well.', 'laugh']]);
    await remember(gg, 'Last night, as Polemarchus tells it', async () => {
      await gg.lines([
        ['polemarchus', 'I’ll stand up for my father. The poet Simonides had it right: doing right means giving everyone what they are owed.', { to: 'socrates' }],
        ['socrates', 'And what are people owed?', { to: 'polemarchus', mood: 'think' }],
        ['polemarchus', 'That depends on who they are. You owe your friends help. You owe your enemies harm.', { to: 'socrates' }],
        ['socrates', 'So doing right means helping your friends and hurting your enemies.', { to: 'polemarchus' }],
        ['polemarchus', 'Exactly.', { to: 'socrates', mood: 'happy' }],
        ['socrates', 'Tell me, do you ever get people wrong? Think someone is a good friend, and then find out he’s a crook?', { to: 'polemarchus', mood: 'think' }],
        ['polemarchus', 'Of course. It happens all the time.', { to: 'socrates' }],
        ['socrates', 'Then here is a question for our guest. Suppose he follows his rule on a day when he has got someone wrong. Who gets helped, and who gets hurt?', { mood: 'happy' }]]);
      const c = await gg.choose(['He helps a bad person and hurts a good one.', 'He still helps his friends, so no harm is done.'], { prompt: 'Polemarchus helps his friends and hurts his enemies. Today he is wrong about who is who. What happens?', name: 'Socrates' });
      gg.log.push({ t: 'attempt', skill: 'counterexample', correct: c === 0 });
      if (c === 1) { await gg.say('socrates', 'He helps the people he thinks are his friends. But one of them is a crook, and he hasn’t found that out yet. So who is he really helping?', { mood: 'think' }); await gg.choose(['A bad person.']); }
      await gg.lines([
        ['polemarchus', 'All right, then I’ll fix it. Help the friend who really is good. Hurt the enemy who really is bad.', { to: 'socrates' }],
        ['socrates', 'That’s better. Now another question. When you really hurt a horse, does it become a better horse or a worse one?', { to: 'polemarchus', mood: 'think' }],
        ['polemarchus', 'A worse one.', { to: 'socrates' }],
        ['socrates', 'And our guest: when a person is really harmed, does he come out of it a better person or a worse one?', { mood: 'happy' }]]);
      const h = await gg.choose(['A worse one.', 'A better one, if it teaches him a lesson.'], { prompt: 'When someone is really harmed, do they become a better person or a worse one?', name: 'Socrates' });
      if (h === 1) await gg.say('socrates', 'Teaching someone a lesson is meant to do him good. I’m asking about real harm, the kind that damages a person.', { mood: 'think' });
      await gg.lines([
        ['polemarchus', 'Worse. He’d come out of it worse.', { to: 'socrates', mood: 'think' }],
        ['socrates', 'So a good person, by doing what’s right, would be turning other people into worse people. Does that sound like something doing right could do?', { to: 'polemarchus' }],
        ['polemarchus', 'No. It doesn’t.', { to: 'socrates', mood: 'sad' }],
        ['socrates', 'Then I don’t think it can ever be right to harm anyone. Not even an enemy.', { to: 'polemarchus' }]]);
    });
    await gg.lines([
      ['polemarchus', 'And I agreed with him. I hadn’t expected to.', 'happy'],
      ['polemarchus', 'That was when Thrasymachus lost his temper. He’d been trying to break in for a while.', 'laugh']]);
    api.giveCards(gg, ['friends', 'harm']);
    gg.flags.pole = true; api.note(gg, 'Second answer: help friends, hurt enemies');
    await gg.lines([
      ['mika', 'So even if Thrasymachus is my enemy, I’m not supposed to do him harm.', 'think'],
      ['mika', 'Is keeping his purse harming him? He’s got plenty more.', 'think']]);
    api.refreshObjective(gg);
  };

  g.npc('clitophon').talk = async (gg) => { await gg.say('clitophon', gg.flags.book1 ? 'I offered him a way out last night and he wouldn’t take it. I still think it was a fair one.' : 'I only spoke once last night. Thrasymachus is the one to ask.'); };

  g.npc('thrasymachus').talk = async (gg) => {
    const T = gg.npc('thrasymachus');
    if (!gg.flags.pole) { await gg.say('thrasymachus', 'Not now. Go and listen to the old man and his son first. Then come and hear someone who knows what he’s talking about.', { mood: 'scorn' }); return; }
    if (gg.flags.book1) {
      if (gg.flags.askedT || gg.flags.purseEnd) { await gg.say('thrasymachus', 'I have nothing more to say. Go and admire Socrates with the rest of them.', { mood: 'scorn' }); return; }
      const c = await gg.choose(['Suppose someone found a purse, and nobody saw them pick it up. Should they give it back?', 'Nothing. Sorry to bother you.'], { prompt: 'Thrasymachus glares at you.', name: 'Thrasymachus' });
      if (c === 1) return;
      gg.flags.askedT = true;
      await gg.lines([
        ['thrasymachus', 'Give it back? Only a simpleton would. If nobody saw, it’s theirs. That’s how the world works, and I’m the only one here honest enough to say so.', 'scorn'],
        ['thrasymachus', 'Why do you ask?', 'angry'],
        ['mika', 'No reason!', 'afraid', 'startle']]);
      await gg.say('', 'Mika pulls you away by the sleeve.');
      await gg.lines([
        ['mika', 'Did you hear that? By his own rule I should keep it. He’d call me a fool for giving it back.', 'surprised'],
        ['mika', 'So why don’t I feel any better?', 'sad']]);
      return;
    }
    T.actor.pose = 'stand';
    await gg.lines([
      ['thrasymachus', 'You want to hear how Socrates made a fool of me. He didn’t.', 'angry'],
      ['thrasymachus', 'I’ll tell you what I told them. And it’s the truth, whatever he did to it afterwards.', 'scorn']]);
    await remember(gg, 'Last night, as Thrasymachus tells it', async () => {
      await gg.lines([
        ['thrasymachus', 'What rubbish, the pair of you! Bowing and giving way to each other like fools.', { to: 'socrates', mood: 'angry', play: 'fistShake' }],
        ['thrasymachus', 'If you really want to know what doing right is, Socrates, stop asking questions and give an answer yourself.', { to: 'socrates', mood: 'angry' }],
        ['socrates', 'Don’t be hard on us. If we’ve gone wrong, we didn’t mean to. You tell us, then. I can see you have an answer ready.', { to: 'thrasymachus', mood: 'happy' }],
        ['thrasymachus', 'Listen, then. In every city, who makes the laws? The people in charge. And they make laws that are good for themselves.', { to: 'socrates' }],
        ['thrasymachus', 'A king makes laws that suit kings. The rich make laws that suit the rich. When the poor run a city, they do the same.', { to: 'socrates' }],
        ['thrasymachus', 'Then they tell everyone that obeying the law is “right”. So “right” is simply whatever is good for the stronger.', { to: 'socrates', mood: 'scorn' }],
        ['socrates', 'Do the people in charge ever make mistakes? Pass a law that they think is good for them, when really it is bad for them?', { to: 'thrasymachus', mood: 'think' }],
        ['thrasymachus', 'Sometimes. Of course.', { to: 'socrates' }],
        ['socrates', 'And you say it is right for everyone to obey the law, whatever it says?', { to: 'thrasymachus' }],
        ['thrasymachus', 'Yes.', { to: 'socrates' }],
        ['socrates', 'Then let me ask our guest. What happens on the day they pass a law that is bad for them, and everyone obeys it?', { mood: 'happy' }]]);
      const c = await gg.choose(['People do what is bad for the stronger, and it still counts as “right”.', 'Then nobody ought to obey that law.'], { prompt: 'The rulers pass a law that is bad for themselves, and everyone obeys it. What follows?', name: 'Socrates' });
      gg.log.push({ t: 'attempt', skill: 'counterexample', correct: c === 0 });
      if (c === 1) { await gg.say('socrates', 'He has just told us that obeying is always right. So on that day, doing right is...', { mood: 'think' }); await gg.choose(['...bad for the stronger.']); }
      await gg.lines([
        ['socrates', 'So sometimes “right” is what is good for the stronger, and sometimes it is what is bad for them. I don’t think that’s what you meant.', { to: 'thrasymachus' }],
        ['clitophon', 'He meant whatever the stronger think is good for them.', { to: 'socrates' }],
        ['thrasymachus', 'I meant nothing of the kind! A ruler who makes a mistake isn’t really being a ruler at that moment. Any more than a doctor who gets it wrong is being a doctor.', { to: 'clitophon', mood: 'angry' }],
        ['socrates', 'All right. Take your real doctor, the one who never slips. Who is his skill for? Himself, or the sick person?', { to: 'thrasymachus', mood: 'think' }],
        ['thrasymachus', 'The sick person.', { to: 'socrates' }],
        ['socrates', 'And a ship’s captain? Is his skill for himself, or for his crew?', { to: 'thrasymachus' }],
        ['thrasymachus', 'For the crew.', { to: 'socrates', mood: 'angry' }],
        ['socrates', 'So anyone with a real skill uses it for the people in his care. Then a real ruler would rule for the good of the people he rules.', { to: 'thrasymachus', mood: 'happy' }],
        ['thrasymachus', 'Tell me, Socrates, have you got a nurse? Because she’s letting you run around with a snotty nose.', { to: 'socrates', mood: 'scorn', play: 'laugh' }],
        ['thrasymachus', 'Do you think a shepherd fattens his sheep for the good of the sheep? He does it for the owner’s dinner.', { to: 'socrates', mood: 'angry' }],
        ['thrasymachus', 'Honest people lose, every time. In business the cheat comes out ahead. When taxes are due, the honest man pays more.', { to: 'socrates', mood: 'angry' }],
        ['thrasymachus', 'And the man who steals a whole city and makes slaves of its people? Nobody calls him a thief. They call him happy.', { to: 'socrates', mood: 'scorn' }],
        ['socrates', 'Now I think we have come to the real question, and it’s bigger than the first one.', { mood: 'think' }],
        ['socrates', 'Who has the better life: the person who does right, or the person who does wrong and gets away with it?', { mood: 'think' }]]);
    });
    await gg.lines([
      ['polemarchus', 'They went at it for an hour after that. Socrates asked him one small question after another.'],
      ['polemarchus', 'One was whether a gang of thieves could pull off a robbery if they cheated each other the whole time.', 'happy'],
      ['thrasymachus', 'And I said no. Even thieves have to be fair to each other, or they get nothing done. I know what I said.', 'angry'],
      ['polemarchus', 'By the end he was agreeing to everything, slowly, and sweating. And then he went red. Socrates said he had never seen that before.', 'laugh'],
      ['thrasymachus', 'It was a hot night.', 'angry'],
      ['thrasymachus', 'I said yes to be done with it, the way you nod along when an old woman tells you a story. And at the end he admitted he still didn’t know what doing right is.', 'scorn'],
      ['thrasymachus', 'So you tell me. Did he prove me wrong?', 'scorn']]);
    const v = await gg.choose(['Yes. Your idea didn’t hold together.', 'He made you look foolish. I’m not sure he answered you.', 'I can’t tell yet.']);
    gg.flags.book1view = v;
    await gg.say('thrasymachus', ['Then you’re as easily pleased as the rest of them.', 'At least one person in this house was paying attention.', 'Then keep listening. You’ll see that I was right.'][v], { mood: 'scorn' });
    T.actor.pose = 'sit';
    api.giveCards(gg, ['stronger', 'err', 'shepherd', 'blush', 'nothing']);
    gg.flags.book1 = true; gg.audio.phrase([294, 349, 392, 440]); api.note(gg, 'Third answer: whatever suits the strong');
    await gg.lines([
      ['mika', 'He’s horrible. But is he wrong? Look at who is rich in this town.', 'sad'],
      ['mika', 'And if he’s right, I’d be a fool to give his purse back. He would say so himself.', 'think'],
      ['glaucon', 'I was here, and I didn’t think he had been answered either. He gave up too easily.', 'think'],
      ['glaucon', 'I’m Glaucon. Come and talk to me when you’re ready. I made Socrates start again from the beginning.', 'happy']]);
    gg.flags.met_glaucon = true;
    api.refreshObjective(gg);
  };
}

export { runDispute, showDebrief };
