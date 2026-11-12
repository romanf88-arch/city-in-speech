// The last chapter of this part, at the place where the new city is staked out: what the city in words was,
// whether Socrates meant it to be built, the same question asked about the game, and what Mika does with the purse.
import { runDispute, showDebrief } from './dispute.js';
import { HOMES } from './story.js';

export function setupEnd(g, api) {
  const S = g.sites;
  g.npc('archedemos').talk = async (gg) => {
    api.meet(gg, 'archedemos');
    const f = gg.flags, atSite = Math.hypot(gg.player.x - S.citySite.x, gg.player.z - S.citySite.z) < 60;
    if (!f.said_archedemos) { f.said_archedemos = true; await gg.say('archedemos', 'Archedemos. I measure out ground for builders.', { mood: 'happy' }); }
    if (f.city) { await gg.say('archedemos', 'The builders start tomorrow: first the small village, then the bigger city, then the soldiers. Come back for it.'); return; }
    if (!f.book1) { await gg.say('archedemos', 'Go and hear how last night began, at the house of Cephalus. We can talk after that.'); return; }
    if (!(f.ring && f.poetry && f.cave)) { await gg.say('archedemos', 'They talked about founding a city last night, and I want to see where it would go. Hear about the ring, the poets, and the cave first. Then find me at the stakes, east of the road north of the gate.'); return; }
    if (!atSite) { await gg.say('archedemos', 'Meet me at the stakes, east of the road north of the gate. It’s easier to explain there.'); return; }
    gg.ui.area('The city in words', 'Was it ever meant to be built?');
    await gg.lines([
      ['archedemos', 'These stakes mark where the first houses would go, if anyone ever built the city they described last night. I’ve been laying it out so I can see it better.', 'happy'],
      ['archedemos', 'Let me walk you through it. They started small: a village where a farmer, a builder, a weaver, and a shoemaker each do the one job they’re good at, and swap what they make.'],
      ['archedemos', 'Glaucon said that was a city fit for pigs. He wanted couches and fine food. So the city grew. A bigger city needs more land, that means war, and war means soldiers.', 'laugh'],
      ['archedemos', 'They ended up with three groups. Most people farm, make things, and trade. A smaller group are the soldiers who guard the city. And out of the best soldiers, a few are chosen to rule.'],
      ['archedemos', 'The soldiers and the rulers own nothing. No house, no gold. They live together and eat together, and the city feeds them.'],
      ['mika', 'Where would I be?', 'think'],
      ['archedemos', 'With the traders. You sell things.', 'happy'],
      ['archedemos', 'To hold it all together, Socrates suggested telling everyone a story about where they came from. He was embarrassed to say it out loud.'],
      ['archedemos', 'The story goes like this. You were all made inside the earth, so you are all brothers and sisters. But the god mixed gold into some of you, silver into others, and iron or bronze into the rest.'],
      ['archedemos', 'Gold rules, silver guards, and iron and bronze farm and make things. Glaucon said: no wonder you were embarrassed.', 'laugh']]);
    api.giveCards(gg, ['noble']);
    await gg.lines([
      ['mika', 'Bronze, then. And if I had a child who turned out to be gold?', 'think'],
      ['archedemos', 'Then the child moves up. He did say that. And a ruler’s child who turns out bronze moves down.'],
      ['archedemos', 'Then came three ideas that he knew people would laugh at. He called them waves, the kind that knock you off your feet.'],
      ['archedemos', 'One: women guard and rule alongside the men. Two: the soldiers have no families of their own, and their children are raised by everyone together.'],
      ['archedemos', 'Three, the biggest: the city will never work unless philosophers are its kings.', 'think'],
      ['mika', 'What is a philosopher, exactly?', 'think'],
      ['archedemos', 'Someone who wants to understand what is true more than he wants money or fame. Socrates meant the people who get out of the cave.']]);
    api.giveCards(gg, ['kings']);
    await gg.lines([
      ['archedemos', 'Glaucon asked whether a city like this could ever exist. Socrates gave three answers at different times last night, and that is what everyone is arguing about.'],
      ['archedemos', 'First he said: we wanted a model. A painter who paints the most beautiful person he can imagine is no worse a painter if nobody like that exists.'],
      ['archedemos', 'But he also said it could happen. When Glaucon asked how to begin, he said: send everyone over ten years old out to the countryside, and bring the children up fresh.', 'think'],
      ['archedemos', 'And at the very end, Glaucon said the city exists only in words. Socrates answered that perhaps there is a model of it in the sky, for anyone who wants to look, and to build himself to match.'],
      ['archedemos', 'Whether it exists anywhere, he said, makes no difference.']]);
    api.giveCards(gg, ['model', 'ten', 'heaven', 'ship']);
    await gg.say('mika', 'I can’t tell whether I would be safer there, or stuck there.', { mood: 'sad' });
    await api.gather(gg, ['dromon', 'sannion', 'kleio', 'archedemos', 'phanias', 'theano']);
    await runDispute(gg, 'city');
    f.city = true; api.note(gg, 'Was the city meant?');
    // The same question, asked about the game.
    await gg.say('phanias', 'One more question, and it’s about us. You have spent the day inside something that somebody made. It kept pushing you to pick a side, the way Socrates pushed Glaucon. Was it showing you the book, or working on you?', { mood: 'think' });
    f.gameView = await gg.choose(['Showing me the book.', 'Working on me.', 'Both.']);
    await gg.lines([
      ['sannion', 'I’ll tell you what I am. I’m a made-up person who speaks for two real books. So are the others, each for their own. Don’t take our word for anything. Check us against the books.', 'happy'],
      ['kleio', 'And check the passages against Plato. A page can’t answer back. Neither can we, really.', 'think']]);
    gg.audio.phrase([196, 262, 294, 349, 392, 523]);
    for (const id of ['kleio', 'sannion', 'theano', 'dromon', 'phanias']) api.relocate(gg, id, ...HOMES[id]);
    await purse(gg);
    api.refreshObjective(gg);
    showDebrief(gg, mirror(gg));
  };

  // Mika decides what to do with the purse. Nothing here says which choice is right.
  async function purse(gg) {
    const f = gg.flags, hasMika = !!f.mikaWith;
    if (!hasMika) return;
    gg.env('night', 12);
    await gg.say('', 'The others drift away. Mika stays where she is, with her hand over the purse at her belt.');
    await gg.lines([
      ['mika', 'It’s nearly dark, and he leaves town tomorrow. I have to decide.', 'sad'],
      ['mika', 'I’ve listened all day. Not one of them said I should give it back because I’d be caught. Nobody is going to catch me. That was never the question.', 'think'],
      ['mika', 'What would you do?', 'plead']]);
    const c = await gg.choose([
      'Give it back. Doing right is worth it even if nobody ever knows.',
      'Give it back. People agree not to cheat each other, and that only works if we keep to it when nobody is looking.',
      'Keep it. He would tell you himself that only a fool gives it back.',
      'It’s yours to decide. I won’t choose for you.'], { prompt: 'What do you tell Mika?', name: 'Mika' });
    f.purseAdvice = c;
    let end = c === 2 ? 'kept' : 'returned';
    if (c === 0) await gg.say('mika', 'That’s what Glaucon wanted Socrates to prove. I don’t know whether he proved it. But I know which of those two men I would rather be.', { mood: 'think' });
    else if (c === 1) await gg.say('mika', 'The helmsman’s deal. I never agreed to anything out loud. But I would want the next person to hand mine back.', { mood: 'think' });
    else if (c === 2) await gg.say('mika', 'He would say that. He’s the one person in this town who couldn’t complain if I kept it.', { mood: 'think' });
    else {
      const v = (gg.disputeState.ring || {}).vote;
      if (v === 'kleio') await gg.say('mika', 'Then I’ll treat it as a test, the way Kleio said. If I can’t give it back when nobody would ever know, then I only ever did right for show.', { mood: 'think' });
      else if (v === 'dromon') await gg.say('mika', 'Then I’ll go with the helmsman. A deal that people keep only while they’re being watched isn’t worth much. I would want mine back.', { mood: 'think' });
      else if (v === 'sannion') await gg.say('mika', 'Sannion said the story shows what Glaucon really wants. I’ve been asking myself what I want all day. I don’t want to be someone who has to hope nobody looks.', { mood: 'think' });
      else { end = 'undecided'; await gg.say('mika', 'Then I’m not deciding tonight. I’ll sleep on it, purse and all.', { mood: 'think' }); }
    }
    if (end === 'returned') {
      await gg.ui.fade(1, 0.9);
      await gg.say('', 'She runs off down the road toward the harbor. It is fully dark by the time she comes back, out of breath.');
      await gg.ui.fade(0, 0.9);
      await gg.lines([
        ['mika', 'I gave it to him. He counted it. Twice.', 'happy'],
        ['mika', 'Then he asked what I wanted for bringing it back. I said nothing. And he went red, the way they said he did last night.', 'laugh'],
        ['mika', 'He told me I was a fool. But he said it quietly.', 'happy'],
        ['mika', 'I still can’t say exactly why it was right. I’ll keep working on that part.', 'think']]);
      f.purseText = 'Mika took the purse back to Thrasymachus. He counted it twice, went red, and called her a fool, quietly. She says she still cannot explain exactly why it was right.';
    } else if (end === 'kept') {
      await gg.lines([
        ['mika', 'All right. I’m keeping it.', 'sad'],
        ['mika', 'My mother can see a doctor now. That’s a good thing, isn’t it? So why does it feel as if I’ve swallowed a stone?', 'sad'],
        ['mika', 'Ask me in a year whether I chose right.', 'think']]);
      f.purseText = 'Mika kept the purse. She says her mother can see a doctor now, and that it feels as if she has swallowed a stone.';
    } else {
      await gg.say('mika', 'Socrates said he still didn’t know what doing right is, after a whole night of talking. I’ve only had a day.', { mood: 'happy' });
      f.purseText = 'Mika has not decided. She is keeping the purse until tomorrow.';
    }
    f.purseEnd = end; api.note(gg, 'What Mika did');
    await gg.say('mika', 'Thank you for walking with me. Find me at the harbor next festival, and I’ll save you a garland.', { mood: 'happy', play: 'wave' });
    await gg.say('', 'That is the end of the first part.');
  }

  // Sentences that tell the player what they did, for the closing summary.
  function mirror(gg) {
    const f = gg.flags, l = f.ringLog || {}, out = [];
    out.push('With the ring you ' + (l.king ? 'killed the king and took the kingdom, as the shepherd does in the story' : l.gold && l.prisoner ? 'took the king’s gold and let a prisoner go' : l.gold ? 'took gold from the king’s chest and stopped there' : l.prisoner ? 'let a prisoner out of the king’s cage and took nothing' : l.returned ? 'did nothing, and put it back on the dead man’s finger' : 'did nothing, and kept it') + '.' + (l.said === 2 ? ' You also pointed out that a story told to a listener cannot test what the listener would do unseen.' : ''));
    if (f.livesPick != null) out.push(['You said the good man who is taken for a criminal still has the better life.', 'You said the rotten man who is taken for a good one has the better life.', 'You could not say which of Glaucon’s two men has the better life.'][f.livesPick]);
    if (f.tablet != null) out.push('You crossed out or kept ' + f.tablet + ' of the four passages of Homer the same way Socrates did.');
    if (f.wentBack != null) out.push(f.wentBack ? 'Having seen the sun, you went back down into the cave' + (f.triedToFree ? ' and tried to free the prisoner beside you.' : ' and sat among the prisoners without speaking.') : f.refused ? 'Having seen the sun, you refused to go back down, even when you were told it was a fair thing to ask.' : 'Having seen the sun, you would not go back down until you were told it was a fair thing to ask.');
    if (f.gameView != null) out.push(['You took the game to be showing you the book.', 'You took the game to be working on you.', 'You took the game to be both showing you the book and working on you.'][f.gameView]);
    if (f.purseEnd) out.push((f.purse0 != null ? 'This morning you told Mika ' + ['to give the purse back', 'to keep the purse', 'that you did not know what she should do'][f.purse0] + '. Tonight you ' : 'You ') + ['told her to give it back because doing right is worth it unseen', 'told her to give it back because the agreement not to cheat depends on it', 'told her to keep it', 'left the choice to her'][f.purseAdvice] + '. ' + (f.purseEnd === 'returned' ? 'She gave it back.' : f.purseEnd === 'kept' ? 'She kept it.' : 'She has not decided.'));
    return out;
  }
  g.mirror = () => mirror(g);
}
