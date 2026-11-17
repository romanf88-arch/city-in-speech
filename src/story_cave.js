// The cave (Republic 514a-521b), with the sun and the line. The player sits at the wall, is freed, is dragged up,
// and learns to see outside. Afterward Socrates explains his picture and the four levels of knowing, and people argue
// about what the cave is a picture of. In a second sitting the player decides whether to go back down.
import * as THREE from 'three';
import { Reflector } from '../vendor/Reflector.js';
import { $, el, clamp } from './util.js';
import { PLACES, POND_LEVEL } from './world.js';
import { CAVE } from './cave.js';
import { runDispute } from './dispute.js';
import { HOMES } from './story.js';

const PI = Math.PI, _d = new THREE.Vector3(), _t = new THREE.Vector3();

export function setupCave(g, api) {
  const S = g.sites, cave = g.cave;
  let phase = 0, dragging = false;

  // ---- the pond below the cave mouth, with a true reflection
  const pond = PLACES.pond;
  const mirror = new Reflector(new THREE.CircleGeometry(7.3, 28), { textureWidth: 512, textureHeight: 512, color: 0x8fa3a8, clipBias: 0.003, multisample: 0 });
  mirror.rotation.x = -PI / 2; mirror.position.set(pond[0], POND_LEVEL, pond[1]);
  // The finishing pass (post.js) signals with a negative exposure; the mirror's own picture is drawn the plain way.
  { const before = mirror.onBeforeRender; mirror.onBeforeRender = function (r, ...rest) { const e = r.toneMappingExposure; r.toneMappingExposure = Math.abs(e) % 100; before.call(this, r, ...rest); r.toneMappingExposure = e; }; }
  const flat = new THREE.Mesh(new THREE.CircleGeometry(7.3, 28), new THREE.MeshLambertMaterial({ color: 0x4f7f96 })); flat.rotation.x = -PI / 2; flat.position.copy(mirror.position);
  g.kit.zone('north').add(mirror, flat);
  const trees = [['cypress_a', -64.5, -197.5], ['olive_a', -62, -211.5], ['pine_a', -68, -205.5], ['cypress_b', -52, -195.5]].map(([id, x, z]) => g.kit.spawn(id, x, z, x * 0.7, { zone: 'north' }));
  g.tickers.push(() => { const near = g.space === 'world' && Math.hypot(g.player.x - pond[0], g.player.z - pond[1]) < 42; mirror.visible = near; flat.visible = !near; });

  // ---- the people at the wall
  for (let i = 0; i < 7; i++) {
    if (i === 3) continue; const s = cave.seat(i);
    g.addNPC({ id: 'pris' + i, name: 'A prisoner', space: 'cave', look: { skin: ['tan', 'olive', 'pale', 'dark', 'tan', 'olive', 'fair'][i], hair: [0x2a221c, 0x5a4a3a, 0x8a7a68, 0x15110e, 0x3a2a1c, 0x1c1612, 0x6a5a48][i], beard: ['full', 'none', 'long', 'short', 'none', 'full', 'short'][i], hairStyle: i === 2 ? 'bald' : i === 5 ? 'veil' : 'long', robe: [0x5d4a3a, 0x4a4f43, 0x614038, 0x4b4352, 0x57503a, 0x3f4a50, 0x5a4a40][i], length: 'short', shoes: false }, x: s.x, z: s.z, h: PI, pose: 'ground', behavior: 'ignore' });
  }
  g.addNPC({ id: 'freer', name: '', space: 'cave', look: { skin: 'tan', robe: 0x2c2723, robe2: 0x3a332d, hat: 'hood', beard: 'short' }, x: 0, z: 1.2, h: PI, hidden: true, behavior: 'ignore' });
  // Mika is not in the picture Socrates makes. She waits on the hill.
  const mikaAway = (away) => { const m = g.npc('mika'); if (m && g.flags.mikaWith) m.show(!away); };

  // After the story has been heard, the cave can be walked into from the hillside.
  g.addTrigger({ x: S.mouth.x, z: S.mouth.z + 1.6, r: 2.3, when: () => !g.flags.inStory, run: async (gg) => {
    if (!gg.flags.cave1) { await gg.say('', 'A few steps in, it is too dark to see anything. Socrates is sitting on the stone seat just below. Hear him first.'); gg.player.z += 2.2; return; }
    await gg.ui.fade(1, 0.8);
    cave.setOrder(['jar', 'horse', 'man', 'tree']); cave.fireLevel = 1; phase = 7; gg.busyEnv = true;
    gg.env('cave', 0); gg.teleport('cave', cave.tunnelX(52), 52, Math.PI);
    Object.assign(gg.cam, { mode: 'first', fpLimit: null, fpYaw: 0, fpPitch: 0.1, fpHeight: 1.62 });
    gg.objective('Walk down to the wall, or back up to the daylight', null);
    await gg.ui.fade(0, 1.2);
  } });
  g.addTrigger({ space: 'cave', x: cave.tunnelX(55.6), z: 55.6, r: 1.6, when: () => phase === 7, run: async (gg) => {
    await gg.ui.fade(1, 0.9, '#fff'); phase = 0; gg.cam.mode = 'follow'; gg.busyEnv = false;
    gg.teleport('world', S.mouth.x, S.mouth.z + 5.5, 0); gg.env('afternoon', 0); api.refreshObjective(gg);
    await gg.ui.fade(0, 1.2, '#fff');
  } });
  const setGlare = (v) => { g.glare = v; g.canvas.style.filter = v > 0.01 ? `blur(${(7 * v).toFixed(1)}px) brightness(${(1 + 1.5 * v).toFixed(2)}) saturate(${(1 - 0.5 * v).toFixed(2)})` : ''; };
  const setDim = (on) => { g.canvas.style.filter = on ? 'brightness(0.32) blur(2.2px)' : ''; };
  const say = (who, text, opts) => g.run((gg) => gg.say(who, text, Object.assign({ noFocus: true }, opts || {})));
  // Wait until a condition has held for a moment while the player is free to move and look.
  function until(cond, hold = 1.1) {
    if (g.ui.auto) return Promise.resolve();
    return new Promise((res) => { let acc = 0; const t = (dt) => { if (g.busy) return; acc = cond() ? acc + dt : 0; if (acc >= hold) { g.tickers.splice(g.tickers.indexOf(t), 1); res(); } }; g.tickers.push(t); });
  }
  const view = () => g.camera.getWorldDirection(_d);
  const lookingAt = (x, y, z, cos) => { _t.set(x, y, z).sub(g.camera.position).normalize(); return view().dot(_t) > cos; };

  // ---- Socrates on the hill
  g.npc('socrates').talk = async (gg) => {
    gg.flags.met_socrates = true;
    if (!gg.flags.ring) { await gg.say('socrates', 'You’ve climbed all this way before hearing how it began. Go down to the house of Cephalus first, and hear Glaucon’s story. I’m not going anywhere.', { mood: 'happy' }); return; }
    if (gg.errand && gg.errand.caveAsk) await gg.errand.caveAsk(gg);   // the stranger asks about Bion, and Socrates names his price (story_bion.js)
    if (gg.flags.cave && gg.errand && gg.errand.caveLead && !gg.flags.lead5 && gg.flags.lead4 && !gg.flags.bion) { await gg.errand.caveLead(gg); api.refreshObjective(gg); return; }
    if (gg.flags.cave) { await gg.say('socrates', 'I’ve told you how it seems to me. Whether it’s true, only a god knows.', { mood: 'happy' }); return; }
    if (gg.flags.cave1) { theReturn(); return; }
    gg.ui.area('The cave', 'What is real, and how do we come to know it?');
    await gg.lines([
      ['mika', 'That’s him. That’s Socrates.', 'afraid'],
      ['socrates', 'You’ve walked all the way up here to ask about last night? Sit down, both of you. I’m afraid I talked far too much.', 'happy']]);
    await gg.choose(['Did you prove it? That doing right is worth it even if nobody ever knows?', 'They say you told a story about a cave.']);
    await gg.lines([
      ['socrates', 'I tried to show that doing right is worth it for its own sake. To do that properly, I would have to tell you what “good” is. The thing itself.', 'think'],
      ['socrates', 'Glaucon asked me exactly that, in the middle of the night. And I couldn’t tell him. I was afraid of making a fool of myself.', 'happy'],
      ['socrates', 'The best I could do was a comparison. Think of the sun. Without its light you can’t see anything. And without it nothing grows.'],
      ['socrates', 'I said the good is like that for the mind. It is what lets us understand anything at all, and it is what makes things what they are. Glaucon laughed, and said that was quite a claim.', 'happy']]);
    api.giveCards(gg, ['sun']);
    await gg.lines([
      ['mika', 'I don’t understand that.', 'sad'],
      ['socrates', 'Neither did Glaucon, quite. So I tried a picture, and I think the picture is better. Would you like to be inside it?', 'happy'],
      ['socrates', 'Sit down and shut your eyes. Mika can wait here with me.']]);
    runCave();
  };

  async function runCave() {
    g.flags.inStory = true; g.busyEnv = true;
    await g.ui.fade(1, 1.2);
    const seat = cave.seat(3); mikaAway(true);
    cave.setOrder(['jar', 'horse', 'man', 'tree']); cave.mode = 'show'; cave.fireLevel = 1; cave.t = 3;
    g.env('cave', 0); g.teleport('cave', seat.x, seat.z, PI);
    Object.assign(g.cam, { mode: 'first', fpLimit: [0.5, 0.6], fpYaw: 0, fpPitch: -0.32, fpHeight: 0.95 });
    g.frozen = true; phase = 1; g.objective(null);
    let strained = 0; g.onStrain = () => { if (g.time - strained > 6 && phase === 1) { strained = g.time; g.ui.hint('Something holds your neck. You can only look at the wall.'); setTimeout(() => g.ui.hint(null), 3500); } };
    g.ui.area('The cave', 'A picture Socrates is describing. You are inside it.');
    await g.ui.fade(0, 1.6);
    await say('', 'You have been sitting here since you were a child. Your legs and your neck are held, so you can only look at this wall. The shapes that cross it are all you have ever seen.');
    await say('', 'The people beside you call out a name as each shape goes by. Their voices bounce off the wall, so it sounds as if the shapes are speaking.');
    // naming, then predicting
    const kinds = ['horse', 'jar', 'tree', 'man'], label = { horse: 'The horse.', jar: 'The jar.', tree: 'The tree.', man: 'The man.' };
    const crossing = async (lead) => { if (!g.ui.auto) await until(() => cave.nextCrossing().dt < lead, 0.05); return cave.nextCrossing().kind; };
    let right = 0;
    for (let r = 0; r < 2; r++) {
      const k = await crossing(1.6);
      await g.run(async (gg) => {
        const opts = kinds.filter((x) => x !== k).slice(0, 2).concat(k).sort(), c = await gg.choose(opts.map((x) => label[x]), { prompt: 'A shape is crossing the wall. What is it?', name: '' });
        const ok = opts[c] === k; right += ok ? 1 : 0; gg.log.push({ t: 'attempt', skill: 'shadows', correct: ok });
        await gg.say('pris2', ok ? label[k].replace('.', '') + '. Yes.' : 'No. That’s ' + label[k].toLowerCase().replace('.', '') + '. Look again.', { noFocus: true });
      });
      if (!g.ui.auto) await g.wait(2.2);
    }
    await say('pris4', 'The sharp ones can say what’s coming before it comes. You try.', {});
    for (let r = 0; r < 3; r++) {
      const upcoming = await crossing(6.2);
      let ok = false;
      await g.run(async (gg) => { const c = await gg.choose(kinds.map((x) => label[x]), { prompt: 'Which shape comes next?', name: '' }); ok = kinds[c] === upcoming; gg.log.push({ t: 'attempt', skill: 'shadows', correct: ok }); });
      if (!g.ui.auto) await until(() => cave.nextCrossing().kind !== upcoming || cave.nextCrossing().dt < 0.4, 0.05);
      right += ok ? 1 : 0;
      await say('pris2', ok ? 'There. Called it before it came.' : 'No. ' + label[upcoming].replace('.', '') + ' comes after that one. It always does.');
      if (!g.ui.auto) await g.wait(1.6);
    }
    g.flags.shadowScore = right;
    await say('pris4', right >= 3 ? 'Sharpest eyes in the row. Give this one the prize.' : 'You’ll learn the order. We all did.');
    await say('', (right >= 3 ? 'They cheer you for it. ' : '') + 'Down here, this is what knowing things means: saying which shadow is which, and which one comes next. They give prizes for it.');

    // ---- release
    phase = 2;
    const fr = g.npc('freer'); fr.show(true); fr.put(seat.x + 0.5, seat.z + 1.0, PI);
    await say('', 'Someone is behind you. The collar opens. Hands lift you to your feet and turn you round, toward the light.');
    g.cam.fpLimit = [0.9, 0.7]; g.cam.fpHeight = 1.62;
    if (g.ui.auto || g.reduceMotion) { g.player.heading = 0; } else for (let i = 1; i <= 40; i++) { g.player.heading = PI - (PI * i) / 40; setGlare(Math.min(1, i / 16)); await g.wait(0.07); }
    setGlare(1); fr.put(seat.x - 0.9, seat.z + 0.4, 0.4);
    let back = 0;
    await g.run(async (gg) => {
      await gg.say('', 'The light hurts. There is a fire up there, and things moving in front of it, and you can’t make out any of them.', { noFocus: true });
      back = await gg.choose(['Turn back to the wall.', 'Keep looking toward the light.']);
    });
    g.flags.turnedBack = back === 0;
    if (back === 0) {
      setGlare(0); g.player.heading = PI; g.cam.fpYaw = 0; g.cam.fpPitch = -0.3;
      await say('', 'There is the wall, and the shapes on it, as clear as ever. They still seem more real than whatever is behind you.');
      await say('', 'The hands turn you round again.');
      g.player.heading = 0; g.cam.fpYaw = 0; g.cam.fpPitch = -0.1;
    }
    setGlare(0.45);
    await say('', 'Slowly you begin to see. You can walk now. Go and look at what was behind you all those years.');
    g.cam.fpLimit = null; g.frozen = false; phase = 3; setGlare(0.2);
    g.objective('Look over the low wall', { x: 0, z: 3.2, label: 'The low wall', space: 'cave' });
  }

  const inCave = (o) => Object.assign({ space: 'cave' }, o);
  g.addSpot(inCave({ x: 0, z: 3.3, r: 2.6, label: 'Look over the low wall', when: () => phase === 3 && !g.flags.sawRoad, run: async (gg) => {
    gg.flags.sawRoad = true; setGlare(0.08);
    await gg.say('', 'A path runs behind the wall. People walk along it carrying figures on poles: a horse, a jar, a tree, a man, cut out of wood and stone. Some of them are talking and some are silent.', { noFocus: true });
    await gg.say('', 'What you called a horse was the shadow of one of these.', { noFocus: true });
    gg.objective('Look around as much as you like. The one who freed you is waiting by the steep path up.', { x: cave.tunnelX(16), z: 15.2, label: 'The path up', space: 'cave' });
    const fr = gg.npc('freer'); fr.put(cave.tunnelX(15) - 1.4, 13.6, PI);
  } }));
  const carriers = 'The nearest one looks straight through you and keeps walking. Another is talking to nobody about the price of barley. None of them will say who put them to this work, or why.';
  for (const sx of [9.4, -9.4]) g.addSpot(inCave({ x: sx, z: 4.9, r: 2.4, label: 'Ask the carriers who they are', when: () => phase === 3 && !g.flags.askedCarriers, run: async (gg) => { gg.flags.askedCarriers = true; await gg.say('', carriers, { noFocus: true }); } }));
  g.addSpot(inCave({ x: 3.9, z: 9.6, r: 2.6, label: 'Look at the fire', when: () => phase === 3 && !g.flags.sawFire, run: async (gg) => {
    gg.flags.sawFire = true;
    await gg.say('', 'It is a fire, burning on a ledge high up at the back. From your seat you took its light for the only light there is.', { noFocus: true });
  } }));
  g.addSpot(inCave({ x: 1.3, z: -0.2, r: 2.0, label: 'Tell the others what is behind them', when: () => phase === 3 && g.flags.sawRoad && !g.flags.told, run: async (gg) => {
    gg.flags.told = true;
    await gg.say('pris4', 'Sit down. You’re standing in front of the jar.', { noFocus: true });
    await gg.say('pris2', 'Figures on sticks! Listen to that. So which one comes next, then? You don’t know any more, do you?', { noFocus: true });
  } }));
  // the steep path: once on it you are dragged
  g.addTrigger(inCave({ x: cave.tunnelX(15.6), z: 15.6, r: 2.6, once: false, when: () => phase === 3 && g.flags.sawRoad, run: async (gg) => {
    phase = 4; dragging = true; gg.npc('freer').show(false); gg.speedScale = 0.8;
    await gg.say('', 'The path is rough and steep. You are dragged up it, and you are angry. You would rather go back to the wall, where at least you could see.', { noFocus: true });
    gg.objective('Up, toward the daylight', null);
  } }));
  g.tickers.push((dt) => {
    if (!dragging || g.busy || g.space !== 'cave') return;
    const p = g.player, nz = p.z + 1.15 * dt, nx = p.x + (cave.tunnelX(nz) - p.x) * Math.min(1, dt * 1.5);
    if (cave.space.walkable(nx, nz)) { p.x = nx; p.z = nz; }
    setGlare(clamp((p.z - 34) / 22, 0.05, 1));
    if (p.z > CAVE.mouthZ - 1.2) { dragging = false; emerge(); }
  });

  async function emerge() {
    phase = 5; g.speedScale = 1;
    await g.ui.fade(1, 1.1, '#fff');
    const mo = S.mouth.anchor('outside'), ok = Math.hypot(mo.x - S.mouth.x, mo.z - S.mouth.z) > 0.5, ox = ok ? mo.x : -40, oz = ok ? mo.z + 1.5 : -223.5;
    g.env('afternoon', 0); g.teleport('world', ox, oz, -0.6);
    Object.assign(g.cam, { mode: 'first', fpLimit: null, fpYaw: 0, fpPitch: 0, fpHeight: 1.62 });
    setGlare(1); g.ui.area('Outside', '');
    await g.ui.fade(0, 1.4, '#fff');
    await say('', 'Outside, the light is so strong that at first you can’t see anything at all.');
    g.objective('Look down, at the shadows on the ground', null);
    await until(() => g.cam.fpPitch > 0.42); setGlare(0.7);
    await say('', 'Shadows. Those you can stand to look at.');
    g.objective('Go to the water and look at what is in it', { x: pond[0], z: pond[1], label: 'The pond' });
    await until(() => Math.hypot(g.player.x - pond[0], g.player.z - pond[1]) < 11.5 && lookingAt(pond[0], POND_LEVEL, pond[1], 0.9)); setGlare(0.4);
    await say('', 'Trees, upside down in the water, with the sky underneath them. Pictures of things. You can look at those too.');
    g.objective('Now look up at the trees themselves', null);
    await until(() => g.cam.fpPitch < 0.02 && trees.some((t) => lookingAt(t.position.x, t.position.y + 4, t.position.z, 0.9))); setGlare(0.15);
    await say('', 'The real things.');
    g.env('night', 6); if (!g.ui.auto) await g.wait(5);
    await say('', 'Night comes. The moon and the stars are easier on your eyes than the day was.');
    g.objective('Look at the moon', null);
    await until(() => view().dot(g.sky.sunDir) > 0.94); setGlare(0.05);
    g.env('dawn', 7); if (!g.ui.auto) await g.wait(6);
    g.objective('Last of all, look at the sun', null);
    await until(() => view().dot(g.sky.sunDir) > 0.955, 1.4); setGlare(0);
    await say('', 'The sun itself, in its own place. It gives the seasons and the years, and one way or another everything you saw down below depends on it.');
    await say('', 'You think of the others at the wall, and the prizes they give each other. You would rather be a poor farmhand up here than live the way they do.');
    await afterImage();
  }

  async function backToHill() {
    await g.ui.fade(1, 1.0);
    setGlare(0); setDim(false); g.cam.mode = 'follow'; g.frozen = false; cave.fireLevel = 1;
    const ex = S.exedra; g.teleport('world', ex.x + 0.6, ex.z + 3.4, PI);
    const m = g.npc('mika'); if (m && g.flags.mikaWith) { m.show(true); m.put(ex.x + 2.0, ex.z + 3.0, PI); }
    g.env('afternoon', 0); g.busyEnv = false; g.objective('Hear what Socrates says about his picture', null);
    await g.ui.fade(0, 1.0);
  }

  async function afterImage() {
    await backToHill();
    let now = true;
    await g.run(async (gg) => {
      await gg.lines([
        ['socrates', 'That’s the picture. When I told it to Glaucon he said: what strange prisoners. I said: they’re like us.', 'happy'],
        ['mika', 'Like us how? I’m not chained to anything.', 'think']]);
      api.giveCards(gg, ['likeus', 'dragged', 'prizes']);
      await gg.lines([
        ['socrates', 'Here is how I read my own picture. The cave is the world we see with our eyes. Outside is what we can only work out by thinking.'],
        ['socrates', 'The climb is what learning is like. It’s slow, and it hurts. For a while the things you used to be sure of seem more real than what you’re being shown.'],
        ['socrates', 'And the last thing you come to see, and the hardest, is the good. That’s the sun. Is any of this true? Only a god knows.', 'think']]);
      api.giveCards(gg, ['key']);
      await gg.lines([
        ['socrates', 'It says something about teaching, too. Some people think teaching means pouring knowledge into an empty head, like putting sight into blind eyes.'],
        ['socrates', 'I don’t. Everyone can already see. The trouble is that we’re facing the wrong way. Teaching is turning someone round.', 'happy']]);
      api.giveCards(gg, ['turn']);
      await gg.lines([
        ['socrates', 'Now think about the stages you went through outside. First you could only look at shadows. Then at reflections in the water. Then at the things themselves.'],
        ['socrates', 'I think knowing anything goes in stages like that. I drew Glaucon a line with four parts, from the lowest kind of knowing to the highest. Let me show you, and you can sort a few things onto it.']]);
      api.giveCards(gg, ['line']);
      await placeOnLine(gg);
      await gg.lines([
        ['mika', 'So: hearing about a thing, seeing it, working it out, and really understanding it. Four steps.', 'think'],
        ['mika', 'What I know about right and wrong is mostly the first kind. Things people told me.', 'sad']]);
      await api.gather(gg, ['kleio', 'sannion', 'archedemos', 'theano']);
      await gg.say('theano', 'There is a curious detail in that line, if you like puzzles. Do you want to see it before we argue about the cave?', { mood: 'happy' });
      if ((await gg.choose(['Show me.', 'Not now.'])) === 0) {
        await lineWidget(gg);
        await gg.say('theano', 'So the two middle parts come out the same length, however you cut the line. Socrates never mentions it. Some scholars think Plato knew and meant something by it. Others say the lengths of those two parts mean nothing at all.', { note: 'Nicholas Denyer, C. D. C. Reeve, and Sean McAleer take different views of this.' });
      }
      await runDispute(gg, 'cave');
      gg.flags.cave1 = true; gg.audio.phrase([220, 262, 330, 392]); api.note(gg, 'The cave, and four levels of knowing');
      await gg.say('mika', 'Maybe “it’s only wrong if you get caught” is one of my shadows. Something I was handed, and never turned round to look at.', { mood: 'think' });
      await gg.say('socrates', 'There is one more part, and it’s the part Glaucon didn’t like. Do you want it now, or would you rather walk for a while first?', { mood: 'happy' });
      now = (await gg.choose(['Tell me now.', 'I’ll come back for it.'])) === 0;
      if (!now) { gg.flags.inStory = false; for (const id of ['kleio', 'sannion', 'theano', 'archedemos']) api.relocate(gg, id, ...HOMES[id]); api.refreshObjective(gg); }
    });
    if (now) await theReturn();
  }

  // ---- the second sitting: should the one who got out go back down?
  async function theReturn() {
    await g.run(async (gg) => {
      gg.flags.inStory = true;
      await gg.lines([
        ['socrates', 'In the city we built last night, the people who get out of the cave are the ones who should rule. They are the only ones who have seen what is really good.'],
        ['socrates', 'But they won’t want to. They would rather stay up in the light. So the founders of the city make them go back down, each in turn, to live with the prisoners and rule.', 'think'],
        ['socrates', 'Glaucon objected. He said that isn’t fair to them. We would be making them live a worse life when they could have a better one.']]);
      api.giveCards(gg, ['godown', 'least', 'fifty', 'worse']);
      const c = await gg.choose(['Go back down.', 'Stay in the light.'], { prompt: 'You have been outside. What do you do?', name: 'Socrates' });
      gg.flags.wentBack = c === 0;
    });
    if (g.flags.wentBack) await goBackDown();
    else await g.run(async (gg) => {
      await gg.lines([
        ['socrates', 'Then here is what the founders would say to you. In other cities, people like you grow up on their own and owe nobody anything. But we raised you and taught you, for your own good and for the city’s.'],
        ['socrates', 'You can see better down there than the others can. So go down when your turn comes.']]);
      const c = await gg.choose(['Then I’ll go, because it’s a fair thing to ask.', 'I still won’t go.']);
      gg.flags.refused = c === 1;
      await gg.say('socrates', c === 0 ? 'Glaucon said the same. They will go, he said, as something that has to be done, and not as something they want.' : 'Then the city we built has a hole in it, right where its best citizen is standing. Hear what these people make of that.', { mood: 'think' });
    });
    await g.run(async (gg) => {
      await api.gather(gg, ['kleio', 'sannion', 'archedemos', 'theano', 'dromon']);
      await gg.lines([
        ['dromon', 'Before you settle this, there’s one more thing from last night you should hear. Socrates told a story about a ship, and I steer ships, so I have views on it.'],
        ['dromon', 'The owner of the ship is big and strong, but he’s half deaf and can’t see well. The sailors fight over who gets to steer, though not one of them has ever learned how.'],
        ['dromon', 'The one man aboard who has studied the stars and the winds, they call a useless stargazer. Socrates said that is how cities treat the people who really know something.', 'scorn']]);
      api.giveCards(gg, ['ship']);
      await runDispute(gg, 'back');
      gg.flags.cave = true; gg.flags.inStory = false; gg.audio.phrase([220, 262, 330, 392, 440]); api.note(gg, 'Going back down');
      await gg.say('mika', 'So even Socrates’ friends can’t agree whether his best people get a fair deal. I thought philosophers were supposed to have answers.', { mood: 'happy' });
      if (gg.errand && gg.errand.caveLead) await gg.errand.caveLead(gg);   // where Bion is (story_bion.js)
      for (const id of ['kleio', 'sannion', 'theano', 'dromon']) api.relocate(gg, id, ...HOMES[id]);
      api.relocate(gg, 'archedemos', S.citySite.x - 5, S.citySite.z + 5, -2.2);
      api.refreshObjective(gg);
    });
  }

  async function goBackDown() {
    await g.ui.fade(1, 1.0);
    const seat = cave.seat(3); mikaAway(true);
    cave.setOrder(['bird', 'man', 'jar', 'tree']); cave.fireLevel = 0.5; cave.t = 9; g.busyEnv = true;
    g.env('cave', 0); g.teleport('cave', seat.x, seat.z, PI);
    Object.assign(g.cam, { mode: 'first', fpLimit: [0.5, 0.6], fpYaw: 0, fpPitch: -0.32, fpHeight: 0.95 }); g.frozen = true; phase = 6; setDim(true);
    g.npc('freer').show(false);
    await g.ui.fade(0, 1.2);
    await say('', 'You go back down and sit in your old place. Coming in from the sunlight, you can hardly see. The shapes on the wall are a blur.');
    const kinds = ['bird', 'man', 'jar', 'tree', 'horse'], label = { horse: 'The horse.', jar: 'The jar.', tree: 'The tree.', man: 'The man.', bird: 'The bird.' };
    for (let r = 0; r < 2; r++) {
      if (!g.ui.auto) await until(() => cave.nextCrossing().dt < 1.6, 0.05);
      const k = cave.nextCrossing().kind;
      await g.run(async (gg) => {
        const c = await gg.choose(kinds.slice(0, 4).map((x) => label[x]), { prompt: 'Something is crossing the wall. What is it?', name: '' });
        await gg.say('pris2', kinds[c] === k ? 'Slow. And you had to squint to get it.' : 'Wrong. You used to be the best of us.', { noFocus: true });
      });
      if (!g.ui.auto) await g.wait(1.5);
    }
    let free = 1;
    await g.run(async (gg) => {
      await gg.say('pris4', 'Went up there and came back with ruined eyes. It isn’t worth even trying to go.', { noFocus: true });
      free = await gg.choose(['Try to free the one beside you.', 'Sit still and say nothing.']);
      gg.flags.triedToFree = free === 0;
      if (free === 0) { await gg.say('pris2', 'Get your hands off me! Somebody hold this one down.', { noFocus: true }); await gg.say('', 'In Socrates’ telling, if the prisoners could get their hands on the person who tried to free them and lead them up, they would kill him.', { noFocus: true }); }
      else await gg.say('', 'You sit among them. You know what the shapes are, and you can’t win a single round.', { noFocus: true });
    });
    await backToHill();
  }

  // ---- the divided line: a puzzle for those who want it
  function lineWidget(gg) {
    if (gg.ui.auto) return Promise.resolve();
    return new Promise((res) => {
      $('pickTitle').textContent = 'The divided line'; $('pickSub').textContent = 'Drag the slider to cut the line in two. Each part is then cut again in the same proportion.';
      const wrap = $('pickCards'); wrap.innerHTML = ''; wrap.style.display = 'block';
      const bar = el('div'); bar.style.cssText = 'display:flex;height:54px;border:1px solid #2a2118;border-radius:4px;overflow:hidden;margin:14px 0 6px;font-family:system-ui;font-size:12.5px;text-align:center;line-height:1.25';
      const names = ['Pictures', 'Things', 'Working out', 'Understanding'], cols = ['#d9c9a0', '#c4b08a', '#a9b9c4', '#8fa6b8'], segs = names.map((n, i) => { const s = el('div'); s.style.cssText = 'background:' + cols[i] + ';display:flex;align-items:center;justify-content:center;padding:2px;border-right:1px solid #2a2118'; bar.append(s); return s; });
      const info = el('p'); info.style.fontSize = '16px';
      const range = el('input'); range.type = 'range'; range.min = '55'; range.max = '85'; range.value = '66'; range.style.width = '100%'; range.setAttribute('aria-label', 'Where to make the first cut, as a percent');
      const draw = () => { const r = range.value / 100, len = [(1 - r) * (1 - r), (1 - r) * r, r * (1 - r), r * r]; segs.forEach((s, i) => { s.style.width = (len[i] * 100) + '%'; s.textContent = names[i] + ' ' + Math.round(len[i] * 100); }); info.textContent = 'What we see: ' + Math.round((1 - r) * 100) + ' parts. What we can only think about: ' + Math.round(r * 100) + ' parts. The two middle sections are ' + Math.round(len[1] * 100) + ' and ' + Math.round(len[2] * 100) + '.'; };
      range.addEventListener('input', draw); draw();
      const q = el('p', null, 'Move the cut to a few different places. What do you notice about the two middle parts?'); q.style.fontSize = '17px';
      const row = el('div', 'row'), fb = el('p'); fb.style.cssText = 'font-size:16px;min-height:24px';
      ['They are always equal.', 'The second is always longer.', 'It depends on the cut.'].forEach((t, i) => { const b = el('button', 'btn ghost', t); b.onclick = () => { if (i === 0) { fb.textContent = 'Yes. However you cut the line, “things” and “working out” come out the same length.'; done.disabled = false; done.focus(); } else fb.textContent = 'Move the slider and read the two middle numbers again.'; }; row.append(b); });
      const done = el('button', 'btn', 'Continue'); done.disabled = true; done.onclick = () => { $('picker').classList.add('hidden'); wrap.style.display = ''; $('pickCancel').classList.remove('hidden'); gg.canvas.focus(); res(); };
      wrap.append(range, bar, info, q, row, fb, done);
      $('pickCancel').classList.add('hidden'); $('picker').classList.remove('hidden'); range.focus();
    });
  }
  async function placeOnLine(gg) {
    const secs = ['1. A picture of the thing: a shadow, a reflection, a story about it', '2. The thing itself, seen with your own eyes', '3. Working it out, from a starting point you take for granted', '4. Understanding it fully, taking nothing for granted'];
    const items = [
      ['The trees you saw upside down in the pond.', 0, 'Yes. A reflection is a picture of a thing. That’s the lowest level.'],
      ['The tree itself.', 1, 'Yes. That’s the thing the reflection was a picture of. The second level.'],
      ['A square, the way someone doing geometry thinks about it. The square he scratches in the sand is only his sketch of it.', 2, 'Yes. He reasons about something he can’t see, with a sketch to help him, and he never questions where he started from. The third level.'],
      ['Knowing what doing right really is, having questioned every starting point along the way.', 3, 'Yes. That’s the top. I told Glaucon I could only point toward it.'],
    ];
    for (const it of items) {
      for (;;) { const c = await gg.choose(secs, { prompt: it[0], name: 'Which level of knowing is this?' }); gg.log.push({ t: 'attempt', skill: 'line', correct: c === it[1] }); if (c === it[1]) break; await gg.say('socrates', 'Not that one. Ask yourself: is it a picture of something, the thing itself, something worked out with the help of a picture, or something understood all the way down?', { mood: 'think' }); }
      await gg.say('socrates', it[2], { mood: 'happy' });
    }
    await gg.say('socrates', 'I gave the four levels names, from the bottom up: imagination, belief, thought, and understanding.');
  }
}
