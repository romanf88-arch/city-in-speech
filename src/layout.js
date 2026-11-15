// Where everything stands: the harbor town, the road north, the cave hill, and the valley in Lydia.
import { dressTown } from './props.js';
import * as THREE from 'three';
import { mulberry32, noise2, nearestOnPath } from './util.js';
import { ROAD_N, ROAD_E, PATH_CAVE, PLACES, FIELDS } from './world.js';

const PI = Math.PI, E = PI / 2, Wd = -PI / 2, N = PI, S = 0;   // which way a building's front faces

export function buildLayout(game) {
  const w = game.world, kit = game.kit, sites = {};
  const P = (id, x, z, rot = 0, opts) => kit.place(id, x, z, rot, opts);

  // ---- ground surfaces
  w.pave(-90, 90, 38, 55.2, 2.6, 0xb9ae9c, 0xa9a08f);
  w.pave(-26, 26, -22, 14, 2, 0xc3b8a4, 0xb3a893);
  const street = (pts, wid = 7) => w.ribbon(pts, wid, 0xcdbd9a, 0xc2b18d);
  street([[0, 38], [0, 14]], 9); street([[0, -22], [0, -79]], 8);
  street([[-100, 20], [-4, 20]]); street([[4, 20], [100, 20]]);
  street([[-4, -46], [-40, -46]], 6); street([[4, -46], [98, -46]], 6); street([[-66, -24], [-66, -76]], 5); street([[-40, -46], [-98, -46]], 5);
  street([[62, 14], [62, -76]], 5);
  w.ribbon(ROAD_N, 6.5, 0xcbb98f, 0xbfae86); w.ribbon(ROAD_E, 5.5, 0xcbb98f, 0xbfae86); w.ribbon(PATH_CAVE, 3, 0xbfae86, 0xb3a37c);

  // ---- quay and piers
  w.block(0, -1.0, 56.7, 186, 5.2, 3.2, 0xa89f91);
  w.addFloor(0, 56.7, 93, 1.6, 0, 1.6, 0.5);
  // The wet band where the harbor water meets the quay front and the two piers (world.js, Sea.wetBand).
  if (game.sea && game.sea.wetBand) game.sea.wetBand(game.world.group, [[-93, 58.3, -63.5, 58.3, 0, 1], [-56.5, 58.3, 56.5, 58.3, 0, 1], [63.5, 58.3, 93, 58.3, 0, 1], ...[-60, 60].flatMap((px) => [[px - 3.5, 58.3, px - 3.5, 97.5, -1, 0], [px + 3.5, 58.3, px + 3.5, 97.5, 1, 0], [px - 3.5, 97.5, px + 3.5, 97.5, 0, 1]])]);
  for (const sx of [-60, 60]) {
    w.block(sx, -1.1, 77.5, 7, 5.4, 40, 0x9c9384); w.addFloor(sx, 77.5, 3.5, 20, 0, 1.6, 0.4);
    for (let z = 62; z < 97; z += 9) { P('bollard', sx - 2.9, z, 0, { y: 1.6 }); P('bollard', sx + 2.9, z, 0, { y: 1.6 }); }
  }
  // Ships and boats afloat. Each is a single object so that it can rise, fall, and rock on the water.
  sites.afloat = [];
  const afloat = (id, x, z, rot, y, noCollide, amount) => {
    const o = kit.spawn(id, x, z, rot, { y, noCollide }), rock = new THREE.Group();
    while (o.children.length) rock.add(o.children[0]);
    o.add(rock); sites.afloat.push({ o, rock, y, k: amount, ph: x * 0.37 + z * 0.11 });
  };
  afloat('ship_merchant', -67.3, 80, 0, 0.15, false, 1); afloat('ship_trireme', 67, 77.5, 0, 0.1, false, 0.7);
  afloat('ship_merchant', 14, 132, 0.5, 0.15, true, 1.4); afloat('boat_small', 22, 61.4, E, 0.1, true, 2.2); afloat('boat_small', -30, 61.6, Wd, 0.1, true, 2.2);   // 2 m clear of the quay front (58.3): nearer, the high quay edge hid half the hull and the boat looked jammed under it
  game.tickers.push(() => {
    const t = game.time;
    for (const b of sites.afloat) {
      b.o.position.y = b.y + (Math.sin(t * 0.55 + b.ph) * 0.05 + Math.sin(t * 0.93 + b.ph * 1.7) * 0.025) * b.k;
      b.rock.rotation.z = (Math.sin(t * 0.62 + b.ph) * 0.02 + Math.sin(t * 1.1 + b.ph * 2.1) * 0.008) * b.k;
      b.rock.rotation.x = Math.sin(t * 0.47 + b.ph * 1.3) * 0.009 * b.k;
    }
  });
  P('boat_small', -122, 71, 0.4, { y: 0.4, noCollide: true }); P('boat_small', 128, 73, -0.5, { y: 0.4, noCollide: true });
  for (let x = -84; x <= 84; x += 14) if (Math.abs(Math.abs(x) - 60) > 6) P('bollard', x, 54.6);
  [['crate_stack', -44, 50, 0.3], ['crate_stack', -41.5, 51.2, 1.2], ['amphora_group', -36, 44, 0.1], ['amphora_group', 30, 49, -0.2], ['sacks', -52, 46, 0.5], ['sacks', 46, 51, 2.1],
    ['pithos', -24, 43, 0], ['pithos', -22.4, 44.2, 0], ['cart', 38, 43, 0.7], ['cart', -76, 44, -0.4], ['net_rack', 76, 50, 0.2], ['net_rack', 82, 46, 1.4], ['crate_stack', 52, 44, 0.8],
    ['amphora', 33, 47.5, 0], ['amphora', -38.6, 46.4, 0], ['amphora', 12, 52, 0], ['sacks', 70, 42, 1.0], ['amphora_group', -66, 50.5, 0.4], ['crate_stack', 64, 52, 0.2]].forEach(([id, x, z, r]) => P(id, x, z, r));

  // ---- buildings
  const houses = [];   // for the things set out by their doors (props.js)
  [['warehouse', -72, 30, S], ['warehouse', -50, 30, S], ['house_b', -28, 30.5, S], ['house_a', -16, 31, S], ['house_a', 15.5, 31, S], ['house_b', 27.5, 30.5, S], ['warehouse', 50, 30, S], ['warehouse', 72, 30, S],
    ['house_a', -48, -15, Wd], ['house_b', -50, 3, Wd], ['house_c', -74, -8, E], ['house_a', -92, 6, E], ['house_a', -80, 9.5, S], ['house_b', -93, -18, E],
    ['house_b', 40, 8.5, S], ['house_a', 57, 6.5, S], ['house_c', 80, 2, Wd], ['house_a', 95, 8, Wd], ['house_b', 78, -22, Wd], ['house_a', 94, -30, Wd],
    ['house_c', -21, -33, N], ['house_a', -17, -57, S], ['house_b', -29, -60, S], ['house_a', -76, -36, E], ['house_b', -77, -58, E], ['house_c', -88, -68, S], ['house_a', -50, -68, S], ['house_a', -36, -71, S], ['house_a', -93, -52, E],
    ['house_b', 18, -34, N], ['house_a', 31, -35.5, N], ['house_c', 23, -58, S], ['house_a', 44, -36, N], ['house_b', 72, -36, Wd], ['house_a', 71, -57, Wd], ['house_c', 86, -64, S], ['house_a', 42, -66, S], ['house_a', 52, -60, S], ['house_b', 92, -45.5, N]]
    .forEach(([id, x, z, r]) => houses.push([id, P(id, x, z, r)]));
  sites.cephalus = P('courtyard_house', -50, -46, E); houses.push(['courtyard_house', sites.cephalus]);
  sites.stoa = P('stoa', -33.5, -4, E);
  sites.shrine = P('shrine', 45, -6, Wd);
  sites.statue = P('statue_goddess', 31.5, -6, Wd);
  sites.bema = P('bema', 9, -13, S);
  sites.bookstall = P('bookstall', 21.5, 3.5, Wd);
  sites.stallA = P('stall_a', -15, 10.4, N); sites.stallB = P('stall_b', -8.5, 10.8, N); sites.stallC = P('stall_c', 14, 10.4, N); const stallD = P('stall_a', 23, -16, Wd);
  sites.well = P('well', -15, -12, 0.3);
  P('herm', -25, 12.6, S); P('herm', 25, 12.6, S); P('herm', 4.8, -21.4, S); P('herm', -4.6, -21.4, S); P('herm', -5, -106, 0.4, { zone: 'north' });
  P('bench', -24, -19.5, 0); P('bench', 20, -20, 0); P('bench', 36, 0.5, E); P('altar', 36.2, -6, Wd); P('table_low', -31.5, -8, E); P('couch', -32.5, -11.5, 0); P('stool', -30.2, -6.6, 0);
  sites.flames = [];
  const flame = (id, x, z) => sites.flames.push(P(id, x, z, 0));
  [[5.4, -10.3], [12.6, -10.3], [36.6, -9.6], [36.6, -2.4], [-24.5, 4], [-24.5, -14]].forEach(([x, z]) => flame('brazier', x, z));
  for (const z of [33, 17.5, -25, -37, -52, -66]) { flame('torch_post', -5.2, z); flame('torch_post', 5.2, z); }
  [[-40.6, -42.6], [-40.6, -49.4], [-60, 41], [60, 41], [-20, 41], [20, 41]].forEach(([x, z]) => flame('torch_post', x, z));

  // ---- walls and gate
  sites.gate = P('gate', 0, -80, N);
  for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) P('wall_seg', sx * (13 + 12 * i), -80, N);
  for (const sx of [-1, 1]) {
    P('wall_tower', sx * 105.5, -80, 0);
    for (let i = 0; i < 11; i++) P('wall_seg', sx * 105.5, -71.5 + 12 * i, E);
    P('wall_tower', sx * 105.5, 57.5, 0);
  }

  // ---- town trees
  [['olive_a', -20, -17.5, 0.4], ['olive_b', 54, -18, 2], ['cypress_a', 40, -13.5, 0], ['cypress_a', 40, 1.5, 1], ['cypress_b', 52.6, -13, 2], ['pine_a', 92, 40, 0.6], ['pine_a', -96, 38, 2.2], ['olive_b', -62, -24, 1.1],
    ['olive_a', 8, -64, 2.6], ['cypress_b', -9, -72, 0], ['cypress_b', 9, -72, 0], ['olive_a', -92, -8, 0.2], ['olive_b', 96, -62, 1.4], ['bush_b', -40.5, -38.5, 0], ['bush_b', -40.6, -53.6, 1], ['bush_a', 12, 33, 0], ['olive_b', 62, 22, 0.5], ['olive_a', -64, 22.5, 1.9]]
    .forEach(([id, x, z, r]) => P(id, x, z, r));

  // ---- north: road, exedra, cave mouth, city site
  sites.exedra = P('exedra', -31, -209, 0.25, { zone: 'north' });
  const my = w.terrainY(-40, -227.2);
  sites.mouth = P('cave_mouth', -40, -229.2, S, { zone: 'north', y: my - 0.15 });
  // A black backing so the mouth reads as an opening.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 6.5), new THREE.MeshBasicMaterial({ color: 0x050403, fog: false }));
  back.position.set(-40, my + 2.6, -230.6); kit.zone('north').add(back);
  w.addBox(-40, -232.4, 6, 1.2, 0, 8);
  P('cliff_a', -51.5, -233, 0.25, { zone: 'north' }); P('cliff_a', -28.5, -233.2, -0.2, { zone: 'north' }); P('rock_c', -47, -224, 0.4, { zone: 'north' }); P('rock_b', -33.6, -223.4, 1, { zone: 'north' });
  for (const [x, z] of [[-3.6, -94], [-12, -150], [-25.5, -184]]) P('milestone', x, z, 0.2, { zone: 'north' });
  for (let i = 0; i < 7; i++) { const t = 0.12 + i * 0.125, a = pathAt(ROAD_N, t); P(i % 2 ? 'cypress_a' : 'cypress_b', a[0] + (i % 2 ? 6.5 : -6.5), a[1], i, { zone: 'north' }); }
  sites.pond = { x: -58, z: -203, r: 7.5 };
  // The plateau where the city will be founded later: surveyor's stakes and a marker.
  sites.citySite = { x: PLACES.citySite[0], z: PLACES.citySite[1] };
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2, x = sites.citySite.x + Math.sin(a) * 22, z = sites.citySite.z + Math.cos(a) * 16; w.block(x, w.terrainY(x, z) + 0.6, z, 0.12, 1.3, 0.12, 0x6b4a32); }
  P('milestone', sites.citySite.x - 26, sites.citySite.z + 12, 0.8, { zone: 'north' }); P('column_single', sites.citySite.x, sites.citySite.z, 0, { zone: 'north' });

  // ---- scattered trees, shrubs, and stones
  const rng = mulberry32(4242), lyd = PLACES.lydia;
  const inTown = (x, z) => x > -112 && x < 112 && z > -88 && z < 60;
  const clearOf = (x, z) => nearestOnPath(ROAD_N, x, z).d > 6 && nearestOnPath(ROAD_E, x, z).d > 6 && nearestOnPath(PATH_CAVE, x, z).d > 4.5
    && FIELDS.every((f) => Math.hypot(x - f[0], z - f[1]) > f[2] + 2)
    && Math.hypot(x + 40, z + 229) > 13 && Math.hypot(x + 31, z + 209) > 7 && Math.hypot(x - sites.citySite.x, z - sites.citySite.z) > 30 && Math.hypot(x - sites.pond.x, z - sites.pond.z) > sites.pond.r + 1.5;
  let placed = 0;
  for (let i = 0; i < 2600 && placed < 520; i++) {
    const x = -300 + rng() * 600, z = -300 + rng() * 400;
    if (inTown(x, z) || !clearOf(x, z)) continue;
    const y = w.terrainY(x, z); if (y < 1.6 || y > 52) continue;
    const dl = Math.hypot(x - lyd[0], z - lyd[1]); if (dl < 112) continue;
    const dense = noise2(x * 0.02 + 5, z * 0.02) , r = rng(), rot = rng() * 6.28, sc = 0.8 + rng() * 0.5, zone = z < -84 ? 'north' : 'town';
    if (dense < 0.34 && r > 0.25) continue;
    let id;
    if (r < 0.26) id = rng() < 0.5 ? 'olive_a' : 'olive_b'; else if (r < 0.4) id = y > 9 ? 'pine_a' : 'olive_a'; else if (r < 0.5) id = rng() < 0.5 ? 'cypress_a' : 'cypress_b';
    else if (r < 0.78) id = rng() < 0.75 ? 'bush_a' : 'bush_b'; else if (r < 0.93) id = rng() < 0.6 ? 'rock_a' : 'rock_b'; else id = 'rock_c';
    P(id, x, z, rot, { scale: sc, zone }); placed++;
  }
  for (let i = 0; i < 620; i++) {
    const x = -260 + rng() * 520, z = -290 + rng() * 380;
    if ((inTown(x, z) && rng() > 0.03) || nearestOnPath(ROAD_N, x, z).d < 3.6 || Math.hypot(x - lyd[0], z - lyd[1]) < 112) continue;
    const y = w.terrainY(x, z); if (y < 1.5) continue;
    P('grass_tuft', x, z, rng() * 6.28, { scale: 0.9 + rng() * 1.3, zone: z < -84 ? 'north' : 'town', noCollide: true });
  }

  // ---- Lydia, where the story of the ring is set
  const L = (id, dx, dz, rot = 0, opts = {}) => P(id, lyd[0] + dx, lyd[1] + dz, rot, Object.assign({ zone: 'lydia' }, opts));
  sites.hut = L('hut', -6, -20, 0.5);
  sites.palace = L('palace_hall', -31, 14, E);
  L('palace_wall', -17, 0, 0); L('palace_wall', -3.4, 0, 0); L('palace_wall', -17, 28, 0); L('palace_wall', -3.4, 28, 0);
  L('palace_wall', 3.6, 6.2, E, { scale: 0.86 }); L('palace_wall', 3.6, 21.8, E, { scale: 0.86 });
  sites.palaceGate = { x: lyd[0] + 3.6, z: lyd[1] + 14 };
  sites.throne = L('throne', -33.5, 14, E, { y: w.terrainY(lyd[0] - 33.5, lyd[1] + 14) + 0.7 });
  sites.chest = L('chest', -34.5, 21.5, E, { y: w.terrainY(lyd[0] - 34.5, lyd[1] + 21.5) + 0.3 });
  L('brazier', -24, 9, 0); L('brazier', -24, 19, 0); L('pithos', -8, 3, 0); L('amphora_group', -12, 25, 0.2);
  sites.meeting = { x: lyd[0] + 16, z: lyd[1] - 2 };
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + 0.3; L('rock_a', 16 + Math.sin(a) * 3.4, -2 + Math.cos(a) * 3.4, a, { scale: 0.9 }); }
  sites.chasm = { x: PLACES.chasm[0], z: PLACES.chasm[1] };
  for (let i = 0; i < 90; i++) {
    const a = rng() * PI * 2, r = 20 + rng() * 44, x = lyd[0] + Math.sin(a) * r, z = lyd[1] + Math.cos(a) * r;
    if (Math.hypot(x - sites.chasm.x, z - sites.chasm.z) < 17 || (x < lyd[0] + 8 && x > lyd[0] - 40 && z > lyd[1] - 4 && z < lyd[1] + 32) || Math.hypot(x - sites.meeting.x, z - sites.meeting.z) < 7) continue;
    const q = rng(); P(q < 0.25 ? 'olive_a' : q < 0.4 ? 'cypress_b' : q < 0.5 ? 'pine_a' : q < 0.8 ? 'bush_a' : 'rock_b', x, z, rng() * 6.28, { zone: 'lydia', scale: 0.8 + rng() * 0.5 });
  }
  for (let i = 0; i < 220; i++) { const a = rng() * PI * 2, r = rng() * 48, x = lyd[0] + Math.sin(a) * r, z = lyd[1] + Math.cos(a) * r; P('grass_tuft', x, z, rng() * 6.28, { zone: 'lydia', scale: 1 + rng() * 1.4, noCollide: true }); }

  dressTown(kit, w, houses, [sites.stallA, sites.stallB, sites.stallC, stallD]);   // doorways and market (props.js)
  kit.build();
  // Flames get a glow and a share of the night lights.
  for (const f of sites.flames) { const a = f.anchor('flame'); game.addFlame(a.x, f.id === 'brazier' ? f.y + 1.2 : f.y + 2.5, a.z, f.id === 'brazier' ? { power: 34 } : { power: 22, base: f.y + 2.3, smoke: 0.6 }); }
  kit.zone('lydia').visible = false;

  game.mapLabels = [{ text: 'Harbor', x: 0, z: 47 }, { text: 'Agora', x: 0, z: -4 }, { text: 'House of Cephalus', x: -50, z: -60 }, { text: 'Shrine of Bendis', x: 52, z: 6 }, { text: 'North gate', x: 0, z: -88 },
    { text: 'Cave hill', x: -40, z: -246 }, { text: 'Stone seat', x: -14, z: -206 }, { text: 'Site of the city in speech', x: 130, z: -182 },
    { text: 'Shepherd’s hut', x: lyd[0] - 6, z: lyd[1] - 26, lydia: true }, { text: 'The king’s hall', x: lyd[0] - 28, z: lyd[1] + 36, lydia: true }, { text: 'Pasture', x: lyd[0] + 26, z: lyd[1] - 24, lydia: true }];
  return sites;
}

function pathAt(path, t) {
  let total = 0; const seg = [];
  for (let i = 0; i < path.length - 1; i++) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); seg.push(l); total += l; }
  let d = t * total;
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const k = d / seg[i]; return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k]; } d -= seg[i]; }
  return path[path.length - 1];
}
