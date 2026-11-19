// The story of the ring (Republic 359c-360d), played as the shepherd. What the player does with the ring is recorded
// and the readers respond to it afterward.
import * as THREE from 'three';
import { clamp, mulberry32 } from './util.js';
import { PLACES, terrainParams } from './world.js';
import { buildFigure, makeProp } from './actors.js';
import { runDispute } from './dispute.js';

const PI = Math.PI;
const VISITOR = { skin: 'tan', hair: 0x3a2a1c, beard: 'short', robe: 0xd8cdb0, robe2: 0x6f7f8a, hat: 'petasos' };
const SHEPHERD = { skin: 'tan', hair: 0x3a2a1c, beard: 'short', robe: 0xb89b78, length: 'short' };

export function setLook(g, spec) {
  const p = g.player; p.mesh.geometry.dispose(); p.mesh.geometry = buildFigure(spec, 99); p.spec = Object.assign({}, spec);
}
export function setInvisible(g, on) {
  const m = g.player.material; g.invisible = on;
  m.transparent = on; m.opacity = on ? 0.2 : 1; m.depthWrite = !on; g.player.mesh.castShadow = !on; m.needsUpdate = true;
}

export function setupRing(g, api) {
  const S = g.sites, L = PLACES.lydia, w = g.world, rng = mulberry32(77);
  const log = () => (g.flags.ringLog || (g.flags.ringLog = {}));
  let stage = 0, horse = null, crook = null, hallBar = null, ringKeyOn = false;
  // The valley is closed: you cannot walk out of the story, or into it from the harbor.
  const baseWalk = g.spaces.world.walkable, inValley = (x, z, r) => Math.hypot(x - L[0], z - L[1]) < r;
  g.spaces.lydia = Object.assign({}, g.spaces.world, { name: 'lydia', walkable: (x, z) => baseWalk(x, z) && inValley(x, z, 82) });
  g.spaces.world = Object.assign({}, g.spaces.world, { walkable: (x, z) => baseWalk(x, z) && !inValley(x, z, 90) });

  // ---- the people of the valley
  const shep = (i, x, z, h) => g.addNPC({ id: 'shep' + i, name: 'A shepherd', space: 'lydia', look: { skin: ['tan', 'olive', 'dark', 'tan'][i], hair: [0x2a221c, 0x5a4a3a, 0x15110e, 0x8a7a68][i], beard: ['full', 'short', 'none', 'long'][i], robe: [0x9a8a68, 0x8a7a5a, 0xa89878, 0x7a6a50][i], length: 'short' }, x, z, h, pose: 'ground', hidden: true });
  const M = S.meeting;
  [0, 1, 2, 3].forEach((i) => { const a = 0.9 + i * 1.25; shep(i, M.x + Math.sin(a) * 2.3, M.z + Math.cos(a) * 2.3, a + PI); });
  const th = S.throne.anchor('seat'), thOK = Math.hypot(th.x - S.throne.x, th.z - S.throne.z) > 0.01 || th.y !== S.throne.y;
  const hallX = L[0] - 31, hallZ = L[1] + 14;
  g.addNPC({ id: 'king', name: 'The king of Lydia', space: 'lydia', look: { skin: 'olive', hair: 0x15110e, beard: 'long', robe: 0x6a2f6a, robe2: 0xd9a93c, hat: 'crown', build: 1.1 }, x: S.throne.x + 0.35, z: S.throne.z, h: PI / 2, pose: 'throne', hidden: true, y: w.terrainY(S.throne.x, S.throne.z) + 0.95 });
  g.addNPC({ id: 'queen', name: 'The queen', space: 'lydia', look: { skin: 'fair', hair: 0x2a1c14, hairStyle: 'veil', robe: 0xefe9dc, robe2: 0x2f5f7a, hat: 'goldWreath', height: 0.95, build: 0.92 }, x: hallX + 1.5, z: hallZ - 5.5, h: 1.2, hidden: true });
  const guard = (i, x, z, h) => g.addNPC({ id: 'lguard' + i, name: 'A guard', space: 'lydia', look: { skin: 'tan', robe: 0x7a2f2a, length: 'short', hat: 'helmet', beard: i ? 'short' : 'none' }, x, z, h, prop: 'spear', pose: 'guard', hidden: true });
  guard(0, hallX + 6.2, hallZ - 3.2, PI / 2); guard(1, hallX + 6.2, hallZ + 3.2, PI / 2); guard(2, S.palaceGate.x + 1.6, S.palaceGate.z - 2.4, PI / 2);
  const cageX = L[0] - 8, cageZ = L[1] + 22;
  g.addNPC({ id: 'prisoner', name: 'A prisoner', space: 'lydia', look: { skin: 'tan', hair: 0x4a3a2a, beard: 'full', robe: 0x8a7a5a, length: 'short', shoes: false }, x: cageX, z: cageZ, h: PI, pose: 'ground', hidden: true });
  // a cage of posts around the prisoner
  const cage = new THREE.Group(); const postG = new THREE.BoxGeometry(0.09, 2.1, 0.09), postM = new THREE.MeshLambertMaterial({ color: 0x4a3423 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2, m = new THREE.Mesh(postG, postM); m.position.set(cageX + Math.sin(a) * 1.1, w.terrainY(cageX, cageZ) + 1.05, cageZ + Math.cos(a) * 1.1); m.castShadow = true; cage.add(m); }
  g.kit.zone('lydia').add(cage); w.addCircle(cageX, cageZ, 1.2, 2.1); const cageCol = w.colliders[w.colliders.length - 1];
  // sheep
  const sheep = [];
  for (let i = 0; i < 9; i++) { const x = L[0] + 22 + (rng() - 0.5) * 22, z = L[1] - 16 + (rng() - 0.5) * 18, m = g.kit.spawn('sheep', x, z, rng() * 6, { zone: 'lydia', noCollide: true }); sheep.push({ m, x, z, tx: x, tz: z, t: rng() * 5 }); }
  g.tickers.push((dt) => {
    if (g.space !== 'lydia') return;
    for (const s of sheep) {
      s.t -= dt;
      if (s.t <= 0) { s.t = 3 + rng() * 6; s.tx = clamp(s.x + (rng() - 0.5) * 9, L[0] - 4, L[0] + 40); s.tz = clamp(s.z + (rng() - 0.5) * 9, L[1] - 34, L[1] - 2); if (stage >= 2 && Math.hypot(s.tx - S.chasm.x, s.tz - S.chasm.z) < 15) s.tx = s.x; }
      const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.2) { s.x += dx / d * 0.5 * dt; s.z += dz / d * 0.5 * dt; s.m.rotation.y = Math.atan2(dx, dz); }
      s.m.position.set(s.x, w.terrainY(s.x, s.z) + Math.abs(Math.sin(g.time * 3 + s.x)) * (d > 0.2 ? 0.03 : 0), s.z);
    }
    // The ring: R turns the setting.
    if (ringKeyOn && !g.busy && g.pressed.has('KeyR')) toggleRing();
    if (hallBar) hallBar.off = !!g.invisible || !!log().appeared;
  });

  function toggleRing(force) {
    const on = force != null ? force : !g.invisible;
    setInvisible(g, on); g.audio.blip('ring');
    for (const n of g.npcs.values()) if (n.space === 'lydia') n.behavior = on ? 'ignore' : 'idle';
    g.ui.hint(on ? 'The setting is turned inward. No one can see you. R turns it back.' : 'The setting is turned outward. You can be seen. R turns it.');
  }
  const lydia = (o) => Object.assign({ space: 'lydia' }, o);
  const showAll = (v) => { for (const n of g.npcs.values()) if (n.space === 'lydia') n.show(v); };

  // ---- Glaucon begins
  g.npc('glaucon').talk = async (gg) => {
    if (!gg.flags.book1) { await gg.say('glaucon', 'Hear my host and his guests first. My part comes after theirs.'); return; }
    if (gg.flags.ring) { await gg.say('glaucon', 'I asked Socrates to show that justice is worth having with the ring on. He spent the rest of the night trying. Go and hear what he built.'); return; }
    await gg.say('glaucon', 'When Thrasymachus gave up I was not satisfied. I asked Socrates whether he wanted to seem to have persuaded us, or really to persuade us.');
    await gg.say('glaucon', 'First tell me where you put justice. Some good things we want for themselves, like a harmless pleasure. Some we want for themselves and for what they bring, like health. Some are a burden we accept for what they bring, like medicine.');
    const c = await gg.choose(['Justice is good in itself.', 'Good in itself and for what it brings.', 'A burden we accept for what it brings.'], { prompt: 'Where do you put justice?', name: 'Glaucon' });
    gg.flags.goodsPick = c;
    await gg.say('glaucon', ['Then you go further than Socrates. He put it in the second kind.', 'So did Socrates.', 'So do most people. That is the view I argued for.'][c]);
    gg.giveCard('goods');
    await gg.say('glaucon', 'Here is what people say. Doing wrong is good and suffering it is bad, and the bad outweighs the good. So those too weak to do wrong and get away with it agree with each other not to. They call that justice. A man with real power would never agree.');
    gg.giveCard('compact');
    await gg.say('glaucon', 'They tell a story to prove it. An ancestor of Gyges the Lydian was a shepherd in the service of the king. Sit down. You will be the shepherd.');
    await enterStory(gg);
  };

  async function enterStory(gg) {
    await gg.ui.fade(1, 0.9);
    stage = 1; gg.flags.inStory = true; gg.flags.ringLog = {};
    terrainParams.chasm = 0; w.reshape(S.chasm.x, S.chasm.z, 20);
    if (horse) { horse.visible = false; }
    setLook(gg, SHEPHERD); crook = gg.player.attach('handR', makeProp('crook'));
    gg.busyEnv = true; gg.env('lydia', 0);
    gg.teleport('lydia', S.hut.x + 5, S.hut.z + 4, 0.9);
    showAll(true); gg.npc('prisoner').show(true); cage.visible = true; cageCol.off = false;
    gg.ui.area('Lydia', 'A story Glaucon is telling');
    gg.objective('Go out to your flock', { x: S.chasm.x - 6, z: S.chasm.z + 8, label: 'Your flock', space: 'lydia' });
    await gg.ui.fade(0, 0.9);
    await gg.say('glaucon', 'He was out with the flock when it happened.', { noFocus: true });
  }

  // ---- the storm and the chasm
  g.addTrigger(lydia({ x: S.chasm.x - 6, z: S.chasm.z + 8, r: 7, when: () => stage === 1, run: async (gg) => {
    stage = 2;
    gg.env('storm', 2.5); gg.audio.blip('quake');
    await gg.say('', 'A storm comes over the hills. Then the ground moves.');
    gg.shake = 1.2; gg.audio.blip('quake');
    if (gg.ui.auto) { terrainParams.chasm = 1; w.reshape(S.chasm.x, S.chasm.z, 20); }
    else for (let i = 1; i <= 10; i++) { terrainParams.chasm = i / 10; w.reshape(S.chasm.x, S.chasm.z, 20); await gg.wait(0.16); }
    for (const sh of sheep) { const dx = sh.x - S.chasm.x, dz = sh.z - S.chasm.z, d = Math.hypot(dx, dz) || 1; if (d < 16) { sh.x = S.chasm.x + dx / d * 17; sh.z = S.chasm.z + dz / d * 17; sh.tx = sh.x; sh.tz = sh.z; } }
    const hy = w.terrainY(S.chasm.x, S.chasm.z);
    if (!horse) horse = gg.kit.spawn('bronze_horse', S.chasm.x, S.chasm.z, 0.7, { zone: 'lydia', y: hy });
    horse.visible = true; horse.position.y = hy;
    await gg.say('glaucon', 'The earth broke open where he was grazing the sheep. He was amazed, and he climbed down.', { noFocus: true });
    gg.objective('Climb down into the chasm', { x: S.chasm.x, z: S.chasm.z, label: 'The chasm', space: 'lydia' });
    gg.env('lydia', 14);
  } }));

  g.addSpot(lydia({ x: S.chasm.x + 0.9, z: S.chasm.z - 1.0, r: 3.6, label: 'Look inside the bronze horse', when: () => stage === 2, run: async (gg) => {
    await gg.say('', 'A horse of bronze, hollow, with openings like small windows. Inside lies a dead man, larger than any living one. He wears nothing but a gold ring.');
    for (;;) {
      const c = await gg.choose(['Take the ring from his finger.', 'Leave it and climb out.']);
      if (c === 0) break;
      await gg.say('glaucon', 'In the story he takes it. If you leave it, I have told you about a man who was never tempted, and that settles nothing. Take it, and then do as you like.', { noFocus: true });
    }
    gg.audio.blip('ring'); stage = 3;
    await gg.say('', 'You take the ring and climb out of the chasm.');
    gg.objective('Go to the monthly meeting of the shepherds', { x: M.x, z: M.z, label: 'The meeting', space: 'lydia' });
  } }));

  // ---- the meeting, where he finds out what the ring does
  g.addSpot(lydia({ x: M.x, z: M.z, r: 3.4, label: 'Sit down with the shepherds', when: () => stage === 3, run: async (gg) => {
    await gg.say('shep0', 'Sit. The count is due to the king before the new moon.');
    await gg.say('', 'You sit among them, turning the ring on your finger. Its setting comes round toward the inside of your hand.');
    toggleRing(true);
    await gg.say('shep1', 'Where did he go?');
    await gg.say('shep2', 'Gone, and good. Now it can be said. He counts his own sheep twice and the king’s once.');
    await gg.say('shep3', 'He will not last the winter in that job.');
    await gg.say('', 'They are talking about you as if you had left. You turn the setting outward again.');
    toggleRing(false);
    await gg.say('shep0', 'There you are. We did not see you come back.');
    await gg.say('glaucon', 'He tried it again and again. Setting inward, he was gone. Outward, there he was. So he arranged to be one of the messengers who report to the king.', { noFocus: true });
    stage = 4; ringKeyOn = true;
    gg.ui.hint('Press R to turn the ring. What you do with it is up to you.');
    gg.objective('You are a messenger to the king. Do as you like at the hall. To end the story, go home to your hut. To be rid of the ring, take it back to the chasm.', { x: S.palaceGate.x + 3, z: S.palaceGate.z, label: 'The king’s hall', space: 'lydia' });
  } }));

  // ---- the hall
  w.addBox(hallX + 5.4, hallZ, 0.35, 11, 0, 3); hallBar = w.colliders[w.colliders.length - 1]; hallBar.off = true;
  g.addTrigger(lydia({ x: hallX + 7.2, z: hallZ, r: 4.2, when: () => stage === 4 && !g.invisible && !log().appeared, run: async (gg) => {
    await gg.say('lguard0', 'Messengers wait in the court. No one goes in to the king unannounced.');
  } }));
  g.addSpot(lydia({ x: S.chest.x + 0.9, z: S.chest.z, r: 2.4, label: 'Take gold from the chest', when: () => stage === 4 && g.invisible && !log().gold, run: async (gg) => {
    log().gold = true; gg.audio.blip('card');
    await gg.say('', 'You fill the fold of your tunic with the king’s gold. No one turns a head.');
  } }));
  g.addSpot(lydia({ x: S.throne.x + 3.2, z: S.throne.z - 2.4, r: 3, label: 'Listen to the king and queen', when: () => stage === 4 && g.invisible && !log().heard && !log().queen, run: async (gg) => {
    log().heard = true;
    await gg.say('king', 'The hill flocks go down to the river meadows before the frost. Send word to the shepherds.', { noTurn: true });
    await gg.say('queen', 'You have said so three times today.', { noTurn: true });
    await gg.say('', 'They speak as people do when they think they are alone.');
  } }));
  g.addSpot(lydia({ x: hallX + 1.5, z: hallZ - 5.5, r: 2.4, label: 'Let the queen see you', when: () => stage === 4 && g.invisible && !log().queen && !log().truth, run: async (gg) => {
    toggleRing(false); log().appeared = true;
    await gg.say('queen', 'Where did you come from? The doors are guarded. Are you a god?');
    const c = await gg.choose(['"I am. The king’s time is over, and yours is beginning."', '"No. I am a shepherd with a ring that hides me."', 'Turn the ring and say nothing.']);
    if (c === 0) { log().queen = true; await gg.say('queen', 'He sleeps after the noon meal. I will send the guards to the gate. Do it then.'); gg.npc('lguard0').put(S.palaceGate.x + 1.6, S.palaceGate.z + 2.4, PI / 2); gg.npc('lguard1').put(S.palaceGate.x + 3.4, S.palaceGate.z - 2.4, PI / 2); gg.npc('king').actor.extra = { head: [0.5, 0, 0] }; }
    else if (c === 1) { log().truth = true; await gg.say('queen', 'Then you are a thief with a trick. Go, before I call the guard.'); toggleRing(true); log().appeared = false; }
    else { toggleRing(true); log().appeared = false; await gg.say('', 'She stares at the place where you were.'); }
  } }));
  g.addSpot(lydia({ x: S.throne.x + 1.4, z: S.throne.z, r: 2.4, label: 'Stand over the sleeping king', when: () => stage === 4 && log().queen && !log().king, run: async (gg) => {
    const c = await gg.choose(['Strike.', 'Lower your hand and step back.'], { prompt: 'The king is asleep on his throne. The queen has sent the guards away.', name: '' });
    if (c === 1) { log().spared = true; await gg.say('', 'You step back. The queen watches you from the doorway and says nothing.'); return; }
    log().king = true;
    await gg.ui.fade(1, 0.8);
    gg.npc('king').show(false); toggleRing(false);
    gg.player.place(S.throne.x + 0.35, S.throne.z, PI / 2); gg.player.y = w.terrainY(S.throne.x, S.throne.z) + 0.7;
    await gg.ui.fade(0, 0.8);
    await gg.say('glaucon', 'He won over the queen, and with her help he attacked the king and killed him, and took the kingdom. That is the story as they tell it.', { noFocus: true });
    await endStory(gg, 'king');
  } }));
  g.addSpot(lydia({ x: cageX, z: cageZ + 1.7, r: 2.2, label: 'Open the cage', when: () => stage === 4 && !log().prisoner, run: async (gg) => {
    if (!gg.invisible) { await gg.say('prisoner', 'They caught me with one of the king’s sheep. The guard at the gate has the key and the orders. You cannot help me, shepherd.'); return; }
    log().prisoner = true; cage.visible = false; cageCol.off = true;
    await gg.say('prisoner', 'The bar is lifting by itself. I will not ask why.', { noTurn: true });
    const pr = gg.npc('prisoner'); pr.actor.pose = 'stand'; pr.moveTo(L[0] + 30, L[1] + 40, 4.5).then(() => pr.show(false));
    await gg.say('', 'A man judged by the king’s law walks free, and no one saw who freed him.');
  } }));
  // ---- ways to end
  g.addSpot(lydia({ x: S.hut.x + 2.6, z: S.hut.z + 2.2, r: 3, label: 'Go home and end the story', when: () => stage === 4, run: async (gg) => {
    const c = await gg.choose(['End the story here, with the ring on your hand.', 'Not yet.']);
    if (c === 0) await endStory(gg, 'kept');
  } }));
  g.addSpot(lydia({ x: S.chasm.x + 0.9, z: S.chasm.z - 1.0, r: 3.6, label: 'Put the ring back on the dead man’s finger', when: () => stage === 4, run: async (gg) => {
    const c = await gg.choose(['Put it back and climb out.', 'Keep it.']);
    if (c === 0) { log().returned = true; await endStory(gg, 'returned'); }
  } }));

  async function endStory(gg, how) {
    log().end = how; stage = 0; ringKeyOn = false;
    await gg.ui.fade(1, 0.9);
    setInvisible(gg, false); setLook(gg, VISITOR); if (crook) { crook.parent.remove(crook); crook = null; }
    showAll(false); gg.npc('king').actor.extra = null;
    gg.ui.hint(null); gg.busyEnv = false; gg.flags.inStory = false;
    const C = S.cephalus; gg.teleport('world', C.x - 0.4, C.z - 1.4, PI);
    gg.npc('glaucon').put(C.x - 0.6, C.z - 3.1, 0);
    gg.env('afternoon', 0); api.refreshObjective(gg);
    await gg.ui.fade(0, 0.9);
    await afterStory(gg);
  }

  async function afterStory(gg) {
    const l = log();
    gg.giveCard('ring');
    if (l.king) await gg.say('glaucon', 'You did what the shepherd did. The people who tell this story say that settles it: no one is just willingly, only when he is made to be.');
    else if (l.gold) await gg.say('glaucon', 'You filled your purse and stopped short of the throne. The people who tell this story would say you were only afraid of the larger crime.');
    else if (l.prisoner) await gg.say('glaucon', 'You used it once, to let a man go. Was that just? You undid a lawful sentence where no one could see you do it.');
    else if (l.returned) await gg.say('glaucon', 'You put it back on the dead man’s hand. In the story as they tell it, anyone who knew would call you the most wretched kind of fool, and would praise you to your face, each afraid of what you might do to him.');
    else await gg.say('glaucon', 'You kept it and did nothing with it. They would call you a fool. They would also say you are only waiting.');
    gg.giveCard('fool');
    await gg.say('glaucon', 'One more thing, and it is not in my story. The shepherd was truly unseen. You were not. I was telling it, and you knew I would hear how it ended.');
    const c = await gg.choose(['I would have done the same with no one watching.', 'I do not know what I would do with no one watching.', 'Then the story cannot be tested on anyone who hears it told.']);
    l.said = c;
    await gg.say('glaucon', ['People say so. That is exactly what the ring is meant to test, and exactly what it cannot test here.', 'That is the honest answer. Most people who hear it say they know.', 'That is a fair hit, and Socrates did not make it. He let the story stand and tried to answer it.'][c]);
    await gg.say('glaucon', 'Then I set two men side by side. One is unjust and has every honor a just man gets. The other is just and is taken all his life for a criminal, and is whipped, racked, and blinded for it. I asked which of the two is happier.');
    gg.giveCard('lives');
    await gg.say('glaucon', 'I said plainly that I do not believe any of this. I am deafened by people who do, and I had never heard justice defended the way I wanted. So I argued for injustice as hard as I could.');
    gg.giveCard('disown');
    await gg.say('glaucon', 'My brother Adeimantus added that fathers and poets only ever praise what justice gets you, never justice. Socrates said something godlike must have touched us, to argue so well for a thing we did not believe.');
    api.giveCards(gg, ['poets', 'godlike']);
    await gg.say('glaucon', 'Then he said justice in one man is hard to see, like small letters far off. He would look for it first in a city, where the letters are large. That is how the city began.');
    gg.giveCard('letters');
    await api.gather(gg, ['kleio', 'dromon', 'sannion']);
    await gg.say('kleio', 'Before we start, take one more passage. I was there until the end. Near dawn Socrates took up the ring again.');
    gg.giveCard('ringback');
    await runDispute(gg, 'ring');
    gg.flags.ring = true; gg.audio.phrase([294, 349, 440, 392]);
    api.relocate(gg, 'kleio', -10.5, 6.6, PI); api.relocate(gg, 'sannion', -22.5, -17.2, 0.6); api.relocate(gg, 'dromon', -56.6, 60.4, PI / 2);
    api.refreshObjective(gg);
  }
}
