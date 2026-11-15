// The schoolroom: the first house the player can walk into. It is a side visit, open from the start and never
// required by the main story. Things to try: the wax tablet, the lyre master's four tunings, a boy's game of odd or
// even, and a favor for a boy's attendant that ends in a choice nobody settles.
//
// Every claim about schooling here is from research/notes-school.md, which names the passage for each. The source
// is shown to the player as a note under the line and in the journal. The lyre master, the attendant, the boy and
// his father, and the price of the roll are invented, and the journal's source list says so.

// The four tunings, as the scales later Greek writers gave these names (see the header of music.js), from a base
// pitch. What they sounded like in Socrates' day is not known for certain, and the note under the lines says so.
const TUNE = {
  mixo: { base: 246.94, r: [1, 256 / 243, 32 / 27, 4 / 3, 1024 / 729, 128 / 81, 16 / 9, 2], seq: [7, 6, 5, 4, 5, 4, 3, 2, 1, 0], gap: 0.44 },
  lydian: { base: 261.63, r: [1, 9 / 8, 81 / 64, 4 / 3, 3 / 2, 27 / 16, 243 / 128, 2], seq: [0, 2, 4, 2, 5, 4, 2, 4, 2, 1, 0], gap: 0.27 },
  dorian: { base: 329.63, r: [1, 256 / 243, 32 / 27, 4 / 3, 3 / 2, 128 / 81, 16 / 9, 2], seq: [4, 4, 3, 4, 2, 1, 0, 0, 3, 4, 0], gap: 0.36 },
  phrygian: { base: 293.66, r: [1, 9 / 8, 32 / 27, 4 / 3, 3 / 2, 27 / 16, 16 / 9, 2], seq: [0, 1, 3, 4, 3, 1, 2, 0], gap: 0.42 },
};
async function play(g, name) {
  const t = TUNE[name];
  for (const i of t.seq) { g.audio.pluck(t.base * t.r[i], t.gap * 2.6, 0.26); await g.wait(t.gap); }
  await g.wait(0.6);
}

// Letters as strokes in a box one unit wide and one high (y down), for the wax tablet.
const STROKES = {
  M: [[[0, 1], [0, 0], [0.5, 0.62], [1, 0], [1, 1]]],
  I: [[[0.5, 0], [0.5, 1]]],
  K: [[[0.08, 0], [0.08, 1]], [[0.95, 0], [0.08, 0.52], [0.95, 1]]],
  A: [[[0, 1], [0.5, 0], [1, 1]], [[0.2, 0.62], [0.8, 0.62]]],
};

// Go over faint letters on a wax tablet with the mouse. Resolves with the share of the letters covered (0 to 1).
// The Space bar or Enter finishes it for the player, so nobody is stuck here.
function trace(g, word, helper) {
  if (g.ui.auto) return Promise.resolve(1);
  return new Promise((res) => {
    const W = 680, H = 300, wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,8,6,.6)';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'max-width:92vw;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.6);cursor:crosshair;touch-action:none';
    const tip = document.createElement('div');
    tip.textContent = 'Hold the mouse button down and go over the faint letters. ' + (helper ? 'Press the Space bar and Theano will guide your hand.' : 'Press the Space bar to finish them without the mouse.');
    tip.style.cssText = 'margin-top:14px;color:#f4ecdc;font:17px/1.45 Palatino Linotype,Georgia,serif;text-align:center;max-width:min(92vw,640px)';
    wrap.append(cv, tip); document.body.append(wrap);
    const c = cv.getContext('2d'), n = word.length, lw = 96, lh = 150, gapX = (W - 80 - n * lw) / (n - 1), top = (H - lh) / 2;
    // The guide lines, and points along them to check against.
    const lines = [], pts = [];
    [...word].forEach((ch, k) => { for (const s of STROKES[ch]) lines.push(s.map(([x, y]) => [40 + k * (lw + gapX) + x * lw, top + y * lh])); });
    for (const l of lines) for (let i = 0; i < l.length - 1; i++) { const [ax, ay] = l[i], [bx, by] = l[i + 1], m = Math.ceil(Math.hypot(bx - ax, by - ay) / 6); for (let j = 0; j <= m; j++) pts.push({ x: ax + (bx - ax) * j / m, y: ay + (by - ay) * j / m, hit: false }); }
    const marks = [];   // what the player has scratched: lists of points
    const draw = () => {
      c.fillStyle = '#6b4a32'; c.fillRect(0, 0, W, H); c.fillStyle = '#4a3423'; c.fillRect(W / 2 - 4, 0, 8, H);
      c.fillStyle = '#2a2420'; c.fillRect(16, 16, W / 2 - 28, H - 32); c.fillRect(W / 2 + 12, 16, W / 2 - 28, H - 32);
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(214,196,160,.26)'; c.lineWidth = 2;
      for (const l of lines) { c.beginPath(); l.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
      c.strokeStyle = 'rgba(240,226,190,.92)'; c.lineWidth = 3.4;
      for (const m of marks) { c.beginPath(); m.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
    };
    const share = () => pts.filter((p) => p.hit).length / pts.length;
    let down = false, done = false;
    const at = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    const finish = (guided) => {
      if (done) return; done = true;
      if (guided) { marks.length = 0; for (const l of lines) marks.push(l); draw(); }
      window.removeEventListener('keydown', onKey, true);
      setTimeout(() => { wrap.remove(); res(guided ? 0 : share()); }, guided ? 900 : 500);
    };
    const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(share() < 0.8); } };
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); marks.push([at(e)]); g.audio.tone(300, 0.03, 'triangle', 0.02); });
    cv.addEventListener('pointerup', () => { down = false; });
    cv.addEventListener('pointermove', (e) => {
      if (!down || done) return;
      const p = at(e); marks[marks.length - 1].push(p);
      for (const q of pts) if (!q.hit && Math.hypot(q.x - p[0], q.y - p[1]) < 13) q.hit = true;
      draw(); if (share() > 0.86) finish(false);
    });
    window.addEventListener('keydown', onKey, true);
    draw();
  });
}

export function setupSchool(g, api) {
  const S = g.sites.school; if (!S) return;
  const at = (a, b) => { const [x, z] = S.at(a, b); return { x, z }; };
  const inRoom = (x, z) => !!g.world.indoor(x, z);
  const here = (id) => { const n = g.npc(id); return !!(n && !n.hidden && n.space === 'world' && inRoom(n.x, n.z)); };
  const mikaHere = () => { const m = g.npc('mika'); return !!(m && !m.hidden && m.behavior === 'follow' && m.space === g.space); };
  const visit = (gg, what) => { gg.flags[what] = true; gg.flags.schoolSeen = true; };

  // ---- walking in for the first time
  g.addTrigger(Object.assign(at(-1.5, 1.6), { r: 1.1, when: (gg) => !gg.flags.schoolSeen, run: async (gg) => {
    gg.flags.schoolSeen = true;
    gg.ui.area('The schoolroom', 'Where boys learn letters and the lyre');
    if (mikaHere()) await gg.lines([
      ['mika', 'I’ve never been inside. I used to stand under that window and listen to them chanting.', 'happy'],
      ['mika', 'Go on in. That’s Theano by the chair, and it’s her school.']]);
    else await gg.say('', 'A schoolroom. A boy is writing at a bench, two people are playing lyres, and an old man sits by the door with a staff.');
    api.note(gg, 'The schoolroom');
  } }));

  // ---- Theano, the first time she is spoken to in her own room
  const T = g.npc('theano'), oldT = T.talk;
  T.talk = async (gg, n) => {
    if (!here('theano') || gg.flags.schoolHello) return oldT ? oldT(gg, n) : undefined;
    gg.flags.schoolHello = true; gg.flags.schoolSeen = true; api.meet(gg, 'theano');
    await gg.say('theano', 'Come in. A school may not open before sunrise, and it has to shut before sunset. That’s the law.', { mood: 'happy', note: 'Aeschines, Against Timarchus 9-10. The speech was given in 345 BC, about seventy-five years after this day, and credits the rule to an old lawgiver.' });
    await gg.say('theano', 'Boys come here for two things: letters with me, and the lyre with the master over there. For wrestling and running they go to a trainer somewhere else.', { note: 'Plato, Protagoras 325d-326c. Xenophon, Constitution of the Lacedaemonians 2.1.' });
    await gg.say('theano', 'Their fathers pay for it. So the rich send their sons youngest and keep them here longest.', { note: 'Plato, Protagoras 326c.' });
    await gg.say('theano', 'I have never been sent a girl.', { mood: 'think', note: 'The ancient passages on schooling speak only of sons. Compare Xenophon, Oeconomicus 7.5-6, on how little a girl of a good family was taught.' });
    if (mikaHere()) await gg.say('mika', 'I’d have come.', { mood: 'sad' });
    await gg.lines([
      ['theano', 'Look around. The tablet on the bench is free, if you’d like to try writing. The lyre master will play for you if you ask. The small one on the floor will win your knucklebones off you.', 'happy'],
      ['theano', 'And the old man by the door has something on his mind. He has wanted to ask somebody a favor all day.']]);
  };

  // ---- the wax tablet
  g.addSpot(Object.assign(at(2.75, 0.91), { r: 1.5, label: 'Write on the wax tablet', run: async (gg) => {
    visit(gg, 'schoolTablet');
    await gg.say('', 'Two thin boards hinged like a book, each filled with wax. A pen with a sharp point lies across them.', { note: 'A teacher holds a tablet and pen like these on the cup painted by Douris about 480 BC (Berlin F 2285).' });
    const th = here('theano'), mk = mikaHere();
    if (th) await gg.say('theano', 'Let me start you off the way I start the little ones. I write the letters lightly, and you go over my lines.', { mood: 'happy', note: 'Plato, Protagoras 326d: the writing master first draws the letters “in faint outline” (W. R. M. Lamb’s translation).' });
    else await gg.say('', 'Someone has already written four letters lightly in the wax, for a pupil to go over.', { note: 'Plato, Protagoras 326d: the writing master first draws the letters “in faint outline” (W. R. M. Lamb’s translation).' });
    if (th && mk) await gg.lines([['theano', 'There. Four letters. That’s your name, Mika.'], ['mika', 'That’s me? You do it. I want to watch how.', 'happy']]);
    gg.ui.closeDialogue();
    const got = await trace(gg, 'MIKA', th);
    await gg.say('', got >= 0.8 ? 'Your lines wobble, but anyone could read them.' : th ? 'Theano’s hand closes over yours and finishes the strokes.' : 'You finish the strokes slowly, one at a time.');
    if (mk) await gg.lines([[th ? 'theano' : '', th ? 'Mu, iota, kappa, alpha.' : 'The four letters are mu, iota, kappa and alpha. They spell Mika.'], ['mika', 'Four scratches, and it’s me. I’ve sold garlands to half this town, and I have never seen my own name.', 'think']]);
    if (th) await gg.lines([
      ['theano', 'There are only a few letters. Every word you have ever heard is made out of them.'],
      ['theano', 'A boy can read when he can spot them anywhere, in a long word or in a short one.'],
      ['theano', 'Socrates used that last night. He said that knowing what courage is works the same way. You know it when you can spot it anywhere, in a big thing or in a small one.', 'think']]);
    api.giveCards(gg, ['reading']);
  } }));

  // ---- the lyre master and the four tunings
  const tunings = async (gg, first) => {
    const was = gg.music.on; gg.music.setOn(false);
    try {
      await gg.say('', 'He tunes the strings four different ways. Listen to each one.');
      for (const [name, line] of [
        ['mixo', 'This is the tuning for laments. You hear it at funerals.'],
        ['lydian', 'This is a soft one. It gets played late at a drinking party.'],
        ['dorian', 'This one is for a man who holds firm when things are going badly. In a battle, say.'],
        ['phrygian', 'And this one is for peaceful things a person chooses to do. Asking a favor, praying, listening to advice.']]) {
        await gg.say('lyremaster', line); gg.ui.closeDialogue(); await play(gg, name);
      }
    } finally { gg.music.setOn(was); }
    if (!first) return;
    const c = await gg.choose(['All four. They should know every kind of feeling.', 'Only the last two.', 'All of them except the drinking song.'], { prompt: 'Which of them would you let the boys learn?', name: 'The lyre master' });
    gg.flags.schoolTunings = c;
    const why = ' His city needs soldiers, and he didn’t want them brought up on weeping or on wine.';
    await gg.say('lyremaster', [`Socrates kept only the last two.${why}`, `So did Socrates.${why}`, 'Socrates was stricter than you. He kept only the last two, and the laments were the first to go.'][c],
      { note: 'Republic 398d-399c. Nobody now knows for certain how these tunings sounded in Socrates’ day. The game plays the scales that later Greek writers gave the same names.' });
    await gg.lines([
      ['lyremaster', 'He also said he can’t tell one tuning from another. He described the kind of person he wanted the music to sound like, and Glaucon supplied the names.', 'happy'],
      ['lyremaster', 'And he would have that flute case off my wall. His city keeps no flutes and no harps. It keeps the lyre and the kithara, and a pipe for the shepherds.', { note: 'Republic 399c-e. A flute lesson is painted on the cup by Douris, and a flute case hangs on its schoolroom wall.' }],
      ['lyremaster', 'I teach the flute to any boy whose father asks me to. I’d be a poorer man in his city.', 'think']]);
    if (mikaHere()) await gg.say('mika', 'I liked the first one best. The sad one.', { mood: 'think' });
    api.giveCards(gg, ['tunings']);
  };
  g.npc('lyremaster').talk = async (gg) => {
    if (gg.flags.schoolLyre) {
      const c = await gg.choose(['Yes, play them again.', 'No, thank you.'], { prompt: 'Do you want to hear the four tunings again?', name: 'The lyre master' });
      if (c === 0) await tunings(gg, false);
      return;
    }
    visit(gg, 'schoolLyre');
    await gg.say('lyremaster', 'Sit down, if you like. I teach the lyre. The boys learn the songs by ear while I play along, until the tune is in their fingers.', { mood: 'happy', note: 'Plato, Protagoras 326a-b. Two people play lyres facing each other on the cup by Douris.' });
    await gg.say('lyremaster', 'I hear that Socrates and Glaucon went through the tunings last night and threw most of them out. Do you want to hear what they threw out?');
    await tunings(gg, true);
  };

  // ---- odd or even
  g.addSpot(Object.assign(at(-0.4, -0.9), { r: 1.5, label: 'Play odd or even with the boy', run: async (gg) => {
    visit(gg, 'schoolBones');
    await gg.say('', 'The boy has a little basket of knucklebones: the ankle bones of sheep, worn smooth from handling.', { note: 'Boys play odd-and-even with knucklebones “which they drew from little baskets” in Plato, Lysis 206e (Lamb’s translation).' });
    await gg.say('pupil2', 'Odd or even? You haven’t got any bones, so I’ll lend you three. Guess right and you keep them.', { mood: 'happy' });
    let right = 0;
    for (let i = 0; i < 3; i++) {
      const n = 1 + Math.floor(Math.random() * 6), c = await gg.choose(['Odd.', 'Even.'], { prompt: 'He holds out a closed fist.', name: 'A pupil' });
      const ok = (c === 0) === (n % 2 === 1); if (ok) right++;
      await gg.say('', `He opens his hand. ${['One', 'Two', 'Three', 'Four', 'Five', 'Six'][n - 1]}. ${ok ? 'You guessed right.' : 'You guessed wrong.'}`);
    }
    await gg.say('pupil2', right >= 2 ? 'You’re good at this. Theano says it’s only counting.' : 'I win. Theano says it’s only counting, but it isn’t. It’s guessing.', { mood: 'happy' });
    if (here('theano')) await gg.lines([
      ['theano', 'It is counting. He adds and takes away faster than boys twice his size, and nobody has ever made him do it.', 'happy'],
      ['theano', 'Socrates said something like that last night. Don’t force children to learn. Let them play at it, because nothing a person is forced to learn stays with them.'],
      ['theano', 'He gave a second reason. When children play, you can see what each of them is good at.', 'think'],
      ['theano', 'The man who taught in this room before me used that rod on the wall. I leave it where the boys can see it, and I have not needed it.', { note: 'Republic 536d-537a. For beatings see Plato, Protagoras 325d, and Aristophanes, Clouds 961-983.' }]]);
    else await gg.say('pupil2', 'Theano says Socrates is on my side. He said children should learn by playing, and nobody should force them.', { note: 'Republic 536d-537a.' });
    api.giveCards(gg, ['play']);
  } }));

  // ---- what hangs on the wall
  g.addSpot(Object.assign(at(3.3, 1.75), { r: 1.25, label: 'Look at what hangs on the wall', run: async (gg) => {
    gg.flags.schoolSeen = true;
    await gg.say('', 'A book roll on a cord. A writing tablet with its two leaves shut. A lyre, a sack, and a rod.', { note: 'These, and the lyres, cups, basket and flute case on the other wall, hang in the schoolroom on the cup painted by Douris about 480 BC (Berlin, Antikensammlung F 2285). The rod is the game’s addition.' });
  } }));

  // ---- the attendant, and the favor he asks
  const book = async (gg) => {
    await gg.say('', 'You tell him the price, two drachmas for the first roll, and what the bookseller said.');
    await gg.lines([
      ['attendant', 'Two drachmas. His father can spare that. So it comes down to whether a book is good for the boy.'],
      ['attendant', 'You’ve seen this room, and you’ve heard the bookseller. What would you tell his father?']]);
    const c = await gg.choose(['Buy it. With the roll in front of him he can stop at a line and look at it twice.', 'Don’t buy it. Let him learn it by ear, the way everyone has.', 'Buy it, and have him say it aloud to you every evening all the same.'], { prompt: 'What would you tell the boy’s father?', name: 'A boy’s attendant' });
    gg.flags.schoolBook = c; gg.flags.schoolErrand = 3;
    gg.flags.schoolBookText = 'The father of one of Theano’s pupils wants to buy him the first roll of Homer, so that the boy can go over it at home. The bookseller says a reader can stop at a line and look at it twice. The lyre master says a book will ruin the boy’s memory. Your advice was: ' + ['buy it', 'don’t buy it, and let him learn by ear', 'buy it, and have him say the lines aloud every evening as well'][c] + '. Nobody in the room settled it. In Plato’s own account of a school the boys do both: they read the poets at the bench, and then they learn them by heart.';
    const th = here('theano');
    if (c === 0) await gg.say(th ? 'theano' : 'attendant', 'Then somebody has to sit with him and ask him what the lines mean. A roll can’t do that. Ask it a question and it says the same words again.', { mood: 'think', note: 'Plato, Phaedrus 275d (H. N. Fowler’s translation): written words “always say only one and the same thing”.' });
    else if (c === 1) await gg.say('attendant', 'That is how I learned the songs of my own country, and I still have every one of them. I couldn’t tell you what half of them mean.', { mood: 'think' });
    else await gg.say(th ? 'theano' : 'attendant', 'That’s what happens in this room already. The older boys read the poets at the bench, and then they learn them by heart.', { mood: 'happy', note: 'Plato, Protagoras 325e.' });
    if (mikaHere()) await gg.lines([
      ['mika', 'Nobody ever bought me a book, and I know more Homer than that boy does. I got it standing in the square listening to Terpes.'],
      ['mika', 'But I couldn’t find one line of it on a roll.', 'think']]);
    await gg.say('attendant', 'I’ll tell his father what you said, and that it was a stranger’s advice. He’ll do as he likes. He usually does.', { mood: 'happy' });
    api.giveCards(gg, ['school']); api.note(gg, 'A book for a schoolboy');
  };
  g.npc('attendant').talk = async (gg) => {
    gg.flags.schoolSeen = true;
    const e = gg.flags.schoolErrand || 0;
    if (e === 2) return book(gg);
    if (e === 3) { await gg.say('attendant', 'His father is still at sea. When he lands I’ll tell him what you said.'); return; }
    if (e === 1) { await gg.say('attendant', 'The bookseller’s stall is on the east side of the market square. I’ll be here. I am always here.'); return; }
    await gg.say('attendant', 'I’m not a teacher. I belong to the father of that boy at the bench. I walk the boy here at sunrise, I carry his things, and I walk him home before dark.', { note: 'Plato, Lysis 208c. Xenophon, Constitution of the Lacedaemonians 2.1-2: each father appoints “a slave to act as tutor”. On the cup by Douris a man with a staff sits and watches each lesson; the cup does not say who he is.' });
    await gg.say('attendant', 'If he misbehaves, I am the one who corrects him. He is free and I am not, and he still does what I tell him. People find that odd, when they stop to think about it.', { mood: 'think', note: 'Plato, Lysis 208c: Socrates calls it strange, “a free man controlled by a slave”.' });
    await gg.say('attendant', 'You can hear that I wasn’t born here.', { note: 'Plato, Lysis 223a: the boys’ attendants call them home “in their foreign accent”.' });
    api.giveCards(gg, ['attendant']);
    await gg.lines([
      ['attendant', 'May I ask you a favor? His father is a ship’s captain, and he is away for months. He wants to buy the boy a book: the beginning of Homer, written out, so that the boy can go over it at home.'],
      ['attendant', 'The lyre master says a book will ruin the boy’s memory. He learned everything he knows by ear.'],
      ['attendant', 'I’ve been told to find out what one costs, and I can’t leave the boy. The bookseller has a stall in the market square. Would you ask him the price? Ask what he thinks, too. He’s a clever man.']]);
    gg.flags.schoolErrand = 1;
    gg.ui.toast('A favor for the attendant', 'Ask Phanias the bookseller, in the market square, what a roll of Homer costs.', 'Something to do');
  };

  // ---- the bookseller's answer (his own conversation, in story_poetry.js, goes on as before afterwards)
  const P = g.npc('phanias'), oldP = P.talk;
  P.talk = async (gg, n) => {
    if (gg.flags.schoolErrand !== 1) return oldP ? oldP(gg, n) : undefined;
    api.meet(gg, 'phanias'); gg.flags.said_phanias = true;
    await gg.say('phanias', 'A Homer for a schoolboy? I have the first roll, with the plague and the quarrel in it. Two drachmas, and that’s a fair price.', { mood: 'happy', note: 'The price is invented. The one price for a book in the sources is Plato, Apology 26d-e: a drachma at most for the books of Anaxagoras.' });
    await gg.say('phanias', 'Tell his father this. A boy who has it by heart can say it again, and that is all he can do with it.');
    await gg.say('phanias', 'A boy with the roll in front of him can stop at a line and look at it twice. He can ask whether Achilles was right to sulk.', { mood: 'think', note: 'Eric Havelock, Preface to Plato, p. 208: writing lets a reader take “a second look”.' });
    await gg.say('phanias', 'I’ll be fair to the other side, though it may cost me the sale. There is a young man in Athens who has bought every book he can find, all of Homer among them. He thinks that owning them has made him wise.');
    await gg.say('phanias', 'Socrates went and asked him what he meant to become with all those books. A doctor? A builder? A reciter? The young man couldn’t say.', { mood: 'happy', note: 'Xenophon, Memorabilia 4.2.1 and 4.2.8-10.' });
    if (gg.flags.writing) await gg.say('phanias', 'It’s the story of Theuth again, and this time there is a child in it.');
    await gg.say('phanias', 'Take the price back to the school, and tell them what you think yourself.');
    gg.flags.schoolErrand = 2;
    gg.ui.toast('A favor for the attendant', 'Go back to the schoolroom and tell the attendant the price.', 'Something to do');
  };
}
