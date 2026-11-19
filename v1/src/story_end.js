// The last question of this part, asked where the new city is staked out: is the city meant?
import { runDispute, showDebrief } from './dispute.js';
import { HOMES } from './story.js';

export function setupEnd(g, api) {
  const S = g.sites;
  g.npc('archedemos').talk = async (gg) => {
    api.meet(gg, 'archedemos');
    const f = gg.flags, atSite = Math.hypot(gg.player.x - S.citySite.x, gg.player.z - S.citySite.z) < 60;
    if (f.city) { await gg.say('archedemos', 'The founders begin tomorrow: the first small city, then the swollen one, then the guardians. Come back for it.'); return; }
    if (!f.book1) { await gg.say('archedemos', 'Archedemos. I lay out ground for builders. Go and hear how last night began, and we will talk after.'); return; }
    if (!(f.ring && f.poetry && f.cave)) { await gg.say('archedemos', 'I measure ground. They talked of founding a city last night, and I mean to see where it would go. Hear the ring, the poets, and the cave first. Then find me at the stakes east of the north road.'); return; }
    if (!atSite) { await gg.say('archedemos', 'Meet me at the stakes, east of the north road. It is better asked there.'); return; }
    await gg.say('archedemos', 'These stakes are where the founders say the first houses would go. You have heard the ring, the poets, and the cave. All day you have been circling one question, so here it is with the ground under it.');
    await gg.say('archedemos', 'Last night Socrates hesitated, and then proposed one useful lie for the whole city: that all its people were formed inside the earth and are brothers, and that the god mixed gold, silver, or iron into each.');
    gg.giveCard('noble');
    await gg.say('archedemos', 'When Glaucon pressed him on whether such a city could exist, he said they had wanted a model, the way a painter paints the most beautiful man without proving one lives. Then he said it could come about on one condition: philosophers must be kings.');
    api.giveCards(gg, ['model', 'kings']);
    await gg.say('archedemos', 'Asked how to begin, he said: send everyone over ten out into the country and raise the children fresh. And at the very end he said it makes no difference whether the city exists anywhere. A man can still found himself on it.');
    api.giveCards(gg, ['ten', 'heaven', 'ship']);
    await api.gather(gg, ['dromon', 'sannion', 'kleio', 'archedemos', 'phanias', 'theano']);
    await runDispute(gg, 'city');
    // The same question, turned on the game.
    await gg.say('phanias', 'One more question, and it is about us. You have spent the day inside a made thing. It pushed you to choose, the way Socrates pushed Glaucon. Was it showing you the book, or working on you?');
    f.gameView = await gg.choose(['Showing me the book.', 'Working on me.', 'Both.']);
    await gg.say('sannion', 'I will say what I am. I am an invented man who speaks for two real books. So are the rest of us, each for his own. Check us against them.');
    await gg.say('kleio', 'And check the passages against Plato. A page cannot answer back. Neither, really, can we.');
    await gg.say('', 'That is the end of the first part. The festival goes on tonight.');
    f.city = true; gg.audio.phrase([196, 262, 294, 349, 392, 523]);
    for (const id of ['kleio', 'sannion', 'theano', 'dromon', 'phanias']) api.relocate(gg, id, ...HOMES[id]);
    api.refreshObjective(gg);
    showDebrief(gg, mirror(gg));
  };

  // Sentences that tell the player what they did, for the closing summary.
  function mirror(gg) {
    const f = gg.flags, l = f.ringLog || {}, out = [];
    out.push('With the ring you ' + (l.king ? 'killed the king and took the kingdom, as the shepherd does in the story' : l.gold && l.prisoner ? 'took the king’s gold and let a prisoner go' : l.gold ? 'took gold from the king’s chest and stopped there' : l.prisoner ? 'let a prisoner out of the king’s cage and took nothing' : l.returned ? 'did nothing, and put it back on the dead man’s finger' : 'did nothing, and kept it') + '.' + (l.said === 2 ? ' You also pointed out that a story told to a listener cannot test what the listener would do unseen.' : ''));
    if (f.tablet != null) out.push('You struck or kept ' + f.tablet + ' of the four passages of Homer the way Socrates did.');
    if (f.wentBack != null) out.push(f.wentBack ? 'Having seen the sun, you went back down into the cave' + (f.triedToFree ? ' and tried to free the prisoner beside you.' : ' and sat among the prisoners in silence.') : f.refused ? 'Having seen the sun, you refused to go back down, even when told it was a just order.' : 'Having seen the sun, you would not go back down until you were told it was a just order.');
    if (f.gameView != null) out.push(['You took the game to be showing you the book.', 'You took the game to be working on you.', 'You took the game to be both showing you the book and working on you.'][f.gameView]);
    return out;
  }
  g.mirror = () => mirror(g);
}
