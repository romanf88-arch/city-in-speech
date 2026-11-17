// Thrasymachus's place: in front of the stoa on the west side of the market square, where he teaches rich men's sons
// to argue. Roman, 2026-11-16: the tellers "should be scattered and found". Until now he sat in Cephalus's courtyard
// all day, and his five pupils and his water jar were only described.
//
// From the texts: he expects to be paid (Republic 337d); a speaker in court talks against the water clock
// (Theaetetus 172d-e). Invented: that he teaches at this stoa, the five pupils and what they say, and that Clitophon
// and Glaucon come here with him after the morning at Cephalus's house.
const PI = Math.PI;
const AT = { x: -28.4, z: -4 };      // his stool, in front of the middle of the stoa, facing the square

export function setupStoa(g, api, crowdLook) {
  if (!g.errand) return;
  const P = (id, x, z, r = 0, o) => g.kit.spawn(id, x, z, r, o), gy = (x, z) => g.world.groundY(x, z);
  // his stool, two benches for the pupils, and the jar with a hole in it that times a speech
  P('stool', AT.x, AT.z, 0, { noCollide: true });
  P('bench', -24.9, -6.0, PI / 2); P('bench', -24.9, -2.0, PI / 2);
  P('stool', -28.7, -1.5, 0); P('amphora', -28.7, -1.5, 0, { y: gy(-28.7, -1.5) + 0.45, noCollide: true });
  const say = ['We’re waiting for somebody to practice on. Is it you?', 'My father pays for this. I would sooner be watching the horses.', 'He never lets us finish a sentence.', 'Don’t look at me. I lost yesterday.', 'He is in a worse temper than usual. He has lost a purse.'];
  [[-6.7, 3], [-6.0, 6], [-5.3, 9], [-2.5, 12], [-1.5, 14]].forEach(([z, k], i) => {
    const id = 'tboy' + (i + 1);
    g.addNPC({ id, name: 'A pupil', look: Object.assign(crowdLook(k), { height: 0.8, beard: 'none', hat: 'none', hairStyle: 'full', length: 'short' }), x: -24.9, z, h: -PI / 2, pose: 'sit' });
    g.npc(id).talk = async (gg) => { await gg.say(id, say[i]); };
  });

  g.errand.stoaSpot = { x: AT.x + 2.4, z: AT.z, label: 'Thrasymachus' };
  // After Cephalus has told his part, Thrasymachus goes to his pupils. Clitophon goes with him, and Glaucon comes to
  // hear whether he does better today. Glaucon leaves for the north gate once Thrasymachus has told his part.
  g.errand.placeThras = () => {
    const f = g.flags; if (!f.ceph) return;
    g.npc('thrasymachus').put(AT.x, AT.z, PI / 2, 'sit');
    g.npc('clitophon').put(AT.x - 0.5, AT.z - 2.7, 1.0, 'stand');
    if (!f.book1) g.npc('glaucon').put(-22.3, -4.1, -PI / 2, 'stand');
  };
}
