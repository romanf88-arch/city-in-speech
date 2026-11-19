// Boats that move (2026-11-19, one of the first-five-minutes changes). A small boat rowed slowly round the water
// between the two piers, and a merchant ship under sail crossing the bay beyond the harbor. Both rise, fall and rock
// as the moored ships do (layout.js). The rower faces the stern, as rowers do, and the oars follow his stroke.
import * as THREE from 'three';
import { Actor, rowPull } from './actors.js';

export function setupHarborBoats(g) {
  const kit = g.kit, w = g.world, wood = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  const boats = [];
  const afloat = (id, y) => { const o = kit.spawn(id, 0, 0, 0, { y, noCollide: true }), rock = new THREE.Group(); while (o.children.length) rock.add(o.children[0]); o.add(rock); return { o, rock, y }; };

  // ---- the rowboat: an ellipse 64 m by 32 m between the piers (their inner faces are at x = -56.5 and 56.5), clear
  // of the ship at the quay (to z 79), at about 1.1 m/s, so once round takes a little over two minutes.
  const row = afloat('boat_small', 0.1);
  const rower = new Actor({ skin: 'tan', hair: 0x2e2218, beard: 'short', dress: 'exomis', length: 'short', robe: 0x8a7a5e, hat: 'none' }, 4311);
  rower.place(0, -0.35, Math.PI, 0.22); rower.setActivity('row', { phase: 0 }); row.rock.add(rower.group);
  const oars = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.74, 0.62, -0.15);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.9, 6), wood); shaft.rotation.z = Math.PI / 2; shaft.position.x = side * 0.7;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.14), wood); blade.position.x = side * 1.95;
    shaft.castShadow = blade.castShadow = true; pivot.add(shaft, blade); row.rock.add(pivot);
    return { pivot, side };
  });
  const R = { cx: 0, cz: 100, rx: 32, rz: 16, speed: 1.1, a: 0.6 };
  boats.push({ b: row, k: 1.6, ph: 0.3, step(dt) {
    R.a += dt * R.speed / Math.hypot(R.rx * Math.sin(R.a), R.rz * Math.cos(R.a));
    const x = R.cx + R.rx * Math.cos(R.a), z = R.cz + R.rz * Math.sin(R.a), dx = -R.rx * Math.sin(R.a), dz = R.rz * Math.cos(R.a);
    row.o.position.x = x; row.o.position.z = z; row.o.rotation.y = Math.atan2(dx, dz);
    // The oars: at the catch the blades point toward the bow; on the pull they sweep aft through the water, and on
    // the return they come forward raised. (The boat moves toward its local +z; the rower faces -z.)
    const p = rowPull(rower.actT || 0), pulling = p >= (R.prevP != null ? R.prevP : p); R.prevP = p;
    for (const o of oars) {
      o.dip = (o.dip || 0) + ((pulling ? 0.32 : -0.03) - (o.dip || 0)) * Math.min(1, dt * 7);
      o.pivot.rotation.y = o.side * (-0.6 + 1.1 * p); o.pivot.rotation.z = -o.side * o.dip;
    }
    return [x, z];
  } });

  // ---- the merchant ship under sail, crossing the mouth of the bay from west to east 185 m out, at 2.2 m/s; past
  // 330 m it starts again from the west, out in the haze.
  const ship = afloat('ship_merchant', 0.15);
  const cloth = new THREE.MeshLambertMaterial({ color: 0xe6d8bb, side: THREE.DoubleSide });
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 6.4, 14, 8), cloth), sp = sail.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) { const u = sp.getX(i) / 7.4 + 0.5, v = sp.getY(i) / 6.4 + 0.5; sp.setZ(i, 0.95 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.25 + 0.75 * v))); }
  sail.geometry.computeVertexNormals(); sail.position.set(0.1, 7.5, 1.1); sail.castShadow = true; ship.rock.add(sail);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8.2, 6), wood); yard.rotation.z = Math.PI / 2; yard.position.set(0.1, 10.7, 1.0); ship.rock.add(yard);
  const S = { x: -150, z: 185, speed: 2.2 };
  boats.push({ b: ship, k: 0.8, ph: 1.7, step(dt) {
    S.x += dt * S.speed; if (S.x > 330) S.x = -330;
    ship.o.position.x = S.x; ship.o.position.z = S.z; ship.o.rotation.y = Math.PI / 2;
    return [S.x, S.z];
  } });

  g.tickers.push((dt) => {
    const t = g.time, p = g.player, near = g.space === 'world';
    for (const B of boats) {
      const [x, z] = B.step(dt), o = B.b.o, rk = B.b.rock;
      o.visible = near;
      o.position.y = B.b.y + (Math.sin(t * 0.55 + B.ph) * 0.05 + Math.sin(t * 0.93 + B.ph * 1.7) * 0.025) * B.k;
      rk.rotation.z = (Math.sin(t * 0.62 + B.ph) * 0.02 + Math.sin(t * 1.1 + B.ph * 2.1) * 0.008) * B.k;
      rk.rotation.x = Math.sin(t * 0.47 + B.ph * 1.3) * 0.009 * B.k;
      if (B.b === row) { const d = Math.hypot(x - p.x, z - p.z); rower.setDistance(d); if (d < 120 && near) rower.queue(dt); }
    }
  });
  g.harborBoats = { row, ship, rower };
}
