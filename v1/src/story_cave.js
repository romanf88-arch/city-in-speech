// The cave (Republic 514a-521b), with the sun and the line before it. The player sits at the wall, is freed, is dragged up,
// learns to see outside, and then has to decide whether to go back down.
import * as THREE from 'three';
import { Reflector } from '../vendor/Reflector.js';
import { $, el, clamp } from './util.js';
import { PLACES, POND_LEVEL } from './world.js';
import { CAVE } from './cave.js';
import { runDispute } from './dispute.js';
import { HOMES } from './story.js';

const PI = Math.PI, _d = new THREE.Vector3(), _t = new THREE.Vector3();

export function setupCave(g, api) {
  const S = g.sites, cave = g.cave, w = g.world;
  let phase = 0, dragging = false;

  // ---- the pond below the cave mouth, with a true reflection
  const pond = PLACES.pond;
  const mirror = new Reflector(new THREE.CircleGeometry(7.3, 28), { textureWidth: 512, textureHeight: 512, color: 0x8fa3a8, clipBias: 0.003, multisample: 0 });
  mirror.rotation.x = -PI / 2; mirror.position.set(pond[0], POND_LEVEL, pond[1]);
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

  // After the story has been heard, the cave can be walked into from the hillside.
  g.addTrigger({ x: S.mouth.x, z: S.mouth.z + 1.6, r: 2.3, when: () => !g.flags.inStory, run: async (gg) => {
    if (!gg.flags.cave) { await gg.say('', 'Past the first few steps it is too dark to see. Socrates is on the stone seat below. Hear him first.'); gg.player.z += 2.2; return; }
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
    if (!gg.flags.book1) { await gg.say('socrates', 'You have come up the hill before hearing how it began. Go down to the house of Cephalus first. I am not going anywhere.'); return; }
    if (gg.flags.cave) { await gg.say('socrates', 'I told you what it seemed like to me. Only a god knows whether it is true.'); return; }
    await gg.say('socrates', 'They have sent you up the hill for the cave. I told it to Glaucon near the middle of the night, when he pressed me to say what the good is.');
    await gg.say('socrates', 'I could not say. I was afraid of making a fool of myself. So I told him what it is like. As the sun lets the eye see and makes things grow, the good lets the mind know and gives what is known its being. Glaucon laughed at how far that went.');
    gg.giveCard('sun');
    await gg.say('socrates', 'Then I had him picture a line cut in four: shadows, the things that cast them, what geometers reason about, and what argument reaches when it takes nothing for granted. We will draw it afterward.');
    gg.giveCard('line');
    await gg.say('socrates', 'And then a picture. Compare our nature, I said, with education and without it, to something like this. Sit down. You will be in it.');
    runCave();
  };

  async function runCave() {
    g.flags.inStory = true; g.busyEnv = true;
    await g.ui.fade(1, 1.2);
    const seat = cave.seat(3);
    cave.setOrder(['jar', 'horse', 'man', 'tree']); cave.mode = 'show'; cave.fireLevel = 1; cave.t = 3;
    g.env('cave', 0); g.teleport('cave', seat.x, seat.z, PI);
    Object.assign(g.cam, { mode: 'first', fpLimit: [0.5, 0.6], fpYaw: 0, fpPitch: -0.32, fpHeight: 0.95 });
    g.frozen = true; phase = 1; g.objective(null);
    let strained = 0; g.onStrain = () => { if (g.time - strained > 6 && phase === 1) { strained = g.time; g.ui.hint('The collar holds your neck. You can look only at the wall.'); setTimeout(() => g.ui.hint(null), 3500); } };
    g.ui.area('The cave', 'A picture Socrates is making');
    await g.ui.fade(0, 1.6);
    await say('', 'You have sat here since you were a child. Your legs and your neck are held, so you can look only at this wall. The shapes that cross it are all you know of the world.');
    await say('', 'The people beside you call out a name as each shape goes by, and their voices come back off the wall as if the shapes had spoken.');
    // naming, then predicting
    const kinds = ['horse', 'jar', 'tree', 'man'], label = { horse: 'The horse.', jar: 'The jar.', tree: 'The tree.', man: 'The man.' };
    const crossing = async (lead) => { if (!g.ui.auto) await until(() => cave.nextCrossing().dt < lead, 0.05); return cave.nextCrossing().kind; };
    let right = 0;
    for (let r = 0; r < 2; r++) {
      const k = await crossing(1.6);
      await g.run(async (gg) => {
        const opts = kinds.filter((x) => x !== k).slice(0, 2).concat(k).sort(), c = await gg.choose(opts.map((x) => label[x]), { prompt: 'A shape is crossing the wall. What is it?', name: '' });
        const ok = opts[c] === k; right += ok ? 1 : 0; gg.log.push({ t: 'attempt', skill: 'shadows', correct: ok });
        await gg.say('pris2', ok ? label[k].replace('.', '') + '. Yes.' : 'No. That is ' + label[k].toLowerCase().replace('.', '') + '. Look again.', { noFocus: true });
      });
      if (!g.ui.auto) await g.wait(2.2);
    }
    await say('pris4', 'The sharp ones can say what is coming before it comes. Try.', {});
    for (let r = 0; r < 3; r++) {
      const upcoming = await crossing(6.2);
      let ok = false;
      await g.run(async (gg) => { const c = await gg.choose(kinds.map((x) => label[x]), { prompt: 'Which shape comes next?', name: '' }); ok = kinds[c] === upcoming; gg.log.push({ t: 'attempt', skill: 'shadows', correct: ok }); });
      if (!g.ui.auto) await until(() => cave.nextCrossing().kind !== upcoming || cave.nextCrossing().dt < 0.4, 0.05);
      right += ok ? 1 : 0;
      await say('pris2', ok ? 'There. He said it before it came.' : 'No. ' + label[upcoming].replace('.', '') + ' comes after that one. It always does.');
      if (!g.ui.auto) await g.wait(1.6);
    }
    g.flags.shadowScore = right;
    await say('pris4', right >= 3 ? 'Sharpest eyes in the row. Give him the prize.' : 'He will learn the order. We all did.');
    await say('', right >= 3 ? 'They honor you for it. Here that is what it means to know things: to say which shadow is which, and which comes next.' : 'Here that is what it means to know things: to say which shadow is which, and which comes next. They give prizes for it.');

    // ---- release
    phase = 2;
    const fr = g.npc('freer'); fr.show(true); fr.put(seat.x + 0.5, seat.z + 1.0, PI);
    await say('', 'Someone is behind you. The collar opens. Hands lift you to your feet and turn you round, toward the light.');
    g.cam.fpLimit = [0.9, 0.7]; g.cam.fpHeight = 1.62;
    if (g.ui.auto || g.reduceMotion) { g.player.heading = 0; } else for (let i = 1; i <= 40; i++) { g.player.heading = PI - (PI * i) / 40; setGlare(Math.min(1, i / 16)); await g.wait(0.07); }
    setGlare(1); fr.put(seat.x - 0.9, seat.z + 0.4, 0.4);
    let back = 0;
    await g.run(async (gg) => {
      await gg.say('', 'The light hurts. There is a fire up there, and things moving in front of it, and you cannot make out any of them.', { noFocus: true });
      back = await gg.choose(['Turn back to the wall.', 'Keep looking toward the light.']);
    });
    g.flags.turnedBack = back === 0;
    if (back === 0) {
      setGlare(0); g.player.heading = PI; g.cam.fpYaw = 0; g.cam.fpPitch = -0.3;
      await say('', 'There is the wall, and the shapes on it, as clear as ever. These still seem more real than whatever is behind you.');
      await say('', 'The hands turn you round again.');
      g.player.heading = 0; g.cam.fpYaw = 0; g.cam.fpPitch = -0.1;
    }
    setGlare(0.45);
    await say('', 'Slowly you begin to see. You can walk now. Look at what was behind you all those years.');
    g.cam.fpLimit = null; g.frozen = false; phase = 3; setGlare(0.2);
    g.objective('Look over the low wall', { x: 0, z: 3.2, label: 'The low wall', space: 'cave' });
  }

  const inCave = (o) => Object.assign({ space: 'cave' }, o);
  g.addSpot(inCave({ x: 0, z: 3.3, r: 2.6, label: 'Look over the low wall', when: () => phase === 3 && !g.flags.sawRoad, run: async (gg) => {
    gg.flags.sawRoad = true; setGlare(0.08);
    await gg.say('', 'A road runs behind the wall, and people walk along it carrying figures on poles: a horse, a jar, a tree, a man, cut from wood and stone. Some of them are talking and some are silent.', { noFocus: true });
    await gg.say('', 'What you called a horse was the shadow of one of these.', { noFocus: true });
    gg.objective('Walk where you like. The one who freed you is waiting by the steep path up.', { x: cave.tunnelX(16), z: 15.2, label: 'The path up', space: 'cave' });
    const fr = gg.npc('freer'); fr.put(cave.tunnelX(15) - 1.4, 13.6, PI);
  } }));
  g.addSpot(inCave({ x: 9.4, z: 4.9, r: 2.4, label: 'Ask the carriers who they are', when: () => phase === 3 && !g.flags.askedCarriers, run: async (gg) => {
    gg.flags.askedCarriers = true;
    await gg.say('', 'The nearest one looks through you and keeps walking. Another is telling nobody about the price of barley. None of them says who set them to this, or why.', { noFocus: true });
  } }));
  g.addSpot(inCave({ x: -9.4, z: 4.9, r: 2.4, label: 'Ask the carriers who they are', when: () => phase === 3 && !g.flags.askedCarriers, run: async (gg) => {
    gg.flags.askedCarriers = true;
    await gg.say('', 'The nearest one looks through you and keeps walking. Another is telling nobody about the price of barley. None of them says who set them to this, or why.', { noFocus: true });
  } }));
  g.addSpot(inCave({ x: 3.9, z: 9.6, r: 2.6, label: 'Look at the fire', when: () => phase === 3 && !g.flags.sawFire, run: async (gg) => {
    gg.flags.sawFire = true;
    await gg.say('', 'It is a fire, burning on a ledge high up and far back. From your seat you took its light for the only light there is.', { noFocus: true });
  } }));
  g.addSpot(inCave({ x: 1.3, z: -0.2, r: 2.0, label: 'Tell the others what is behind them', when: () => phase === 3 && g.flags.sawRoad && !g.flags.told, run: async (gg) => {
    gg.flags.told = true;
    await gg.say('pris4', 'Sit down. You are standing in front of the jar.', { noFocus: true });
    await gg.say('pris2', 'Figures on sticks. Listen to him. Which comes next, then? You do not know any more, do you.', { noFocus: true });
  } }));
  // the steep path: once on it you are dragged
  g.addTrigger(inCave({ x: cave.tunnelX(15.6), z: 15.6, r: 2.6, once: false, when: () => phase === 3 && g.flags.sawRoad, run: async (gg) => {
    phase = 4; dragging = true; gg.npc('freer').show(false); gg.speedScale = 0.8;
    await gg.say('', 'The path is rough and steep. You are dragged up it, and you are angry. You would sooner go back to the wall, where you could see.', { noFocus: true });
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
    await say('', 'Outside, the light is so strong that at first you can see nothing at all.');
    g.objective('Look down, at the shadows on the ground', null);
    await until(() => g.cam.fpPitch > 0.42); setGlare(0.7);
    await say('', 'Shadows. Those you can bear.');
    g.objective('Go to the water and look at what is in it', { x: pond[0], z: pond[1], label: 'The pond' });
    await until(() => Math.hypot(g.player.x - pond[0], g.player.z - pond[1]) < 11.5 && lookingAt(pond[0], POND_LEVEL, pond[1], 0.9)); setGlare(0.4);
    await say('', 'Trees, upside down in the water, and the sky under them. Pictures of things, and you can look at those too.');
    g.objective('Now look up at the trees themselves', null);
    await until(() => g.cam.fpPitch < 0.02 && trees.some((t) => lookingAt(t.position.x, t.position.y + 4, t.position.z, 0.9))); setGlare(0.15);
    await say('', 'The things themselves.');
    g.env('night', 6); if (!g.ui.auto) await g.wait(5);
    await say('', 'Night comes. The moon and the stars are easier on your eyes than the day was.');
    g.objective('Look at the moon', null);
    await until(() => view().dot(g.sky.sunDir) > 0.94); setGlare(0.05);
    g.env('dawn', 7); if (!g.ui.auto) await g.wait(6);
    g.objective('Last of all, look at the sun', null);
    await until(() => view().dot(g.sky.sunDir) > 0.955, 1.4); setGlare(0);
    await say('', 'The sun itself, in its own place. It gives the seasons and the years, and in some way it is the cause of everything you saw below.');
    await say('', 'You think of the others at the wall and the prizes they give each other. You would sooner be a poor man’s hired hand up here than live as they do.');
    await afterImage();
  }

  async function backToHill() {
    await g.ui.fade(1, 1.0);
    setGlare(0); setDim(false); g.cam.mode = 'follow'; g.frozen = false; cave.fireLevel = 1;
    const ex = S.exedra; g.teleport('world', ex.x + 0.6, ex.z + 3.4, PI);
    g.env('afternoon', 0); g.busyEnv = false; g.objective('Hear Socrates out', null);
    await g.ui.fade(0, 1.0);
  }

  async function afterImage() {
    await backToHill();
    await g.run(async (gg) => {
      await gg.say('socrates', 'That is the picture. Glaucon said they were strange prisoners, and I told him they are like us.');
      api.giveCards(gg, ['likeus', 'dragged', 'prizes']);
      await gg.say('socrates', 'I told him how to read it. The prison is the world we see. The fire is our sun. The climb is the soul’s journey to what is known by thought, and the last thing seen there, with great effort, is the good. Whether that is true, only a god knows.');
      gg.giveCard('key');
      await gg.say('socrates', 'And I said what I think it shows about teaching. Some people claim to put knowledge into a soul that has none, like putting sight into blind eyes. But the power is in everyone already. An eye cannot turn to the light unless the whole body turns. Education is the craft of that turning.');
      gg.giveCard('turn');
      await gg.say('socrates', 'Now the line. Take this stick and cut it where you like, as long as the parts are unequal. I will cut each part again in the same proportion.');
      await lineWidget(gg);
      await placeOnLine(gg);
      await api.gather(gg, ['kleio', 'sannion', 'archedemos', 'theano']);
      await gg.say('theano', 'One thing before we argue. You saw that the two middle parts of the line came out equal however you cut it. Socrates never mentions it. A scholar named Denyer thinks Plato knew and meant it. Reeve says the lengths of those two carry no meaning. A third, McAleer, calls it a wrinkle.');
      await runDispute(gg, 'cave');
      // ---- the return
      await gg.say('socrates', 'There is one thing left. The founders of our city will not let the ones who reach the light stay there. Each in turn must go back down and live with the prisoners, and rule.');
      await gg.say('socrates', 'Glaucon objected. He said we would be making them live a worse life when a better one is open to them.');
      api.giveCards(gg, ['godown', 'least', 'fifty', 'worse']);
      const c = await gg.choose(['Go back down.', 'Stay in the light.'], { prompt: 'You have been outside. What do you do?', name: 'Socrates' });
      gg.flags.wentBack = c === 0;
    });
    if (g.flags.wentBack) await goBackDown();
    else await g.run(async (gg) => {
      await gg.say('socrates', 'Then here is what the founders will say to you. In other cities people like you grow up by themselves and owe nothing. But we raised you, for your own sake and the city’s, like leaders in a hive. You see better than they do down there. Go in your turn.');
      const c = await gg.choose(['Then I will go, because it is a just order.', 'I still will not go.']);
      gg.flags.refused = c === 1;
      await gg.say('socrates', c === 0 ? 'Glaucon said the same: they will go, as to something that cannot be avoided, and not as to something fine.' : 'Then the city we built has a hole in it exactly where its best citizen stands. Hear what these people make of that.');
    });
    await g.run(async (gg) => {
      await api.gather(gg, ['kleio', 'sannion', 'archedemos', 'theano', 'dromon']);
      await gg.say('dromon', 'Before you settle this, take the ship he described last night. I am a helmsman, and I have views on it.');
      gg.giveCard('ship');
      await runDispute(gg, 'back');
      gg.flags.cave = true; gg.flags.inStory = false; gg.audio.phrase([220, 262, 330, 392, 440]);
      for (const id of ['kleio', 'sannion', 'theano', 'dromon']) api.relocate(gg, id, ...HOMES[id]);
      api.relocate(gg, 'archedemos', S.citySite.x - 5, S.citySite.z + 5, -2.2);
      api.refreshObjective(gg);
    });
  }

  async function goBackDown() {
    await g.ui.fade(1, 1.0);
    const seat = cave.seat(3);
    cave.setOrder(['bird', 'man', 'jar', 'tree']); cave.fireLevel = 0.5; cave.t = 9; g.busyEnv = true;
    g.env('cave', 0); g.teleport('cave', seat.x, seat.z, PI);
    Object.assign(g.cam, { mode: 'first', fpLimit: [0.5, 0.6], fpYaw: 0, fpPitch: -0.32, fpHeight: 0.95 }); g.frozen = true; phase = 6; setDim(true);
    g.npc('freer').show(false);
    await g.ui.fade(0, 1.2);
    await say('', 'You go back down and sit in your old place. Coming out of the sunlight, your eyes are full of darkness. The shapes on the wall are a blur.');
    const kinds = ['bird', 'man', 'jar', 'tree', 'horse'], label = { horse: 'The horse.', jar: 'The jar.', tree: 'The tree.', man: 'The man.', bird: 'The bird.' };
    for (let r = 0; r < 2; r++) {
      if (!g.ui.auto) await until(() => cave.nextCrossing().dt < 1.6, 0.05);
      const k = cave.nextCrossing().kind;
      await g.run(async (gg) => {
        const c = await gg.choose(kinds.slice(0, 4).map((x) => label[x]), { prompt: 'Something is crossing the wall. What is it?', name: '' });
        await gg.say('pris2', kinds[c] === k ? 'Late. And he had to squint to get it.' : 'Wrong. He used to be the best of us.', { noFocus: true });
      });
      if (!g.ui.auto) await g.wait(1.5);
    }
    let free = 1;
    await g.run(async (gg) => {
      await gg.say('pris4', 'He went up there and came back with his eyes ruined. It is not worth even trying to go.', { noFocus: true });
      free = await gg.choose(['Try to free the one beside you.', 'Sit still and say nothing.']);
      gg.flags.triedToFree = free === 0;
      if (free === 0) { await gg.say('pris2', 'Take your hands off me. Hold him, somebody.', { noFocus: true }); await gg.say('', 'In Socrates’ telling, if they could get their hands on the man who tried to free them and lead them up, they would kill him.', { noFocus: true }); }
      else await gg.say('', 'You sit among them, knowing what the shapes are, and unable to win a single round.', { noFocus: true });
    });
    await backToHill();
  }

  // ---- the divided line
  function lineWidget(gg) {
    if (gg.ui.auto) return Promise.resolve();
    return new Promise((res) => {
      $('pickTitle').textContent = 'The divided line'; $('pickSub').textContent = 'Drag the slider to make the first cut. Each part is then cut again in the same proportion.';
      const wrap = $('pickCards'); wrap.innerHTML = ''; wrap.style.display = 'block';
      const bar = el('div'); bar.style.cssText = 'display:flex;height:54px;border:1px solid #2a2118;border-radius:4px;overflow:hidden;margin:14px 0 6px;font-family:system-ui;font-size:12.5px;text-align:center;line-height:1.25';
      const names = ['Pictures', 'Things', 'What geometers reason about', 'What argument reaches'], cols = ['#d9c9a0', '#c4b08a', '#a9b9c4', '#8fa6b8'], segs = names.map((n, i) => { const s = el('div'); s.style.cssText = 'background:' + cols[i] + ';display:flex;align-items:center;justify-content:center;padding:2px;border-right:1px solid #2a2118'; bar.append(s); return s; });
      const info = el('p'); info.style.fontSize = '16px';
      const range = el('input'); range.type = 'range'; range.min = '55'; range.max = '85'; range.value = '66'; range.style.width = '100%'; range.setAttribute('aria-label', 'Where to make the first cut, as a percent');
      const draw = () => { const r = range.value / 100, len = [(1 - r) * (1 - r), (1 - r) * r, r * (1 - r), r * r]; segs.forEach((s, i) => { s.style.width = (len[i] * 100) + '%'; s.textContent = names[i] + ' ' + Math.round(len[i] * 100); }); info.textContent = 'Seen: ' + Math.round((1 - r) * 100) + ' parts. Thought: ' + Math.round(r * 100) + ' parts. The two middle sections are ' + Math.round(len[1] * 100) + ' and ' + Math.round(len[2] * 100) + '.'; };
      range.addEventListener('input', draw); draw();
      const q = el('p', null, 'Move the cut to several places. What do you find about the two middle parts?'); q.style.fontSize = '17px';
      const row = el('div', 'row'), fb = el('p'); fb.style.cssText = 'font-size:16px;min-height:24px';
      ['They are equal wherever I cut.', 'The second is always longer.', 'It depends on the cut.'].forEach((t, i) => { const b = el('button', 'btn ghost', t); b.onclick = () => { if (i === 0) { fb.textContent = 'Yes. However the line is cut, the things we see and the things geometers reason about get the same length.'; done.disabled = false; done.focus(); } else fb.textContent = 'Move the slider and read the two middle numbers again.'; }; row.append(b); });
      const done = el('button', 'btn', 'Continue'); done.disabled = true; done.onclick = () => { $('picker').classList.add('hidden'); wrap.style.display = ''; $('pickCancel').classList.remove('hidden'); gg.canvas.focus(); res(); };
      wrap.append(range, bar, info, q, row, fb, done);
      $('pickCancel').classList.add('hidden'); $('picker').classList.remove('hidden'); range.focus();
    });
  }
  async function placeOnLine(gg) {
    const secs = ['Pictures: shadows and reflections', 'Things: what casts them', 'What geometers reason about', 'What argument reaches when it takes nothing for granted'];
    const items = [
      ['The trees you saw upside down in the pond.', 0, 'A reflection is a picture of a thing. Lowest part.'],
      ['The tree itself.', 1, 'The thing that the reflection is a picture of. Second part.'],
      ['The square a geometer reasons about. The one he draws in the sand is only his picture of it.', 2, 'He uses the drawn square as a picture and takes his starting points for granted. Third part.'],
      ['What justice is, reached by argument that questions even its own starting points.', 3, 'That is the top, and I told Glaucon I could only point toward it.'],
    ];
    await gg.say('socrates', 'Now place a few things on it.');
    for (const it of items) {
      for (;;) { const c = await gg.choose(secs, { prompt: it[0], name: 'Where on the line?' }); gg.log.push({ t: 'attempt', skill: 'line', correct: c === it[1] }); if (c === it[1]) break; await gg.say('socrates', 'Not there. Ask whether it is a picture of something, the thing itself, something reasoned about with the help of pictures, or something reached by argument alone.'); }
      await gg.say('socrates', it[2]);
    }
    await gg.say('socrates', 'And as a picture stands to the thing, so the whole of what we see stands to what we can only think. That is all the line says. I gave the four states of mind these names, from the bottom up: imagination, belief, thought, understanding.');
  }
}
