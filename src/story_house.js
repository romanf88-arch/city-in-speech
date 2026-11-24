// The ship captain's house: the third house the player can walk into, and the only one that is a home. The captain
// is at sea, so his wife runs it. Like the schoolroom and the workshop it is a side visit, open from the start.
// Things to do: hear what a wife's work is, look at the year's stores, weave a few rows at the loom, and carry a
// girl's question to Theano's school: will she take a girl? The answer comes back to her mother as a choice.
//
// Every claim about households and women is from research/notes-house.md, which names the passage for each. The
// family is invented. Lysias mentions "Archeneos the ship-captain" and his house in the Piraeus (Against
// Eratosthenes 16), and the game borrows the name; the journal's source list says so.

const WEFT = [['cream', '#e6dcc0'], ['red', '#a33b2e'], ['blue', '#2f5f7a']];

// Weave a strip of cloth at the loom: the player picks a thread color for each row. Resolves with the rows woven.
export function weave(g, rows = 10) {
  if (g.ui.auto) return Promise.resolve(rows);
  return new Promise((res) => {
    const W = 560, H = 380, wrap = document.createElement('div');
    wrap.className='craft-activity';
    wrap.dataset.modal='weaving';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label','Weave a strip of cloth');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,8,6,.6)';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.tabIndex=0;cv.setAttribute('aria-label','Loom. Use 1, 2 or 3 to choose thread.');
    cv.style.cssText = 'max-width:92vw;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.6);cursor:pointer';
    const tip = document.createElement('div');tip.setAttribute('role','status');tip.setAttribute('aria-live','polite');
    tip.style.cssText = 'margin-top:14px;color:#f4ecdc;font:17px/1.45 Palatino Linotype,Georgia,serif;text-align:center;max-width:min(92vw,620px)';
    wrap.append(cv, tip); document.body.append(wrap);
    const c = cv.getContext('2d'), x0 = 70, x1 = W - 70, top = 56, rowH = 22, n = 24, picks = [];
    const draw = () => {
      c.fillStyle = '#3a2c20'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#6b4a32'; c.fillRect(x0 - 34, top - 26, x1 - x0 + 68, 20); c.fillRect(x0 - 30, top - 26, 14, H); c.fillRect(x1 + 16, top - 26, 14, H);
      // the hanging threads
      c.strokeStyle = 'rgba(233,226,208,.75)'; c.lineWidth = 1.6;
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; c.beginPath(); c.moveTo(x, top); c.lineTo(x, H - 60); c.stroke(); }
      // the rows woven so far, from the top down, each passing over and under the threads
      picks.forEach((p, r) => {
        const y = top + r * rowH; c.fillStyle = WEFT[p][1]; c.fillRect(x0, y, x1 - x0, rowH - 1);
        c.fillStyle = 'rgba(0,0,0,.13)'; for (let i = (r % 2); i < n; i += 2) c.fillRect(x0 + (x1 - x0) * i / n, y, (x1 - x0) / n, rowH - 1);
      });
      // the weights
      c.fillStyle = '#b86a45'; for (let i = 0; i < n; i += 2) { const x = x0 + (x1 - x0) * (i + 0.5) / n; c.fillRect(x - 6, H - 60, 12, 22); }
      // the three threads to choose from
      WEFT.forEach((wf, i) => { c.fillStyle = wf[1]; c.fillRect(W / 2 - 150 + i * 110, H - 30, 80, 20); c.fillStyle = '#f4ecdc'; c.font = '14px Georgia,serif'; c.textAlign = 'center'; c.fillText(String(i + 1), W / 2 - 110 + i * 110, H - 36); });
      tip.textContent = picks.length < rows ? `Row ${picks.length + 1} of ${rows}. Press 1, 2 or 3 to choose the thread, or click a color.` : 'The strip is finished.';
    };
    let done = false;
    const finish = () => { if (done) return; done = true;threadButtons.forEach(b=>b.disabled=true); window.removeEventListener('keydown', onKey, true); setTimeout(() => { wrap.remove();g.keys.clear();g.pressed.clear();if(g.mode==='play')g.canvas.focus();res(picks.length); }, 900); };
    const pick = (i) => { if (done || g.mode==='paused') return; picks.push(i); g.audio.tone(380 + i * 70, 0.07, 'triangle', 0.05); draw(); if (picks.length >= rows) finish(); };
    const controls=document.createElement('div');controls.className='craft-actions';
    const threadButtons=WEFT.map(([name,color],i)=>{const b=document.createElement('button');b.className='btn';b.textContent=(i+1)+'. '+name;b.style.borderLeft='8px solid '+color;b.onclick=()=>pick(i);controls.append(b);return b;});
    const leave=document.createElement('button');leave.className='btn ghost';leave.textContent='Leave the loom';leave.onclick=()=>{if(g.mode!=='paused')finish();};controls.append(leave);wrap.append(controls);
    const onKey = (e) => {
      if(g.mode==='paused' || e.ctrlKey || e.metaKey || e.altKey)return;
      if(e.code==='Tab'){e.preventDefault();e.stopImmediatePropagation();const all=[cv,...threadButtons,leave].filter(b=>!b.disabled),i=all.indexOf(document.activeElement);all[e.shiftKey?(i<=0?all.length-1:i-1):(i+1)%all.length].focus();return;}
      if(e.repeat){e.preventDefault();e.stopImmediatePropagation();return;}
      const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
      if (i >= 0) { e.preventDefault(); e.stopPropagation(); pick(i % 3); }
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation();if(controls.contains(document.activeElement))document.activeElement.click();else pick(picks.length ? picks[picks.length - 1] : 0); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    };
    cv.addEventListener('pointerdown', (e) => {if(g.mode==='paused')return;const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; if (y > H - 40) { const i = Math.floor((x - (W / 2 - 150)) / 110); if (i >= 0 && i < 3) pick(i); } });
    window.addEventListener('keydown', onKey, true);
    draw();cv.focus();
  });
}

export function setupHouse(g, api) {
  const H = g.sites.home; if (!H) return;
  const at = (a, b) => { const [x, z] = H.at(a, b); return { x, z }; };
  const mikaHere = () => { const m = g.npc('mika'); return !!(m && !m.hidden && m.behavior === 'follow' && m.space === g.space); };
  const near = (id, d = 8) => { const n = g.npc(id); return !!(n && !n.hidden && Math.hypot(n.x - g.player.x, n.z - g.player.z) < d); };
  // The wife does not speak with a man she does not know unless Mika, whom she knows, is with him.
  const stranger = async (gg) => {
    await gg.say('wife', 'My husband is at sea, and I don’t talk with men I don’t know. Come back with somebody I do know.', { note: 'Lysias, Against Simon 6, speaks of the women of a house as “ashamed to be seen even by their kinsmen”.' });
  };

  // ---- walking in for the first time
  g.addTrigger(Object.assign(at(-1.5, 1.6), { r: 1.1, when: (gg) => !gg.flags.homeSeen, run: async (gg) => {
    gg.flags.homeSeen = true;
    gg.ui.area('The ship captain’s house', 'His wife runs it while he is at sea');
    if (mikaHere()) await gg.lines([
      ['mika', 'This is the house of Archeneos, the ship’s captain. He is at sea, so his wife is in charge of everything here.'],
      ['mika', 'She knows me, because I bring her garlands. That is the only reason a man she has never met is getting through this door.', 'happy']]);
    else await gg.say('', 'A woman is weaving at a tall loom, a girl is spinning, and another woman kneels at a grindstone. They stop and look at you. Nobody speaks.');
    api.note(gg, 'The ship captain’s house');
  } }));

  // ---- the girl's question, and what her mother does with the answer
  const decide = async (gg) => {
    await gg.say('', 'You tell them what Theano said: she would take the girl tomorrow, if the girl’s father sent her.');
    await gg.lines([
      ['wife', 'So she would take her. That was the easy half.'],
      ['wife', 'Her father is at sea, so today it is for me to say. What would you do in my place?', 'think']]);
    const c = await gg.choose(['Send her to Theano. If she is quick, being a girl is no reason to hold her back.', 'Keep her here and teach her the loom and the stores. That is the work she will have.', 'Let her brother go on teaching her at home, and say nothing to anyone.'], { prompt: 'The girl wants to learn her letters.', name: 'The captain’s wife' });
    gg.flags.homeChoice = c; gg.flags.homeErrand = 3;
    await gg.say('wife', [
      'And who marries a girl who has sat in a room full of boys? You are thinking of her mind. I have to think of her whole life.',
      'That is what my mother decided for me. I run this house better than my husband runs his ship, and I can’t read the marks on my own jars.',
      'That is what we are doing now. It works for as long as nobody notices.'][c], { mood: 'think' });
    await gg.say('daughter', ['I wouldn’t mind the boys.', 'I can do the loom and the letters. I have two hands.', 'I’m already on the second half of the letters.'][c], { mood: 'happy' });
    if (mikaHere()) await gg.say('mika', 'Nobody decided anything for me. There was no money, so I went to the market with my mother’s garlands.', { mood: 'sad', note: 'A widow in Aristophanes feeds five children by weaving garlands in the market (Thesmophoriazusae 443-458).' });
    await gg.say('wife', 'I will think about it until his ship comes in. That is as much deciding as I am allowed.', { note: 'Socrates’ reason for schooling women is that the city needs its best guardians, whoever they are (456a-457a). Julia Annas argues that the proposal is not made for the women’s sake: Plato’s interest “is neither in women’s rights nor in their preferences” (An Introduction to Plato’s Republic, p. 181).' });
    api.giveCards(gg, ['samework']);
    gg.flags.homeText = 'The daughter of Archeneos the ship’s captain wants to learn her letters, as her brother does at Theano’s school. Theano said she would take a girl if her father sent her, and that Socrates is on the girl’s side. Her mother asked what you would do. Your advice was: '
      + ['send her to the school', 'keep her at home and teach her the loom and the stores', 'let her brother go on teaching her quietly at home'][c]
      + '. Her mother will think about it until her husband’s ship comes in. Xenophon has a husband say that the god made women’s nature for indoor work. Socrates says in the Republic that no work belongs to a woman because she is a woman.';
    api.note(gg, 'A girl who wants to learn letters');
  };

  g.npc('wife').talk = async (gg) => {
    gg.flags.homeSeen = true;
    if (!mikaHere()) return stranger(gg);
    if (gg.flags.homeErrand === 2) return decide(gg);
    if (gg.flags.homeHello) { await gg.say('wife', gg.flags.homeErrand === 3 ? 'No ship yet. The girl asks me every morning whether I have decided.' : 'Try the loom, and look at the stores if you like. And do talk to my daughter.'); return; }
    gg.flags.homeHello = true;
    await gg.say('wife', 'Mika. And a man I don’t know. Come in, both of you, and leave the door open. I won’t have the neighbors saying that I receive strangers while my husband is away.', { note: 'Lysias, Against Simon 6, speaks of the women of a house as “ashamed to be seen even by their kinsmen”. A poorer woman worked in the market, as Mika does.' });
    await gg.say('wife', 'My husband brings in what we live on. Keeping it is my work: the grain, the oil, the wool, the slaves, the children.', { note: 'Xenophon, Oeconomicus 7.20-25 and 7.35-36.' });
    await gg.say('wife', 'People say a wife is like the queen in a beehive. She stays inside, sends the others out to work, takes in what they bring, and shares it out.', { mood: 'happy', note: 'Xenophon, Oeconomicus 7.32-34.' });
    await gg.lines([
      ['wife', 'My husband’s man came back from the school laughing. He says Socrates wants women to guard the city alongside the men, and to have the same schooling for it.'],
      ['wife', 'I guard this house already. I go round it the way a commander goes round his sentries. Nobody finds that funny.', { mood: 'think', note: 'Xenophon, Oeconomicus 9.14-15: a husband tells his wife to think of herself as “guardian of the laws” of the household and to inspect it as a garrison commander inspects his guards.' }],
      ['wife', 'Try the loom, and look at the stores if you like. And talk to my daughter. She has been pestering me about something, and I’d like to hear what a stranger makes of it.', 'happy']]);
  };

  g.npc('daughter').talk = async (gg) => {
    gg.flags.homeSeen = true;
    if (!mikaHere()) { await gg.say('', 'The girl looks at her mother and says nothing.'); return; }
    const e = gg.flags.homeErrand || 0;
    if (e === 2) return decide(gg);
    if (e === 3) { await gg.say('daughter', ['Theano would take me. I am going to keep saying so.', 'I can spin and think at the same time. Nobody can stop that.', 'My brother showed me three more letters last night.'][gg.flags.homeChoice || 0], { mood: 'happy' }); return; }
    if (e === 1) { await gg.say('daughter', 'Theano’s school is on the main street, north of the market square. Will you really ask her?'); return; }
    await gg.lines([
      ['daughter', 'My brother goes to Theano’s school. At night he shows me his letters on his tablet. I can write half of them already.', 'happy'],
      ['daughter', 'Will you ask Theano whether she would take me? Mother says no girl goes. But nobody has ever asked.']]);
    gg.flags.homeErrand = 1;
    gg.ui.toast('A question for Theano', 'Ask Theano, at the schoolroom north of the market square, whether she would take a girl.', 'Something to do');
  };

  // ---- Theano's answer (her other conversations go on as before)
  const T = g.npc('theano'), oldT = T.talk;
  T.talk = async (gg, n) => {
    if (gg.flags.homeErrand !== 1) return oldT ? oldT(gg, n) : undefined;
    api.meet(gg, 'theano');
    await gg.lines([
      ['theano', 'The captain’s girl? I would take her tomorrow.', 'happy'],
      ['theano', 'Her father would have to send her, and pay for her. No father in this town has done that for a daughter.'],
      ['theano', 'Tell her mother that Socrates is on the girl’s side. He said that if women are to do the same work as men, they have to be taught the same things.', { mood: 'think', note: 'Republic 451e-452a.' }],
      ['theano', 'And tell her that I say so as well.']]);
    gg.flags.homeErrand = 2;
    gg.ui.toast('A question for Theano', 'Go back to the ship captain’s house, south of the market square, with her answer.', 'Something to do');
  };

  // ---- the year's stores
  g.addSpot(Object.assign(at(2.9, -1.8), { r: 1.4, label: 'Look at the stores', run: async (gg) => {
    gg.flags.homeSeen = true;
    await gg.say('', 'Two tall jars of grain. Oil and wine in the smaller jars. A chest by the far wall for the blankets and the good cloaks.', { note: 'Xenophon, Oeconomicus 9.3: the dry rooms of a house are for the grain, the cool ones for the wine, and the most secure for the best blankets and vessels.' });
    if (mikaHere() && near('wife')) await gg.say('wife', 'That has to last until the next harvest. If I let a year’s store go in a month, we starve in the spring.', { note: 'Xenophon, Oeconomicus 7.36.' });
    await gg.say(mikaHere() ? 'mika' : '', mikaHere() ? 'Food, a roof, and clothes on the loom. Adeimantus told me Socrates started his whole city from those three.' : 'Food, a roof overhead, and clothes on the loom. Socrates started his city in words from those three needs.', { mood: 'think', note: 'Republic 369b-d.' });
    api.giveCards(gg, ['needs']);
  } }));

  // ---- the loom
  g.addSpot(Object.assign(at(1.1, -0.2), { r: 1.05, label: 'Weave a few rows at the loom', run: async (gg) => {
    gg.flags.homeSeen = true;
    await gg.say('', 'An upright loom. The cloth grows from the top, and the hanging threads are held tight by clay weights.', { note: 'Two women work at an upright loom, and others weigh and spin wool, on an oil flask painted about 550-530 BC (New York, Metropolitan Museum 31.11.10).' });
    const ok = mikaHere() && near('wife');
    if (ok) await gg.say('wife', 'Go on, then. Every man thinks it is easy.', { mood: 'happy' });
    gg.ui.closeDialogue();
    await weave(gg);
    if (!ok) { await gg.say('', 'You leave a short strip of cloth at the top of the loom.'); return; }
    gg.flags.homeLoom = true;
    await gg.lines([
      ['wife', 'Not bad. Your edges wander. I will have to pull it out after you’ve gone.', 'happy'],
      ['wife', 'I’m told Socrates talked about this last night. He said men are better than women at nearly everything. Then he hesitated over weaving and cooking, where women are supposed to be best.'],
      ['wife', 'Glaucon told him that plenty of women are better than plenty of men at plenty of things.', 'happy'],
      ['wife', 'And then Socrates said the thing that made my husband’s man laugh. No work belongs to a woman because she is a woman, or to a man because he is a man.', { note: 'Republic 455c-e.' }],
      ['wife', 'My husband was taught otherwise, and so was I. The god made a woman’s nature for the work indoors and a man’s for the work outdoors.', { mood: 'think', note: 'Xenophon, Oeconomicus 7.22-25. Xenophon gives this view to a husband, Ischomachus, who is explaining it to Socrates.' }]]);
    api.giveCards(gg, ['samework']);
  } }));
}
