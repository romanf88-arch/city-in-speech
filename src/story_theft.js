// The theft from Philokles, played. If the player told Bion they would take Melitta's thirty minas from Philokles by
// night (story_bion.js), the game's last night puts them outside his house and lets them do it, or not.
// Roman, 2026-11-15: "nothing can go wrong and nothing has to be worked out"; 2026-11-16: "a counter for how much
// money the player can manage to steal, with no specific indication that the goal is actually to maximize money".
//
// How it plays. Almost nothing is explained. The doorkeeper dozes against the wall by the door and wakes every so
// often; awake, he sees anyone outside within nine metres. Inside, Philokles snores; when the snoring stops, anything
// that moves makes a noise he can hear. The chest at the far end holds bags of ten minas, far more than thirty, and a
// counter shows what has been taken. Each bag slows the player. Being seen ends it with nothing.
// The doorkeeper is also at the door by day, and can be talked to, so the player has met the man who will pay for it.
//
// All of it is invented: the house, the doorkeeper, the chest, the bags. Nothing here is from an ancient text.
const C = { creep: 0.5, weight: 0.035, doze: 8, dozeMore: 4, stir: 1.5, awake: 4.5, sight: 9, notice: 1.2, snore: 6, snoreMore: 3, still: 2.4, noise: 1.3, take: 2.2, bag: 10, bags: 12, away: 12 };
const NUM = ['no', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'a hundred', 'a hundred and ten', 'a hundred and twenty'];

export function setupTheft(g, api) {
  const H = g.sites.philokles; if (!g.errand || !H) return;
  const PI = Math.PI, dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const door = H.at(-1.6, 3.2), seat = H.at(-3.2, 4.0), lampAt = H.at(-4.2, 4.05), bed = H.at(-3.5, -1.3), chestAt = H.at(2.75, -2.2), out = H.at(-1.6, 5.0);
  const start = { x: door[0] + 5.8, z: door[1] + 13.4 };          // on the main street, south of the house
  const gy = (x, z) => g.world.groundY(x, z);
  g.kit.spawn('stool', seat[0], seat[1], 0, { noCollide: true });
  g.addFlame(lampAt[0], gy(lampAt[0], lampAt[1]) + 0.55, lampAt[1], { power: 7, size: 0.9, smoke: 0 });            // the doorkeeper's lamp, lit at night
  { const [x, z] = H.at(0.7, 2.75); g.kit.spawn('stool', x, z, 0, { y: H.floor, noCollide: true }); g.addFlame(x, H.floor + 0.75, z, { power: 6, size: 0.7, smoke: 0 }); }   // a lamp left burning by the way through the curtain, so both ends of the room can be made out

  g.addNPC({ id: 'keeper', name: 'The doorkeeper', role: 'at the door of Philokles', color: '#9a8a6a', look: { face: 't2', skin: 'tan', hair: 0xcfc8bc, hairStyle: 'bald', beard: 'full', robe: 0x8a7a5e, length: 'short', hat: 'none', age: 'old', height: 0.96 }, x: seat[0], z: seat[1], h: PI / 2, pose: 'sit' });
  g.addNPC({ id: 'philokles', name: 'Philokles', role: 'lends money', color: '#b9a35a', look: { face: 't3', skin: 'pale', hair: 0x2a221c, beard: 'short', robe: 0xe9e2d0, robe2: 0x7a5a8a, build: 1.2 }, x: bed[0], z: bed[1], h: 0, pose: 'lie', y: H.floor + 0.62, hidden: true, behavior: 'ignore' });
  const keeper = g.npc('keeper'), phil = g.npc('philokles');

  let active = false, cont = null, entered = false, taken = 0, taking = false, notice = 0, noise = 0, kPhase = 'doze', kT = 0, sPhase = 'snore', sT = 0, snoreT = 0, sawBench = false, hud = null, said = '';
  const part = (k) => hud.querySelector('[data-k="' + k + '"]');
  function panel() {
    if (!hud) {
      hud = document.createElement('div');
      hud.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);min-width:170px;background:var(--shade);color:#f6ecd8;padding:8px 16px 10px;border-radius:6px;font-family:var(--serif);font-size:16px;line-height:1.35;text-align:center;pointer-events:none';
      hud.innerHTML = '<div data-k="title" style="font-family:var(--sans);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#d8c69c">Taken</div><div data-k="taken" style="font-size:22px"></div>'
        + '<div data-k="seenBox" style="margin-top:6px;display:none"><div data-k="seenWord" style="font-family:var(--sans);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#ff9a7a"></div><div style="height:6px;background:rgba(255,255,255,.18);border-radius:3px;margin-top:3px"><div data-k="seen" style="height:6px;width:0;background:#ff9a7a;border-radius:3px"></div></div></div>';
      const host = document.getElementById('objective'); (host && host.parentElement ? host.parentElement : document.body).appendChild(hud);
    }
    hud.classList.toggle('hidden', !active); if (!active) return;
    const risk = Math.max(notice, noise);
    part('title').style.display = part('taken').style.display = taken ? '' : 'none';
    part('taken').textContent = taken + ' minas';
    part('seenBox').style.display = risk > 0.02 ? '' : 'none'; part('seenWord').textContent = noise >= notice ? 'He can hear you' : 'He is looking your way'; part('seen').style.width = Math.round(Math.min(1, risk) * 100) + '%';
  }
  const cue = (text) => { if (text === said) return; said = text; g.ui.hint(text || null); };
  const pace = () => { g.speedScale = Math.max(0.2, C.creep - C.weight * (taken / C.bag)); };

  function keeperPose(awake) {
    const a = keeper.actor;
    if (awake) { a.setActivity(null); a.pose = 'stand'; } else { a.pose = 'sit'; a.setActivity('doze', { pose: 'sit' }); }
  }

  g.tickers.push((dt) => {
    const p = g.player, here = g.space === 'world', inRoom = here && H.room.inside(p.x, p.z);
    if (!active) {
      // By day nobody gets past the doorkeeper.
      if (inRoom && !g.busy) g.run(async (gg) => { await gg.say('keeper', 'Not without my master’s word. And he is out.', { mood: 'scorn' }); gg.player.place(out[0], out[1], PI / 2); gg.cam.yaw = PI / 2; gg.snapCam = true; });
      return;
    }
    if (!here) return;
    if (inRoom) entered = true;
    if (g.busy && !taking) { panel(); return; }
    // ---- the doorkeeper: dozes, stirs, looks about, dozes again
    kT -= dt;
    if (kT <= 0) {
      if (kPhase === 'doze') { kPhase = 'stir'; kT = C.stir; }
      else if (kPhase === 'stir') { kPhase = 'awake'; kT = C.awake; keeperPose(true); }
      else { kPhase = 'doze'; kT = C.doze + Math.random() * C.dozeMore; keeperPose(false); }
    }
    const dk = dist(p, seat[0], seat[1]);
    if (kPhase === 'awake') keeper.actor.heading = PI / 2 + Math.sin(g.time * 1.3) * 1.1;      // he looks up and down the street
    const watched = kPhase === 'awake' && !inRoom && dk < C.sight;
    notice = watched ? notice + dt / C.notice : Math.max(0, notice - dt * 1.5);
    // ---- the sleeper: snores, then lies still and listens
    sT -= dt;
    if (sT <= 0) { if (sPhase === 'snore') { sPhase = 'still'; sT = C.still; } else { sPhase = 'snore'; sT = C.snore + Math.random() * C.snoreMore; } }
    const moving = Math.abs(p.speed || 0) > 0.15 || taking, heard = sPhase === 'still' && inRoom && moving;
    noise = heard ? noise + dt / C.noise : Math.max(0, noise - dt * 0.8);
    if (sPhase === 'snore' && dist(p, bed[0], bed[1]) < 9) { snoreT -= dt; if (snoreT <= 0) { snoreT = 2.6; if (g.audio.burst) g.audio.burst(0, 1.1, 150, 85, 0.05, 'lowpass', 0.9, 0.35); } }
    // what the player can tell from where they stand
    // Inside, by the door, the player can see out to the doorkeeper.
    const byDoor = inRoom && dist(p, door[0], door[1]) < 2.6;
    cue(inRoom ? (sPhase === 'still' ? 'The snoring has stopped.' : byDoor ? (kPhase === 'awake' ? 'Outside, the doorkeeper is on his feet.' : kPhase === 'stir' ? 'Outside, the doorkeeper stirs.' : '') : '')
      : (dk < 15 ? (kPhase === 'stir' ? 'The doorkeeper stirs.' : kPhase === 'awake' ? 'The doorkeeper is awake.' : '') : ''));
    panel();
    if (notice >= 1) return caught('keeper');
    if (noise >= 1) return caught('philokles');
    // out again, and clear of the door
    if (entered && !inRoom && dist(p, door[0], door[1]) > C.away) finish(taken >= 30 ? 'done' : taken > 0 ? 'short' : 'back');
  });

  // ---- the chest
  g.addSpot({ x: chestAt[0], z: chestAt[1], r: 1.7, label: () => (taken ? 'Take another bag' : 'Open the chest'), when: () => active && taken < C.bag * C.bags, run: async (gg) => {
    if (!sawBench) {
      sawBench = true;
      await gg.say('', 'The chest is not locked. It is full of small leather bags. Each bag is ten minas.');
      await gg.say('', 'Beside it stands a shield-maker’s bench, with the tools still laid out on it.');
    }
    taking = true; await gg.wait(C.take); taking = false;
    if (!active) return;
    taken += C.bag; pace(); if (g.audio.burst) g.audio.burst(0, 0.12, 2600, 1400, 0.05, 'bandpass', 2.2, 0.003); panel();
  } });
  g.addSpot({ x: chestAt[0] - 0.9, z: chestAt[1] + 0.9, r: 1.3, label: 'Put a bag back', when: () => active && taken > 0, run: async (gg) => {
    taking = true; await gg.wait(C.take * 0.6); taking = false;
    if (!active) return;
    taken -= C.bag; pace(); panel();
  } });
  // Leaving without going in at all.
  g.addSpot({ x: start.x, z: start.z + 2.5, r: 2.4, label: 'Walk away', when: () => active && !entered, run: async () => { finish('back'); } });

  function reset() {
    active = false; g.speedScale = 1; g.noRun = false; g.busyEnv = false; cue(''); g.ui.hint(null); panel();
    keeper.actor.setActivity(null); keeper.put(seat[0], seat[1], PI / 2, 'sit'); phil.show(false);
  }
  function caught(by) {
    if (!active) return; active = false; panel();
    const f = g.flags;
    g.run(async (gg) => {
      if (by === 'keeper') { keeperPose(true); await gg.say('keeper', 'You! Stand where you are. Master! Master, there is a man at the door!', { mood: 'angry' }); }
      else await gg.say('', 'The couch creaks. Philokles is sitting up, looking straight at you.');
      await gg.say('', taken ? 'You drop the bags and run.' : 'You run.');
      await gg.ui.fade(1, 0.5);
      f.theft = 'seen'; f.theftBy = by; f.theftTaken = 0; taken = 0;
      await end(gg);
    });
  }
  function finish(how) {
    if (!active) return; active = false; panel();
    const f = g.flags;
    g.run(async (gg) => {
      if (how === 'back') {
        await gg.say('', entered ? 'You come out into the street with empty hands. The chest is as you found it.' : 'You turn round and walk back down the street. The doorkeeper sleeps on.');
        const c = await gg.choose([{ text: 'Melitta will have to do without.', note: 'She has no dowry, and you will have to tell her.' }, { text: 'I will pay her dowry myself.', note: 'Thirty minas is your mother’s house and her olive trees.' }], { prompt: 'Then where does Melitta’s dowry come from?' });
        f.theft = 'back'; f.theftTaken = 0; f.bion = c === 0 ? 'forgive' : 'pay';
      } else { f.theft = how; f.theftTaken = taken; await gg.say('', 'You walk down to the harbor with ' + NUM[taken / C.bag] + ' minas under your cloak. Nobody calls after you.'); }
      await gg.ui.fade(1, 0.6);
      await end(gg);
    });
  }
  async function end(gg) {
    const f = gg.flags, n = f.theftTaken || 0;
    f.bionText = f.theft === 'back' ? 'You went to Philokles’s house at night and left his silver where it lay. ' + (f.bion === 'pay' ? 'You will pay Melitta’s dowry by selling your mother’s house and her olive trees.' : 'Melitta has no dowry, and you have a letter to write.')
      : f.theft === 'seen' ? 'You went to Philokles’s house at night to take Melitta’s thirty minas. ' + (f.theftBy === 'keeper' ? 'The doorkeeper saw you' : 'Philokles woke and saw you') + ', and you ran with nothing.'
      : 'You took ' + NUM[n / C.bag] + ' minas from Philokles’s chest at night, and nobody saw you. Bion had told you the doorkeeper would be beaten for it.';
    reset();
    const a = gg.sites.citySite; gg.teleport('world', a.x - 2, a.z + 8, 0);      // back where the night ended
    await gg.ui.fade(0, 0.8);
    const k = cont; cont = null; if (k) await k(gg);
  }

  // The last lines of the game for a player who went to the house.
  g.errand.theftLines = () => {
    const f = g.flags, n = f.theftTaken || 0, bought = 'In the morning Bion bought Sosias and the boy.';
    if (f.theft === 'seen') return [(f.theftBy === 'keeper' ? 'The old doorkeeper saw your face' : 'Philokles saw your face by his own lamp') + ', and you ran with nothing. ' + bought + ' You took the first ship out.',
      'Philokles had the doorkeeper beaten for sleeping at his door. Melitta has no dowry. In the Piraeus they are asking about a stranger in a blue cloak.'];
    if (f.theft === 'short') return ['You came away with ' + NUM[n / C.bag] + ' minas, and nobody saw you. ' + bought,
      'Philokles had his doorkeeper beaten all the same, and sold him a week later. ' + NUM[n / C.bag][0].toUpperCase() + NUM[n / C.bag].slice(1) + ' minas is not the dowry that was promised. The bridegroom’s father has asked for time to think.'];
    if (f.theft === 'done') return ['You came away with ' + NUM[n / C.bag] + ' minas, and nobody saw you. ' + (n > 30 ? 'Thirty of them are Melitta’s dowry. You have told nobody about the other ' + NUM[(n - 30) / C.bag] + '. ' : '') + bought,
      'Philokles had his doorkeeper beaten, and sold him a week later. Melitta will be married in the autumn, with her dowry whole. Nobody in the Piraeus connects any of it with you.'];
    return null;
  };
  g.errand.theftMirror = () => {
    const f = g.flags, n = f.theftTaken || 0;
    if (f.theft === 'back') return 'You said you would take the money from Philokles. At his house that night you left his silver where it lay. ' + (f.bion === 'pay' ? 'You are selling your mother’s house to pay Melitta’s dowry.' : 'Melitta lost her dowry.');
    if (f.theft === 'seen') return 'You went to take the money from Philokles unseen, and you were seen. You ran with nothing, Melitta lost her dowry, and the doorkeeper was beaten.';
    if (f.theft === 'short' || f.theft === 'done') return 'You took ' + NUM[n / C.bag] + ' minas from Philokles unseen' + (n > 30 ? ', which is ' + NUM[(n - 30) / C.bag] + ' more than Melitta’s dowry' : n < 30 ? ', which is less than Melitta’s dowry' : '') + '. His doorkeeper was beaten and sold for it.';
    return null;
  };

  // Called at the end of the game's last scene (story_end.js). next(gg) runs when the night at the house is over.
  g.errand.theftStart = async (gg, next) => {
    cont = next; entered = false; taken = 0; taking = false; notice = noise = 0; sawBench = false; said = ''; gg.flags.theftBy = null;
    kPhase = 'doze'; kT = C.doze + 2; sPhase = 'snore'; sT = C.snore; snoreT = 0.5;
    await gg.ui.fade(1, 0.8);
    gg.busyEnv = true; gg.env('night', 0);
    const m = gg.npc('mika'); if (m) m.show(false);
    phil.show(true); phil.put(bed[0], bed[1], 0, 'lie'); keeper.put(seat[0], seat[1], PI / 2, 'sit'); keeperPose(false);
    gg.teleport('world', start.x, start.z, Math.atan2(door[0] - start.x, door[1] - start.z));
    gg.ui.area('The house of Philokles', 'After midnight');
    await gg.ui.fade(0, 0.9);
    await gg.say('', 'The street is empty. The doorkeeper sits against the wall by the door with a lamp beside him, and his chin is on his chest.');
    await gg.say('', 'Inside the house somebody is snoring.');
    gg.noRun = true; active = true; pace(); gg.objective('The chest is at the far end of the room, behind a curtain.', null); panel();
  };

  // ---- by day: the man at the door
  keeper.talk = async (gg) => {
    const f = gg.flags; if (active) return;
    if (!f.said_keeper) { f.said_keeper = true; await gg.say('keeper', 'This is the house of Philokles. He lends money. If you owe him, come back with it. If you don’t, keep it that way.', { mood: 'happy' }); return; }
    if (f.lead2 && !f.keeperBion) {
      f.keeperBion = true;
      await gg.lines([
        ['keeper', 'Bion the shield-maker? He stood at this door every morning for a year, to pay or to ask for more time.', 'think'],
        ['keeper', 'I never made him wait in the sun. It was the only thing I had to give him.', 'sad']]);
      return;
    }
    await gg.say('keeper', 'My master is out. He is always out to people he owes, and always in to people who owe him.', { mood: 'happy' });
  };
  g.errand.theftSite = { door, start, chest: chestAt, seat, bed, out };
  g.errand.theftState = () => ({ active, entered, taken, taking, notice, noise, kPhase, kT, sPhase, sT });   // for tests
}
