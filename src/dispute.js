// Runs a dispute among readers, keeps the record of it, and draws the journal and the closing summary.
import { $, el } from './util.js';
import { CARDS, CARD_BY_ID } from './cards.js';
import { READERS, DISPUTES, TENSIONS, SOURCES, STORY, WORDS } from './content.js';

const TRIES = 3;   // no longer a limit (see PARTS below); kept so that old saved games still load

// Which part of a reader's claim each objection goes against: the numbers count the reader's claim sentences from 0.
// When a player puts a passage to a reader, the reader asks which part of the view it goes against, and the player
// has to find it. This replaced a limit of three failed objections (2026-11-16, from the review Roman passed on:
// replace the limit with "What part of my claim does that challenge?"). The labels are the game's own reading of its
// own sentences, and are not taken from the books the readers speak for. Where an objection fairly bears on two parts,
// both are accepted.
const PARTS = {
  ring: { kleio: { compact: [0], ringback: [2] }, dromon: { disown: [1, 2], godlike: [1, 2] }, sannion: { godlike: [2], disown: [2] } },
  poetry: { phanias: { wreath: [2], theuth: [0, 2] }, kleio: { couches: [2] }, sannion: { homer: [2], couches: [1, 2] }, dromon: { begin: [2], quarrel: [2] } },
  writing: { phanias: { theuth: [0, 2] }, kleio: { persuade: [1, 2] }, theano: { theuth: [1] }, sannion: { theuth: [1] } },
  cave: { kleio: { key: [0, 1] }, sannion: { key: [0, 1], turn: [0, 1] }, archedemos: { likeus: [0, 1] }, theano: { dragged: [0, 1] } },
  back: { kleio: { least: [1], worse: [1, 2] }, sannion: { prizes: [0] }, archedemos: { godown: [0, 2] }, theano: { fifty: [1, 2] }, dromon: { least: [1, 2] } },
  city: { dromon: { heaven: [0, 2], model: [0, 2] }, sannion: { kings: [0, 2] }, kleio: { kings: [0, 1] }, archedemos: { noble: [0, 1], heaven: [0, 1] }, phanias: { kings: [0, 2], ten: [0, 2] }, theano: { heaven: [1] } },
};
const NTH = ['The first thing you said', 'The second thing you said', 'The third thing you said', 'The fourth thing you said', 'The fifth thing you said'];

function state(g, id) {
  if (!g.disputeState[id]) g.disputeState[id] = { heard: [], asked: [], plain: [], pressed: {}, misses: 0, wax: TRIES, vote: null, done: false };
  const st = g.disputeState[id]; if (!st.plain) st.plain = [];
  return st;
}

// Say several lines by one person.
async function lines(g, who, arr, lastNote) { for (let i = 0; i < arr.length; i++) await g.say(who, arr[i], i === arr.length - 1 && lastNote ? { note: lastNote } : {}); }

// The guide speaks, if she is with the player. Returns false if she is not there.
async function guide(g, text, mood) {
  const m = g.npcs.get('mika');
  if (!m || m.hidden || m.space !== g.space) return false;
  await g.say('mika', text, { mood: mood || 'neutral', noFocus: true });
  return true;
}
const hasGuide = (g) => { const m = g.npcs.get('mika'); return !!(m && !m.hidden && m.space === g.space); };

export async function runDispute(g, id) {
  const D = DISPUTES[id], st = state(g, id);
  if (st.done) return st.vote;
  const hand = () => D.hand.filter((c) => g.cards.includes(c)).map((c) => CARD_BY_ID[c]);
  const firstEver = !g.flags.disputeTaught;
  if (!st.started) {
    st.started = true;
    if (firstEver) {
      await g.say('', 'These people all heard the same thing last night, and they took it in different ways. The question they disagree about is this. ' + D.question);
      await guide(g, 'They can’t all be right. Let’s hear what each of them thinks. Then you can say who you believe.', 'think');
    } else await g.say('', 'The people here disagree with each other. The question is this. ' + D.question + ' Hear each of them, test them if you like, and then cast your pebble.');
  }
  for (;;) {
    const opts = D.readers.map((r) => {
      const R = READERS[r.who], heard = st.heard.includes(r.who), pressed = (st.pressed[r.who] || []).length;
      return { text: (heard ? 'Go back to ' : 'Hear ') + R.name + ', who ' + R.role, note: heard ? (pressed ? 'You have found a weak spot in this view.' : 'Heard. Not tested yet.') : '' };
    });
    const allHeard = D.readers.every((r) => st.heard.includes(r.who));
    opts.push({ text: 'Cast your pebble', note: allHeard ? 'Say which view you find strongest, or keep your pebble.' : 'You can do this once you have heard everyone.' });
    const pick = await g.choose(opts, { prompt: D.question, name: 'Who do you want to hear?' });
    if (pick === D.readers.length) {
      if (!allHeard) { await g.say('', 'Hear all of them first. Otherwise you would only be guessing.'); continue; }
      break;
    }
    await hearReader(g, id, D.readers[pick], hand);
  }
  // The vote.
  if (firstEver) await guide(g, 'In Athens people vote by dropping a pebble in a jar. So, whose jar gets yours? Nobody is going to tell you which of them is right.', 'happy');
  const vopts = D.readers.map((r) => r.vote); vopts.push('Keep your pebble for now.');
  const v = await g.choose(vopts, { prompt: D.question, name: 'Where does your pebble go?' });
  const voted = v < D.readers.length ? D.readers[v].who : 'none';
  st.vote = voted; st.done = true; g.audio.blip('pebble');
  if (voted !== 'none') await g.say(voted, D.readers[v].voted);
  const part = D.parting[voted];
  if (part) await g.say(part[0], part[1]);
  g.ui.wax(null);
  g.stats.votes = (g.stats.votes || 0) + 1;
  g.ui.toast('Written in your journal', D.title + ': ' + (voted === 'none' ? 'you kept your pebble' : 'your pebble went to ' + READERS[voted].name));
  return voted;
}

async function hearReader(g, id, r, hand) {
  const st = state(g, id), R = READERS[r.who];
  if (!g.flags['said_' + r.who]) { g.flags['said_' + r.who] = true; g.flags['met_' + r.who] = true; await g.say(r.who, R.intro); }
  await lines(g, r.who, r.claim);
  if (!st.heard.includes(r.who)) st.heard.push(r.who);
  if (!g.flags.disputeTaught) {
    g.flags.disputeTaught = true;
    if (await guide(g, r.plain, 'think')) st.plain.push(r.who);
    await g.say('', 'You can ask ' + R.name + ' why, or ask Mika what she makes of it. You can also put a passage from your journal to ' + R.name + '. ' + R.name + ' will ask which part of the view the passage goes against. If you find the place, you get an honest answer. If you get it wrong, you are told so, and you can try again.');
  }
  for (;;) {
    const canObject = hand().length > 0, mika = hasGuide(g), told = st.plain.includes(r.who);
    const o = [{ text: 'Why do you think that?', note: st.asked.includes(r.who) ? 'You have asked this.' : '', k: 'why' },
      { text: 'Put a passage to ' + R.name, note: canObject ? '' : 'You have no passages for this yet.', k: 'object' }];
    if (mika) o.push({ text: 'Ask Mika what she makes of it', note: told ? 'She has an idea for an objection.' : '', k: 'mika' });
    o.push({ text: 'Hear someone else', k: 'leave' });
    const c = o[await g.choose(o, { prompt: R.name + ' is waiting for your answer.', name: R.name })].k;
    if (c === 'why') {
      await lines(g, r.who, r.why);
      if (!st.asked.includes(r.who)) { st.asked.push(r.who); g.stats.asked++; }
      await g.say('', 'Where this view comes from: ' + r.src + (r.note ? ' ' + r.note : ''));
    } else if (c === 'mika') {
      if (!told) { st.plain.push(r.who); await guide(g, r.plain, 'think'); }
      else await guide(g, r.hint, 'think');
    } else if (c === 'object') {
      if (!canObject) { await g.say('', 'You have no passages that bear on this yet.'); continue; }
      const cardId = await g.ui.pickCard(hand(), 'Which passage do you want to put to ' + R.name + '?', R.name + ' will ask which part of the view it goes against.');
      if (!cardId) continue;
      g.stats.objections++;
      const card = CARD_BY_ID[cardId], t = r.troubles[cardId], sup = r.supports[cardId], parts = (PARTS[id] && PARTS[id][r.who] && PARTS[id][r.who][cardId]) || null;
      await g.say('you', 'What about this passage? “' + card.title + '.”');
      // The reader asks which part of the claim the passage goes against. A wrong answer costs nothing but the correction.
      const body = r.claim.map((line, i) => ({ text: NTH[i] || 'Another thing you said', note: line }));
      body.push({ text: 'None of it. It backs you up.', note: '' });
      const pick = await g.choose(body, { prompt: 'Which part of what I said does that go against?', name: R.name });
      const backs = pick === r.claim.length, miss = () => { g.audio.blip('bad'); st.misses++; g.stats.misses++; g.log.push({ t: 'attempt', skill: 'evidence', correct: false, dispute: id, who: r.who, card: cardId }); };
      if (t && !backs && (!parts || parts.includes(pick))) {
        const first = !(st.pressed[r.who] || []).includes(cardId);
        g.audio.blip('good'); g.stats.hits += first ? 1 : 0;
        if (first) (st.pressed[r.who] || (st.pressed[r.who] = [])).push(cardId);
        g.log.push({ t: 'attempt', skill: 'evidence', correct: true, dispute: id, who: r.who, card: cardId });
        await g.say('you', t.you);
        await lines(g, r.who, t.reply, t.cite ? 'Source: ' + t.cite : null);
        if (first) g.ui.toast('Weak spot found', R.name + ' on “' + card.title + '”');
      } else if (t) {
        miss();
        await g.say(r.who, backs ? 'I wish it did. Read it again. I think it goes against something I said.' : 'That passage does give me trouble, but not there. Look again at what I said.');
      } else if (sup && backs) {
        const agreed = st.agreed || (st.agreed = {}), first = !(agreed[r.who] || []).includes(cardId);
        g.audio.blip('good'); if (first) { (agreed[r.who] || (agreed[r.who] = [])).push(cardId); g.stats.agreed = (g.stats.agreed || 0) + 1; }
        g.log.push({ t: 'attempt', skill: 'evidence', correct: true, dispute: id, who: r.who, card: cardId, kind: 'supports' });
        await g.say(r.who, sup);
        if (first) g.ui.toast('Common ground found', R.name + ' on “' + card.title + '”');
      } else {
        miss();
        await g.say(r.who, sup || (backs ? 'I don’t see that it has much to do with what I said, one way or the other.' : 'I don’t see how that passage is a problem for what I said.'));
      }
      if (st.misses >= 2 && !st.hinted) { st.hinted = true; if (!(await guide(g, 'Look for a passage that says the opposite of what ' + R.name + ' just claimed. ' + r.hint, 'think'))) await g.say('', 'A passage is a problem for a view when the view says one thing and the passage seems to say the opposite.'); }
    } else return;
  }
}

// ---------------------------------------------------------------- journal
export function renderJournal(g, tab) {
  tab = tab || g.journalTab || 'story'; g.journalTab = tab;
  document.querySelectorAll('#journal .tab').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.onclick = () => renderJournal(g, b.dataset.tab); });
  const body = $('journalBody'); body.innerHTML = '';
  if (tab === 'story') {
    const list = STORY.filter((e) => e.when(g.flags));
    if (!list.length) { body.append(el('p', null, 'Nothing yet. This page keeps a plain summary of what has happened and what has been argued, so you can catch up at any time.')); return; }
    for (const e of list) {
      const box = el('div', 'sofar'); box.append(el('b', null, e.title));
      box.append(el('p', e.cross ? 'x' : null, e.text || g.flags[e.flag || 'purseText'] || '')); body.append(box);
    }
  } else if (tab === 'passages') {
    if (!g.cards.length) { body.append(el('p', null, 'No passages yet. You will collect them as you hear what was said last night. Each one is a place in Plato’s book, retold in plain words.')); return; }
    const wrap = el('div', 'cards');
    CARDS.filter((c) => g.cards.includes(c.id)).forEach((c) => wrap.append(g.ui.cardEl(c, false)));
    body.append(wrap);
  } else if (tab === 'readings') {
    const ids = Object.keys(DISPUTES).filter((id) => g.disputeState[id] && g.disputeState[id].started);
    if (!ids.length) { body.append(el('p', null, 'No disputes yet. When people disagree about what something means, their views are kept here with the books they come from.')); return; }
    for (const id of ids) {
      const D = DISPUTES[id], st = g.disputeState[id];
      body.append(el('h3', null, D.title)); body.append(el('p', null, D.question));
      for (const r of D.readers) {
        if (!st.heard.includes(r.who)) continue;
        const R = READERS[r.who], box = el('div', 'reading');
        box.append(el('div', 'who', R.name + ', who ' + R.role));
        const h = el('h4'); if (st.vote === r.who) h.append(el('span', 'pebble')); h.append(document.createTextNode(r.vote.replace(/^[^:]+:\s*/, '').replace(/^./, (m) => m.toUpperCase()))); box.append(h);
        box.append(el('p', null, r.claim.join(' ')));
        if (st.asked.includes(r.who)) box.append(el('p', null, r.why.join(' ')));
        for (const cid of (st.pressed[r.who] || [])) { const t = r.troubles[cid], hc = el('div', 'hard'); hc.append(el('b', null, 'Weak spot: ' + CARD_BY_ID[cid].title + ' (' + CARD_BY_ID[cid].ref + '). ')); hc.append(document.createTextNode(t.reply.join(' ') + (t.cite ? ' (' + t.cite + ')' : ''))); box.append(hc); }
        box.append(el('div', 'src', 'From: ' + r.src + (r.note ? ' ' + r.note : '')));
        body.append(box);
      }
      if (st.done && st.vote === 'none') body.append(el('p', null, 'You kept your pebble.'));
    }
  } else if (tab === 'people') {
    body.append(el('p', null, 'Mika and the six readers below are invented. Each reader speaks for real books, named here. What they say those books argue was taken from the books themselves.'));
    for (const p of (g.peopleNotes || [])) { if (!g.flags['met_' + p.id]) continue; const row = el('div', 'person'), dot = el('div', 'dot'); dot.style.background = p.color || '#999'; row.append(dot); const t = el('div'); t.append(el('b', null, p.name)); t.append(el('p', null, p.about)); row.append(t); body.append(row); }
    for (const k in READERS) {
      const R = READERS[k]; if (!g.flags['met_' + k]) continue;
      const row = el('div', 'person'), dot = el('div', 'dot'); dot.style.background = R.color; row.append(dot);
      const t = el('div'); t.append(el('b', null, R.name + ', who ' + R.role)); t.append(el('p', null, R.about)); t.append(el('p', null, 'Speaks for: ' + R.speaksFor)); row.append(t); body.append(row);
    }
  } else if (tab === 'words') {
    for (const [w, d] of WORDS) { const row = el('div', 'word'); row.append(el('b', null, w)); row.append(el('p', null, d)); body.append(row); }
  } else {
    body.append(el('p', null, 'Everything the readers say was drawn from these books.'));
    for (const [a, b] of SOURCES) { const p = el('p'); p.append(el('b', null, a.replace(/\.$/, '') + '. ')); p.append(document.createTextNode(b)); body.append(p); }
  }
}

// ---------------------------------------------------------------- closing summary
export function tensionsFor(g) {
  const out = [];
  for (const t of TENSIONS) { const a = g.disputeState[t.a[0]], b = g.disputeState[t.b[0]]; if (a && b && a.vote === t.a[1] && b.vote === t.b[1]) out.push(t.text); }
  return out;
}

export function showDebrief(g, extra) {
  const body = $('debriefBody'); body.innerHTML = '';
  body.append(el('h2', null, 'What you made of it'));
  const done = Object.keys(DISPUTES).filter((id) => g.disputeState[id] && g.disputeState[id].done);
  const tally = {};
  body.append(el('h3', null, 'Your pebbles'));
  for (const id of done) {
    const st = g.disputeState[id], D = DISPUTES[id], r = D.readers.find((x) => x.who === st.vote);
    const p = el('p'); p.append(el('b', null, D.question + ' '));
    p.append(document.createTextNode(r ? r.vote : 'You kept your pebble.'));
    body.append(p);
    if (r) tally[st.vote] = (tally[st.vote] || 0) + 1;
  }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) body.append(el('p', null, 'You sided most often with ' + READERS[top[0]].name + ', who speaks for ' + READERS[top[0]].speaksFor + '.'));
  if (extra && extra.length) { body.append(el('h3', null, 'What you did')); for (const line of extra) body.append(el('p', null, line)); }
  const s = g.stats, tried = s.hits + s.misses;
  body.append(el('h3', null, 'How you argued'));
  body.append(el('p', null, 'You asked “why” ' + s.asked + ' times and put a passage to a reader ' + (tried + (s.agreed || 0)) + ' times. ' + s.hits + ' of those found a real weak spot' + (s.agreed ? ', and ' + s.agreed + ' showed that you saw a passage backing a view up' : '') + '.' + (tried >= 4 && s.hits / tried >= 0.6 ? ' You were checking what people claimed against what was actually said, and that is how these arguments are meant to be tested.' : tried < 3 ? ' You mostly listened. Next time, try to catch each reader out with a passage.' : '')));
  const ten = tensionsFor(g);
  body.append(el('h3', null, 'Where your choices pull against each other'));
  if (ten.length) ten.forEach((t) => body.append(el('p', null, t)));
  else body.append(el('p', null, 'None of the common conflicts showed up in your choices. Your views may fit together, or you may have kept your pebble at the points where they would have clashed.'));
  body.append(el('h3', null, 'What these arguments are called'));
  body.append(el('p', null, 'If you go on to read about the Republic, you will meet these names. The question the ring raises is called nature against convention: is doing right good in itself, or only a rule that people agreed on? The argument about the poets turns on mimesis, the Greek word for imitation, which can mean copying, acting a part, or losing yourself in a performance. The line and the cave are about levels of knowing, and about whether the most real things can be seen or only thought. The question about the city is a question about how to read: can an author put forward an extreme plan in order to make the reader think, without meaning it as a plan?'));
  body.append(el('h3', null, 'Something to take away'));
  body.append(el('p', null, 'Pick one thing you believe about what is fair. Who taught it to you, and how: a story, a saying, a rule? If you had the ring for a month, would you still act on it? Then ask which of the six readers would explain your answer best, and which passage that reader would have trouble with.'));
  body.append(el('h3', null, 'Read the books'));
  for (const [a, b] of SOURCES.slice(0, 10)) { const p = el('p'); p.style.fontSize = '15px'; p.append(el('b', null, a.replace(/\.$/, '') + '. ')); p.append(document.createTextNode(b)); body.append(p); }
  const row = el('div', 'row'), b1 = el('button', 'btn', 'Keep walking'), b2 = el('button', 'btn ghost', 'Open the journal');
  b1.onclick = () => { $('debrief').classList.add('hidden'); g.canvas.focus(); };
  b2.onclick = () => { $('debrief').classList.add('hidden'); g.toggle('journal'); };
  row.append(b1, b2); body.append(row);
  const coming = el('p', null, 'This is the first part. The founding of the city, the three waves, the ship, the decline of cities, and the choice of lives are still to come.'); coming.style.fontSize = '14px'; body.append(coming);
  $('debrief').classList.remove('hidden'); b1.focus({ preventScroll: true }); body.scrollTop = 0;
}
