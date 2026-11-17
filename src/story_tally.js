// The stranger's errand, part 2: the month's accounts at the shield workshop, which earn Polemarchus's part of last
// night and the page he keeps on Bion.
//
// Polemarchus's rule is that doing right means giving each what he is owed: help to friends and harm to enemies
// (Republic 331e-332d). Socrates's objections are that you can be wrong about who your friend is (334c-335a) and
// that harming a man makes him worse (335b-e). The task puts both in front of the player before Polemarchus tells
// his part: four men are owed money, one is a friend who asks for more than the tablet says, and one is from a rival
// workshop whom Polemarchus wants to keep waiting. What the player does is recorded, and Polemarchus comes back to it.
//
// From the ancient texts (all saved in research/ancient/, notes in research/notes-debt.md):
//   Aristophanes, Wasps (the passage from line 650): "reckon ... not with pebbles, but on your fingers". So
//       Athenians reckoned with pebbles.
//   Herodotus 2.36.4: "The Greeks write and calculate from left to right".
//   Demosthenes 27.9: a workshop of twenty slaves "given to my father as security for a debt of forty minae", and
//       money "loaned at the rate of a drachma a month".
//   Plato, Apology 38b: Socrates's friends tell him to propose a fine of thirty minas, "saying that they are
//       sureties for it".
// Invented: the four men and what they are owed, every price, Hermon, Dexippos, Philokles, and Bion's page. The
// board is simplified to columns of hundreds, tens and ones; the texts say only that pebbles were used.

const PEB = 9;   // most pebbles in a column

// The counting board. Resolves with { amount } when the player pays, or { sent: true } when he sends the man away.
function board(g, page) {
  if (g.ui.auto) { const r = g.ui.auto('tally', page); return Promise.resolve(r && typeof r === 'object' ? r : { amount: page.owed }); }
  return new Promise((res) => {
    const n = [0, 0, 0], names = ['hundreds', 'tens', 'ones'];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(10,8,6,.62);font-family:Palatino Linotype,Georgia,serif';
    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-wrap:wrap;gap:18px;max-width:min(94vw,860px);background:#efe6d2;border-radius:10px;box-shadow:0 12px 44px rgba(0,0,0,.6);padding:20px 22px;color:#2a2118';
    // the wax tablet with this man's lines
    const tab = document.createElement('div');
    tab.style.cssText = 'flex:1 1 300px;background:#3a2c20;border:8px solid #6b4a32;border-radius:6px;padding:14px 16px;color:#eadfc4;font-size:17px;line-height:1.5';
    tab.innerHTML = '<div style="font:600 12px/1.4 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#d8c69c;margin-bottom:6px"></div>';
    tab.firstChild.textContent = page.who;
    for (const l of page.lines) { const d = document.createElement('div'); d.textContent = l; d.style.margin = '0 0 6px'; tab.append(d); }
    if (page.ask) { const d = document.createElement('div'); d.textContent = page.ask; d.style.cssText = 'margin-top:10px;font-style:italic;color:#ffd9a0'; tab.append(d); }
    // the board
    const side = document.createElement('div'); side.style.cssText = 'flex:1 1 330px;display:flex;flex-direction:column;gap:10px';
    const cols = document.createElement('div'); cols.style.cssText = 'display:flex;gap:10px';
    const total = document.createElement('div'); total.style.cssText = 'font-size:18px;text-align:center';
    const stacks = [];
    const draw = () => {
      stacks.forEach((s, i) => { s.innerHTML = ''; for (let k = 0; k < n[i]; k++) { const p = document.createElement('span'); p.style.cssText = 'display:inline-block;width:17px;height:17px;border-radius:50%;background:#3b3835;margin:2px;box-shadow:inset -2px -2px 3px rgba(255,255,255,.18)'; s.append(p); } });
      total.textContent = 'On the board: ' + (n[0] * 100 + n[1] * 10 + n[2]) + ' drachmas';
    };
    const change = (i, d) => { const v = n[i] + d; if (v < 0 || v > PEB) return; n[i] = v; g.audio.blip('pebble'); draw(); };
    names.forEach((nm, i) => {
      const col = document.createElement('div'); col.style.cssText = 'flex:1;background:#d9c9a8;border:1px solid #b8a37c;border-radius:6px;padding:8px 6px;text-align:center;cursor:pointer;user-select:none';
      const lab = document.createElement('div'); lab.textContent = nm; lab.style.cssText = 'font:600 12px/1.4 system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:#6b5a3e';
      const st = document.createElement('div'); st.style.cssText = 'min-height:70px;padding:6px 0'; stacks.push(st);
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;justify-content:center';
      const mk = (txt, d, label) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.style.cssText = 'font:600 18px/1 system-ui,sans-serif;width:42px;height:34px;border-radius:6px;border:1px solid #8a7550;background:#f6efdf;cursor:pointer'; b.onclick = (e) => { e.stopPropagation(); change(i, d); }; return b; };
      row.append(mk('−', -1, 'Take a pebble from the ' + nm), mk('+', 1, 'Add a pebble to the ' + nm));
      col.onclick = () => change(i, 1);
      col.append(lab, st, row); cols.append(col);
    });
    const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap';
    const big = (txt) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.style.cssText = 'font:600 16px/1 system-ui,sans-serif;padding:11px 18px;border-radius:7px;border:1px solid #6b4a32;background:#6b4a32;color:#fff6e0;cursor:pointer'; return b; };
    const done = (r) => { window.removeEventListener('keydown', onKey, true); wrap.remove(); res(r); };
    const pay = big('Pay him this'); pay.onclick = () => done({ amount: n[0] * 100 + n[1] * 10 + n[2] }); btns.append(pay);
    if (page.canSend) { const s = big('Send him away'); s.style.background = '#8a3b2e'; s.onclick = () => done({ sent: true }); btns.append(s); }
    const tip = document.createElement('div'); tip.style.cssText = 'font:13px/1.45 system-ui,sans-serif;color:#5a4a34;text-align:center';
    tip.textContent = 'Click a column to add a pebble, or use + and −. Keys: 1, 2, 3 add a pebble; Shift with 1, 2, 3 takes one away; Enter pays.';
    side.append(cols, total, btns, tip);
    panel.append(tab, side); wrap.append(panel); document.body.append(wrap);
    function onKey(e) {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) { e.preventDefault(); e.stopPropagation(); change(i, e.shiftKey ? -1 : 1); }
      else if (e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); done({ amount: n[0] * 100 + n[1] * 10 + n[2] }); }
    }
    window.addEventListener('keydown', onKey, true);
    draw(); pay.focus();
  });
}

export function setupTally(g, api) {
  const W = g.sites.workshop; if (!W || !g.errand) return;
  const at = (a, b) => { const [x, z] = W.at(a, b); return { x, z }; };
  const SEAT = at(-0.6, -0.95), TABLE = at(-0.6, -0.05), DOOR = at(0, 4.6);
  g.kit.spawn('table_low', TABLE.x, TABLE.z, 0, { y: W.floor, noCollide: true });
  g.kit.spawn('stool', SEAT.x, SEAT.z, 0, { y: W.floor, noCollide: true });
  g.errand.shopDoor = { x: DOOR.x, z: DOOR.z, label: 'Shield workshop' };
  // Once his father has told his part, Polemarchus is at the workshop with the tablets.
  g.errand.placePol = () => { if (g.flags.ceph) g.npc('polemarchus').put(SEAT.x, SEAT.z, Math.atan2(TABLE.x - SEAT.x, TABLE.z - SEAT.z), 'sit'); };

  g.errand.tally = async (gg) => {
    let slips = 0;
    const ask = async (page, ok) => { for (;;) { const r = await board(gg, page), v = ok(r); if (v === true) return r; slips++; await gg.say(v[0], v[1], { mood: v[2] || 'think' }); } };
    const plain = (owed) => (r) => (r.amount === owed ? true : r.amount < owed ? ['', 'He counts it and shakes his head. It is short.'] : ['polemarchus', 'That is more than we owe him. It is my father’s silver you are counting. Again.']);
    await gg.lines([
      ['polemarchus', 'So you stood at my father’s altar. Then you are owed a hearing from me as well.', 'happy'],
      ['polemarchus', 'But it is the end of the month, and four men are waiting at that door to be paid. The slave who works my counting board is drunk.'],
      ['polemarchus', 'You read the tablet and set out the pebbles. Hundreds, tens, ones. I pay what the board says. Then you can have my part of last night, and Bion’s page.']]);
    await ask({ who: 'The charcoal-seller', lines: ['Charcoal for the forge: 6 baskets at 4 drachmas', 'Paid him at the new moon: 10 drachmas'], owed: 14 }, plain(14));
    await ask({ who: 'The bronze merchant', lines: ['Bronze sheet: 2 loads at 85 drachmas', 'Paid him on delivery: 60 drachmas'], owed: 110 }, plain(110));
    // the friend who asks for more than he is owed
    await gg.say('', 'The third man is Hermon, who sells ox-hide. He says the price of hides has gone up, and he asks for ninety.');
    await gg.say('polemarchus', 'Give Hermon what he asks. He is a friend of this house.');
    const h = await ask({ who: 'Hermon, who sells ox-hide', lines: ['Ox-hides to line the shields: 5 at 12 drachmas', 'Paid him: nothing yet'], ask: 'He asks for 90 drachmas. Polemarchus says to give it to him.', owed: 60 },
      (r) => (r.amount === 60 || r.amount === 90 ? true : ['', 'That is neither what the tablet says nor what he asks.']));
    gg.flags.tallyFriend = h.amount === 90 ? 'asked' : 'tally';
    if (h.amount === 90) await gg.say('polemarchus', 'Good.');
    else { await gg.say('polemarchus', 'Sixty? I said give him what he asks.', { mood: 'angry' }); await gg.say('polemarchus', 'No. Leave it. Sixty is what the tablet says.', { mood: 'think' }); }
    // the man from the rival workshop
    await gg.say('', 'The last man is from the other shield workshop, across the harbor.');
    await gg.say('polemarchus', 'He can wait another month. They are no friends of ours.', { mood: 'scorn' });
    const e = await ask({ who: 'A man from the other shield workshop', lines: ['Rivets borrowed from them in the spring, to be paid for in coin: 40 drachmas', 'Paid: nothing yet'], ask: 'Polemarchus wants him sent away unpaid.', owed: 40, canSend: true },
      (r) => (r.sent || r.amount === 40 ? true : ['', 'That is not what the tablet says he is owed.']));
    gg.flags.tallyEnemy = e.sent ? 'sent' : 'paid';
    if (e.sent) await gg.say('polemarchus', 'Good. Let them wait for it.');
    else { await gg.say('polemarchus', 'I told you to let him wait.', { mood: 'angry' }); await gg.say('polemarchus', 'Well. It was owed.', { mood: 'think' }); }
    gg.flags.tally = true; gg.flags.tallySlips = slips; api.note(gg, 'The month’s accounts');
    await gg.say('polemarchus', slips ? 'You count like a poet. But it is done.' : 'You count better than my slave does sober.', { mood: 'laugh' });
  };

  // What Polemarchus says about the two men once he has told how Socrates caught him out (called from story.js).
  g.errand.tallyAfter = async (gg) => {
    const f = gg.flags;
    if (f.tallyFriend) await gg.say('polemarchus', f.tallyFriend === 'asked' ? 'That was Hermon, this morning. I told you to pay a friend whatever he asked, and the tablet said sixty. I had heard all of this from Socrates the night before, and I still did it.' : 'That was Hermon, this morning. I told you to pay a friend whatever he asked, and you paid him what the tablet said. Socrates would have done the same.', { mood: 'think' });
    if (f.tallyEnemy) await gg.say('polemarchus', f.tallyEnemy === 'sent' ? 'And we sent the other workshop’s man away without his forty drachmas, because I don’t like them. So you can see how much I learned in one night.' : 'And you paid the other workshop’s man when I wanted him kept waiting. I can’t say you were wrong.', { mood: 'laugh' });
  };

  // The second lead: Bion's page.
  g.errand.bionPage = async (gg) => {
    if (gg.flags.errand0 == null) return;
    await gg.say('', 'Polemarchus turns the tablets over until he finds a page with one name at the top.');
    await gg.lines([
      ['polemarchus', 'Bion. He had the bench by the east wall. He stood surety for a friend called Dexippos, who owed sixty minas to a man named Philokles.', 'think'],
      ['polemarchus', 'Dexippos took a ship and did not come back. So Philokles came to Bion for all of it.'],
      ['polemarchus', 'Bion paid thirty minas down, here in this room. I wondered at the time where a shield-maker found thirty minas.'],
      ['polemarchus', 'For the rest, Philokles took him to court and was given his tools and his two slaves. After that there was no bench to rent.', 'sad'],
      ['polemarchus', 'By my old rule Bion did right. He helped his friend.', 'think'],
      ['polemarchus', 'Philokles did not write his own speech for the court. Our guest in the yellow cloak wrote it. Ask Thrasymachus what was said. He teaches at the stoa, the long porch on the west side of the market square. He will want paying first.']]);
    gg.flags.lead2 = true; api.note(gg, 'Bion: where the money went');
  };
}
