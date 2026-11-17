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
  // ---- the ship the player has just come off (2026-11-16). A review Roman passed on asked for the arrival to be
  // framed "through ship rigging and a hanging sail", with the view angled "toward a bustling street". So a merchant
  // ship lies stern-on at the middle of the quay, where the view north runs up the main street to the gate and the
  // mountains. A sail has been let down to dry on the port side, loose ropes cross the deck, a gangplank runs to the
  // quay, and two lines hold the stern. The opening shot itself is in story.js (openingShot).
  afloat('ship_merchant', 2.2, 70.6, 0, 0.15, false, 0.5);
  {
    const ship = sites.arrivalShip = sites.afloat[sites.afloat.length - 1], cloth = new THREE.MeshLambertMaterial({ color: 0xe9dcc0, side: THREE.DoubleSide }), hemp = new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), wood = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
    // The sail: u runs from the end of the yard on the port side (0) to the mast (1), v from the foot (0) up to the yard (1).
    // The lower port corner is hauled down to head height and the foot rises in a curve to the mast, so from the deck
    // the cloth hangs across one upper corner of the view and the town shows under it. It hangs in pleats, is sewn
    // from six strips (the darker seams), and has a darker hem.
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 40, 10), cloth), sp = sail.geometry.attributes.position, tint = new Float32Array(sp.count * 3), c0 = new THREE.Color(0xe9dcc0);
    for (let i = 0; i < sp.count; i++) {
      const u = sp.getX(i) + 0.5, v = sp.getY(i) + 0.5, foot = 3.5 + 2.9 * Math.pow(u, 1.4) + 0.1 * Math.sin(u * 18);
      sp.setXYZ(i, -2.9 + u * 3.2 - 0.22 * Math.sin(Math.PI * v) * (1 - u), foot + v * (9.6 - foot), 1.0 + (0.04 + 0.1 * (1 - v)) * Math.sin(u * 30 + v * 2) + 0.3 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
      const k = (0.9 + 0.1 * Math.sin(u * 30 + v * 2 + 1.6)) * (Math.abs(((u * 6) % 1) - 0.5) > 0.46 ? 0.8 : 1) * (v < 0.06 || u < 0.02 ? 0.8 : 1);
      tint[i * 3] = c0.r * k; tint[i * 3 + 1] = c0.g * k; tint[i * 3 + 2] = c0.b * k;
    }
    cloth.color.set(0xffffff); cloth.vertexColors = true; sail.geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    sail.geometry.computeVertexNormals(); sail.castShadow = true; ship.rock.add(sail);
    const line = (a, b, sag, parent, r = 0.03) => {
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t)); }
      parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 5), hemp));   // no shadow: a rope this thin would cost a shadow draw for a line nobody sees
    };
    line([-2.9, 3.5, 1.0], [-2.3, 2.3, 3.2], 0.12, ship.rock, 0.025);   // the sheet that holds the sail's lower corner down
    line([0.1, 11.2, 0.7], [2.6, 3.4, 5.5], 0.5, ship.rock); line([0.1, 10.4, 0.7], [-2.5, 3.3, 4.6], 0.4, ship.rock); line([2.9, 9.8, 2.5], [2.5, 3.3, -6.5], 0.9, ship.rock);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 5.2), wood); plank.position.set(4.6, 1.75, 60.2); plank.rotation.set(0.03, -0.25, 0); plank.castShadow = true; plank.receiveShadow = true; w.group.add(plank);
    P('bollard', -7, 54.6);
    // the stern lines, both to the left of the gangplank so that nobody walks through one
    line([1.4, 2.6, 61.4], [0, 2.4, 54.7], 0.55, w.group, 0.035); line([0.2, 2.6, 61.5], [-7, 2.4, 54.7], 0.7, w.group, 0.035);
  }
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
    ['amphora', 33, 47.5, 0], ['amphora', -38.6, 46.4, 0], ['amphora', 12, 52, 0],
    ['sacks', -4.6, 53.2, 0.4], ['crate_stack', -7.2, 51.6, 0.2], ['crate_stack', -5.4, 50.3, 1.1], ['amphora', -3.3, 52.3, 0], ['amphora_group', 11.8, 55.2, 0.3], ['cart', 14.5, 43.5, 0.9], ['pithos', 17.5, 50.6, 0],
    // the goods set down where the player lands, and two stalls that face each other across the mouth of the main street (life.js puts the people at them)
    ['stall_b', -6.8, 36.6, E], ['stall_c', 7.2, 37.2, Wd], ['sacks', 70, 42, 1.0], ['amphora_group', -66, 50.5, 0.4], ['crate_stack', 64, 52, 0.2]].forEach(([id, x, z, r]) => P(id, x, z, r));

  // ---- buildings
  const houses = [];   // for the things set out by their doors (props.js)
  [['warehouse', -72, 30, S], ['warehouse', -50, 30, S], ['house_b', -28, 30.5, S], ['house_a', -16, 31, S], ['house_b', 27.5, 30.5, S], ['warehouse', 50, 30, S], ['warehouse', 72, 30, S],
    ['house_a', -48, -15, Wd], ['house_b', -50, 3, Wd], ['house_c', -74, -8, E], ['house_a', -92, 6, E], ['house_a', -80, 9.5, S], ['house_b', -93, -18, E],
    ['house_b', 40, 8.5, S], ['house_a', 57, 6.5, S], ['house_c', 80, 2, Wd], ['house_a', 95, 8, Wd], ['house_b', 78, -22, Wd], ['house_a', 94, -30, Wd],
    ['house_c', -21, -33, N], ['house_a', -76, -36, E], ['house_b', -77, -58, E], ['house_c', -88, -68, S], ['house_a', -50, -68, S], ['house_a', -36, -71, S], ['house_a', -93, -52, E],
    ['house_a', 31, -35.5, N], ['house_c', 23, -58, S], ['house_a', 44, -36, N], ['house_b', 72, -36, Wd], ['house_a', 71, -57, Wd], ['house_c', 86, -64, S], ['house_a', 42, -66, S], ['house_a', 52, -60, S], ['house_b', 92, -45.5, N]]
    .forEach(([id, x, z, r]) => houses.push([id, P(id, x, z, r)]));
  sites.cephalus = P('courtyard_house', -50, -46, E); houses.push(['courtyard_house', sites.cephalus]);
  // ---- the schoolroom: a house the player can walk into, on the main street just north of the square, where a
  // two-story house stood. Its door faces west onto the street, so the afternoon sun comes in through it. What is
  // in the room follows the school scenes on the cup painted by Douris about 480 BC (research/notes-school.md).
  {
    const SX = 11.5, SZ = -31, R = Wd, cs = Math.cos(R), sn = Math.sin(R);
    const sch = sites.school = P('school', SX, SZ, R, { lift: 0.07 }), sy = sch.y;   // lifted clear of the gentle slope it stands on
    // Room coordinates: a across the room (door wall to the right of center is +, in meters from the middle),
    // b from the back wall (-) to the door wall (+). at() turns them into map coordinates.
    sch.at = (a, b) => [SX + a * cs + b * sn, SZ - a * sn + b * cs];
    sch.floor = sy + 0.05;
    const local = (x, z) => { const dx = x - SX, dz = z - SZ; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
    (w.rooms || (w.rooms = [])).push({ name: 'school',
      inside: (x, z, pad = 0) => { const [a, b] = local(x, z); return Math.abs(a) < 4.1 + pad && Math.abs(b) < 3.2 + pad; },
      roofY: (x, z) => sy + 4.8 - 0.5 * Math.abs(local(x, z)[1]),
      // Where the sun lands inside the door: daylight thrown back up into the room from there (game.js, updateFlames).
      bounce: (() => { const [x, z] = sch.at(-2.0, 1.5); return [x, sy + 0.7, z]; })() });
    const F = (id, a, b, r = 0, up = 0.05) => { const [x, z] = sch.at(a, b); return P(id, x, z, R + r, { y: sy + up }); };
    F('stool', -3.3, 2.2);                                  // the attendant's seat by the door
    F('stool', -3.0, -1.9); F('stool', -1.6, -1.9);         // the lyre lesson
    F('wall_a', -2.3, -3.19, 0, 1.5);                       // two lyres, two cups, a basket, a flute case
    F('wall_b', 4.09, 1.75, -PI / 2, 1.3);                  // a scroll, a tablet, a lyre, a sack, the rod
    F('klismos', 2.9, -2.1, -0.35);                         // the teacher's chair
    F('school_bench', 1.9, 0.6, -0.35); F('tablet_set', 2.75, 0.91, -0.35, 0.48);
    F('scroll_bin', 3.55, -2.6); F('bone_basket', -0.4, -0.9); F('hydria', -3.75, 2.9);
    { const [x, z] = sch.at(1.9, 0.6); w.addBox(x, z, 1.3, 0.19, R - 0.35, 0.5); }
    { const [x, z] = sch.at(2.9, -2.1); w.addCircle(x, z, 0.3, 0.9); }
  }
  // ---- the shield workshop of the family of Cephalus, on the street that leads to his door, where two houses
  // stood. Lysias says the Thirty listed the slaves at "the factory" and took "seven hundred shields of ours"
  // (Against Eratosthenes 8 and 19; research/notes-workshop.md). The layout of the room is the game's own.
  {
    const SX = -24, SZ = -57.5, R = S, cs = Math.cos(R), sn = Math.sin(R);
    const shop = sites.workshop = P('workshop', SX, SZ, R, { lift: 0.16 }), sy = shop.y;
    shop.at = (a, b) => [SX + a * cs + b * sn, SZ - a * sn + b * cs];   // a: west (-) to east (+); b: back wall (-) to the door wall (+)
    shop.floor = sy + 0.05;
    const local = (x, z) => { const dx = x - SX, dz = z - SZ; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
    (w.rooms || (w.rooms = [])).push({ name: 'workshop',
      inside: (x, z, pad = 0) => { const [a, b] = local(x, z); return Math.abs(a) < 5.7 + pad && Math.abs(b) < 3.7 + pad; },
      roofY: (x, z) => sy + 5.2 - 0.5 * Math.abs(local(x, z)[1]),
      bounce: (() => { const [x, z] = shop.at(-2.2, -1.1); return [x, sy + 0.7, z]; })() });   // where the sun from the west window lands
    const F = (id, a, b, r = 0, up = 0.05) => { const [x, z] = shop.at(a, b); return P(id, x, z, R + r, { y: sy + up }); };
    shop.forge = F('forge', 3.5, -3.05); F('stump_anvil', 2.0, -1.5);
    F('workbench', -3.2, -1.0); F('workbench', -3.2, 1.7);
    F('shield_stack', -5.05, -2.95); F('shield_stack', -5.0, 2.95, 0.6); F('shield_stack', 5.0, 2.9, 1.1);
    for (let k = 0; k < 6; k++) F('shield', -4.4 + k * 1.1, -3.66, 0, 1.12);          // finished shields on the rail
    F('shield', -2.3, 4.13, 0, 0.02); F('shield', 2.35, 4.13, 0, 0.02);               // two by the door, as the shop's sign
    F('crate_stack', 4.9, 1.2, 0.3); F('amphora', 5.2, -0.6); F('hydria', 1.0, -3.2); F('stool', 3.4, 3.1);
  }
  // ---- the ship captain's house: an ordinary family's house, on the main street between the harbor and the
  // square, where a one-room house stood. It is the same building as the schoolroom, furnished as a home: a loom,
  // wool, the year's stores, a hearth (research/notes-house.md).
  {
    const SX = 11.5, SZ = 31, R = Wd, cs = Math.cos(R), sn = Math.sin(R);
    const home = sites.home = P('school', SX, SZ, R, { lift: 0.1 }), sy = home.y;
    home.at = (a, b) => [SX + a * cs + b * sn, SZ - a * sn + b * cs];   // as for the schoolroom
    home.floor = sy + 0.05;
    const local = (x, z) => { const dx = x - SX, dz = z - SZ; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
    (w.rooms || (w.rooms = [])).push({ name: 'home',
      inside: (x, z, pad = 0) => { const [a, b] = local(x, z); return Math.abs(a) < 4.1 + pad && Math.abs(b) < 3.2 + pad; },
      roofY: (x, z) => sy + 4.8 - 0.5 * Math.abs(local(x, z)[1]),
      bounce: (() => { const [x, z] = home.at(-2.0, 1.5); return [x, sy + 0.7, z]; })() });
    const F = (id, a, b, r = 0, up = 0.05) => { const [x, z] = home.at(a, b); return P(id, x, z, R + r, { y: sy + up }); };
    F('loom', 2.4, -0.55); F('wool_basket', 3.45, 0.35); F('stool', -0.3, 1.5);
    home.hearth = F('brazier', -0.8, -2.6);
    F('pithos', 3.45, -2.55); F('pithos', 2.3, -2.7); F('amphora', 1.35, -2.8); F('amphora', 0.9, -2.75); F('chest', 3.6, 2.45, -PI / 2);
    F('couch', -3.55, 0.3); F('table_low', -2.4, 1.2); F('hydria', -3.7, 2.8); F('basket_figs', -2.4, 1.2, 0, 0.45);
    { const [x, z] = home.at(-2.45, -1.45); P('rock_a', x, z, 0.7, { y: sy + 0.02, scale: 0.32, noCollide: true }); }   // the lower grindstone
  }
  // ---- the house of Philokles (invented: the man Bion owes, story_bion.js), on the main street north of the square
  // and across the street from the shield workshop. It is the same building as the schoolroom: one long room. He
  // sleeps at the end by the door. The chest is at the far end behind a curtain, beside the bench and the shields
  // the court gave him from Bion's shop. The night scene played here is in story_theft.js.
  {
    const SX = -11.5, SZ = -56, R = E, cs = Math.cos(R), sn = Math.sin(R);
    const ph = sites.philokles = P('school', SX, SZ, R, { lift: 0.14 }), sy = ph.y;
    ph.at = (a, b) => [SX + a * cs + b * sn, SZ - a * sn + b * cs];   // a: along the room, from the end by the door (-) to the chest (+); b: back wall (-) to the street wall (+)
    ph.floor = sy + 0.05;
    const local = ph.local = (x, z) => { const dx = x - SX, dz = z - SZ; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
    ph.room = { name: 'philokles',
      inside: (x, z, pad = 0) => { const [a, b] = local(x, z); return Math.abs(a) < 4.1 + pad && Math.abs(b) < 3.2 + pad; },
      roofY: (x, z) => sy + 4.8 - 0.5 * Math.abs(local(x, z)[1]),
      bounce: (() => { const [x, z] = ph.at(-2.0, 1.5); return [x, sy + 0.7, z]; })() };
    (w.rooms || (w.rooms = [])).push(ph.room);
    const F = (id, a, b, r = 0, up = 0.05) => { const [x, z] = ph.at(a, b); return P(id, x, z, R + r, { y: sy + up }); };
    ph.couch = F('couch', -3.5, -1.3); F('table_low', -3.3, 0.5); F('pithos', -3.5, -2.7); F('amphora', -2.6, -2.8);
    ph.chest = F('chest', 3.55, -2.2, -PI / 2); F('workbench', 3.1, 2.4); F('shield_stack', 1.9, -2.6); F('shield', 2.45, -3.06, 0, 1.1); F('pithos', 0.2, -2.7);
    // the curtain across the room, with a way through at the street side
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3, 14, 1), new THREE.MeshLambertMaterial({ color: 0x7a3b2e, side: THREE.DoubleSide })), cp = cloth.geometry.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, 0.07 * Math.sin(cp.getX(i) * 7));
    cloth.geometry.computeVertexNormals();
    { const [x, z] = ph.at(1.25, -0.9); cloth.position.set(x, sy + 1.2, z); cloth.rotation.y = R; w.group.add(cloth); }
  }
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
    ['olive_a', 8, -64, 2.6], ['cypress_b', -9, -72, 0], ['cypress_b', 9, -72, 0], ['olive_a', -92, -8, 0.2], ['olive_b', 96, -62, 1.4], ['bush_b', -40.5, -38.5, 0], ['bush_b', -40.6, -53.6, 1], ['olive_b', 62, 22, 0.5], ['olive_a', -64, 22.5, 1.9]]
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
  for (const f of sites.flames) {
    const a = f.anchor('flame');
    game.addFlame(a.x, f.id === 'brazier' ? f.y + 1.2 : f.y + 2.5, a.z, f.id === 'brazier' ? { power: 34 } : { power: 22, base: f.y + 2.3, smoke: 0.6 });
  }
  if (sites.home) { const h = sites.home.hearth, a = h.anchor('flame'); game.addFlame(a.x, h.y + 1.2, a.z, { power: 12, always: true, size: 1.1 }); }   // the house's hearth
  // The workshop's hearth burns by day as well as by night.
  if (sites.workshop) { const a = sites.workshop.forge.anchor('flame'); game.addFlame(a.x, a.y + 0.2, a.z, { power: 16, base: a.y - 0.04, always: true, size: 1.2 }); }
  kit.zone('lydia').visible = false;

  game.mapLabels = [{ text: 'Harbor', x: 0, z: 47 }, { text: 'Agora', x: 0, z: -4 }, { text: 'House of Cephalus', x: -50, z: -60 }, { text: 'Shrine of Bendis', x: 52, z: 6 }, { text: 'Schoolroom', x: 17, z: -31 }, { text: 'Shield workshop', x: -24, z: -64 }, { text: 'Ship captain’s house', x: 18, z: 31 }, { text: 'North gate', x: 0, z: -88 },
    { text: 'Cave hill', x: -40, z: -246 }, { text: 'Stone seat', x: -14, z: -206 }, { text: 'Site of the city in speech', x: 130, z: -182 },
    { text: 'Shepherd’s hut', x: lyd[0] - 6, z: lyd[1] - 26, lydia: true }, { text: 'The king’s hall', x: lyd[0] - 28, z: lyd[1] + 36, lydia: true }, { text: 'Pasture', x: lyd[0] + 26, z: lyd[1] - 24, lydia: true },
    // the four folds of the nights before and after the ring (story_ring_nights.js)
    { text: 'Your fold', x: lyd[0] - 6, z: lyd[1] - 34, lydia: true }, { text: 'Old shepherd’s fold', x: lyd[0] + 10, z: lyd[1] - 42, lydia: true },
    { text: 'Young shepherd’s fold', x: lyd[0] - 30, z: lyd[1] - 10, lydia: true }, { text: 'Big shepherd’s fold', x: lyd[0] + 22, z: lyd[1] + 6, lydia: true }];
  return sites;
}

function pathAt(path, t) {
  let total = 0; const seg = [];
  for (let i = 0; i < path.length - 1; i++) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); seg.push(l); total += l; }
  let d = t * total;
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const k = d / seg[i]; return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k]; } d -= seg[i]; }
  return path[path.length - 1];
}
