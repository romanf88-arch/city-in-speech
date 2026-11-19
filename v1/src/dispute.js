// Runs a dispute among readers, keeps the record of it, and draws the journal and the closing summary.
import { $, el } from './util.js';
import { CARDS, CARD_BY_ID } from './cards.js';
import { READERS, DISPUTES, TENSIONS, SOURCES } from './content.js';

const WAX = 3;

function state(g, id) {
  if (!g.disputeState[id]) g.disputeState[id] = { heard: [], asked: [], pressed: {}, misses: 0, wax: WAX, vote: null, done: false };
  return g.disputeState[id];
}

// Say several lines by one reader.
async function lines(g, who, arr) { for (const t of arr) await g.say(who, t); }

export async function runDispute(g, id) {
  const D = DISPUTES[id], st = state(g, id);
  if (st.done) return st.vote;
  const hand = () => D.hand.filter((c) => g.cards.includes(c)).map((c) => CARD_BY_ID[c]);
  g.ui.wax(st.wax, WAX);
  if (!st.started) {
    st.started = true;
    await g.say('', D.question + ' The people here do not agree. Hear each of them. You may ask why, or object by handing over a passage from your journal. A passage that really troubles a reading will get that reader’s best reply. One that does not costs you a wax mark, and you have three.');
  }
  for (;;) {
    const opts = D.readers.map((r) => {
      const R = READERS[r.who], heard = st.heard.includes(r.who), pressed = (st.pressed[r.who] || []).length;
      return { text: (heard ? 'Go back to ' : 'Hear ') + R.name + ', who ' + roleVerb(R.role), note: heard ? (pressed ? 'You have found a hard case for this reading.' : 'Heard. Not yet tested.') : '' };
    });
    const allHeard = D.readers.every((r) => st.heard.includes(r.who));
    opts.push({ text: 'Cast your pebble', note: allHeard ? 'Say which reading you find strongest, or keep the pebble.' : 'You can do this once you have heard everyone.' });
    const pick = await g.choose(opts, { prompt: D.question, name: 'The dispute' });
    if (pick === D.readers.length) {
      if (!allHeard) { await g.say('', 'Hear all of them first. A pebble cast before that would only be a guess.'); continue; }
      break;
    }
    await hearReader(g, id, D.readers[pick], hand);
    g.ui.wax(st.wax, WAX);
  }
  // The vote.
  const vopts = D.readers.map((r) => r.vote); vopts.push('Keep your pebble for now.');
  const v = await g.choose(vopts, { prompt: 'Where does your pebble go? ' + D.question, name: 'Your pebble' });
  const voted = v < D.readers.length ? D.readers[v].who : 'none';
  st.vote = voted; st.done = true; g.audio.blip('pebble');
  if (voted !== 'none') await g.say(voted, D.readers[v].voted);
  const part = D.parting[voted];
  if (part) await g.say(part[0], part[1]);
  g.ui.wax(null);
  g.stats.votes = (g.stats.votes || 0) + 1;
  g.ui.toast('Recorded in your journal', D.title + ': ' + (voted === 'none' ? 'pebble kept' : 'pebble to ' + READERS[voted].name));
  return voted;
}

function roleVerb(role) { return role.startsWith('keeps') || role.startsWith('writes') ? role : 'is a ' + role; }

async function hearReader(g, id, r, hand) {
  const st = state(g, id), R = READERS[r.who];
  await lines(g, r.who, r.claim);
  if (!st.heard.includes(r.who)) st.heard.push(r.who);
  for (;;) {
    const canObject = st.wax > 0 && hand().length > 0;
    const o = [{ text: 'Ask why', note: st.asked.includes(r.who) ? 'You have asked this.' : '' }, { text: 'Object with a passage', note: canObject ? '' : (st.wax > 0 ? 'You have no passages for this yet.' : 'Your wax marks are used up.') }, { text: 'Turn to someone else' }];
    const c = await g.choose(o, { prompt: R.name + ' is waiting.', name: R.name });
    if (c === 0) {
      await lines(g, r.who, r.why);
      if (!st.asked.includes(r.who)) { st.asked.push(r.who); g.stats.asked++; }
      await g.say('', 'This reading comes from ' + r.src);
    } else if (c === 1) {
      if (!canObject) { await g.say('', st.wax > 0 ? 'You have no passages that bear on this yet.' : 'You have no wax marks left. Listen, and then decide.'); continue; }
      const cardId = await g.ui.pickCard(hand(), 'Which passage troubles ' + R.name + '’s reading?', 'Pick the passage this reading has the most trouble explaining.');
      if (!cardId) continue;
      g.stats.objections++;
      const card = CARD_BY_ID[cardId];
      if (r.troubles[cardId]) {
        const first = !(st.pressed[r.who] || []).includes(cardId);
        g.audio.blip('good'); g.stats.hits += first ? 1 : 0;
        if (first) (st.pressed[r.who] || (st.pressed[r.who] = [])).push(cardId);
        g.log.push({ t: 'attempt', skill: 'evidence', correct: true, dispute: id, who: r.who, card: cardId });
        await g.say('you', 'What about this? ' + card.title + ' (' + card.ref + ').');
        await lines(g, r.who, r.troubles[cardId]);
        if (first) g.ui.toast('Hard case found', R.name + ' on "' + card.title + '"');
      } else {
        g.audio.blip('bad'); st.wax--; st.misses++; g.stats.misses++;
        g.log.push({ t: 'attempt', skill: 'evidence', correct: false, dispute: id, who: r.who, card: cardId });
        await g.say('you', 'What about this? ' + card.title + ' (' + card.ref + ').');
        await g.say(r.who, r.supports[cardId] || 'That passage does not touch what I said. Look for the place my reading has to explain away.');
        g.ui.wax(st.wax, WAX);
        if (st.misses >= 2 && !st.hinted) { st.hinted = true; await g.say('', 'A hint. A passage troubles a reading when the reading says one thing and the passage seems to say the opposite. Reread what ' + R.name + ' claimed, then look for the passage that pulls the other way.'); }
      }
    } else return;
  }
}

// ---------------------------------------------------------------- journal
export function renderJournal(g, tab) {
  tab = tab || g.journalTab || 'readings'; g.journalTab = tab;
  document.querySelectorAll('#journal .tab').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.onclick = () => renderJournal(g, b.dataset.tab); });
  const body = $('journalBody'); body.innerHTML = '';
  if (tab === 'passages') {
    if (!g.cards.length) { body.append(el('p', null, 'No passages yet. You will collect them as people tell you what was said last night.')); return; }
    const wrap = el('div', 'cards');
    CARDS.filter((c) => g.cards.includes(c.id)).forEach((c) => wrap.append(g.ui.cardEl(c, false)));
    body.append(wrap);
  } else if (tab === 'readings') {
    const ids = Object.keys(DISPUTES).filter((id) => g.disputeState[id] && g.disputeState[id].started);
    if (!ids.length) { body.append(el('p', null, 'No disputes yet. When people disagree about what a passage means, their readings will be kept here with the books they come from.')); return; }
    for (const id of ids) {
      const D = DISPUTES[id], st = g.disputeState[id];
      body.append(el('h3', null, D.title)); body.append(el('p', null, D.question));
      for (const r of D.readers) {
        if (!st.heard.includes(r.who)) continue;
        const R = READERS[r.who], box = el('div', 'reading');
        box.append(el('div', 'who', R.name + ', ' + R.role));
        const h = el('h4'); if (st.vote === r.who) h.append(el('span', 'pebble')); h.append(document.createTextNode(r.vote.replace(/^[^:]+:\s*/, '').replace(/^./, (m) => m.toUpperCase()))); box.append(h);
        box.append(el('p', null, r.claim.join(' ')));
        if (st.asked.includes(r.who)) box.append(el('p', null, r.why.join(' ')));
        for (const cid of (st.pressed[r.who] || [])) { const hc = el('div', 'hard'); hc.append(el('b', null, 'Hard case: ' + CARD_BY_ID[cid].title + ' (' + CARD_BY_ID[cid].ref + '). ')); hc.append(document.createTextNode(r.troubles[cid].join(' '))); box.append(hc); }
        box.append(el('div', 'src', 'Source: ' + r.src));
        body.append(box);
      }
      if (st.done && st.vote === 'none') body.append(el('p', null, 'You kept your pebble.'));
    }
  } else if (tab === 'people') {
    body.append(el('p', null, 'The six readers below are invented. Each speaks for real books, named here. What they say those books argue was taken from the books themselves.'));
    for (const k in READERS) {
      const R = READERS[k]; if (!g.flags['met_' + k]) continue;
      const row = el('div', 'person'), dot = el('div', 'dot'); dot.style.background = R.color; row.append(dot);
      const t = el('div'); t.append(el('b', null, R.name + ', ' + R.role)); t.append(el('p', null, R.about)); t.append(el('p', null, 'Speaks for: ' + R.speaksFor)); row.append(t); body.append(row);
    }
    for (const p of (g.peopleNotes || [])) { if (!g.flags['met_' + p.id]) continue; const row = el('div', 'person'), dot = el('div', 'dot'); dot.style.background = p.color || '#999'; row.append(dot); const t = el('div'); t.append(el('b', null, p.name)); t.append(el('p', null, p.about)); row.append(t); body.append(row); }
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
  for (const line of (extra || [])) body.append(el('p', null, line));
  const s = g.stats, tried = s.hits + s.misses;
  body.append(el('h3', null, 'How you argued'));
  body.append(el('p', null, 'You asked "why" ' + s.asked + ' times and objected with a passage ' + tried + ' times. ' + s.hits + ' of those objections found a real hard case.' + (tried >= 4 && s.hits / tried >= 0.6 ? ' You were reading the passages against the claims, which is the work.' : tried < 3 ? ' You mostly listened. Next time try to catch each reader out with a passage.' : '')));
  const ten = tensionsFor(g);
  body.append(el('h3', null, 'Where your readings pull against each other'));
  if (ten.length) ten.forEach((t) => body.append(el('p', null, t)));
  else body.append(el('p', null, 'None of the usual strains showed up in your choices. That may mean your reading is consistent, or that you kept your pebble where it mattered.'));
  body.append(el('h3', null, 'What these disagreements are called'));
  body.append(el('p', null, 'The ring raises the question whether justice is good by nature or only by agreement, which the Greeks put as nature against convention. The quarrel about the poets turns on the word mimesis, which can mean copying, acting a part, or losing yourself in a performance. The line and the cave set out levels of knowing, from taking pictures for things up to understanding why things are as they are, and they raise the question whether what is most real can be seen or only thought. The question whether the city is meant is the question of how to read a book that argues by images, and whether an author can mean an extreme proposal as a way of making the reader think.'));
  body.append(el('h3', null, 'To take away'));
  body.append(el('p', null, 'Pick one belief you hold about what is fair. Who handed it to you, and in what form: a story, a saying, a rule? If you had the ring for a month, would you still act on it? Then say which of the six readers would explain your answer best, and which passage that reader would have trouble with.'));
  body.append(el('h3', null, 'Read the books'));
  for (const [a, b] of SOURCES.slice(0, 10)) { const p = el('p'); p.style.fontSize = '15px'; p.append(el('b', null, a.replace(/\.$/, '') + '. ')); p.append(document.createTextNode(b)); body.append(p); }
  const row = el('div', 'row'), b1 = el('button', 'btn', 'Keep walking'), b2 = el('button', 'btn ghost', 'Open the journal');
  b1.onclick = () => { $('debrief').classList.add('hidden'); g.canvas.focus(); };
  b2.onclick = () => { $('debrief').classList.add('hidden'); g.toggle('journal'); };
  row.append(b1, b2); body.append(row);
  const coming = el('p', null, 'This is the first part. The founding of the city, the three waves, the ship, the decline of the regimes, and the choice of lives are still to come.'); coming.style.fontSize = '14px'; body.append(coming);
  $('debrief').classList.remove('hidden'); b1.focus({ preventScroll: true }); body.scrollTop = 0;
}
