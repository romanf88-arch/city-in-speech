// The rhapsode in the agora (Republic 376e-398b and 595a-608b) and the bookseller's question about writing.
import { runDispute } from './dispute.js';
import { HOMES } from './story.js';

const PI = Math.PI;

// Chant one line with the rhapsode. The player keeps the beat with the Space bar. Returns how many beats were kept.
function chant(g, text, beats = 4, gap = 0.66) {
  if (g.ui.auto) return Promise.resolve(beats);
  return new Promise((res) => {
    const start = performance.now() + 900, times = []; for (let i = 0; i < beats; i++) times.push(start + i * gap * 1000);
    const hit = new Array(beats).fill(false); let shown = -1;
    const draw = (k) => g.ui.story(text + '\n' + times.map((_, i) => (hit[i] ? '●' : i <= k ? '○' : '·')).join('  '));
    draw(-1);
    const onKey = (e) => {
      if (e.code !== 'Space' && e.type !== 'pointerdown') return; if (e.preventDefault) e.preventDefault();
      const now = performance.now(); let best = -1, bd = 230;
      times.forEach((t, i) => { const d = Math.abs(now - t); if (d < bd && !hit[i]) { bd = d; best = i; } });
      if (best >= 0) { hit[best] = true; g.audio.tone(660, 0.08, 'triangle', 0.06); draw(shown); }
    };
    window.addEventListener('keydown', onKey, true); g.canvas.addEventListener('pointerdown', onKey);
    const tick = () => {
      const now = performance.now();
      times.forEach((t, i) => { if (i > shown && now >= t) { shown = i; g.audio.pluck([196, 220, 262, 220][i % 4], 0.7); draw(shown); } });
      if (now > times[beats - 1] + 600) { window.removeEventListener('keydown', onKey, true); g.canvas.removeEventListener('pointerdown', onKey); g.ui.story(null); res(hit.filter(Boolean).length); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function setupPoetry(g, api) {
  const S = g.sites, B = S.bema;
  // An audience in front of the platform.
  [[-2.6, 5.2], [-0.8, 6.0], [1.2, 5.4], [3.0, 6.3], [-4.2, 6.8], [0.2, 7.6]].forEach(([dx, dz], i) => g.addNPC({ id: 'aud' + i, name: 'A listener', look: { skin: ['tan', 'olive', 'fair'][i % 3], hair: [0x2a221c, 0x4a3a2a, 0x15110e][i % 3], beard: i % 2 ? 'short' : 'none', hairStyle: i === 2 ? 'veil' : 'full', robe: [0xe6dcc0, 0xd9c4a3, 0xcfc0a0][i % 3], robe2: [0x8a3b2e, 0x6f7f6a, null, 0x2f5f7a, 0xb98a2a, null][i], height: 0.95 + i * 0.015 }, x: B.x + dx, z: B.z + dz, h: Math.atan2(-dx, -dz), behavior: 'ignore' }));
  g.tickers.push(() => { for (let i = 0; i < 6; i++) { const n = g.npc('aud' + i); if (n && !n.lookTarget) n.lookTarget = { x: B.x, y: B.y + 2.4, z: B.z }; } });
  g.chatter.push({ x: B.x, z: B.z + 4, r: 13, members: ['terpes'], when: (gg) => !gg.busy, lines: [['terpes', 'Sing, goddess, the rage of Achilles, Peleus’ son...'], ['terpes', '...the ruinous rage that brought the Achaeans pain past counting...'], ['terpes', '...and sent the strong souls of heroes down to the house of Hades.']] });

  g.npc('terpes').talk = async (gg) => {
    if (!gg.flags.book1) { await gg.say('terpes', 'They tell me the thing to hear first is at the house of Cephalus. Come back afterward. Homer will keep.'); return; }
    if (gg.flags.poetry) { await gg.say('terpes', 'They can strike what lines they like. Tonight the harbor will still want Achilles.'); return; }
    gg.flags.met_terpes = true; gg.flags.met_adeimantus = true;
    await gg.say('terpes', 'You look like a man who came for the argument. Stay for Homer. Stand close and say it with me, the way I learned it, and my teacher before me.');
    await gg.say('', 'Keep the beat with him. Press the Space bar each time the string sounds.');
    const T = gg.npc('terpes'); T.actor.speaking = true; gg.ui.closeDialogue();
    let kept = 0;
    kept += await chant(gg, 'Sing, goddess, the rage of Achilles, Peleus’ son,');
    kept += await chant(gg, 'the ruinous rage that brought the Achaeans pain past counting');
    kept += await chant(gg, 'and sent the strong souls of heroes down to the house of Hades.');
    T.actor.speaking = false; gg.flags.kept = kept;
    await gg.say('', kept >= 7 ? 'By the third line you are no longer thinking about the words. The people around you are saying them with you.' : 'You lose the beat and stand outside it, listening. Everyone around you has it by heart.');
    await gg.say('terpes', 'Thirty years from now you will still be able to say that. I never read it. It was sung into me.');
    await gg.say('adeimantus', 'Last night Socrates told me that same opening without the song. Like this.');
    await gg.say('', 'A priest came to ask for his daughter back. The king grew angry and sent him away. The old man went off and prayed to his god to punish the Greeks.');
    await gg.say('adeimantus', 'The first way he called imitation. The poet speaks as if he were the angry king, and so do you when you recite it. The second is plain telling, in the teller’s own voice.');
    gg.giveCard('narration');
    const q = await gg.choose(['The song.', 'The plain telling.', 'Neither.'], { prompt: 'Which of the two could you stop and question?', name: 'Adeimantus' });
    gg.flags.question = q;
    await gg.say('adeimantus', ['Try it. Ask the song what it means, and it sings you the next line.', 'Yes. It holds still, and the teller is not hiding behind anyone.', 'Fair. A summary leaves most of it out. But it does stand still to be looked at.'][q]);
    await api.gather(gg, ['theano'], true);
    await gg.say('theano', 'Let me try something I do with my pupils. A moment ago you were Achilles. So tell me what courage is.');
    for (let n = 0; ; n++) {
      const c = await gg.choose(['Achilles going out to meet Hector.', 'Odysseus holding his temper in his own hall.', 'Standing your ground.', 'I can give you brave men. I cannot give you the thing they share.'], { prompt: 'What is courage?', name: 'Theano' });
      if (c === 3) break;
      await gg.say('theano', c === 2 ? 'Always? A man who stands his ground against good advice is brave?' : 'That is a brave man. I asked what courage is, the thing both of them have.');
      if (n >= 2) { await gg.say('theano', 'You keep giving me examples. Say so, and we can go on.'); }
    }
    await gg.say('theano', 'Good. Havelock says that is where the old schooling leaves a person: rich in examples, with no way to stand back and ask what they are examples of. On his account a general answer becomes possible only once the spell of the poem is broken.');
    await gg.say('', '(The question about courage is this game’s own test. The claim about the old schooling is Havelock’s, in Preface to Plato, pp. 200-223.)');
    // The tablet.
    await gg.say('adeimantus', 'Socrates and I went through Homer deciding what the young guardians of his city may hear. Here are four passages on my tablet. Strike the ones you think he struck.');
    const items = [
      ['The dead Achilles says he would sooner be a poor man’s hired hand on earth than king over all the dead.', true, 'Struck. Men who must face death are not to be taught that being dead is the worst thing there is.'],
      ['Achilles lies on the shore in grief, now on his side, now on his back, and pours ashes over his head.', true, 'Struck. A good man does not think death a terrible thing for his friend, so he does not wail like that.'],
      ['The gods laugh helplessly at lame Hephaestus bustling through the hall.', true, 'Struck. People of worth should not be shown overcome by laughter, and gods least of all.'],
      ['Odysseus strikes his chest and tells his heart to endure, since it has endured worse.', false, 'Kept. That is a man mastering himself, and Socrates wants the young to hear it.'],
    ];
    let match = 0; const picks = [];
    for (const it of items) { const c = await gg.choose(['Strike it.', 'Keep it.'], { prompt: it[0], name: 'The tablet' }); picks.push(c === 0); if ((c === 0) === it[1]) match++; }
    for (let i = 0; i < items.length; i++) await gg.say('adeimantus', (picks[i] === items[i][1] ? 'As you had it. ' : 'Not as you had it. ') + items[i][2]);
    gg.flags.tablet = match; gg.log.push({ t: 'attempt', skill: 'censor', correct: match >= 3 });
    await gg.say('adeimantus', 'He began from this: a child takes whatever stamp is pressed on it, and the first stories are the stamp. So the founders must watch the storytellers. He also said that in his city only the rulers may tell a falsehood, and only for the city’s good.');
    api.giveCards(gg, ['begin', 'hades', 'lies']);
    const a = await gg.choose(['He is right to choose what children hear.', 'No one should hold that list.', 'I would keep more of Homer than he does.'], { prompt: 'What do you make of the list?', name: 'Adeimantus' });
    gg.flags.listView = a;
    await gg.say('adeimantus', 'Hold that thought. And know that the poet who can turn himself into anyone would be honored in that city, crowned, and sent on to another.');
    gg.giveCard('wreath');
    await gg.say('adeimantus', 'Near dawn he came back to poetry, and was harder on it. He said he had loved Homer since he was a boy, but no man is to be honored above the truth.');
    await gg.say('adeimantus', 'He said a painter copies how a couch looks, which is a copy of what the carpenter made, and that the poet is like the painter. He asked which city Homer ever ran. He said that what we enjoy weeping over in the theater grows stronger in us. And then he said poetry may come back if her friends can show she does good.');
    api.giveCards(gg, ['couches', 'homer', 'theater', 'quarrel']);
    await api.gather(gg, ['phanias', 'kleio', 'sannion', 'dromon']);
    await runDispute(gg, 'poetry');
    gg.flags.poetry = true; gg.audio.phrase([262, 294, 349, 392]);
    await gg.say('phanias', 'Come by my stall when you have a moment. Socrates tells a story about my own trade, and it is not flattering.');
    api.relocate(gg, 'phanias', ...HOMES.phanias); api.relocate(gg, 'kleio', ...HOMES.kleio); api.relocate(gg, 'sannion', ...HOMES.sannion); api.relocate(gg, 'dromon', ...HOMES.dromon); api.relocate(gg, 'theano', ...HOMES.theano);
    api.refreshObjective(gg);
  };

  const stallHome = (() => { const n = g.npc('phanias'); return [n.x, n.z, n.actor.heading]; })();
  function currentStall() { return stallHome; }

  g.npc('adeimantus').talk = async (gg) => {
    gg.flags.met_adeimantus = true;
    await gg.say('adeimantus', gg.flags.poetry ? 'My brother asked whether justice is worth having unseen. I asked why no one had ever praised it for itself. I am still waiting to be sure of the answer.' : 'I have the list Socrates and I made last night. Hear the rhapsode first, and then I will show you.');
  };

  g.npc('phanias').talk = async (gg) => {
    api.meet(gg, 'phanias');
    if (!gg.flags.book1) { await gg.say('phanias', 'Phanias. I sell books, in a town that mostly still learns by ear. Come back when you have been to the house.'); return; }
    if (gg.flags.writing) { await gg.say('phanias', 'Everything we said to you today was written down by somebody. It will say the same words to the next visitor. Make of that what you like.'); return; }
    await gg.say('phanias', 'You carry a journal, I see. Then you should hear what Socrates says about my trade. It is from another conversation, with a young man called Phaedrus.');
    await gg.say('phanias', 'An Egyptian god named Theuth invented letters and brought them to King Thamus as a cure for forgetting. The king said: you have it backward. People who trust marks will stop using their memories. They will seem to know a great deal, and know little.');
    await gg.say('phanias', 'And Socrates adds that written words are like figures in a painting. They look alive. Ask them a question, and they keep a solemn silence.');
    gg.giveCard('theuth');
    await api.gather(gg, ['kleio', 'theano', 'sannion']);
    await runDispute(gg, 'writing');
    gg.flags.writing = true;
    await gg.say('phanias', 'One thing more, for a customer. All of us were written down by somebody, and we will say the same words to the next visitor. Whether that makes us a help or a harm is your question now.');
    api.relocate(gg, 'kleio', ...HOMES.kleio); api.relocate(gg, 'sannion', ...HOMES.sannion); api.relocate(gg, 'theano', ...HOMES.theano);
    api.refreshObjective(gg);
  };
}
