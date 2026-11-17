// The stranger's errand, part 3: Thrasymachus wants paying before he will say anything, and the only money in reach
// is his own, in the purse Mika found.
//
// From the texts:
//   Republic 337d (my notes, research/notes-passages.md): Thrasymachus tells Socrates "in addition to learning, you
//       must pay money", and Glaucon says "We will all contribute for Socrates".
//   Republic 338c: his account of justice, that it is what suits the stronger.
//   Republic 459a, tr. Shorey (research/ancient/plato-republic-459a.txt): "Glaucon. I see that you have in your house
//       hunting-dogs and a number of pedigree cocks."
//   Plato, Theaetetus 172d-e, tr. Fowler (research/ancient/plato-theaetetus-172d.txt): men in the law courts "are
//       always in a hurry—for the water flowing through the water-clock urges them on", and the contests "never run
//       an indefinite course".
// Invented: that Thrasymachus wrote a speech for a man called Philokles, the speech itself, his pupils sitting as a
// practice court, how they vote, the fee of thirty drachmas, and that Glaucon saw Bion leave. How a real water clock
// was measured out is not something I have read; the six measures are the game's.
import { clamp } from './util.js';

// The speech Thrasymachus wrote for Philokles, in three points, and what can be said against each.
// Each answer: [measures of water it uses, pebbles it moves toward Bion, the words, what happens].
const POINTS = [
  { say: 'The law is plain. A man who stands surety pays when the debtor does not. Bion gave his word in front of witnesses.',
    replies: [
      [1, 1, '“He never went back on his word. He paid thirty minas the week he was asked.”', 'One of the boys nods.'],
      [3, 2, '“Dexippos owed this money, and he is alive, with a ship. Philokles has not gone after him at all. He went for the man who stayed.”', 'Two of the boys look at Thrasymachus. He does not look back.'],
      [1, -1, '“Philokles is a rich man, and Bion made shields.”', 'These are rich men’s sons. One of them folds his arms.']] },
  { say: 'And he has paid thirty minas. Nobody pays half of a debt he does not owe. By paying, he admitted all of it.',
    replies: [
      [2, 1, '“Paying half shows that he meant to pay. It does not show that he could pay the rest.”', 'A boy at the end of the bench turns his pebble over in his fingers.'],
      [3, 2, '“The thirty minas were not his. He borrowed a girl’s dowry to keep his word to a friend. He has ruined two houses to pay Philokles half.”', 'Nobody on the bench says anything. Two of them are looking at the floor.'],
      [1, 0, '“That is only a trick with words.”', 'Thrasymachus smiles. “Tricks with words are what their fathers pay me for.”']] },
  { say: 'Last, think of yourselves. If a surety can walk away, nobody will lend, and this harbor lives on loans. Find against him, and you protect your own money.',
    replies: [
      [2, 1, '“Philokles took his tools. A shield-maker with no tools will never pay the other thirty. He protected nothing.”', 'One boy laughs, and then stops.'],
      [3, 2, '“Then think of yourselves. After this, who will stand surety for a friend? And who at this harbor gets a loan without one?”', 'It is his own argument, turned round. Two of the boys shift on the bench.'],
      [1, 0, '“That isn’t justice. It is only what pays.”', 'Thrasymachus spreads his hands. “What else did you think it was?”']] },
];
const WATER = 6, NEED = 3, BOYS = 5, WORD = ['None', 'One', 'Two', 'Three', 'Four', 'Five'];

export function setupFee(g, api) {
  if (!g.errand) return;

  // The practice court. Returns the number of pebbles for Bion.
  async function court(gg) {
    let water = WATER, peb = 0;
    const m = (n) => n + (n === 1 ? ' measure' : ' measures');
    const show = () => gg.objective('The practice court. Water left: ' + m(water) + '. Pebbles for Bion so far: ' + peb + ' of ' + BOYS + '.', null);
    await gg.say('', 'Five boys sit on a bench with a pebble each. A jar with a hole in it stands on a stool, and when its water has run out you must stop talking. Thrasymachus stands up and gives the speech he wrote for Philokles.');
    show();
    for (const P of POINTS) {
      await gg.say('thrasymachus', P.say, { mood: 'scorn' });
      const open = P.replies.filter((r) => r[0] <= water);
      if (!open.length) { await gg.say('', 'Your water has run out. This point goes unanswered.'); continue; }
      const c = await gg.choose(open.map((r) => ({ text: r[2], note: 'uses ' + m(r[0]) + ' of water' })), { prompt: 'Your answer. You have ' + m(water) + ' of water left.', name: '' });
      const r = open[c]; water -= r[0]; peb = clamp(peb + r[1], 0, BOYS); show();
      await gg.say('', r[3]);
    }
    await gg.say('', 'The boys get up one at a time and drop their pebbles into the two jars. ' + WORD[peb] + ' of the five ' + (peb < 2 ? 'is' : 'are') + ' for Bion.');
    api.refreshObjective(gg);
    return peb;
  }

  // Returns true when he has agreed to talk.
  g.errand.fee = async (gg) => {
    const f = gg.flags;
    if (f.errand0 == null) { f.fee = 'none'; return true; }     // a saved game from before the errand existed
    if (!f.feeAsked) {
      f.feeAsked = true;
      await gg.lines([
        ['thrasymachus', 'You want my account of last night. And Polemarchus tells me you are asking about a speech I wrote. I am not a public fountain.', 'scorn'],
        ['thrasymachus', 'Thirty drachmas. I was robbed of a hundred this morning, and somebody is going to make it up to me.', 'angry'],
        ['mika', 'I have a hundred of his drachmas in my belt.', 'afraid']]);
    } else await gg.say('thrasymachus', 'Thirty drachmas. Or have you come to lose to my pupils again?', { mood: 'scorn' });
    for (;;) {
      const lost = f.feeLost || 0;
      const opts = lost ? ['“Let me stand up against your speech again.”', 'Pay him thirty drachmas out of his own purse.', 'Walk away for now.'] : ['“I don’t have thirty drachmas.”', 'Pay him thirty drachmas out of his own purse.'];
      const c = await gg.choose(opts, { prompt: 'Thrasymachus holds out his hand.', name: '' });
      if (c === 2) return false;
      if (c === 1) {
        await gg.say('', 'Mika counts thirty of his own drachmas into your hand behind your back. Thrasymachus takes them and does not look at them.');
        await gg.say('mika', 'Now it isn’t all there to give back.', { mood: 'sad' });
        f.fee = 'purse'; f.purseSpent = 30;
        f.feeText = 'Thrasymachus wanted thirty drachmas before he would talk. You paid him out of his own purse, the one Mika found. He did not look at the coins. The purse now holds seventy.';
        api.note(gg, 'Thrasymachus’s fee'); return true;
      }
      if (!lost) await gg.lines([
        ['thrasymachus', 'Then work for it. Five of my pupils are sitting over there with nobody to practice on.', 'scorn'],
        ['thrasymachus', 'I wrote the speech that won Philokles his case. Stand up against it for your shield-maker. If they vote for you, we are quits.']]);
      const peb = await court(gg);
      if (peb >= NEED) {
        await gg.lines([
          ['thrasymachus', 'They vote for the stranger. I shall have a word with them when you have gone.', 'angry'],
          ['thrasymachus', 'A wager is a wager. Ask.']]);
        f.fee = 'won';
        f.feeText = 'Thrasymachus wanted thirty drachmas before he would talk. You had no money, so you stood up against the speech he wrote for Philokles, in front of five of his pupils, with a water clock running. ' + WORD[peb] + ' of the five voted for Bion, and he let you off the fee. Mika’s purse was not touched.';
        api.note(gg, 'Thrasymachus’s fee'); return true;
      }
      f.feeLost = lost + 1;
      await gg.say('thrasymachus', (peb === 0 ? 'All five' : WORD[BOYS - peb]) + ' for me. They know who feeds them. Thirty drachmas.', { mood: 'happy' });
    }
  };

  // The third lead: what was said in court, and who saw Bion go.
  g.errand.courtLead = async (gg) => {
    const f = gg.flags; if (f.errand0 == null) return;
    await gg.lines([
      ['thrasymachus', 'Now, your shield-maker. He spoke for himself in court. He said he had done what a friend does.', 'scorn'],
      ['thrasymachus', 'The court heard that, and gave Philokles his tools and his slaves. Philokles could pay for a speech, and Bion could not. That is all I was telling Socrates last night.'],
      ['thrasymachus', 'He did not wait for the costs to be collected. He went out by the north gate one night with a sack on his back.'],
      ['thrasymachus', 'Glaucon was coming in late with those dogs of his, and saw him go. Ask Glaucon which road he took.']]);
    f.lead3 = true; api.note(gg, 'Bion: what happened in court');
  };
}
