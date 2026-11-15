// The shield workshop of the family of Cephalus: the second house the player can walk into. Like the schoolroom it
// is a side visit, open from the start and never required. Things to do: hear from the foreman how the shop runs,
// look at the finished shields, try the bronze-worker's hammer, and decide what to do about a man who is out of
// his mind and wants his spear back (the case Socrates puts to Cephalus at Republic 331c).
//
// Every claim about the family and about workshops is from research/notes-workshop.md, which names the passage for
// each. The foreman, the bronze-worker and the man at the door are invented, and the journal's source list says so.

// Strike in time with the bronze-worker. The player presses the Space bar on each call. Returns the blows that
// were in time. (The same mechanism as keeping the beat with Terpes in story_poetry.js.)
function strike(g, beats = 6, gap = 0.9) {
  if (g.ui.auto) return Promise.resolve(beats);
  return new Promise((res) => {
    const start = performance.now() + 1100, times = []; for (let i = 0; i < beats; i++) times.push(start + i * gap * 1000);
    const hit = new Array(beats).fill(false); let shown = -1;
    const draw = (k) => g.ui.story('Strike when he says “Now”.\n' + times.map((_, i) => (hit[i] ? '●' : i <= k ? '○' : '·')).join('  ') + (k >= 0 && k < beats ? '\nNow!' : ''));
    draw(-1);
    const onKey = (e) => {
      if (e.code !== 'Space' && e.type !== 'pointerdown') return; if (e.preventDefault) e.preventDefault();
      const now = performance.now(); let best = -1, bd = 260;
      times.forEach((t, i) => { const d = Math.abs(now - t); if (d < bd && !hit[i]) { bd = d; best = i; } });
      if (best >= 0) { hit[best] = true; g.audio.tone(1150, 0.16, 'triangle', 0.09, -260); g.audio.tone(540, 0.2, 'square', 0.03, -80); draw(shown); }
      else g.audio.tone(150, 0.12, 'sawtooth', 0.04, -30);
    };
    window.addEventListener('keydown', onKey, true); g.canvas.addEventListener('pointerdown', onKey);
    const tick = () => {
      const now = performance.now();
      times.forEach((t, i) => { if (i > shown && now >= t - 120) { shown = i; draw(shown); } });
      if (now > times[beats - 1] + 700) { window.removeEventListener('keydown', onKey, true); g.canvas.removeEventListener('pointerdown', onKey); g.ui.story(null); res(hit.filter(Boolean).length); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function setupWorkshop(g, api) {
  const W = g.sites.workshop; if (!W) return;
  const at = (a, b) => { const [x, z] = W.at(a, b); return { x, z }; };
  const mikaHere = () => { const m = g.npc('mika'); return !!(m && !m.hidden && m.behavior === 'follow' && m.space === g.space); };

  // ---- walking in for the first time
  g.addTrigger(Object.assign(at(0, 2.2), { r: 1.2, when: (gg) => !gg.flags.shopSeen, run: async (gg) => {
    gg.flags.shopSeen = true;
    gg.ui.area('The shield workshop', 'Where the money of the house of Cephalus is made');
    if (mikaHere()) await gg.lines([
      ['mika', 'This is where the old man’s money comes from. Shields. Anyone who fights on foot needs one.'],
      ['mika', 'Go in. They don’t mind people looking, as long as you keep away from the fire.', 'happy']]);
    else await gg.say('', 'A long room, loud with hammering. Men are shaping wooden bowls at the benches and beating bronze by a fire. Finished shields hang along the back wall.');
    api.note(gg, 'The shield workshop');
  } }));

  // After a saved game is loaded, the man who was told to come back tomorrow is still sitting by the door.
  g.tickers.push(() => { const man = g.npc('shieldowner'); if (g.flags.shopChoice === 1 && man.hidden && !g.busy) { man.show(true); man.actor.pose = 'ground'; man.actor.mood = 'sad'; } });

  // ---- the foreman
  const problem = async (gg) => {
    const man = gg.npc('shieldowner');
    await gg.lines([
      ['foreman', 'Here is my trouble. A friend of the house left his shield with us a month ago for a new arm band, and he left his spear with it so that we would keep it safe.'],
      ['foreman', 'He is at the door now. He has been drinking since yesterday, or he has lost his mind. I can’t tell which. He says his brother has cheated him and he is going to settle it today.', 'think']]);
    man.show(true); man.actor.mood = 'angry';
    await gg.say('shieldowner', 'Give me what is mine! I left them here and I want them back. Now!', { mood: 'angry' });
    await gg.say('foreman', 'They are his. And I am a slave, so I can’t tell a citizen no. You could. What do I do?', { mood: 'sad' });
    const c = await gg.choose(['Give them back. They belong to him.', 'Keep them until he is himself again.', 'Give him the shield and keep the spear.'], { prompt: 'The man at the door wants his shield and his spear.', name: 'The foreman' });
    gg.flags.shopChoice = c;
    await gg.say('', [
      'The foreman fetches the shield and the spear. The man snatches them and goes off up the street, shouting his brother’s name.',
      'You tell the man to come back tomorrow. He calls you both thieves, loudly enough for the whole street to hear. Then he sits down in the dust by the door.',
      'The man takes the shield and looks at it as if he has forgotten why he came. He wanders off up the street without the spear.'][c]);
    if (c !== 1) man.show(false); else { man.actor.pose = 'ground'; man.actor.mood = 'sad'; }
    await gg.say('foreman', [
      'Well. We gave back what we owed. I hope that is the last we hear of it.',
      'He will thank us tomorrow, or he will take the house to court. Possibly both.',
      'That was neatly done. I notice we are still holding something that is his.'][c], { mood: c === 0 ? 'sad' : 'think' });
    await gg.lines([
      ['foreman', 'The old master has a rule for this. Tell the truth and give back what you owe. He says that is all there is to doing right.'],
      ['foreman', 'I hear Socrates put this very case to him last night. A friend leaves his weapons with you, goes mad, and asks for them back. The old master went off to see to his sacrifice.', { note: 'Republic 331c-d.' }],
      ['foreman', 'Polemarchus took it up for him. He said that what you owe a friend is to do him good, and never harm.', { note: 'Republic 331e-332b.' }]]);
    if (mikaHere()) await gg.say('mika', 'So giving a thing back is not always the right thing to do. That doesn’t help me with the purse.', { mood: 'think' });
    api.giveCards(gg, ['madman']);
    gg.flags.shopText = 'A friend of the house of Cephalus had left his shield and spear at the workshop. He came back for them drunk or out of his mind, on his way to settle a quarrel with his brother. The foreman asked you what to do. '
      + ['You said to give them back, because they were his.', 'You said to keep them until he was himself again.', 'You said to give him the shield and keep the spear.'][c]
      + ' It is the case Socrates put to Cephalus the night before. Cephalus had said that doing right is telling the truth and giving back what you owe.';
    api.note(gg, 'The man who wanted his spear back');
  };
  g.npc('foreman').talk = async (gg) => {
    gg.flags.shopSeen = true;
    if (gg.flags.shopChoice != null) { await gg.say('foreman', gg.flags.shopChoice === 1 ? 'He is still out there in the dust. I’ve sent a boy for his brother.' : 'No word of him yet. I keep listening for shouting.'); return; }
    if (gg.flags.shopHello) return problem(gg);
    gg.flags.shopHello = true;
    await gg.say('foreman', 'Come in, and mind the fire. We make shields here for the house of Cephalus.', { mood: 'happy' });
    await gg.say('foreman', 'Pericles himself talked the old master into settling in Athens. He has lived here ever since, and he has never once stood in a law court, on either side.', { note: 'Lysias, Against Eratosthenes 4. Lysias was a son of Cephalus.' });
    await gg.say('foreman', 'He is not a citizen, and neither are his sons. They pay for choruses at the festivals and for the city’s wars, the way rich citizens do, and they have no vote.', { note: 'Lysias, Against Eratosthenes 20.' });
    await gg.say('foreman', 'Every man in this room belongs to the house, and I am one of them. I run the shop and I answer to Polemarchus.', { note: 'Lysias 12.8 and 12.19 speak of the family’s “factory” and its slaves. For a slave who runs a workshop for his owner, see Aeschines, Against Timarchus 97.' });
    await gg.lines([
      ['foreman', 'Watch how it goes. One man shapes the wooden body. One beats the bronze thin. One keeps the fire. Nobody in here does two of those.'],
      ['foreman', 'Each of them has done his one thing for years. He is quicker at it, and better, than a man who did all three.'],
      ['foreman', 'I’m told Socrates built a whole city on that idea last night. Everybody does the one job he is naturally fit for, and more gets made, and it is made better.', { mood: 'happy', note: 'Republic 369e-370c.' }]]);
    if (mikaHere()) await gg.lines([['mika', 'Who decides what a person is fit for?', 'think'], ['foreman', 'In here? The man who bought you.']]);
    api.giveCards(gg, ['onejob']);
    await gg.say('foreman', 'Socrates comes through workshops himself, they say. He says men like us know real things, which is more than he found among the politicians and the poets. Then he says our mistake is to think it makes us wise about everything else.', { mood: 'happy', note: 'Plato, Apology 22c-e.' });
    await gg.lines([
      ['foreman', 'Look at the finished ones on the wall. The bronze-worker will let you try his hammer, if you ask him.'],
      ['foreman', 'And come back to me before you leave. I have a trouble at the door, and I want a free person’s opinion on it.', 'think']]);
  };

  // ---- the finished shields
  g.addSpot(Object.assign(at(-1.7, -2.7), { r: 1.6, label: 'Look at the finished shields', run: async (gg) => {
    gg.flags.shopSeen = true;
    await gg.say('', 'Six finished shields hang from the rail. Each is a wooden bowl about three feet across, faced with bronze that has been beaten thin.', { note: 'A few ancient shields survive, and they show a wooden body faced with thin bronze.' });
    const fm = gg.npc('foreman'), near = Math.hypot(fm.x - gg.player.x, fm.z - gg.player.z) < 9;
    await gg.say(near ? 'foreman' : '', near ? 'Socrates was in an armorer’s shop once, asking why one man’s breastplates cost more than another’s. The armorer said: because mine fit. Socrates said a shield is the same. A good one is good for the man it fits.'
      : 'People tell a story about Socrates in an armorer’s shop. He asked why one man’s breastplates cost more than another’s. The armorer said: because mine fit. Socrates said a shield is the same.', { mood: 'happy', note: 'Xenophon, Memorabilia 3.10.9-15.' });
    await gg.say('', 'There are more of these in the storeroom than anyone here has counted lately.', { note: 'Lysias, Against Eratosthenes 19: when the Thirty robbed this family in 404 BC, they took “seven hundred shields of ours” and a hundred and twenty slaves.' });
    api.giveCards(gg, ['house404']);
  } }));

  // ---- the bronze-worker and his hammer
  g.npc('bronzeworker').talk = async (gg) => {
    gg.flags.shopSeen = true;
    if (gg.flags.shopHammer) {
      const c = await gg.choose(['Yes, let me try again.', 'No, thank you.'], { prompt: 'Do you want another go with the hammer?', name: 'The bronze-worker' });
      if (c === 0) { gg.ui.closeDialogue(); const n = await strike(gg); await gg.say('bronzeworker', n >= 5 ? 'Better. You could be taught.' : 'Still late. Never mind.', { mood: 'happy' }); }
      return;
    }
    gg.flags.shopHammer = true;
    await gg.lines([
      ['bronzeworker', 'I was bought off a ship when I was a boy. I have stood at this stump ever since, beating bronze.'],
      ['bronzeworker', 'Do you want to try? Hit when I say. Too early and the sheet buckles. Too late and it has gone cold.', 'happy']]);
    await gg.say('', 'Press the Space bar each time he says “Now”.');
    gg.ui.closeDialogue();
    const n = await strike(gg);
    await gg.say('bronzeworker', n >= 5 ? 'Not bad for a first sheet. I would still have to beat it flat again.' : 'You have ruined it. That’s all right. It can be melted down.', { mood: 'happy' });
    await gg.lines([
      ['bronzeworker', 'That is why I do this and nothing else. The bronze will not wait while I go off and do some other job.'],
      ['bronzeworker', 'They tell me Socrates said nearly the same thing last night. The work won’t wait for the worker.', { note: 'Republic 370b-c.' }]]);
    const c = await gg.choose(['Did anyone ask whether you were suited to it?', 'Thank you for the lesson.'], { prompt: 'The bronze-worker picks up his hammer again.', name: 'The bronze-worker' });
    if (c === 0) await gg.say('bronzeworker', 'Nobody asked. I was put here, and I turned out to be good at it. I couldn’t tell you what else I might have been good at.', { mood: 'think', note: 'In Socrates’ city each person does the work he is naturally suited for (370a-b, 433a). Slaves appear in that city only in passing (433d). Julia Annas finds it extraordinary that Plato does not treat slavery as worth discussing (An Introduction to Plato’s Republic, p. 171).' });
    api.giveCards(gg, ['onejob']);
  };
}
