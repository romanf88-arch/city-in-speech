// The story of the ring (Republic 357a-369a, the story itself at 359c-360d), played as the shepherd.
// What the player does with the ring is recorded, and Glaucon and the readers respond to it afterward.
import * as THREE from 'three';
import { clamp, mulberry32 } from './util.js';
import { PLACES, terrainParams } from './world.js';
import { buildFigure, makeProp } from './actors.js';
import { Animal } from './animals.js';
import { runDispute } from './dispute.js';

const PI = Math.PI;
export const VISITOR = { skin: 'tan', hair: 0x3a2a1c, beard: 'short', robe: 0xd8cdb0, robe2: 0x6f7f8a, hat: 'wreath' };
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
  const hallX = L[0] - 31, hallZ = L[1] + 14;
  g.addNPC({ id: 'king', name: 'The king of Lydia', space: 'lydia', look: { skin: 'olive', hair: 0x15110e, beard: 'long', robe: 0x6a2f6a, robe2: 0xd9a93c, hat: 'crown', build: 1.1 }, x: S.throne.x + 0.35, z: S.throne.z, h: PI / 2, pose: 'throne', hidden: true, y: w.terrainY(S.throne.x, S.throne.z) + 0.95 });
  g.addNPC({ id: 'queen', name: 'The queen', space: 'lydia', look: { skin: 'fair', hair: 0x2a1c14, hairStyle: 'veil', robe: 0xefe9dc, robe2: 0x2f5f7a, hat: 'goldWreath', height: 0.95, build: 0.92 }, x: hallX + 1.5, z: hallZ - 5.5, h: 1.2, hidden: true });
  const guard = (i, x, z, h) => g.addNPC({ id: 'lguard' + i, name: 'A guard', space: 'lydia', look: { skin: 'tan', robe: 0x7a2f2a, length: 'short', hat: 'helmet', beard: i ? 'short' : 'none' }, x, z, h, prop: 'spear', pose: 'guard', hidden: true });
  guard(0, hallX + 6.2, hallZ - 3.2, PI / 2); guard(1, hallX + 6.2, hallZ + 3.2, PI / 2); guard(2, S.palaceGate.x + 1.6, S.palaceGate.z - 2.4, PI / 2);
  const cageX = L[0] - 8, cageZ = L[1] + 22;
  g.addNPC({ id: 'prisoner', name: 'A prisoner', space: 'lydia', look: { skin: 'tan', hair: 0x4a3a2a, beard: 'full', robe: 0x8a7a5a, length: 'short', shoes: false }, x: cageX, z: cageZ, h: PI, pose: 'ground', hidden: true, mood: 'sad' });
  // a cage of posts around the prisoner
  const cage = new THREE.Group(); const postG = new THREE.BoxGeometry(0.09, 2.1, 0.09), postM = new THREE.MeshLambertMaterial({ color: 0x4a3423 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2, m = new THREE.Mesh(postG, postM); m.position.set(cageX + Math.sin(a) * 1.1, w.terrainY(cageX, cageZ) + 1.05, cageZ + Math.cos(a) * 1.1); m.castShadow = true; cage.add(m); }
  g.kit.zone('lydia').add(cage); w.addCircle(cageX, cageZ, 1.2, 2.1); const cageCol = w.colliders[w.colliders.length - 1];
  // sheep
  const sheep = [];
  for (let i = 0; i < 9; i++) { const x = L[0] + 22 + (rng() - 0.5) * 22, z = L[1] - 16 + (rng() - 0.5) * 18, a = new Animal('sheep', 20 + i), h = rng() * 6; g.kit.zone('lydia').add(a.group); a.place(x, z, h, w.terrainY(x, z)); sheep.push({ a, h, x, z, tx: x, tz: z, t: rng() * 5 }); }
  g.tickers.push((dt) => {
    if (g.space !== 'lydia') return;
    for (const s of sheep) {
      s.t -= dt;
      if (s.t <= 0) { s.t = 3 + rng() * 6; s.tx = clamp(s.x + (rng() - 0.5) * 9, L[0] - 4, L[0] + 40); s.tz = clamp(s.z + (rng() - 0.5) * 9, L[1] - 34, L[1] - 2); if (stage >= 2 && Math.hypot(s.tx - S.chasm.x, s.tz - S.chasm.z) < 15) s.tx = s.x; }
      const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
      const moving = d > 0.2;
      if (moving) { s.x += dx / d * 0.5 * dt; s.z += dz / d * 0.5 * dt; s.h = Math.atan2(dx, dz); }
      s.a.speed = moving ? 0.5 : 0; s.a.state = moving ? 'walk' : 'graze'; s.a.place(s.x, s.z, s.h, w.terrainY(s.x, s.z)); s.a.update(dt);
    }
    // The ring: R turns the stone.
    if (ringKeyOn && !g.busy && g.pressed.has('KeyR')) toggleRing();
    if (hallBar) hallBar.off = !!g.invisible || !!log().appeared;
  });

  function toggleRing(force) {
    const on = force != null ? force : !g.invisible;
    setInvisible(g, on); g.audio.blip('ring');
    for (const n of g.npcs.values()) if (n.space === 'lydia') n.behavior = on ? 'ignore' : 'idle';
    g.ui.hint(on ? 'The stone is turned toward your palm. Nobody can see you. Press R to turn it back.' : 'The stone is turned outward. People can see you. Press R to turn it.');
  }
  const lydia = (o) => Object.assign({ space: 'lydia' }, o);
  const showAll = (v) => { for (const n of g.npcs.values()) if (n.space === 'lydia') n.show(v); };
  const told = { noFocus: true };   // Glaucon's voice while his story plays

  // ---- Glaucon begins
  g.npc('glaucon').talk = async (gg) => {
    gg.flags.met_glaucon = true;
    if (!gg.flags.book1) { await gg.say('glaucon', 'I’m Glaucon. Hear my host and his guests first. My part of last night comes after theirs.'); return; }
    if (gg.flags.ring) { await gg.say('glaucon', 'I asked Socrates to show that doing right is worth it even with the ring on. He spent the rest of the night trying. Go and hear what he came up with.'); return; }
    gg.ui.area('Glaucon’s dare', 'Why do right, if nobody would ever know?');
    await gg.lines([
      ['glaucon', 'When Thrasymachus gave up, I wasn’t satisfied, and I told Socrates so.', 'think'],
      ['glaucon', 'I said: I’m going to argue Thrasymachus’s side better than he did. I don’t believe it. But I have never heard anyone properly prove it wrong, and I want you to.'],
      ['glaucon', 'Start here. There are three kinds of good things. Some are simply nice to have, like a lazy afternoon in the sun.'],
      ['glaucon', 'Some are no fun at all, but they get you something. Bitter medicine, or a hard day’s work.'],
      ['glaucon', 'And some are both. Being healthy feels good, and it’s useful as well.']]);
    const c = await gg.choose(['It’s good in itself, like the afternoon in the sun.', 'Both. It’s good in itself, and for what it gets you.', 'It’s like medicine. You do it for what it gets you.'], { prompt: 'Where would you put doing right?', name: 'Glaucon' });
    gg.flags.goodsPick = c;
    await gg.say('glaucon', ['That’s braver than Socrates. He said both.', 'That’s what Socrates said.', 'That’s what most people think, and it’s the side I argued.'][c], { mood: 'happy' });
    api.giveCards(gg, ['goods']);
    await gg.lines([
      ['glaucon', 'Here is how most people see it. Everyone would like to cheat and take what they want. But being cheated is much worse than cheating is good.'],
      ['glaucon', 'So the people who aren’t strong enough to get away with it make a deal: I won’t wrong you if you don’t wrong me. They write the deal into laws, and they call keeping it “doing right”.'],
      ['glaucon', 'On that view, nobody is fair because they want to be. They are fair because otherwise they would be caught. Take away the chance of getting caught, and you would see what people are really like.', 'think'],
      ['mika', 'Nobody saw me this morning.', 'afraid'],
      ['glaucon', 'There’s an old story about exactly that. It’s about a shepherd in Lydia, across the sea. I’ll tell it so that you see it through his eyes.', 'happy']]);
    api.giveCards(gg, ['compact']);
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
    gg.ui.area('Lydia', 'A story Glaucon is telling. You are the shepherd.');
    gg.objective('Walk out to your sheep', { x: S.chasm.x - 6, z: S.chasm.z + 8, label: 'Your sheep', space: 'lydia' });
    await gg.ui.fade(0, 0.9);
    await gg.say('glaucon', 'He looked after sheep for the king of Lydia. One day he was out with them, the same as any other day.', told);
  }

  // ---- the storm and the crack in the ground
  g.addTrigger(lydia({ x: S.chasm.x - 6, z: S.chasm.z + 8, r: 7, when: () => stage === 1, run: async (gg) => {
    stage = 2;
    gg.env('storm', 2.5); gg.audio.blip('quake');
    await gg.say('glaucon', 'There was a terrible storm, and then an earthquake.', told);
    gg.shake = 1.2; gg.audio.blip('quake');
    if (gg.ui.auto) { terrainParams.chasm = 1; w.reshape(S.chasm.x, S.chasm.z, 20); }
    else for (let i = 1; i <= 10; i++) { terrainParams.chasm = i / 10; w.reshape(S.chasm.x, S.chasm.z, 20); await gg.wait(0.16); }
    for (const sh of sheep) { const dx = sh.x - S.chasm.x, dz = sh.z - S.chasm.z, d = Math.hypot(dx, dz) || 1; if (d < 16) { sh.x = S.chasm.x + dx / d * 17; sh.z = S.chasm.z + dz / d * 17; sh.tx = sh.x; sh.tz = sh.z; } }
    const hy = w.terrainY(S.chasm.x, S.chasm.z);
    if (!horse) horse = gg.kit.spawn('bronze_horse', S.chasm.x, S.chasm.z, 0.7, { zone: 'lydia', y: hy });
    horse.visible = true; horse.position.y = hy;
    await gg.say('glaucon', 'The ground split open right where his sheep were grazing. He was amazed, and he climbed down to look.', told);
    gg.objective('Climb down into the crack in the ground', { x: S.chasm.x, z: S.chasm.z, label: 'The crack', space: 'lydia' });
    gg.env('lydia', 14);
  } }));

  g.addSpot(lydia({ x: S.chasm.x + 0.9, z: S.chasm.z - 1.0, r: 3.6, label: 'Look inside the bronze horse', when: () => stage === 2, run: async (gg) => {
    await gg.say('glaucon', 'Down there he found a horse made of bronze. It was hollow, with little windows in its sides.', told);
    await gg.say('glaucon', 'He looked in. There was a dead man inside, bigger than any man alive. The body had nothing on it except a gold ring.', told);
    for (;;) {
      const c = await gg.choose(['Take the ring from his finger.', 'Leave it and climb out.']);
      if (c === 0) break;
      await gg.say('glaucon', 'In the story he takes it. If he doesn’t, I’ve told you about a man who was never tempted, and we learn nothing about him. Take it. After that, do whatever you like.', told);
    }
    gg.audio.blip('ring'); stage = 3;
    await gg.say('', 'You take the ring and climb back out.');
    await gg.say('glaucon', 'Every month the shepherds met to put together their report for the king. He went along, wearing the ring.', told);
    gg.objective('Go to the shepherds’ meeting', { x: M.x, z: M.z, label: 'The meeting', space: 'lydia' });
  } }));

  // ---- the meeting, where he finds out what the ring does
  g.addSpot(lydia({ x: M.x, z: M.z, r: 3.4, label: 'Sit down with the shepherds', when: () => stage === 3, run: async (gg) => {
    await gg.say('shep0', 'Sit down. The king wants the count of his sheep before the new moon.');
    await gg.say('', 'You sit with them. Without thinking, you turn the ring on your finger, and the stone comes round toward your palm.');
    toggleRing(true);
    await gg.lines([
      ['shep1', 'Where did he go?', 'surprised'],
      ['shep2', 'Good, he’s gone. I can say it now. He counts the king’s sheep short and his own long.', 'scorn'],
      ['shep3', 'He won’t keep that job through the winter.']]);
    await gg.say('', 'They are talking about you as if you had left. You turn the stone back outward.');
    toggleRing(false);
    await gg.say('shep0', 'Oh, there you are. We didn’t see you come back.', { mood: 'surprised' });
    await gg.say('glaucon', 'He tried it a few more times. Stone turned in, nobody could see him. Stone turned out, there he was. So he got himself chosen as one of the messengers who report to the king.', told);
    stage = 4; ringKeyOn = true;
    gg.ui.hint('Press R to turn the ring. With the stone turned in, nobody can see you. What you do now is up to you.');
    gg.objective('Go to the king’s hall and do what you like there. When you have finished, go home to your hut. You can also put the ring back where you found it.', { x: S.palaceGate.x + 3, z: S.palaceGate.z, label: 'The king’s hall', space: 'lydia' });
  } }));

  // ---- the hall
  w.addBox(hallX + 5.4, hallZ, 0.35, 11, 0, 3); hallBar = w.colliders[w.colliders.length - 1]; hallBar.off = true;
  g.addTrigger(lydia({ x: hallX + 7.2, z: hallZ, r: 4.2, when: () => stage === 4 && !g.invisible && !log().appeared, run: async (gg) => {
    await gg.say('lguard0', 'Messengers wait out here. Nobody goes in to the king without being called.');
  } }));
  g.addSpot(lydia({ x: S.chest.x + 0.9, z: S.chest.z, r: 2.4, label: 'Take gold from the chest', when: () => stage === 4 && g.invisible && !log().gold, run: async (gg) => {
    log().gold = true; gg.audio.blip('card');
    await gg.say('', 'You stuff your tunic with the king’s gold. Nobody even looks round.');
  } }));
  g.addSpot(lydia({ x: S.throne.x + 3.2, z: S.throne.z - 2.4, r: 3, label: 'Listen to the king and queen', when: () => stage === 4 && g.invisible && !log().heard && !log().queen, run: async (gg) => {
    log().heard = true;
    await gg.say('king', 'Move the flocks down to the river before the frost comes. Tell the shepherds.', { noTurn: true });
    await gg.say('queen', 'That’s the third time you’ve said so today.', { noTurn: true });
    await gg.say('', 'They talk the way people do when they think they are alone.');
  } }));
  g.addSpot(lydia({ x: hallX + 1.5, z: hallZ - 5.5, r: 2.4, label: 'Let the queen see you', when: () => stage === 4 && g.invisible && !log().queen && !log().truth, run: async (gg) => {
    toggleRing(false); log().appeared = true;
    await gg.say('queen', 'Where did you come from? There are guards on every door. Are you a god?', { mood: 'afraid', play: 'startle' });
    const c = await gg.choose(['“Yes. The king’s time is over. Yours is just beginning.”', '“No. I’m a shepherd, and this ring makes me invisible.”', 'Turn the ring and say nothing.']);
    if (c === 0) { log().queen = true; await gg.say('queen', 'He sleeps after his midday meal. I’ll send the guards to the gate. Do it then.', { mood: 'think' }); gg.npc('lguard0').put(S.palaceGate.x + 1.6, S.palaceGate.z + 2.4, PI / 2); gg.npc('lguard1').put(S.palaceGate.x + 3.4, S.palaceGate.z - 2.4, PI / 2); gg.npc('king').actor.extra = { head: [0.5, 0, 0] }; }
    else if (c === 1) { log().truth = true; await gg.say('queen', 'Then you’re a thief with a trick. Get out, before I call the guards.', { mood: 'angry' }); toggleRing(true); log().appeared = false; }
    else { toggleRing(true); log().appeared = false; await gg.say('', 'She stares at the place where you were standing.'); }
  } }));
  g.addSpot(lydia({ x: S.throne.x + 1.4, z: S.throne.z, r: 2.4, label: 'Stand over the sleeping king', when: () => stage === 4 && log().queen && !log().king, run: async (gg) => {
    const c = await gg.choose(['Kill him.', 'Lower your hand and step back.'], { prompt: 'The king is asleep on his throne. The queen has sent the guards away.', name: '' });
    if (c === 1) { log().spared = true; await gg.say('', 'You step back. The queen watches from the doorway and says nothing.'); return; }
    log().king = true;
    await gg.ui.fade(1, 0.8);
    gg.npc('king').show(false); toggleRing(false);
    gg.player.place(S.throne.x + 0.35, S.throne.z, PI / 2); gg.player.y = w.terrainY(S.throne.x, S.throne.z) + 0.7;
    await gg.ui.fade(0, 0.8);
    await gg.say('glaucon', 'He won the queen over. With her help he killed the king and took the kingdom for himself. That is how the story goes.', told);
    await endStory(gg, 'king');
  } }));
  g.addSpot(lydia({ x: cageX, z: cageZ + 1.7, r: 2.2, label: 'Open the cage', when: () => stage === 4 && !log().prisoner, run: async (gg) => {
    if (!gg.invisible) { await gg.say('prisoner', 'They caught me with one of the king’s sheep. The guard at the gate has the key. There’s nothing you can do for me, shepherd.', { mood: 'sad' }); return; }
    log().prisoner = true; cage.visible = false; cageCol.off = true;
    await gg.say('prisoner', 'The bar is lifting by itself. I’m not going to ask how.', { noTurn: true, mood: 'surprised' });
    const pr = gg.npc('prisoner'); pr.actor.pose = 'stand'; pr.moveTo(L[0] + 30, L[1] + 40, 4.5).then(() => pr.show(false));
    await gg.say('', 'A man the king’s court locked up has just walked free, and nobody saw who let him out.');
  } }));
  // ---- ways to end
  g.addSpot(lydia({ x: S.hut.x + 2.6, z: S.hut.z + 2.2, r: 3, label: 'Go home and end the story', when: () => stage === 4, run: async (gg) => {
    const c = await gg.choose(['End the story here, with the ring still on your hand.', 'Not yet.']);
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
    api.giveCards(gg, ['ring', 'fool']);
    if (l.king) await gg.say('glaucon', 'You did what the shepherd did. The people who tell this story say that proves it: nobody does right because they want to. They do it because they have to.');
    else if (l.gold) await gg.say('glaucon', 'You took the gold and stopped there. The people who tell this story would say you lost your nerve before the bigger crime.');
    else if (l.prisoner) await gg.say('glaucon', 'The only thing you did was let a man out of a cage. Was that right? A court had sentenced him, and you undid it where nobody could see.', { mood: 'think' });
    else if (l.returned) await gg.say('glaucon', 'You put it back. The people who tell this story would say that anyone who knew about it would think you were an idiot. They would praise you to your face, though, because each of them would be afraid you might cheat him one day.');
    else await gg.say('glaucon', 'You kept it and didn’t use it. They would call you a fool. They would also say you’re only waiting.');
    await gg.say('glaucon', 'One more thing. The shepherd really was unseen. You weren’t. I was telling the story, and you knew I would hear how it ended.', { mood: 'think' });
    const c = await gg.choose(['I would have done the same with nobody watching.', 'I honestly don’t know what I would do with nobody watching.', 'Then you can’t test this story on anyone who hears it told.']);
    l.said = c;
    await gg.say('glaucon', ['Everyone says that. It’s exactly what the ring is supposed to test, and exactly what it can’t test here.', 'That’s the honest answer. Most people who hear the story say they know.', 'That’s a fair point, and Socrates didn’t make it. He let the story stand and tried to answer it.'][c]);
    await gg.lines([
      ['glaucon', 'Then I pushed it further. Picture two men.'],
      ['glaucon', 'The first is rotten all the way through. But he hides it so well that everyone takes him for a good man. He gets rich, and people respect him.'],
      ['glaucon', 'The second is truly good. But everyone believes he is a criminal. He is whipped and tortured for it, and in the end they kill him.', 'sad']]);
    const lp = await gg.choose(['The good man, even so.', 'The rotten one, obviously.', 'I can’t say.'], { prompt: 'Which of the two has the better life?', name: 'Glaucon' });
    gg.flags.livesPick = lp;
    await gg.lines([
      ['glaucon', ['Then you’re where I want to be. I asked Socrates to show me why.', 'That’s what most people would say, if they were honest. I asked Socrates to show me why they’re wrong.', 'Neither could I. So I asked Socrates.'][lp], 'think'],
      ['glaucon', 'I told him: don’t tell me that good people get rewarded. Take the rewards away. Show me that being good is better for the person who is good, with nothing added.'],
      ['glaucon', 'And I don’t believe a word of the case I made. I’ve heard it so many times, from so many people, that I wanted to hear it beaten properly.', 'happy'],
      ['glaucon', 'My brother Adeimantus added that parents and poets only ever praise what being good gets you. Socrates said there must be something special about the two of us, to argue so well for a thing we didn’t believe.', 'happy']]);
    api.giveCards(gg, ['lives', 'disown', 'poets', 'godlike']);
    gg.flags.ringHeard = true; api.note(gg, 'Glaucon’s dare');
    await gg.lines([
      ['mika', 'So that’s the dare. Prove that I should give the purse back even if nobody ever finds out.', 'think'],
      ['mika', 'I want to hear somebody try.', 'think'],
      ['glaucon', 'Socrates didn’t answer straight away. He said that what doing right does inside one person is hard to see, like tiny writing a long way off.'],
      ['glaucon', 'So he would look at a whole city first, where the same thing is written in bigger letters. That is how we came to spend the night building a city out of words.', 'happy']]);
    api.giveCards(gg, ['letters']);
    await gg.say('glaucon', 'Not everyone who was here agrees about what my story shows. Some of them are still about.');
    await api.gather(gg, ['kleio', 'dromon', 'sannion']);
    await gg.say('kleio', 'Before we start, you should know one thing. I stayed until dawn, and right at the end Socrates came back to the ring.', { mood: 'think' });
    api.giveCards(gg, ['ringback']);
    await runDispute(gg, 'ring');
    gg.flags.ring = true; gg.audio.phrase([294, 349, 440, 392]); api.note(gg, 'What people make of the ring');
    await gg.lines([
      ['mika', 'So nobody here thinks it’s settled. I want to hear the rest of what Socrates said.', 'think'],
      ['mika', 'There were two parts people got angry about last night. One was about the poets, and one was a story about a cave. Press H if you want me to tell you where to go.', 'happy']]);
    api.relocate(gg, 'kleio', -10.5, 6.6, PI); api.relocate(gg, 'sannion', -22.5, -17.2, 0.6); api.relocate(gg, 'dromon', -56.6, 60.4, PI / 2); api.relocate(gg, 'archedemos', 5, -93.5, 0);
    api.refreshObjective(gg);
  }
}
