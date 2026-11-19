// The stranger's own errand, part 1: serving at Cephalus's altar before anyone in his house will answer a question.
//
// Roman, 2026-11-16: the tellers "should be scattered and found. you should be forced to do something for them
// before they reveal more of the story, after all, you are a stranger", by "some sort of relevant puzzle or game or
// something connected to the city or history". And the stranger needs a reason to be here: he has come to find a
// man who owes a debt (see the opening in story.js, and research/notes-debt.md).
//
// What comes from the ancient texts:
//   Republic 328c    Cephalus sits with a wreath on, having just sacrificed in the courtyard.
//   Republic 331b    what his money is good for: "not owing a sacrifice to some god or money to a person".
//   Republic 331d    he leaves the talk because it is time for the sacrifices.
//   Aristophanes, Peace 956-973 and 1017-1022 (tr. O'Neill; saved in research/ancient/aristophanes-peace-937.txt)
//                    the steps the servant is told to do: take the basket and the lustral water and circle the
//                    altar; the fire-brand is plunged in the water; sprinkle the altar; give barley; purify
//                    yourself; scatter the rest of the barley among those present; "Who is here?"; the people are
//                    sprinkled; the prayer; the sheep is killed inside the house.
// Invented: that a stranger stood in for the altar boy, the words of Cephalus's prayer (they turn 331b into a
// prayer), and where the things stand in the courtyard. Aristophanes says the altar is circled "to the right". I have
// not checked which way round that means, so the game accepts either way.
import * as THREE from 'three';

const PI = Math.PI;
export const served = (f) => !!(f.altar || f.ceph);   // old saved games had no altar task

export function setupErrand(g, api) {
  const S = g.sites, C = { x: S.cephalus.x, z: S.cephalus.z }, w = g.world;
  const ALTAR = { x: C.x + 0.5, z: C.z }, TABLE = { x: C.x + 3.2, z: C.z - 1.8 }, JAR = { x: C.x + 4.1, z: C.z - 1.8 };
  const PRIEST = { x: C.x + 0.5, z: C.z - 2.3 }, WASH = { x: C.x + 2.2, z: C.z + 0.2 }, CROWD = { x: C.x - 2.9, z: C.z + 0.3 };
  const seatC = [C.x - 3.7, C.z];
  const yOf = (p) => w.standY(p.x, p.z);

  // ---- the things by the door: a low table, the basket of barley on it, and the water jar beside it
  g.kit.spawn('table_low', TABLE.x, TABLE.z, 0, { noCollide: true });
  const straw = new THREE.MeshLambertMaterial({ color: 0xb89a5a, side: THREE.DoubleSide }), grain = new THREE.MeshLambertMaterial({ color: 0xe0cc92 }), clay = new THREE.MeshLambertMaterial({ color: 0xb06a45, side: THREE.DoubleSide });
  const basket = new THREE.Group();
  { const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.15, 0.13, 12, 1, true), straw), top = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), grain); wall.position.y = 0.065; top.rotation.x = -PI / 2; top.position.y = 0.1; basket.add(wall, top); }
  basket.position.set(TABLE.x, yOf(TABLE) + 0.4, TABLE.z);
  const jar = new THREE.Mesh(new THREE.LatheGeometry([[0.07, 0], [0.15, 0.1], [0.17, 0.24], [0.11, 0.36], [0.06, 0.4], [0.09, 0.46]].map((p) => new THREE.Vector2(p[0], p[1])), 12), clay);
  jar.position.set(JAR.x, yOf(JAR), JAR.z);
  for (const o of [basket, jar]) { o.traverse((m) => { m.castShadow = true; }); w.group.add(o); }

  let step = -1, turn = 0, lastA = null, sub = 0, slips = 0, has = { basket: false, jar: false };
  const set = (n) => { step = n; g.flags.altarStep = n; api.refreshObjective(g); };
  const ceph = () => g.npc('cephalus');

  // What the goal box and Mika say during the task. The three orders of step 3 are not repeated in the goal box:
  // the player has to have listened. Mika will repeat them if asked.
  g.errand = {
    ritualScene: { basket, jar, altar: ALTAR, table: TABLE, water: JAR, wash: WASH, crowd: CROWD },
    objective: () => [null, 'Take the basket and the water jar, by the courtyard door', 'Carry them once round the altar', 'Sprinkle the altar', 'Do the three things Cephalus asked, in his order', 'Answer Cephalus'][step + 1] || 'Go into the courtyard. Cephalus is at the altar.',
    guide: () => [['Go on in. He’s at the altar, the square stone in the middle.'],
      ['The basket is on the little table by the door, and the water jar is next to it. Take both.'],
      ['Walk all the way round the altar with them. Once is enough.'],
      ['Stand at the altar and press E to sprinkle it.'],
      ['He said three things. Barley to him first. Then wash your hands, by the east side of the altar. Then scatter the rest over the people sitting down.'],
      ['Just answer him.']][step + 1],
    target: () => (step === 0 ? TABLE : step >= 1 ? ALTAR : { x: C.x + 4.5, z: C.z }),
  };

  // ---- it begins when the player walks in from the door
  g.addTrigger({ x: C.x + 4.6, z: C.z, r: 2.6, when: (gg) => gg.flags.atHouse && !served(gg.flags) && step < 0, run: async (gg) => {
    await gg.lines([
      ['cephalus', 'Is that the boy? No. A stranger, with a garland on. You will do.', 'think'],
      ['cephalus', 'The basket and the water are by the door. Bring them here, and carry them once round the altar.']]);
    set(0);
  } });
  g.addSpot({ x: TABLE.x, z: TABLE.z, r: 1.5, label: 'Take up the basket of barley', when: () => step === 0 && !has.basket, run: async (gg) => {
    has.basket = true; basket.visible = false; gg.player.setActivity('basket'); gg.audio.blip('pick'); if (has.jar) set(1);
  } });
  g.addSpot({ x: JAR.x, z: JAR.z, r: 1.4, label: 'Take the jar of water', when: () => step === 0 && !has.jar, run: async (gg) => {
    has.jar = true; jar.position.set(0, -0.3, 0.05); gg.player.attach('handL', jar); gg.audio.blip('pick'); if (has.basket) set(1);
  } });
  // once round the altar, either way
  g.tickers.push(() => {
    if (step !== 1 || g.busy || g.space !== 'world') return;
    const p = g.player, dx = p.x - ALTAR.x, dz = p.z - ALTAR.z, d = Math.hypot(dx, dz);
    if (d < 0.7 || d > 3.2) { lastA = null; return; }
    const a = Math.atan2(dx, dz);
    if (lastA != null) { let da = a - lastA; if (da > PI) da -= 2 * PI; if (da < -PI) da += 2 * PI; turn += da; }
    lastA = a;
    if (Math.abs(turn) >= 2 * PI * 0.93) {
      step = 1.5;
      g.run(async (gg) => {
        if(gg.interactions)await gg.interactions.play('steam',ceph().actor,{x:jar.position.x,y:jar.position.y+0.7,z:jar.position.z},{source:jar,offset:new THREE.Vector3(0,0.46,0)});
        await gg.say('', 'Cephalus takes a burning stick from the altar and puts it out in the water. It hisses.');
        await gg.say('cephalus', 'Now sprinkle the altar.');
        set(2);
      });
    }
  });
  g.addSpot({ x: ALTAR.x, z: ALTAR.z, r: 2.0, label: 'Sprinkle the altar', when: () => step === 2, run: async (gg) => {
    if(gg.interactions)await gg.interactions.play('water',gg.player,{x:ALTAR.x,y:yOf(ALTAR)+1.1,z:ALTAR.z},{source:jar,offset:new THREE.Vector3(0,0.46,0)});
    gg.audio.blip('pebble');
    await gg.say('cephalus', 'Give me some barley. Then wash your hands, and scatter the rest among the company.');
    sub = 0; ceph().label = 'Give Cephalus barley'; set(3);
  } });
  // the three orders, which must be done in his order
  const wrong = async (gg, line) => { slips++; await gg.say('cephalus', line, { mood: 'think' }); };
  // The barley is handed to Cephalus himself, so for that moment pressing E beside him gives it (story.js asks give()).
  g.errand.give = async (gg) => {
    if (step !== 3 || sub !== 0) return false;
    sub = 1; ceph().label = null; gg.audio.blip('pick');
    // You hold out the basket; he takes a handful and throws it on the fire.
    if (gg.interactions && !gg.ui.auto && !gg.reduceMotion) { gg.player.play('offer'); await gg.wait(0.7); }
    // The fire is on the brazier beside the altar (2 m away); the barley goes there.
    let fire = null, fd = 3; for (const f of gg.flames) { const d = Math.hypot(f.x - ALTAR.x, f.z - ALTAR.z); if (d < fd) { fd = d; fire = f; } }
    if (gg.interactions) await gg.interactions.play('grain', ceph().actor, fire ? { x: fire.x, y: fire.y, z: fire.z } : { x: ALTAR.x, y: yOf(ALTAR) + 1.1, z: ALTAR.z });
    await gg.say('', 'He takes a handful from the basket and throws it on the fire.'); return true;
  };
  g.addSpot({ x: WASH.x, z: WASH.z, r: 1.3, label: 'Pour water over your hands', when: () => step === 3 && sub < 2, run: async (gg) => {
    if (sub === 0) { await wrong(gg, 'The barley first.'); return; }
    sub = 2; gg.audio.blip('pebble');
    if(gg.interactions) {
      const hand=new THREE.Vector3(),target=()=>{gg.player.bones.handR.updateWorldMatrix(true,false);return gg.player.bones.handR.getWorldPosition(hand);};
      await gg.interactions.play('water',gg.player,target,{source:jar,offset:new THREE.Vector3(0,0.46,0)});
    }
    await gg.say('', 'You pour water from the jar over one hand and then the other.');
  } });
  g.addSpot({ x: CROWD.x, z: CROWD.z, r: 2.2, label: 'Scatter the barley among them', when: () => step === 3, run: async (gg) => {
    if (sub === 0) { await wrong(gg, 'The barley first. To me.'); return; }
    if (sub === 1) { await wrong(gg, 'Not with those hands. Wash first.'); return; }
    step = 3.5;
    if(gg.interactions)await gg.interactions.play('grain',gg.player,{x:CROWD.x,y:yOf(CROWD)+0.5,z:CROWD.z});
    await gg.say('', 'The grains patter on cloaks and on the paving. The big man in the yellow cloak brushes his off.');
    set(4);
    await gg.say('cephalus', 'Let us pray. Who is here?');
    for (;;) {
      const c = await gg.choose(['“Good men, all of them.”', '“I don’t know any of them.”', '“Nobody much.”'], { prompt: 'Cephalus is waiting for an answer.', name: 'Cephalus' });
      if (c === 0) break;
      slips++;
      await gg.say('polemarchus', 'The answer is “Good men, all of them.” Whatever you think of us.', { mood: 'laugh' });
      await gg.say('cephalus', 'Who is here?');
    }
    await gg.say('', 'You sprinkle the company with the water. Nobody moves.');
    await gg.say('cephalus', 'Gods of this house. I owe no man money, and I owe none of you a sacrifice. Let me die that way.');
    await gg.say('', 'A slave leads a sheep through to the back of the house. The killing is done indoors, and nobody asks you to help with it.');
    await gg.say('cephalus', slips ? 'We’ll make an altar boy of you yet.' : 'You have served at an altar before.', { mood: 'happy' });
    // put the things down, and the old man goes back to his seat
    gg.player.setActivity(null); if (jar.parent) jar.parent.remove(jar); gg.player.held.L = false;
    jar.position.set(JAR.x, yOf(JAR), JAR.z); w.group.add(jar); basket.visible = true;
    gg.flags.altar = true; gg.flags.altarSlips = slips; step = 9; gg.flags.altarStep = 9;
    const c = ceph(); (async () => { await c.moveTo(seatC[0] + 0.5, seatC[1], 0.9); c.put(seatC[0], seatC[1], PI / 2, 'sit'); })();
    await gg.lines([
      ['polemarchus', 'Well. Now you have done something for this house. You can ask it something.', 'happy'],
      ['polemarchus', 'You’ve heard about last night, I suppose. Everyone has. It started right here in the courtyard.'],
      ['polemarchus', 'I met Socrates on the road after the parade, and I told him he wasn’t going home. There were more of us than of him.', 'laugh'],
      ['polemarchus', 'He asked whether he could talk us into letting him go. I asked how he’d manage that if we refused to listen.', 'happy'],
      ['polemarchus', 'So he stayed. Start with my father. Socrates did.']]);
    api.giveCards(gg, ['persuade']);
    await gg.say('', 'You make a note of that. Whenever you hear something that was said last night, a short version goes into your journal. Press J to read it at any time.');
    api.note(gg, 'An offering in the courtyard'); gg.ui.area('The first hour', 'Three answers to one question'); api.refreshObjective(gg);
  } });

  // A game loaded in the middle of the task starts the task again from the door.
  g.errand.reset = () => { step = -1; turn = 0; lastA = null; sub = 0; slips = 0; has = { basket: false, jar: false }; };
  // The old man stands at the altar until the offering has been made.
  g.errand.place = () => { if (g.flags.atHouse && !served(g.flags)) ceph().put(PRIEST.x, PRIEST.z, 0, 'stand'); };
}
