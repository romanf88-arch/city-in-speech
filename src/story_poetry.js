// The poets (Republic 376e-398b and 595a-608b), at the platform in the market square, and the bookseller's question about writing.
// Terpes also recites the whole Iliad, in Samuel Butler's translation of 1898, to anyone who stands near him.
import { runDispute } from './dispute.js';
import { HOMES } from './story.js';
import { RhythmCue } from './rhythm-cue.js';

// Chant one line with the reciter. The player keeps the beat with the Space bar. Returns how many beats were kept.
export function chant(g, text, beats = 4, gap = 0.66) {
  if (g.ui.auto) return Promise.resolve(beats);
  return new Promise((res) => {
    const start = g.time * 1000 + 900, times = []; for (let i = 0; i < beats; i++) times.push(start + i * gap * 1000);
    const hit = new Array(beats).fill(false); let shown = -1;
    let cue;
    const draw = () => {g.ui.story(text);cue?.update(g.time*1000,hit);};
    draw(-1);
    const onKey = (e) => {
      if(g.mode==='paused' || e.ctrlKey || e.metaKey || e.altKey)return;
      if(e.repeat){if(['Space','Enter'].includes(e.code))e.preventDefault();return;}
      if(e.code==='Tab'){e.preventDefault();e.stopImmediatePropagation();cue.button.focus();return;}
      if (e.code !== 'Space' && e.type !== 'pointerdown') return; if (e.preventDefault) e.preventDefault();
      const now = g.time * 1000; let best = -1, bd = 230;
      times.forEach((t, i) => { const d = Math.abs(now - t); if (d < bd && !hit[i]) { bd = d; best = i; } });
      if (best >= 0) { hit[best] = true; g.audio.tone(660, 0.08, 'triangle', 0.06); draw(shown); }
    };
    cue=new RhythmCue(g,{title:'Keep the reciter’s beat',action:'Keep the beat',beats,start,gap:gap*1000,window:230,tap:()=>onKey({type:'pointerdown'})});cue.update(g.time*1000,hit);
    window.addEventListener('keydown', onKey, true); g.canvas.addEventListener('pointerdown', onKey);
    const tick = () => {
      if(g.mode !== 'play')return;
      const now = g.time * 1000;
      cue.update(now,hit);
      times.forEach((t, i) => { if (i > shown && now >= t) { shown = i; g.audio.pluck([196, 220, 262, 220][i % 4], 0.7); draw(shown); } });
      if (now > times[beats - 1] + 600) { window.removeEventListener('keydown', onKey, true); g.canvas.removeEventListener('pointerdown', onKey); g.ui.story(null);cue.close();g.tickers=g.tickers.filter(fn=>fn!==tick); res(hit.filter(Boolean).length); }
    };
    g.tickers.push(tick);
  });
}

export function setupPoetry(g, api) {
  const S = g.sites, B = S.bema;
  // An audience in front of the platform.
  [[-2.6, 5.2], [-0.8, 6.0], [1.2, 5.4], [3.0, 6.3], [-4.2, 6.8], [0.2, 7.6]].forEach(([dx, dz], i) => g.addNPC({ id: 'aud' + i, name: 'A listener', look: { skin: ['tan', 'olive', 'fair'][i % 3], hair: [0x2a221c, 0x4a3a2a, 0x15110e][i % 3], beard: i % 2 ? 'short' : 'none', hairStyle: i === 2 ? 'veil' : 'full', robe: [0xe6dcc0, 0xd9c4a3, 0xcfc0a0][i % 3], robe2: [0x8a3b2e, 0x6f7f6a, null, 0x2f5f7a, 0xb98a2a, null][i], height: 0.95 + i * 0.015 }, x: B.x + dx, z: B.z + dz, h: Math.atan2(-dx, -dz), behavior: 'ignore' }));
  g.tickers.push(() => { for (let i = 0; i < 6; i++) { const n = g.npc('aud' + i); if (n && !n.lookTarget) n.lookTarget = { x: B.x, y: B.y + 2.4, z: B.z }; } });

  // ---- the whole Iliad, a line at a time, for as long as the player stands and listens
  let iliad = null, loading = false, nextAt = 0;
  g.tickers.push(() => {
    const T = g.npc('terpes');
    if (g.space !== 'world' || g.busy || !g.flags.intro) return;
    const d = Math.hypot(g.player.x - T.x, g.player.z - T.z);
    if (d > 17) { if (T.reciting) { T.reciting = false; T.actor.speaking = false; } return; }
    if (!iliad) { if (!loading) { loading = true; fetch('./assets/iliad.json').then((r) => r.json()).then((j) => { iliad = j; }).catch(() => { loading = false; }); } return; }
    if (g.time < nextAt) return;
    let i = g.flags.iliadAt || 0; if (i >= iliad.lines.length) i = 0;
    const line = iliad.lines[i], book = iliad.books.indexOf(i);
    let cur = 0; for (let b = 0; b < iliad.books.length; b++) if (iliad.books[b] <= i) cur = b + 1;
    g.ui.bubble('terpes', 'Terpes · the Iliad, book ' + cur, line, 3.2 + line.length * 0.055, true);
    if (book >= 0 && i > 0) g.ui.toast('Book ' + cur + ' of 24', 'Terpes begins a new book of the Iliad.', 'The reciter');
    T.reciting = true; T.actor.speaking = true; T.actor.mood = 'neutral';
    if (d < 11) g.audio.pluck([196, 220, 262, 220, 294, 262][i % 6], 0.5);
    g.flags.iliadAt = i + 1; nextAt = g.time + 2.9 + line.length * 0.055;
  });

  g.npc('terpes').talk = async (gg) => {
    if (!gg.flags.ring) { await gg.say('terpes', 'Stay and listen as long as you like. I’m reciting the whole Iliad, from the first line to the last. If it’s last night’s argument you’re after, they tell me the place to start is the house of Cephalus.', { mood: 'happy' }); return; }
    if (gg.flags.poetry) { await gg.say('terpes', 'They can cross out whatever lines they like. People will still want Achilles tonight. Stand there and I’ll carry on from where I stopped.', { mood: 'happy' }); return; }
    gg.flags.met_terpes = true; gg.flags.met_adeimantus = true;
    gg.ui.area('The poets', 'What should children hear?');
    await gg.lines([
      ['mika', 'That’s Terpes. He recites Homer for a living, whole books of it, from memory.'],
      ['mika', 'Everybody here grew up on these stories. It’s how we learned about the gods, and war, and what a hero is.', 'happy'],
      ['terpes', 'Come closer! Don’t stand at the back. Say it with me. That’s how I learned it, and my teacher before me.', 'happy', 'beckon']]);
    await gg.say('', 'Keep the beat with him. Press the Space bar each time you hear the string.');
    const T = gg.npc('terpes'); T.actor.speaking = true; gg.ui.closeDialogue(); gg.ui.clearBubbles();
    let kept = 0;
    kept += await chant(gg, 'Sing, O goddess, the anger of Achilles son of Peleus,');
    kept += await chant(gg, 'that brought countless ills upon the Achaeans.');
    kept += await chant(gg, 'Many a brave soul did it send hurrying down to Hades.');
    T.actor.speaking = false; gg.flags.kept = kept;
    await gg.say('', kept >= 7 ? 'By the third line you have stopped thinking about the words. The people around you are saying them along with you.' : 'You lose the beat and end up listening from outside it. Everyone around you knows the words by heart.');
    await gg.lines([
      ['terpes', 'You’ll still know those lines when you’re old. I never read them anywhere. They were sung into me.', 'happy'],
      ['adeimantus', 'I’m Adeimantus, Glaucon’s brother. Socrates and I talked about exactly this last night, for a long time.', 'happy'],
      ['adeimantus', 'It came up because of the city they were building out of words. The city needed soldiers to guard it. So Socrates asked how you bring up a child to be brave, and gentle with his own people.'],
      ['adeimantus', 'His answer was that it starts with the stories children hear. He said the very young are soft, and they take whatever shape is pressed into them first.', 'think']]);
    api.giveCards(gg, ['begin']);
    await gg.lines([
      ['mika', 'My grandmother told me stories every night. I never thought of them as pressing anything into me.', 'think'],
      ['adeimantus', 'So he went through Homer and asked what each part teaches a child. Try it yourself. Here are four passages from my tablet.'],
      ['adeimantus', 'Would you keep each one for the children of his city, or cross it out?']]);
    // The tablet. Each choice is answered at once with what Socrates did and why.
    const items = [
      ['Achilles, the greatest fighter of all, is dead and in the underworld. He says he would rather be alive as a poor farmhand than be king of all the dead.', true, 'He crossed it out. His soldiers will have to face death in battle, and he didn’t want them growing up on the idea that being dead is the worst thing there is.'],
      ['Achilles’ best friend has been killed. Achilles rolls on the ground crying, and pours ashes over his own head.', true, 'He crossed it out. He said a good man doesn’t think death is a terrible thing for a friend who was good, so he wouldn’t fall apart like that. He didn’t want children copying it.'],
      ['The gods are at dinner. They can’t stop laughing at Hephaestus, the lame god, as he hurries round pouring the wine.', true, 'He crossed it out. He thought people who matter shouldn’t be shown helpless with laughter, and gods least of all.'],
      ['Odysseus is furious and wants to lash out. He hits his own chest and tells his heart to hold on, because it has put up with worse.', false, 'He kept it. That’s a man keeping control of himself, and Socrates wanted children to hear it.'],
    ];
    let match = 0;
    for (const it of items) {
      const c = await gg.choose(['Cross it out.', 'Keep it.'], { prompt: it[0], name: 'From the tablet' });
      const same = (c === 0) === it[1]; if (same) match++;
      await gg.say('adeimantus', (same ? 'So did Socrates. ' : 'Socrates went the other way. ') + it[2], { mood: same ? 'happy' : 'think' });
    }
    gg.flags.tablet = match; gg.log.push({ t: 'attempt', skill: 'censor', correct: match >= 3 });
    await gg.say('adeimantus', 'One more thing from that part of the night. He said that in his city only the rulers would be allowed to tell a lie, and only when it was for the city’s good.');
    api.giveCards(gg, ['hades', 'lies']);
    // Telling a story and acting it.
    await gg.lines([
      ['adeimantus', 'He had a second worry, about how a story is told. A poet can say “the king got angry and sent the priest away.” That is telling you about it.'],
      ['adeimantus', 'Or he can put on the king’s voice and rage. Then he is being the king. And so were you, a minute ago, when you chanted along.', 'think'],
      ['adeimantus', 'Socrates retold the start of Homer the plain way, to show me the difference. It went like this.'],
      ['', 'A priest came and asked for his daughter back. The king got angry and sent him away. The old man went off and prayed to his god to punish the Greeks.']]);
    api.giveCards(gg, ['narration']);
    const q = await gg.choose(['The chant.', 'The plain version.', 'Neither of them.'], { prompt: 'Which of the two could you stop and ask questions about?', name: 'Adeimantus' });
    gg.flags.question = q;
    await gg.say('adeimantus', ['Try it. Ask the chant what it means, and all it gives you is the next line.', 'Yes. It holds still, and the person telling it isn’t hiding behind anyone.', 'That’s fair. A summary leaves most of it out. But it does hold still so you can look at it.'][q]);
    await gg.lines([
      ['adeimantus', 'His worry was that if you spend your childhood acting out cowards and bullies, some of it sticks. You turn into a little of what you play.'],
      ['adeimantus', 'He said that if a performer turned up who could turn himself into anybody at all, the city would bow to him, pour perfume on his head, crown him with a wreath, and send him on to the next city.', 'happy']]);
    api.giveCards(gg, ['wreath']);
    // A small test of what learning by chanting leaves you with.
    await api.gather(gg, ['theano'], true);
    if (!gg.flags.said_theano) { gg.flags.said_theano = true; await gg.say('theano', 'I’m Theano. I run a small school near here.', { mood: 'happy' }); }
    await gg.say('theano', 'Can I try something? I do this with my pupils. A minute ago you were Achilles. So tell me: what is courage?', { mood: 'happy' });
    for (let n = 0; ; n++) {
      const c = await gg.choose(['Achilles going out to fight Hector.', 'Odysseus keeping his temper in his own house.', 'Standing your ground.', 'I can name brave people. I can’t say what they all have in common.'], { prompt: 'What is courage?', name: 'Theano' });
      if (c === 3) break;
      await gg.say('theano', c === 2 ? 'Always? If someone stands his ground against good advice, is that brave?' : 'That’s a brave man. I asked what courage is: the thing both of them have.', { mood: 'think' });
      if (n >= 2) await gg.say('theano', 'You keep giving me examples. Say so, and we can go on.');
    }
    await gg.say('theano', 'That’s the honest answer. And it’s one thing people say against learning everything from poems. You end up with a great many examples, and no practice at stepping back and asking what they are examples of.', { note: 'The test is the game’s own. The idea is Eric Havelock’s, Preface to Plato, pp. 200-223.' });
    // Near dawn.
    await gg.say('adeimantus', 'Much later, close to dawn, Socrates came back to the poets. He was harder on them the second time. He gave three arguments.');
    await gg.say('adeimantus', 'First: think of a couch. There is what a couch really is, the idea of it. A carpenter builds one by working from that. Then a painter paints the carpenter’s couch, and only how it looks from one side. So the painting is a copy of a copy. He said poets are like the painter.', { mood: 'think' });
    await gg.say('adeimantus', 'Second: if Homer really understood war and how to run a city, why did he never do either? No city says Homer wrote its laws. No war was won on his advice.');
    await gg.say('adeimantus', 'Third: when something terrible happens to us, we try to hold ourselves together. But at the theater we love to watch a hero howl with grief, and we cry along. He thought whatever you feed like that grows stronger.');
    await gg.say('adeimantus', 'He didn’t shut the door, though. He said he had loved Homer since he was a boy. And if anyone can show that poetry does people good, as well as being a pleasure, she can come back.', { mood: 'happy' });
    api.giveCards(gg, ['couches', 'homer', 'theater', 'quarrel']);
    const a = await gg.choose(['He’s right. What children hear matters too much to leave to chance.', 'Nobody should get to decide what stories other people hear.', 'I would keep a lot more of Homer than he does.'], { prompt: 'What do you make of it?', name: 'Adeimantus' });
    gg.flags.listView = a;
    await gg.lines([
      ['adeimantus', 'Hold on to that. Not everyone here took it the same way.'],
      ['mika', 'The stories I grew up on are full of clever thieves. Hermes stole his brother’s cows on the day he was born, and everyone laughs. Odysseus lies to nearly everybody he meets, and he’s the hero.', 'think'],
      ['mika', 'Maybe that’s where I got the idea that it’s only wrong if you get caught.', 'sad']]);
    await api.gather(gg, ['phanias', 'kleio', 'sannion', 'dromon']);
    await runDispute(gg, 'poetry');
    gg.flags.poetry = true; gg.audio.phrase([262, 294, 349, 392]); api.note(gg, 'The poets');
    await gg.lines([
      ['phanias', 'Come by my stall when you have a moment. Socrates tells a story about my own trade, and it isn’t flattering.', 'happy'],
      ['mika', 'I never knew you could argue about a poem.', 'happy']]);
    api.relocate(gg, 'phanias', ...HOMES.phanias); api.relocate(gg, 'kleio', ...HOMES.kleio); api.relocate(gg, 'sannion', ...HOMES.sannion); api.relocate(gg, 'dromon', ...HOMES.dromon); api.relocate(gg, 'theano', ...HOMES.theano);
    api.refreshObjective(gg);
  };

  g.npc('adeimantus').talk = async (gg) => {
    gg.flags.met_adeimantus = true;
    await gg.say('adeimantus', gg.flags.poetry ? 'My brother asked whether doing right is worth it when nobody can see you. I asked why nobody ever praises it for its own sake. I’m still waiting to be sure of the answer.' : gg.flags.ring ? 'I have the list Socrates and I made last night. Go up and speak to the reciter first, and then I’ll show you.' : 'I’m Adeimantus. If you want to know about last night, start at the house of Cephalus. My brother Glaucon is there.');
  };

  g.npc('phanias').talk = async (gg) => {
    api.meet(gg, 'phanias');
    if (!gg.flags.said_phanias) { gg.flags.said_phanias = true; await gg.say('phanias', 'I’m Phanias. I sell books, in a town where most people still learn everything by ear.', { mood: 'happy' }); }
    if (!gg.flags.ring) { await gg.say('phanias', 'Come back when you’ve been to the house of Cephalus. I’ll have something to tell you then.'); return; }
    if (gg.flags.writing) { await gg.say('phanias', 'Everything we said to you today was written down by somebody. It will say the same words to the next visitor. Make of that what you like.'); return; }
    await gg.lines([
      ['phanias', 'You’ve been writing things down all day, I notice. Then you should hear what Socrates says about my trade. It’s from another conversation of his, with a young man called Phaedrus.', 'happy'],
      ['phanias', 'It’s a story. In Egypt there was a god called Theuth, who invented writing. He took it to the king and said: this will make your people wiser, and it will cure their forgetting.'],
      ['phanias', 'The king said: you have it backwards. People who trust what is written down will stop using their memories. They will seem to know a great deal, and really know very little.', 'think'],
      ['phanias', 'Socrates adds something of his own. He says written words are like the people in a painting. They look alive. But ask them a question, and they stand there saying nothing.', 'think']]);
    api.giveCards(gg, ['theuth']);
    await gg.say('mika', 'I can’t read, so I have to remember everything. Every price, every face. Maybe the king had a point.', { mood: 'think' });
    await api.gather(gg, ['kleio', 'theano', 'sannion']);
    await runDispute(gg, 'writing');
    gg.flags.writing = true; api.note(gg, 'Writing');
    await gg.say('phanias', 'One last thing. Everything we have said to you today was written down by somebody, and we will say exactly the same words to the next visitor. Whether that makes us a help or a harm is for you to decide.');
    api.relocate(gg, 'kleio', ...HOMES.kleio); api.relocate(gg, 'sannion', ...HOMES.sannion); api.relocate(gg, 'theano', ...HOMES.theano);
    api.refreshObjective(gg);
  };
}
