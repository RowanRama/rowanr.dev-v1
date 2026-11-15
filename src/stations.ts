import * as THREE from 'three';
import { createAmpfCell, createSwarm } from './ampf';
import { ball, box, createDrone, createFigure, createRover, cyl, glow, mat, mesh, signSprite } from './models';
import { baseHeight, heightAt, pathAt, rng, type Pad } from './world';

export interface Collider {
  x: number;
  z: number;
  r: number;
}
interface Ctx {
  group: THREE.Group;
  /** terrain height under a local point, in the group's frame */
  ground(lx: number, lz: number): number;
}
interface Built {
  colliders?: Collider[]; // local
  update?(dt: number, time: number, near: boolean): void;
}
interface Def {
  id: string;
  /** scenery has no card, no timeline dot and no checkpoint; it's just somewhere on the island */
  scenery?: { at?: [number, number] }; // at = [angle in degrees, radius]
  u: number;
  side: number; // 1 = downhill of the road, -1 = uphill, 0 = on the road
  offset: number;
  padR: number;
  signY: number;
  build(c: Ctx): Built;
}

export interface Station {
  id: string;
  onTimeline: boolean;
  u: number;
  group: THREE.Group;
  stop: THREE.Vector3; // where the AMR should be to read it
  colliders: Collider[];
  update(dt: number, time: number, near: boolean): void;
  ring: THREE.Mesh;
}

// ---------- builders ----------

function intro({ group, ground }: Ctx): Built {
  for (const x of [-5.6, 5.6]) {
    for (let i = 0; i < 6; i++) group.add(box(0.6, 1, 0.6, i % 2 ? '#1b1e21' : '#f2c230', x, 0.5 + i, 0));
  }
  group.add(box(11.8, 0.9, 0.7, mat('#1b1e21'), 0, 6.4, 0));
  group.add(box(11.4, 0.5, 0.74, glow('#36d1ff', 0.8), 0, 6.4, 0));
  // beach umbrellas near the start line
  const r = rng(5);
  for (let i = 0; i < 3; i++) {
    const u = new THREE.Group();
    u.add(cyl(0.06, 0.06, 2.6, '#e9eef2', 0, 1.3, 0, 6));
    u.add(mesh(new THREE.ConeGeometry(1.6, 0.7, 8), mat(['#ff6b6b', '#ffd43b', '#4dabf7'][i]), 0, 2.7, 0));
    const ux = 13 + r() * 5;
    const uz = -6 + i * 5;
    u.position.set(ux, ground(ux, uz), uz);
    group.add(u);
  }
  return {};
}

function dive({ group, ground }: Ctx): Built {
  // pier out over the water, then a reef on the sea floor
  const deck = 1.1;
  for (let i = 0; i < 9; i++) {
    group.add(box(3, 0.18, 1.9, mat('#a8794f'), 0, deck, 2 - i * 2));
    for (const x of [-1.4, 1.4]) group.add(cyl(0.14, 0.14, deck + 6, '#6b4a32', x, (deck - 6) / 2, 2 - i * 2, 6));
  }
  const r = rng(11);
  const coralColors = ['#ff6f61', '#ff9f43', '#c56cf0', '#ffd166', '#ef476f', '#06d6a0'];
  for (let i = 0; i < 46; i++) {
    const x = (r() - 0.5) * 26;
    const z = -14 - r() * 18;
    const y = ground(x, z);
    if (y > -1) continue;
    const c = coralColors[i % coralColors.length];
    const kind = i % 3;
    if (kind === 0) {
      for (let b = 0; b < 4; b++) {
        const br = cyl(0.12, 0.18, 1.2 + r(), c, x + (r() - 0.5) * 0.6, y + 0.6, z + (r() - 0.5) * 0.6, 5);
        br.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
        group.add(br);
      }
    } else if (kind === 1) {
      group.add(ball(0.5 + r() * 0.6, c, x, y + 0.3, z, 1));
    } else {
      const fan = mesh(new THREE.CircleGeometry(0.9, 7, 0, Math.PI), mat(c, { side: THREE.DoubleSide }), x, y + 0.1, z);
      fan.rotation.y = r() * 3;
      group.add(fan);
    }
  }
  const fish: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const f = mesh(new THREE.ConeGeometry(0.18, 0.6, 5).rotateZ(-Math.PI / 2), mat(i % 2 ? '#ffd43b' : '#4dabf7'));
    f.userData = { cx: (r() - 0.5) * 10, cz: -22 + (r() - 0.5) * 8, rad: 2 + r() * 4, sp: 0.4 + r() * 0.6, y: -2.2 - r() * 2, ph: r() * 6 };
    group.add(f);
    fish.push(f);
  }
  const diver = createFigure('#1b1e21', { pants: '#1b1e21', skin: '#1b1e21' });
  diver.root.add(box(0.3, 0.7, 0.34, mat('#f2c230'), -0.32, 1.35, 0)); // tank
  diver.root.rotation.z = -Math.PI / 2 + 0.15;
  group.add(diver.root);
  const bubbles: THREE.Mesh[] = [];
  const bubbleMat = mat('#e6fbff', { transparent: true, opacity: 0.6 });
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + i * 0.008, 0), bubbleMat);
    b.userData.ph = i / 10;
    group.add(b);
    bubbles.push(b);
  }
  // diver-down buoy
  const buoy = new THREE.Group();
  buoy.add(cyl(0.4, 0.4, 0.5, '#ff6b6b', 0, 0, 0, 10));
  buoy.add(cyl(0.04, 0.04, 1.6, '#e9eef2', 0, 0.9, 0, 6));
  buoy.add(box(0.9, 0.6, 0.04, mat('#e03131'), 0.45, 1.4, 0));
  const stripe = box(1.0, 0.12, 0.05, mat('#ffffff'), 0.45, 1.4, 0);
  stripe.rotation.z = -0.55;
  buoy.add(stripe);
  group.add(buoy);
  return {
    update(dt, time) {
      for (const f of fish) {
        const d = f.userData;
        const a = time * d.sp + d.ph;
        f.position.set(d.cx + Math.cos(a) * d.rad, d.y + Math.sin(a * 2) * 0.2, d.cz + Math.sin(a) * d.rad);
        f.rotation.y = -a - Math.PI;
      }
      const dz = -20 + Math.sin(time * 0.25) * 4;
      diver.root.position.set(Math.sin(time * 0.2) * 5, -3.2, dz);
      diver.legL.rotation.z = Math.sin(time * 4) * 0.35;
      diver.legR.rotation.z = -Math.sin(time * 4) * 0.35;
      for (const b of bubbles) {
        const k = (time * 0.35 + b.userData.ph) % 1;
        b.position.set(diver.root.position.x - 0.9 + Math.sin(k * 12) * 0.15, -3 + k * 3, dz);
      }
      buoy.position.set(3, Math.sin(time * 1.4) * 0.12, -18);
      buoy.rotation.z = Math.sin(time * 1.1) * 0.08;
    },
  };
}

function unsw({ group }: Ctx): Built {
  const stone = '#dcc095';
  group.add(box(15, 6, 7, mat(stone), 0, 3, -4));
  group.add(box(15.6, 0.5, 7.6, mat('#c4a77a'), 0, 6.2, -4));
  const roof = mesh(new THREE.CylinderGeometry(0.01, 4.4, 2.4, 4, 1).rotateY(Math.PI / 4), mat('#8a5a44'));
  roof.scale.set(2.5, 1, 1.15);
  roof.position.set(0, 7.6, -4);
  group.add(roof);
  for (let i = 0; i < 6; i++) group.add(cyl(0.35, 0.4, 5.4, '#efe1c4', -5.5 + i * 2.2, 2.7, -0.2, 8));
  for (let i = 0; i < 7; i++) {
    group.add(box(1, 1.4, 0.1, mat('#33495c'), -6 + i * 2, 4.4, -0.45));
  }
  group.add(box(3.2, 13, 3.2, mat(stone), 9, 6.5, -5));
  group.add(mesh(new THREE.ConeGeometry(2.4, 3, 4).rotateY(Math.PI / 4), mat('#8a5a44'), 9, 14.5, -5));
  group.add(cyl(1.1, 1.1, 0.12, '#f7f3ea', 9, 10.5, -3.36, 20).rotateX(Math.PI / 2));
  group.add(box(0.08, 0.8, 0.05, mat('#1b1e21'), 9, 10.7, -3.25));
  // a few students
  const people = [createFigure('#ffd43b'), createFigure('#4dabf7'), createFigure('#ff6b6b')];
  people.forEach((p, i) => {
    p.root.position.set(-4 + i * 3.5, 0, 3 + (i % 2));
    p.root.rotation.y = i * 1.3;
    group.add(p.root);
  });
  return {
    colliders: [
      { x: -3, z: -4, r: 5 },
      { x: 3, z: -4, r: 5 },
      { x: 9, z: -5, r: 2.6 },
    ],
    update(_dt, time) {
      people.forEach((p, i) => {
        p.armR.rotation.z = Math.sin(time * 2 + i) * 0.4;
      });
    },
  };
}

function rover({ group }: Ctx): Built {
  const ground = mesh(new THREE.CircleGeometry(9, 9).rotateX(-Math.PI / 2), mat('#b5603a'), 0, 0.06, 0);
  ground.castShadow = false;
  group.add(ground);
  const r = rng(21);
  for (let i = 0; i < 10; i++) {
    const a = r() * 6.28;
    const rad = 3 + r() * 5;
    group.add(ball(0.3 + r() * 0.5, '#8c4a2f', Math.cos(a) * rad, 0.2, Math.sin(a) * rad, 0));
  }
  const rv = createRover();
  rv.root.scale.setScalar(2.2);
  group.add(rv.root);
  return {
    update(dt, time) {
      const a = time * 0.25;
      rv.root.position.set(Math.sin(a) * 4.5, 0.06, Math.sin(a * 2) * 2.2);
      const dx = Math.cos(a) * 4.5;
      const dz = Math.cos(a * 2) * 4.4;
      rv.root.rotation.y = Math.atan2(-dz, dx);
      for (const w of rv.wheels) w.rotation.y += dt * 2;
      rv.head.rotation.y = Math.sin(time * 0.7) * 0.8;
    },
  };
}

function subt({ group }: Ctx): Built {
  const r = rng(31);
  const rock = mat('#5b5650');
  for (let i = 0; i < 16; i++) {
    const a = (i / 15) * Math.PI;
    const rad = 6.5 + r() * 0.8;
    const s = 1.8 + r() * 1.2;
    const m = mesh(new THREE.DodecahedronGeometry(s, 0), rock, Math.cos(a) * rad, Math.sin(a) * rad, -4 + r());
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    group.add(m);
  }
  group.add(box(10, 8, 6, mat('#121416', { roughness: 1 }), 0, 3, -7.6));
  group.add(box(9.6, 0.2, 12, mat('#3c3935'), 0, 0.1, -4));
  // a couple of rescue-style artefacts to find
  group.add(box(0.8, 0.5, 0.5, mat('#d9480f'), -2.5, 0.35, -5));
  group.add(cyl(0.4, 0.4, 1.1, '#e03131', 2.6, 0.55, -6, 10));
  const drone = createDrone({ gimbal: true, scale: 2.2, color: '#3b4148' });
  group.add(drone.root);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 9, 20, 1, true).translate(0, -4.5, 0).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  );
  const head = drone.gimbal!.userData.head as THREE.Group;
  head.add(cone);
  cone.scale.setScalar(1 / 2.2);
  cone.position.x = 0.12;
  return {
    colliders: [
      { x: -6.5, z: -4, r: 2.5 },
      { x: 6.5, z: -4, r: 2.5 },
      { x: 0, z: -8, r: 5 },
    ],
    update(dt, time) {
      drone.update(dt);
      drone.root.position.set(Math.sin(time * 0.4) * 2.5, 4 + Math.sin(time * 1.3) * 0.25, -1.5 + Math.cos(time * 0.4) * 1.5);
      drone.root.rotation.y = Math.PI / 2 + Math.sin(time * 0.4) * 0.4;
      drone.gimbal!.rotation.y = Math.sin(time * 0.9) * 1.1;
      head.rotation.z = -0.35 + Math.sin(time * 0.6) * 0.25;
    },
  };
}

function thesis({ group }: Ctx): Built {
  const steel = '#9aa3ab';
  const Ht = 18;
  const legs: [number, number][] = [
    [-1.6, -1.6],
    [1.6, -1.6],
    [1.6, 1.6],
    [-1.6, 1.6],
  ];
  const tower = new THREE.Group();
  for (const [x, z] of legs) {
    const leg = cyl(0.12, 0.16, Ht, steel, x * 0.6, Ht / 2, z * 0.6, 5);
    leg.rotation.set(z * 0.025, 0, -x * 0.025);
    tower.add(leg);
  }
  for (let y = 2; y < Ht; y += 3) {
    const w = 3.2 * (1 - (y / Ht) * 0.4);
    tower.add(box(w, 0.1, 0.1, mat(steel), 0, y, w / 2 - 0.05));
    tower.add(box(w, 0.1, 0.1, mat(steel), 0, y, -w / 2 + 0.05));
    tower.add(box(0.1, 0.1, w, mat(steel), w / 2 - 0.05, y, 0));
    tower.add(box(0.1, 0.1, w, mat(steel), -w / 2 + 0.05, y, 0));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const panel = box(0.5, 2, 0.2, mat('#e9eef2'), Math.cos(a) * 1.4, Ht - 2.5, Math.sin(a) * 1.4);
    panel.rotation.y = -a;
    tower.add(panel);
  }
  tower.add(cyl(0.05, 0.05, 3, glow('#ff6b6b', 1), 0, Ht + 1.5, 0, 6));
  group.add(tower);

  // a point cloud of the tower, revealed as the drone sweeps around it
  const r = rng(77);
  const pts: { a: number; p: THREE.Vector3 }[] = [];
  for (let i = 0; i < 2400; i++) {
    const y = r() * (Ht + 1);
    const w = 1.6 * (1 - (y / Ht) * 0.4);
    const side = Math.floor(r() * 4);
    const s = (r() * 2 - 1) * w;
    const p = [new THREE.Vector3(s, y, w), new THREE.Vector3(s, y, -w), new THREE.Vector3(w, y, s), new THREE.Vector3(-w, y, s)][side];
    p.x += (r() - 0.5) * 0.15;
    p.z += (r() - 0.5) * 0.15;
    pts.push({ a: (Math.atan2(p.z, p.x) + Math.PI * 2) % (Math.PI * 2), p });
  }
  pts.sort((a, b) => a.a - b.a);
  const pos = new Float32Array(pts.length * 3);
  const col = new Float32Array(pts.length * 3);
  const c = new THREE.Color();
  pts.forEach((q, i) => {
    q.p.toArray(pos, i * 3);
    c.setHSL(0.62 - (q.p.y / Ht) * 0.62, 0.9, 0.55).toArray(col, i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true }));
  cloud.position.x = 0.01;
  group.add(cloud);
  const drone = createDrone({ gimbal: true, scale: 1.8 });
  group.add(drone.root);
  return {
    colliders: [{ x: 0, z: 0, r: 2.4 }],
    update(dt, time) {
      drone.update(dt);
      const a = (time * 0.35) % (Math.PI * 4);
      const sweep = Math.min(a, Math.PI * 2);
      drone.root.position.set(Math.cos(a) * 7, 6 + Math.sin(time * 0.5) * 4 + 4, Math.sin(a) * 7);
      drone.root.rotation.y = -a + Math.PI;
      geo.setDrawRange(0, Math.floor((sweep / (Math.PI * 2)) * pts.length));
    },
  };
}

function hike({ group, ground }: Ctx): Built {
  group.add(cyl(0.12, 0.12, 2.2, '#6b4a32', 3, 1.1, 2, 6));
  group.add(box(1.6, 0.5, 0.1, mat('#8a5a32'), 3.6, 1.9, 2));
  for (let i = 0; i < 5; i++) group.add(ball(0.55 - i * 0.08, '#8e8780', -3, 0.35 + i * 0.5, -2, 0));
  const tent = mesh(new THREE.CylinderGeometry(0.01, 2.2, 2.2, 4).rotateY(Math.PI / 4), mat('#ff922b'), 2, 1.1, -4);
  group.add(tent);
  const hiker = createFigure('#2f9e44', { pants: '#495057' });
  hiker.hip.add(box(0.5, 0.7, 0.35, mat('#c92a2a'), -0.36, 0.5, 0));
  group.add(hiker.root);
  return {
    update(_dt, time) {
      const k = Math.sin(time * 0.3);
      const x = k * 6;
      const z = -1 + Math.cos(time * 0.3) * 1.5;
      hiker.root.position.set(x, ground(x, z), z);
      hiker.root.rotation.y = Math.cos(time * 0.3) > 0 ? 0 : Math.PI;
      const s = Math.sin(time * 5) * 0.5;
      hiker.legL.rotation.z = s;
      hiker.legR.rotation.z = -s;
      hiker.armL.rotation.z = -s * 0.8;
      hiker.armR.rotation.z = s * 0.8;
    },
  };
}

function sim({ group }: Ctx): Built {
  const mast = new THREE.Group();
  mast.add(cyl(0.25, 0.45, 11, '#c9ced3', 0, 5.5, 0, 6));
  for (let y = 3; y < 11; y += 2.5) mast.add(box(1.4, 0.12, 0.12, mat('#c9ced3'), 0, y, 0));
  const dish = mesh(new THREE.SphereGeometry(1.6, 14, 6, 0, Math.PI * 2, 0, 0.9), mat('#f1f3f5', { side: THREE.DoubleSide }), 0.6, 9, 0);
  dish.rotation.z = -Math.PI / 2 - 0.3;
  mast.add(dish);
  mast.add(cyl(0.06, 0.06, 1.6, glow('#ffd43b', 1.2), 0, 11.8, 0, 6));
  group.add(mast);
  const rx = new THREE.Group();
  rx.add(cyl(0.15, 0.25, 5, '#c9ced3', 0, 2.5, 0, 6));
  const rxLight = mesh(new THREE.OctahedronGeometry(0.4), mat('#5fd4c4'), 0, 5.4, 0);
  rx.add(rxLight);
  rx.position.set(-9, 0, -2);
  group.add(rx);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.05, 4, 48).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, depthWrite: false }),
    );
    ring.userData.ph = i / 4;
    group.add(ring);
    rings.push(ring);
  }
  return {
    colliders: [{ x: 0, z: 0, r: 1.4 }],
    update(_dt, time) {
      let hit = 0;
      for (const ring of rings) {
        const k = (time * 0.18 + ring.userData.ph) % 1;
        const rad = 1 + k * 14;
        ring.scale.setScalar(rad);
        // the wave bends back toward the ground as it travels, like a ducted signal
        ring.position.y = 9 - k * k * 6;
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
        if (Math.abs(rad - 9.2) < 0.8) hit = 1;
      }
      rxLight.material = hit ? glow('#5fd4c4', 2) : mat('#5fd4c4');
    },
  };
}

function gatech({ group }: Ctx): Built {
  const brick = '#9c4a35';
  group.add(box(14, 7, 7, mat(brick), -2, 3.5, -5));
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 2; j++) group.add(box(1.1, 1.5, 0.1, mat('#f1e6c8'), -7.5 + i * 2.2, 2.2 + j * 2.6, -1.45));
  group.add(box(14.4, 0.5, 7.4, mat('#e9dfc7'), -2, 7.2, -5));
  group.add(box(3.4, 15, 3.4, mat(brick), 7, 7.5, -6));
  group.add(box(3.8, 0.6, 3.8, mat('#e9dfc7'), 7, 15.2, -6));
  group.add(mesh(new THREE.ConeGeometry(2.2, 4, 4).rotateY(Math.PI / 4), mat('#c9a227', { metalness: 0.5, roughness: 0.35 }), 7, 17.5, -6));
  for (const [x, y] of [
    [7, 12],
    [7, 9],
  ])
    group.add(box(1.4, 1.8, 0.1, mat('#f1e6c8'), x, y, -4.25));
  // graduates, caps on
  const grads = [createFigure('#1b2a4a'), createFigure('#1b2a4a')];
  grads.forEach((g, i) => {
    g.hip.add(box(0.6, 0.06, 0.6, mat('#1b1e21'), 0, 1.2, 0));
    g.root.position.set(-3 + i * 2, 0, 2);
    group.add(g.root);
  });
  return {
    colliders: [
      { x: -5, z: -5, r: 4.5 },
      { x: 1, z: -5, r: 4.5 },
      { x: 7, z: -6, r: 2.6 },
    ],
    update(_dt, time) {
      grads.forEach((g, i) => {
        const hop = Math.max(0, Math.sin(time * 2.2 + i * 1.5));
        g.root.position.y = hop * 0.5;
        g.armL.rotation.x = -hop * 2.6;
        g.armR.rotation.x = hop * 2.6;
      });
    },
  };
}

function hands({ group }: Ctx): Built {
  const cell = new THREE.Group();
  cell.scale.setScalar(3);
  group.add(cell);
  cell.add(cyl(0.6, 0.7, 0.9, '#3a3f45', 0, 0.45, 0, 12));
  cell.add(cyl(0.55, 0.55, 0.1, '#dee2e6', 0, 0.95, 0, 16));
  const soft = mat('#ff8fab', { roughness: 0.35, transparent: true, opacity: 0.92 });
  const tendon = mat('#3a3f45');
  const fingers: THREE.Group[][] = [];
  for (let f = 0; f < 3; f++) {
    const a = (f / 3) * Math.PI * 2;
    const baseG = new THREE.Group();
    baseG.position.set(Math.cos(a) * 0.38, 1.0, Math.sin(a) * 0.38);
    baseG.rotation.y = -a;
    cell.add(baseG);
    const chain: THREE.Group[] = [];
    let parent: THREE.Object3D = baseG;
    for (let s = 0; s < 8; s++) {
      const seg = new THREE.Group();
      seg.position.y = s === 0 ? 0 : 0.13;
      const r0 = 0.085 - s * 0.006;
      seg.add(mesh(new THREE.CylinderGeometry(r0 * 0.92, r0, 0.13, 8).translate(0, 0.065, 0), soft));
      seg.add(mesh(new THREE.BoxGeometry(0.015, 0.13, 0.015).translate(r0 * 0.8, 0.065, 0), tendon));
      parent.add(seg);
      chain.push(seg);
      parent = seg;
    }
    fingers.push(chain);
  }
  const obj = ball(0.2, '#ffd43b', 0, 1.35, 0, 1);
  cell.add(obj);
  return {
    colliders: [{ x: 0, z: 0, r: 2.4 }],
    update(_dt, time) {
      const grip = 0.5 + 0.5 * Math.sin(time * 0.8);
      fingers.forEach((chain, i) => {
        chain.forEach((seg, s) => {
          seg.rotation.z = (0.05 + grip * 0.2) * (s / 4 + 0.4) + Math.sin(time * 2 + i + s * 0.3) * 0.015;
        });
      });
      obj.position.y = 1.3 + grip * 0.25;
      obj.rotation.y = time * grip;
    },
  };
}

function climb({ group }: Ctx): Built {
  const r = rng(51);
  const rock = [mat('#7d756d'), mat('#6a625b'), mat('#8f8780')];
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 12;
    const y = r() * 16;
    const s = 2 + r() * 2.2;
    const m = mesh(new THREE.DodecahedronGeometry(s, 0), rock[i % 3], x, y, -6.5 - r() * 2 + y * 0.12);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    group.add(m);
  }
  group.add(box(12, 18, 3, rock[1], 0, 9, -7.8));
  const holdColors = ['#ff6b6b', '#ffd43b', '#4dabf7', '#51cf66', '#cc5de8'];
  for (let i = 0; i < 26; i++) group.add(ball(0.2, holdColors[i % 5], -1.2 + (r() - 0.5) * 3, 0.8 + i * 0.55, -4.9 + i * 0.04, 0));
  const climber = createFigure('#ff922b', { helmet: '#e03131' });
  climber.root.rotation.y = Math.PI / 2;
  group.add(climber.root);
  const belayer = createFigure('#228be6', { helmet: '#fab005' });
  belayer.root.position.set(2, 0, -2);
  belayer.root.rotation.y = Math.PI / 2 + 0.4;
  group.add(belayer.root);
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: '#ffe066' }));
  group.add(rope);
  const anchor = new THREE.Vector3(-1.2, 15.5, -4.4);
  group.add(ball(0.18, '#c9ced3', anchor.x, anchor.y, anchor.z, 0));
  return {
    colliders: [
      { x: -3, z: -7, r: 4 },
      { x: 3, z: -7, r: 4 },
    ],
    update(_dt, time) {
      const k = (Math.sin(time * 0.15) + 1) / 2;
      const y = 0.6 + k * 12;
      climber.root.position.set(-1.2 + Math.sin(y * 1.3) * 0.4, y, -4.1 + y * 0.04);
      const s = Math.sin(time * 2.4);
      climber.armL.rotation.x = -2.4 + s * 0.4;
      climber.armR.rotation.x = 2.4 + s * 0.4;
      climber.legL.rotation.x = -0.4 + s * 0.3;
      climber.legR.rotation.x = 0.4 + s * 0.3;
      const p = ropeGeo.attributes.position as THREE.BufferAttribute;
      p.setXYZ(0, belayer.root.position.x, 1.4, belayer.root.position.z);
      p.setXYZ(1, anchor.x, anchor.y, anchor.z);
      p.setXYZ(2, climber.root.position.x, climber.root.position.y + 1.1, climber.root.position.z);
      p.needsUpdate = true;
    },
  };
}

function ampf({ group, ground }: Ctx): Built {
  const gantt = document.querySelector<HTMLCanvasElement>('#ampf .gantt');
  const cell = createAmpfCell(gantt);
  cell.root.scale.setScalar(4.4);
  cell.root.position.z = 1;
  group.add(cell.root);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 0.95 + (i / 7) * Math.PI * 1.1;
    const x = Math.cos(a) * 17;
    const z = Math.sin(a) * 12 - 2;
    points.push(new THREE.Vector3(x, ground(x, z), z));
  }
  const swarm = createSwarm(points, ['#ff922b', '#4dabf7', '#51cf66']);
  group.add(swarm.root);
  const demo = document.querySelector<HTMLElement>('#ampf .demo');
  demo?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-demo]');
    if (!btn) return;
    if (btn.dataset.demo === 'drop') cell.dropB();
    else cell.reset();
    sync();
  });
  const dropBtn = demo?.querySelector<HTMLButtonElement>('[data-demo="drop"]');
  const sync = () => {
    if (dropBtn) dropBtn.disabled = !cell.bOnline;
  };
  let wasOnline = true;
  let ganttTick = 0;
  return {
    colliders: [
      { x: -3.4, z: 0, r: 4.6 },
      { x: 3.4, z: 0, r: 4.6 },
    ],
    update(dt, time, near) {
      cell.update(dt);
      swarm.update(dt, time);
      ganttTick += dt;
      if (near || ganttTick > 0.2) {
        ganttTick = 0;
        cell.drawGantt();
      }
      if (wasOnline !== cell.bOnline) {
        wasOnline = cell.bOnline;
        sync();
      }
    },
  };
}

function workshop({ group }: Ctx): Built {
  const wall = mat('#d8dde2');
  group.add(box(14, 0.2, 8, mat('#868e96'), 0, 0.1, -3));
  group.add(box(14, 5, 0.3, wall, 0, 2.5, -7));
  group.add(box(0.3, 5, 8, wall, -7, 2.5, -3));
  group.add(box(0.3, 5, 8, wall, 7, 2.5, -3));
  const roof = box(15, 0.3, 9, mat('#495057'), 0, 5.2, -3);
  roof.rotation.x = 0.06;
  group.add(roof);

  // PLC cabinet with slow-blinking I/O lights
  group.add(box(2.4, 3.2, 0.9, mat('#c9ced3'), -4.5, 1.6, -6.2));
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const led = box(0.12, 0.12, 0.05, mat('#2b8a3e'), -5.3 + (i % 8) * 0.22, 2.4 + Math.floor(i / 8) * 0.3, -5.72);
    leds.push(led);
    group.add(led);
  }
  for (let i = 0; i < 5; i++) group.add(box(0.36, 1.1, 0.5, mat('#343a40'), -5.3 + i * 0.4, 1.4, -5.8));

  // pen plotter: a gantry tracing a figure on paper
  group.add(box(3.2, 0.9, 2.2, mat('#495057'), 1, 0.45, -4.5));
  group.add(box(2.8, 0.02, 1.8, mat('#ffffff'), 1, 0.91, -4.5));
  const gantry = box(0.12, 0.3, 2, mat('#f2c230'), 1, 1.1, -4.5);
  group.add(gantry);
  const head = box(0.25, 0.4, 0.25, mat('#1b1e21'), 1, 1.15, -4.5);
  group.add(head);
  const N = 300;
  const tracePos = new Float32Array(N * 3);
  const traceGeo = new THREE.BufferGeometry();
  traceGeo.setAttribute('position', new THREE.BufferAttribute(tracePos, 3));
  const trace = new THREE.Line(traceGeo, new THREE.LineBasicMaterial({ color: '#1b1e21' }));
  group.add(trace);

  // card table and a trading screen
  group.add(cyl(1.2, 1.2, 0.1, '#2b8a3e', 4.6, 1.0, -2.5, 16));
  group.add(cyl(0.12, 0.2, 1, '#6b4a32', 4.6, 0.5, -2.5, 8));
  for (let i = 0; i < 5; i++) {
    const card = box(0.3, 0.02, 0.42, mat(i % 2 ? '#ffffff' : '#ffe3e3'), 4.2 + i * 0.2, 1.07, -2.6 + Math.sin(i) * 0.3);
    card.rotation.y = i * 0.4;
    group.add(card);
  }
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(cv);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(4.6, 3.2, -6.8);
  group.add(screen);
  const series: number[] = [];
  const r = rng(99);
  let v = 64;
  for (let i = 0; i < 64; i++) series.push((v += (r() - 0.48) * 8));
  let tick = 0;
  return {
    colliders: [
      { x: -4, z: -6, r: 3 },
      { x: 4, z: -6, r: 3 },
    ],
    update(dt, time, near) {
      leds.forEach((led, i) => {
        const on = Math.sin(time * 1.2 + i * 1.7) > 0.2;
        led.material = on ? glow('#51cf66', 1.6) : mat('#2b8a3e');
      });
      const px = 1 + Math.sin(time * 0.9) * 1.2;
      const pz = -4.5 + Math.sin(time * 1.3 + 0.5) * 0.75;
      gantry.position.x = px;
      head.position.set(px, 1.15, pz);
      tracePos.copyWithin(0, 3);
      tracePos.set([px, 0.93, pz], (N - 1) * 3);
      traceGeo.attributes.position.needsUpdate = true;
      tick += dt;
      if (near && tick > 0.5) {
        tick = 0;
        series.shift();
        series.push((v = Math.max(20, Math.min(110, v + (r() - 0.48) * 8))));
        g.fillStyle = '#0e1a23';
        g.fillRect(0, 0, 256, 128);
        g.strokeStyle = series.at(-1)! >= series[0] ? '#51cf66' : '#ff6b6b';
        g.lineWidth = 3;
        g.beginPath();
        series.forEach((y, i) => (i ? g.lineTo(i * 4, 128 - y) : g.moveTo(0, 128 - y)));
        g.stroke();
        screenTex.needsUpdate = true;
      }
    },
  };
}

function ski({ group, ground }: Ctx): Built {
  // lift line heading down the slope (outward is -z), skiers carving down beside it
  const pylons: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const z = -4 - i * 11;
    const x = 8;
    const y = ground(x, z);
    group.add(cyl(0.25, 0.35, 7, '#868e96', x, y + 3.5, z, 6));
    group.add(box(3, 0.2, 0.2, mat('#868e96'), x, y + 7, z));
    pylons.push(new THREE.Vector3(x, y + 6.8, z));
  }
  const cablePts = [...pylons.map((p) => p.clone().setX(p.x - 1.3)), ...pylons.slice().reverse().map((p) => p.clone().setX(p.x + 1.3))];
  cablePts.push(cablePts[0].clone());
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cablePts), new THREE.LineBasicMaterial({ color: '#343a40' })));
  const cableLen: number[] = [0];
  for (let i = 1; i < cablePts.length; i++) cableLen.push(cableLen[i - 1] + cablePts[i].distanceTo(cablePts[i - 1]));
  const chairs = Array.from({ length: 6 }, () => {
    const c = new THREE.Group();
    c.add(box(0.05, 1.4, 0.05, mat('#343a40'), 0, -0.7, 0));
    c.add(box(1.2, 0.12, 0.6, mat('#e03131'), 0, -1.4, 0));
    c.add(box(1.2, 0.6, 0.1, mat('#e03131'), 0, -1.1, -0.28));
    group.add(c);
    return c;
  });
  const skiers = ['#e03131', '#1c7ed6', '#f08c00'].map((c) => {
    const f = createFigure(c, { helmet: '#f1f3f5' });
    f.root.add(box(1.8, 0.04, 0.12, mat('#1b1e21'), 0.1, 0.03, 0.13));
    f.root.add(box(1.8, 0.04, 0.12, mat('#1b1e21'), 0.1, 0.03, -0.13));
    f.legL.rotation.z = 0.25;
    f.legR.rotation.z = 0.25;
    group.add(f.root);
    return f;
  });
  const tmp = new THREE.Vector3();
  return {
    colliders: [],
    update(_dt, time) {
      const total = cableLen.at(-1)!;
      chairs.forEach((c, i) => {
        const d = (time * 2 + (i / chairs.length) * total) % total;
        let k = 1;
        while (cableLen[k] < d) k++;
        const f = (d - cableLen[k - 1]) / (cableLen[k] - cableLen[k - 1]);
        c.position.copy(tmp.copy(cablePts[k - 1]).lerp(cablePts[k], f));
      });
      skiers.forEach((s, i) => {
        const k = (time * 0.07 + i / 3) % 1;
        // from up near the summit down toward the road
        const z = -42 + k * 38;
        const x = Math.sin(k * 18 + i) * 5 - 2;
        const dx = Math.cos(k * 18 + i) * 5 * 18;
        s.root.position.set(x, ground(x, z), z);
        s.root.rotation.y = Math.atan2(-38, dx);
        s.hip.rotation.x = Math.cos(k * 18 + i) * 0.3;
      });
    },
  };
}

function summit({ group }: Ctx): Built {
  for (let i = 0; i < 6; i++) group.add(ball(1 - i * 0.12, '#8e8780', 0, 0.6 + i * 0.75, 0, 0));
  group.add(cyl(0.08, 0.08, 6, '#dee2e6', 0, 6, 0, 6));
  const flagGeo = new THREE.PlaneGeometry(3, 1.8, 12, 4).translate(1.5, 0, 0);
  const flag = mesh(flagGeo, mat('#ff922b', { side: THREE.DoubleSide }), 0.05, 8.1, 0);
  group.add(flag);
  const base = (flagGeo.attributes.position.array as Float32Array).slice();
  const drones = [createDrone({ color: '#ff922b', scale: 1.4 }), createDrone({ color: '#4dabf7', scale: 1.4 })];
  drones.forEach((d) => group.add(d.root));
  return {
    colliders: [{ x: 0, z: 0, r: 1.6 }],
    update(dt, time) {
      const p = flagGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        p.setZ(i, Math.sin(x * 2 - time * 4) * 0.18 * (x / 3));
      }
      p.needsUpdate = true;
      flag.geometry.computeVertexNormals();
      drones.forEach((d, i) => {
        d.update(dt);
        const a = time * 0.5 + i * Math.PI;
        d.root.position.set(Math.cos(a) * 9, 10 + Math.sin(time + i) * 1.5, Math.sin(a) * 9);
        d.root.rotation.y = -a;
      });
    },
  };
}

function soccerBall(r: number) {
  const g = new THREE.Group();
  g.add(ball(r, '#ffffff', 0, 0, 0, 1));
  for (const [x, y, z] of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ])
    g.add(ball(r * 0.32, '#1b1e21', x * r * 0.86, y * r * 0.86, z * r * 0.86, 0));
  return g;
}

function soccer({ group }: Ctx): Built {
  const L = 26;
  const Wd = 16;
  for (let i = 0; i < 8; i++) {
    const stripe = box(L / 8, 0.06, Wd, mat(i % 2 ? '#4f9a3c' : '#5aa846'), -L / 2 + L / 16 + (i * L) / 8, 0.03, 0);
    stripe.castShadow = false;
    group.add(stripe);
  }
  const line = mat('#f4f7fa');
  const lw = 0.14;
  group.add(box(L, 0.08, lw, line, 0, 0.05, Wd / 2), box(L, 0.08, lw, line, 0, 0.05, -Wd / 2));
  group.add(box(lw, 0.08, Wd, line, L / 2, 0.05, 0), box(lw, 0.08, Wd, line, -L / 2, 0.05, 0), box(lw, 0.08, Wd, line, 0, 0.05, 0));
  group.add(mesh(new THREE.RingGeometry(2.2, 2.36, 40).rotateX(-Math.PI / 2), line, 0, 0.1, 0));
  for (const sx of [-1, 1]) {
    group.add(box(lw, 0.08, 7, line, sx * (L / 2 - 3.4), 0.05, 0));
    group.add(box(3.4, 0.08, lw, line, sx * (L / 2 - 1.7), 0.05, 3.5), box(3.4, 0.08, lw, line, sx * (L / 2 - 1.7), 0.05, -3.5));
    const goal = new THREE.Group();
    goal.position.x = sx * (L / 2 + 0.1);
    goal.add(cyl(0.08, 0.08, 2.2, '#ffffff', 0, 1.1, 1.9, 6), cyl(0.08, 0.08, 2.2, '#ffffff', 0, 1.1, -1.9, 6));
    const bar = cyl(0.08, 0.08, 3.9, '#ffffff', 0, 2.2, 0, 6);
    bar.rotation.x = Math.PI / 2;
    goal.add(bar);
    const net = mesh(new THREE.PlaneGeometry(3.8, 2.2), mat('#ffffff', { transparent: true, opacity: 0.35, side: THREE.DoubleSide }), sx * 1, 1.1, 0);
    net.rotation.y = Math.PI / 2;
    goal.add(net);
    group.add(goal);
  }
  const spots: [number, number, string][] = [
    [-8, -3, '#e03131'],
    [-4, 4, '#e03131'],
    [-2, -5, '#e03131'],
    [3, 3, '#1c7ed6'],
    [6, -4, '#1c7ed6'],
    [9, 2, '#1c7ed6'],
  ];
  const players = spots.map(([x, z, c]) => {
    const f = createFigure(c, { pants: '#f1f3f5' });
    f.root.position.set(x, 0, z);
    group.add(f.root);
    return { f, home: new THREE.Vector3(x, 0, z) };
  });
  const theBall = soccerBall(0.32);
  group.add(theBall);
  const keeper = createFigure('#fab005');
  keeper.root.position.set(L / 2 - 1, 0, 0);
  keeper.root.rotation.y = Math.PI;
  group.add(keeper.root);
  let from = 0;
  let to = 3;
  let t = 0;
  const r = rng(13);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  return {
    colliders: [
      { x: -L / 2, z: 0, r: 2 },
      { x: L / 2, z: 0, r: 2 },
    ],
    update(dt, time) {
      // the ball gets passed around; whoever has it kicks it on
      t += dt / 1.3;
      if (t >= 1) {
        t = 0;
        from = to;
        let next = Math.floor(r() * players.length);
        if (next === from) next = (next + 1) % players.length;
        to = next;
      }
      a.copy(players[from].f.root.position);
      b.copy(players[to].f.root.position);
      theBall.position.lerpVectors(a, b, t);
      theBall.position.y = 0.32 + Math.sin(t * Math.PI) * 1.4;
      theBall.rotation.x += dt * 8;
      players.forEach((p, i) => {
        const pos = p.f.root.position;
        pos.x = p.home.x + Math.sin(time * 0.6 + i) * 1.2;
        pos.z = p.home.z + Math.cos(time * 0.5 + i * 2) * 1.2;
        p.f.root.rotation.y = Math.atan2(-(theBall.position.z - pos.z), theBall.position.x - pos.x);
        const kick = i === from ? Math.max(0, 1 - t * 4) : 0;
        const run = Math.sin(time * 6 + i) * 0.4;
        p.f.legL.rotation.z = run + kick;
        p.f.legR.rotation.z = -run;
      });
      keeper.root.position.z = THREE.MathUtils.clamp(theBall.position.z, -1.8, 1.8);
    },
  };
}

// ---------- layout along the road ----------
const DEFS: Def[] = [
  { id: 'intro', u: 0.012, side: 0, offset: 0, padR: 0, signY: 9, build: intro },
  { id: 'unsw', u: 0.1, side: 1, offset: 17, padR: 11, signY: 19, build: unsw },
  { id: 'rover', u: 0.17, side: -1, offset: 15, padR: 10, signY: 8, build: rover },
  { id: 'subt', u: 0.24, side: -1, offset: 16, padR: 10, signY: 12, build: subt },
  { id: 'thesis', u: 0.31, side: 1, offset: 16, padR: 9, signY: 24, build: thesis },
  { id: 'sim', u: 0.4, side: 1, offset: 15, padR: 9, signY: 16, build: sim },
  { id: 'gatech', u: 0.49, side: -1, offset: 17, padR: 11, signY: 22, build: gatech },
  { id: 'hands', u: 0.58, side: 1, offset: 13, padR: 7, signY: 9, build: hands },
  { id: 'ampf', u: 0.7, side: 1, offset: 19, padR: 14, signY: 15, build: ampf },
  { id: 'workshop', u: 0.8, side: 1, offset: 15, padR: 10, signY: 10, build: workshop },
  { id: 'summit', u: 1, side: 0, offset: 0, padR: 13, signY: 15, build: summit },
  // interests, scattered around the island
  { id: 'dive', scenery: {}, u: 0.045, side: 1, offset: 20, padR: 0, signY: 6, build: dive },
  { id: 'soccer', scenery: { at: [30, 140] }, u: 0, side: 0, offset: 0, padR: 15, signY: 9, build: soccer },
  { id: 'hike', scenery: { at: [135, 100] }, u: 0, side: 0, offset: 0, padR: 7, signY: 8, build: hike },
  { id: 'climb', scenery: {}, u: 0.645, side: -1, offset: 15, padR: 8, signY: 21, build: climb },
  { id: 'ski', scenery: {}, u: 0.89, side: -1, offset: 13, padR: 7, signY: 10, build: ski },
];

function placement(d: Def) {
  if (d.scenery?.at) {
    const [deg, r] = d.scenery.at;
    const x = Math.cos((deg * Math.PI) / 180) * r;
    const z = Math.sin((deg * Math.PI) / 180) * r;
    const y = baseHeight(x, z);
    return { x, z, y, yaw: Math.atan2(-x, -z), road: new THREE.Vector3(x, y, z) };
  }
  const { p, tangent, out } = pathAt(d.u);
  if (d.id === 'summit') return { x: 0, z: 0, y: p.y, yaw: Math.atan2(tangent.x, tangent.z), road: p };
  if (d.side === 0) return { x: p.x, z: p.z, y: p.y, yaw: Math.atan2(tangent.x, tangent.z), road: p };
  const x = p.x + out.x * d.side * d.offset;
  const z = p.z + out.z * d.side * d.offset;
  const toRoad = new THREE.Vector3(p.x - x, 0, p.z - z).normalize();
  return { x, z, y: d.padR > 0 ? p.y : 0, yaw: Math.atan2(toRoad.x, toRoad.z), road: p };
}

export function stationPads(): Pad[] {
  return DEFS.filter((d) => d.padR > 0).map((d) => {
    const pl = placement(d);
    return { x: pl.x, z: pl.z, y: pl.y, r: d.padR };
  });
}

export function buildStations(scene: THREE.Scene, articles: Map<string, HTMLElement>): Station[] {
  return DEFS.map((d) => {
    const pl = placement(d);
    const group = new THREE.Group();
    group.position.set(pl.x, d.id === 'dive' ? 0 : d.padR > 0 ? pl.y : heightAt(pl.x, pl.z), pl.z);
    group.rotation.y = pl.yaw;
    group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const ground = (lx: number, lz: number) => {
      v.set(lx, 0, lz).applyMatrix4(group.matrixWorld);
      return heightAt(v.x, v.z) - group.position.y;
    };
    const built = d.build({ group, ground });
    const art = articles.get(d.id);
    // interests are unlabelled scenery; only timeline stops get a sign
    if (!d.scenery) {
      const sign = signSprite(art?.dataset.sign ?? d.id);
      sign.position.y = d.signY;
      group.add(sign);
    }
    scene.add(group);

    // checkpoint ring on the road, for timeline stops only
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const stop = d.id === 'summit' ? pathAt(1).p : pl.road.clone();
    ring.position.set(stop.x, stop.y + 0.2, stop.z);
    ring.visible = !d.scenery;
    scene.add(ring);

    const colliders = (built.colliders ?? []).map((c) => {
      v.set(c.x, 0, c.z).applyMatrix4(group.matrixWorld);
      return { x: v.x, z: v.z, r: c.r };
    });
    return {
      id: d.id,
      onTimeline: !d.scenery,
      u: d.u,
      group,
      stop,
      colliders,
      ring,
      update: built.update ?? (() => {}),
    };
  });
}
