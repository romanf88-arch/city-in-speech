// The stranger's errand, part 5: the man himself. Socrates says where he is once the player has been through the
// cave. Bion burns charcoal on a shelf of the hill west of the cave, and the only guide to him is his smoke. Before
// he tells anything the mound breaks open and the player helps him close it. Then he gives his account, and asks the
// player what he owes and to whom. Each of the four answers costs somebody, and the game does not say which is right.
//
// From the texts (Reeve's Republic, research/notes-passages.md):
//   331b  Cephalus on the best use of money: to end up owing nothing to a god or a person.
//   331c  the friend who lends you his weapons and then goes mad: giving back what you owe is not always right.
//   331e  Simonides, as Polemarchus quotes him: give each what is owed; then "good to friends, harm to enemies".
//   335e  "it is never just to harm anyone".
//   359c-360d  the ring: what would a man do if nobody could see?
// Aristophanes, Acharnians about 325-340 (research/ancient/aristophanes-acharnians-204.txt): the old men of Acharnae
//   are charcoal burners, and a basket of coals is "our fellow-citizen".
// Invented: Bion, Dexippos, Philokles, Sosias and his son, the doorkeeper, the jar, the stranger's mother and her
// house, what Socrates says about Bion, and what becomes of everyone. How a charcoal mound is tended is not from an
// ancient text read for this game. Nothing here states Athenian law on debts.
import * as THREE from 'three';

const PIT = { x: -119, z: -260 };                         // the mound
const HUT = { x: -126.5, z: -264.5, rot: 1.2 };
const STAND = { x: PIT.x + 3.3, z: PIT.z + 0.4 };         // where Bion works, on the side the path comes up
const BREAKS = [2, 5, 0, 3, 1], LIFE = [10, 9, 8, 7, 7];  // which side of the mound opens, in order, and how many seconds each can burn

const PICKS = ['collect', 'forgive', 'pay', 'steal'];
const TEXT = {
  collect: 'You took the thirty minas for Melitta’s dowry. Bion carried the jar down to the harbor himself. Sosias and his son stay with Philokles, who sells at the new moon.',
  forgive: 'You left Bion the thirty minas to buy back Sosias and his son. Melitta has no dowry, and you have a letter to write.',
  pay: 'You left Bion the thirty minas to buy back Sosias and his son. You will pay Melitta’s dowry by selling your mother’s house and her olive trees. Bion says he will pay you back over twenty years.',
  steal: 'You left Bion the thirty minas to buy back Sosias and his son. You mean to take Melitta’s thirty from Philokles’s chest by night. Bion told you the doorkeeper will be beaten for it.',
};
const AFTER = {
  forgive: 'First light. I have not slept since the jar came, and I will not sleep tonight.',
  pay: 'Twenty springs. The first payment comes with the charcoal boat.',
  steal: 'I never saw you. Go down by the east path. It is darker.',
};
const EPILOGUE = {
  collect: ['Bion carried the jar down to your ship that evening. Then he went and stood at Philokles’s door until Sosias came out to him.',
    'At the new moon Sosias was sold to a man from Megara, and his son to a miller at Phaleron. Melitta will be married in the autumn, with her dowry whole.'],
  forgive: ['At first light Bion went down to the harbor with the jar. He came back up the hill with Sosias and the boy.',
    'You sail home with nothing in your belt and a letter to write. Melitta’s wedding is put off. The bridegroom’s father has stopped answering.'],
  pay: ['At first light Bion went down to the harbor with the jar. He came back up the hill with Sosias and the boy.',
    'When you get home you will sell the house and the olive trees, and your mother will go to live with her brother. Melitta will be married in the autumn. Bion’s first payment is due in the spring.'],
  steal: ['In the morning Bion bought Sosias and the boy. That night you went into Philokles’s back room and came out with thirty minas, and nobody saw you.',
    'Philokles had his doorkeeper beaten, and sold him a week later. Melitta will be married in the autumn, with her dowry whole. Nobody in the Piraeus connects any of it with you.'],
};

export function setupBion(g, api) {
  if (!g.errand) return;
  const w = g.world, PI = Math.PI, yAt = (x, z) => w.terrainY(x, z), dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const my = yAt(PIT.x, PIT.z), north = { zone: 'north' };

  // ---- the place: a hut, the mound, cut wood, sacks of charcoal
  g.kit.spawn('hut', HUT.x, HUT.z, HUT.rot, north);
  g.kit.spawn('sacks', HUT.x + 3.4, HUT.z + 2.2, 0.7, north);
  g.kit.spawn('stool', PIT.x + 4.1, PIT.z - 2.3, 0, { zone: 'north', noCollide: true });
  const jar = g.kit.spawn('amphora', PIT.x + 3.3, PIT.z - 1.3, 0, { zone: 'north', noCollide: true }); jar.visible = false;
  {
    const geo = new THREE.SphereGeometry(2.3, 18, 8, 0, PI * 2, 0, PI / 2), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.07 * Math.sin(x * 3.1 + z * 1.7) + 0.05 * Math.sin(z * 4.3 - x); p.setXYZ(i, x * k, y * 0.62 * k, z * k); }
    geo.computeVertexNormals();
    const mound = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x51463a })); mound.position.set(PIT.x, my - 0.3, PIT.z); mound.castShadow = mound.receiveShadow = true; w.group.add(mound);
    w.addCircle(PIT.x, PIT.z, 2.25, 1.6);
    // cut oak, stacked four rows high, drawn in one call
    const logG = new THREE.CylinderGeometry(0.12, 0.13, 1.6, 7); logG.rotateZ(PI / 2);
    const logs = new THREE.InstancedMesh(logG, new THREE.MeshLambertMaterial({ color: 0x6a5138 }), 14), m = new THREE.Matrix4(), wx = PIT.x - 4.6, wz = PIT.z + 3.4, wy = yAt(wx, wz);
    let n = 0; for (let row = 0; row < 4; row++) for (let i = 0; i < 5 - row; i++) { m.makeRotationY(0.5 + 0.03 * ((n * 7) % 5 - 2)); m.setPosition(wx + (i - (4 - row) / 2) * 0.27 * Math.sin(0.5), wy + 0.12 + row * 0.22, wz + (i - (4 - row) / 2) * 0.27 * Math.cos(0.5)); logs.setMatrixAt(n++, m); }
    logs.castShadow = true; w.group.add(logs); w.addCircle(wx, wz, 0.95, 1.2);
  }

  // ---- the smoke: the only guide to the place. A column of soft puffs that rises 34 m and leans with the wind.
  const puffTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const puffs = [], top = my + 1.1, N = 20;
  for (let i = 0; i < N; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x5f5b58, transparent: true, opacity: 0, depthWrite: false })); s.position.set(PIT.x, top, PIT.z); s.renderOrder = 1000; w.group.add(s); puffs.push(s); }   // drawn after the sky (which is drawn at 900), or the sky paints over it
  // flames that break out of the side of the mound, one at a time
  const flames = [], at = (k, r) => { const a = k * PI / 3 + 0.5; return [PIT.x + Math.sin(a) * r, PIT.z + Math.cos(a) * r]; };
  for (let k = 0; k < 6; k++) { const [x, z] = at(k, 2.2), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.sky.glowTex, color: 0xff9440, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.position.set(x, yAt(x, z) + 0.55, z); s.visible = false; w.group.add(s); flames.push(s); }

  g.addNPC({ id: 'bion', name: 'Bion', role: 'burns charcoal on the hill', color: '#8a7a5a', look: { face: 't1', skin: 'olive', hair: 0x3a3028, beard: 'full', robe: 0x5a4a3a, length: 'short', hat: 'none', build: 1.1 }, x: STAND.x, z: STAND.z, h: Math.atan2(PIT.x - STAND.x, PIT.z - STAND.z), prop: 'staff', propHand: 'handR' });
  const bion = g.npc('bion');

  let state = 0;            // 0 before the mound breaks, 1 while it is breaking open, 2 afterwards
  let cur = -1, step = 0, left = 0, gap = 0, saved = 0, lost = 0, heat = 0;
  // ---- camera positions chosen by hand for this scene (the review Roman passed on asked for authored shots in
  // conversations). cut() places the camera at once; ease() lets it travel there. back() returns to the walking camera.
  const by = yAt(STAND.x, STAND.z), V = (a) => g.camera.position.clone().set(a[0], a[1], a[2]);
  const SHOT = {
    wide: [[PIT.x + 11.5, by + 1.9, PIT.z - 1.5], [PIT.x, by + 3.2, PIT.z + 0.3]],                    // the mound, the smoke and the man, as you come up
    both: [[PIT.x + 7.1, by + 1.85, PIT.z + 2.6], [PIT.x + 3.7, by + 1.45, PIT.z - 0.3]],       // over your shoulder, with him against the mound
    jar: [[PIT.x + 5.0, by + 1.0, PIT.z + 0.3], [PIT.x + 3.4, by + 0.45, PIT.z - 1.25]],        // the jar on the ground between you
    face: [[PIT.x + 5.0, by + 1.72, PIT.z - 0.35], [STAND.x, by + 1.58, STAND.z]],              // close on him for his question
  };
  const cam = (k, snap) => { const c = g.cam, [p, l] = SHOT[k]; c.mode = 'fixed'; c.fixed = { pos: V(p), look: V(l) }; if (snap) g.snapCam = true; };
  const cut = (k) => cam(k, true), ease = (k) => cam(k, g.reduceMotion), back = () => { const c = g.cam; if (c.mode !== 'fixed') return; c.mode = 'follow'; c.fixed = null; c.yaw = g.player.heading; g.snapCam = true; };
  const stand = (gg) => { const x = PIT.x + 5.4, z = PIT.z - 0.7; gg.player.place(x, z, Math.atan2(STAND.x - x, STAND.z - z)); bion.put(STAND.x, STAND.z, Math.atan2(x - STAND.x, z - STAND.z)); };   // the two men facing each other, with the jar's place between them
  const thud = () => { if (g.audio.burst) g.audio.burst(0, 0.18, 240, 90, 0.12, 'lowpass', 0.8, 0.004); else g.audio.blip('pick'); };
  const crack = () => { if (g.audio.burst) g.audio.burst(0, 0.3, 2400, 600, 0.07, 'bandpass', 1.4, 0.004); };
  const tell = () => g.ui.hint(state === 1 ? 'Throw earth on each flame (E).   Closed: ' + saved + '   Burned through: ' + lost : null);

  g.tickers.push((dt) => {
    const f = g.flags, p = g.player, here = g.space === 'world', d = here ? dist(p, PIT.x, PIT.z) : 1e9;
    // the smoke
    heat = state === 1 ? Math.min(1, heat + dt) : Math.max(0, heat - dt * 0.25);
    const seen = here && d < 250, t = g.time;   // not drawn from the town
    for (let i = 0; i < N; i++) {
      const s = puffs[i]; s.visible = seen; if (!seen) continue;
      const q = (t / 20 + i / N) % 1, lean = q * q, k = 2 + q * 11;
      s.position.set(PIT.x + lean * 9 + Math.sin(i * 2.4 + q * 5) * 0.5 * q, top + q * 34, PIT.z + lean * 3 + Math.cos(i * 1.7 + q * 4) * 0.5 * q);
      s.scale.set(k, k, 1); s.material.opacity = (0.72 + 0.2 * heat) * Math.pow(Math.sin(PI * Math.min(1, q * 1.3)), 0.6) * (1 - q * 0.65);   // a dark grey that shows against a bright sky
      s.material.color.setHex(heat > 0.5 ? 0x3f3b38 : 0x5f5b58);
    }
    if (f.lead4 && bion.hidden && f.bion !== 'collect') bion.show(true);   // he is at the pit once Glaucon has said which road he took
    if (!here) return;
    if (f.lead4 && !f.bionSeen && d < 55) { f.bionSeen = true; api.refreshObjective(g); }
    if (state !== 1 || g.busy || d > 22) return;        // the mound waits for a player who has walked off
    if (cur < 0) {
      gap -= dt; if (gap > 0) return;
      if (step >= BREAKS.length) { finish(); return; }
      cur = BREAKS[step]; left = LIFE[step]; crack(); return;
    }
    left -= dt; const s = flames[cur]; s.visible = true; s.scale.setScalar(0.9 + 2.1 * (1 - left / LIFE[step]) + 0.14 * Math.sin(t * 23));
    if (left <= 0) { lost++; s.visible = false; cur = -1; step++; gap = 1.4; g.audio.blip('bad'); tell(); }
  });
  for (let k = 0; k < 6; k++) { const [x, z] = at(k, 3.15); g.addSpot({ x, z, r: 2.0, label: 'Throw earth on the flame', when: () => state === 1 && cur === k, run: async () => { saved++; flames[cur].visible = false; cur = -1; step++; gap = 1.4; thud(); tell(); } }); }

  function startTask(gg) {
    state = 1; step = 0; cur = -1; gap = 0.8; saved = lost = 0;
    bion.put(PIT.x - 3.3, PIT.z - 0.5, Math.atan2(3.3, 0.5));
    gg.objective('Close every break in the mound before it burns through', null); tell();
  }
  function finish() {
    state = 2; g.flags.bionSaved = saved; for (const s of flames) s.visible = false; g.ui.hint(null);
    g.run(async (gg) => { await account(gg); });
  }

  async function hello(gg) {
    const f = gg.flags;
    gg.ui.area('The charcoal pit', 'On the hill west of the cave');
    f.lead5 = true; f.bionSeen = true; cut('wide');
    await gg.say('', 'A man is pushing earth up against a smoking mound with the end of a pole. He stops when he sees you. He does not put the pole down.');
    await gg.say('bion', 'If Philokles sent you, go back and tell him there is nothing left up here that a man can carry.', { mood: 'angry' });
    const c = await gg.choose(['My father lent you thirty minas. He died last winter. I am his son.', 'Polemarchus thought you might want work.', 'I’m only asking the way over the hill.'], { prompt: 'What do you tell him?', name: 'Bion' });
    f.bionHello = c;
    if (c === 0) await gg.lines([['bion', 'His son.', 'think'], ['bion', 'I have looked down that path every day since the spring, waiting for you. I thought you would be older.', 'sad']]);
    else if (c === 1) await gg.lines([['bion', 'Polemarchus. He was always decent to me. I have no bench and no tools, so tell him no, and thank him.', 'think']]);
    else await gg.lines([['bion', 'Go over the top and keep the sea on your left. Nobody comes this way to get anywhere.', 'think']]);
    await gg.say('', 'Behind him the side of the mound splits, and a tongue of flame comes out of the earth.');
    await gg.lines([
      ['bion', 'It’s breaking open. If the air gets in, a month of oak is ash by dark.', 'afraid'],
      ['bion', 'Take this side. Earth on every flame you see, with your hands if you have to. Go!', 'angry']]);
    back();
  }

  async function account(gg) {
    const f = gg.flags, s = f.bionSaved || 0;
    stand(gg); cut('both');
    await gg.say('', s >= 4 ? 'The mound holds. The smoke thins to a grey thread again.' : s >= 2 ? 'The mound holds, but one side of it has sunk in.' : 'The mound holds at last. Half of it has sunk in.');
    await gg.lines([
      ['bion', s >= 4 ? 'You shovel like a man who has never done it. But the mound is whole, and I could not have held both sides alone.' : s >= 2 ? 'Some of it is ash. Most of it is still charcoal, and I could not have held both sides alone.' : 'Half a month of wood is gone. Without you it would have been all of it.', s >= 2 ? 'happy' : 'sad'],
      ['bion', 'Sit down. A man who works at my fire can ask me what he likes.']]);
    if (f.bionHello) await gg.lines([
      ['bion', 'And you can stop talking about ' + (f.bionHello === 1 ? 'Polemarchus' : 'the way over the hill') + '. I saw the list in your belt when you bent down. I know that hand.', 'think'],
      ['bion', 'You are his son. You might have said so. I would sooner open my door to that than to a lie.', 'sad']]);
    await gg.lines([
      ['bion', 'Your father lent me thirty minas four years ago, to buy bronze. I paid him a little every spring until this one.'],
      ['bion', 'Then Dexippos came to me. We grew up on the same street. He owed Philokles sixty minas, and Philokles wanted a second man to promise the money if Dexippos could not pay. I promised.'],
      ['bion', 'Polemarchus will tell you a man should do good to his friends. I did good to mine. He took a ship the same month.', 'scorn'],
      ['bion', 'I paid Philokles thirty minas, which was everything in the house. For the other thirty he took me to court.'],
      ['bion', 'You have heard the speech, I expect. Thrasymachus wrote it. It was better than the truth, and the truth was all I had.', 'think'],
      ['bion', 'The court gave Philokles my tools. It also gave him Sosias and his boy.', 'sad'],
      ['bion', 'Sosias worked at the bench beside mine for eleven years. The boy was born in my house. They are slaves, and they were mine, and I lost them by giving my word for a friend.', 'sad'],
      ['bion', 'I left at night because I could not pay your father, and because I could not watch my bench carried across the street.']]);
    await gg.say('', 'He goes into the hut and comes back with a sealed jar. He sets it on the ground between you.');
    jar.visible = true; cut('jar');
    await gg.lines([
      ['bion', 'Nine days ago a sailor climbed this hill with that. No letter. Thirty minas in silver, and a clay token with Dexippos’s mark on it.'],
      ['bion', 'So he pays what he owes after all. Late, and to the wrong man. But he pays.', 'think']]);
    cut('both');
    await gg.lines([
      ['bion', 'Philokles sells at the new moon. That is four days from now. He will sell Sosias to one buyer and the boy to another, because he gets a better price that way.'],
      ['bion', 'Thirty minas buys both of them back from him today. I have asked. Thirty minas is also what I owe your father.'],
      ['bion', 'I have sat with this jar for nine days. Every morning I know which is right, and every morning it is the other one.', 'sad']]);
    await gg.say('', 'You tell him what your father wrote beside his name. The thirty minas were never your father’s own. They are the dowry of your cousin Melitta, who has no father and is to be married in the autumn.');
    await gg.lines([
      ['bion', 'A girl’s dowry.', 'afraid'],
      ['bion', 'Then it is worse than I thought, and I thought it was bad.', 'sad']]);
    await gg.say('', 'You count what you have yourself. Your father left the house your mother lives in, her olive trees, and this list. The house and the trees would fetch about thirty minas.');
    ease('face');
    await gg.lines([
      ['bion', 'Hear me. I will not run again, and I will not fight you. Say the word and I will carry this jar down to your ship myself.'],
      ['bion', 'But you have spent the day with people who talk about what a man owes. So tell me. What do I owe, and to whom?', 'plead']]);
    f.bionStory = true; api.note(gg, 'Bion’s account');
    await choice(gg);
  }

  async function choice(gg, again) {
    const f = gg.flags;
    if (again) { stand(gg); cut('face'); await gg.say('bion', 'The jar is where I put it. What do I owe, and to whom?', { mood: 'plead' }); }
    const A = [
      { text: 'Take the jar. It is Melitta’s dowry.', note: 'Sosias and his son are sold apart at the new moon.' },
      { text: 'Leave him the jar. Let him buy them back.', note: 'Melitta has no dowry, and you will have to tell her.' },
      { text: 'Leave him the jar, and pay Melitta’s dowry yourself.', note: 'Thirty minas is your mother’s house and her olive trees.' }];
    let c = await gg.choose([...A, { text: 'Leave him the jar. Philokles has thirty minas too.', note: 'Glaucon asked who would do right if nobody could see.' }], { prompt: 'What do you do about the silver?', name: 'Bion' });
    if (c === 3) {
      await gg.lines([
        ['bion', 'I know his house. It is one long room. He sleeps at the end by the door, and the chest stands at the far end behind a curtain. Nobody would see you.', 'think'],
        ['bion', 'I have thought of it on every one of these nine days. I will tell you why I did not do it.'],
        ['bion', 'When silver goes missing from that house, the doorkeeper is beaten for it first. He is an old Carian. He let me in every morning for a year and never once made me wait.', 'sad'],
        ['bion', 'Philokles would never know it was you. The old man would never know why.']]);
      const d = await gg.choose([{ text: 'Do it anyway, tonight.', note: 'The doorkeeper answers for it.' }, ...A], { prompt: 'What do you do about the silver?', name: 'Bion' });
      c = d === 0 ? 3 : d - 1;
    }
    const pick = PICKS[c];
    if (pick === 'collect') {
      await gg.say('bion', 'Then that is my answer. I asked for it.', { mood: 'sad' });
      await gg.say('', 'He ties the mouth of the jar again and lifts it to his shoulder.');
      await gg.say('bion', 'I will carry it to your ship. Then I am going to Philokles’s door. Sosias should hear it from me.', { mood: 'sad' });
    } else if (pick === 'forgive') await gg.lines([
      ['bion', 'You know what you are giving away. It is not yours. You told me so yourself.', 'think'],
      ['bion', 'I will go down at first light and buy them back. And I will still owe thirty minas, to a girl I have never seen.'],
      ['bion', 'Tell her I do not forget what I owe. It is not much to say to a bride.', 'sad']]);
    else if (pick === 'pay') await gg.lines([
      ['bion', 'Your own house? Then you sailed all this way to lose thirty minas, when you came to find them.', 'afraid'],
      ['bion', 'I will go down at first light and buy them back. And I will pay you, a little every spring, the way I paid your father.'],
      ['bion', 'I make good shields. It will take me twenty years.', 'think']]);
    else await gg.lines([
      ['bion', 'Then I never heard you say it, and you were never on this hill.', 'think'],
      ['bion', 'I will buy them out in the morning with this. What you do after dark is your own. I have told you who pays for it.']]);
    f.bion = pick; f.bionText = TEXT[pick]; api.note(gg, 'The silver');
    if (pick === 'collect') {
      await gg.ui.fade(1, 0.7); bion.show(false); jar.visible = false; cut('wide'); await gg.ui.fade(0, 0.9);
      await gg.say('', 'He goes down the path toward the harbor with the jar on his shoulder. He does not look back at the mound.');
    }
    back();
    if (f.mikaWith && !f.purseGone) await gg.say('mika', 'I thought finding him would be the hard part.', { mood: 'sad' });
    api.refreshObjective(gg);
  }

  bion.talk = async (gg) => {
    const f = gg.flags;
    if (f.bion) { await gg.say('bion', AFTER[f.bion] || '...'); return; }
    if (state === 1) { await gg.say('bion', 'Earth on the flames! We can talk afterwards.', { mood: 'angry' }); return; }
    if (f.bionStory) { jar.visible = true; await choice(gg, true); return; }
    if (f.bionSaved != null) { await account(gg); return; }
    if (f.bionHello == null) await hello(gg);
    else await gg.say('bion', 'It’s breaking through again. Take this side. We can talk when it holds.', { mood: 'afraid' });
    startTask(gg);
  };

  // ---- what the rest of the story asks of this part
  // Socrates, before the cave: he knows where the man is, and names his price.
  g.errand.caveAsk = async (gg) => {
    const f = gg.flags; if (!f.lead4 || f.lead5 || f.socAsked || f.cave) return;
    f.socAsked = true;
    await gg.say('', 'You ask him about a man with a sack who came up the hill road in the spring.');
    await gg.lines([
      ['socrates', 'The shield-maker. Yes, I know where he is.', 'happy'],
      ['socrates', 'But you climbed a hill to ask me a question, so you can stay for one of mine. Come and look at a cave first. I’ll tell you afterwards.']]);
  };
  // Socrates, after the cave: the fifth lead.
  g.errand.caveLead = async (gg) => {
    const f = gg.flags; if (f.errand0 == null || !f.lead4 || f.lead5 || f.bion) return;
    await gg.lines([
      ['socrates', 'Now, your shield-maker. He sat where you are sitting, one day in the spring. He asked me whether a man who can’t pay what he owes can still be a just man.'],
      ['socrates', 'I asked him what he owed, and to whom. The list came out longer than he expected.', 'happy'],
      ['socrates', 'He burns charcoal now, west of here, on the far side of this hill. You’ll see his smoke before you see him.'],
      ['socrates', 'When you find him, he may ask you what he asked me. I never did answer him.', 'think']]);
    f.lead5 = true; api.note(gg, 'Bion: smoke on the hill');
  };
  // The goal while this part is open: no marker until the player has come near enough to see the place.
  g.errand.bionOpen = () => !!(g.flags.lead5 && !g.flags.bion);
  g.errand.bionGoal = () => {
    const f = g.flags;
    if (state === 1) return ['Close every break in the mound before it burns through', null];
    if (!f.bionSeen) return ['Look for smoke on the hill west of the cave, and walk toward it', null];
    return [f.bionHello != null ? 'Talk to Bion at the charcoal pit' : 'Talk to the man at the charcoal pit', dist(g.player, STAND.x, STAND.z) > 8 ? { x: STAND.x, z: STAND.z, label: 'The charcoal pit' } : null];
  };
  g.errand.bionGuide = () => [g.flags.bionSeen ? 'That’s him, at the mound. Go and talk to him.' : 'Socrates said he burns charcoal west of the cave, on the far side of this hill. Look for a thin line of smoke and walk toward it.'];
  // How it came out, told at the very end (story_end.js).
  // A player who went to Philokles’s house at night gets the lines for what happened there (story_theft.js).
  g.errand.epilogue = async (gg) => { const f = gg.flags, e = (f.theft && f.theft !== 'back' && g.errand.theftLines && g.errand.theftLines()) || EPILOGUE[f.bion]; if (e) for (const line of e) await gg.say('', line); };
  // After a reload.
  g.errand.placeBion = () => {
    const f = g.flags;
    state = f.bionSaved != null ? 2 : 0; cur = -1; for (const s of flames) s.visible = false;
    bion.show(!!f.lead4 && f.bion !== 'collect'); bion.put(STAND.x, STAND.z, Math.atan2(PIT.x - STAND.x, PIT.z - STAND.z));
    jar.visible = !!f.bionStory && f.bion !== 'collect';
  };
  g.errand.placeBion();
  g.errand.pit = PIT;
}
