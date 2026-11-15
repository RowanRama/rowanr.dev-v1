import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ball, box, createFigure, cyl, glow, mat, mesh } from './models';
import type { Collider } from './stations';
import { baseHeight, biomeAt, clearOfRoad, heightAt, pathAt, rng, type Pad } from './world';

// A little of Australia, Papua New Guinea and India around the island: animals, buildings and everyday culture.
// Nothing is labelled; it's there to be found. Every model faces +x.

const polar = (deg: number, r: number) => ({ x: Math.cos((deg * Math.PI) / 180) * r, z: Math.sin((deg * Math.PI) / 180) * r });
const headingOf = (dx: number, dz: number) => Math.atan2(-dz, dx);

// spots that get a flattened pad, shared with the terrain builder
const SITES = {
  hausTambaran: { ...polar(165, 85), r: 13 },
  chhatri: { ...polar(62, 132), r: 12 },
  cricket: { ...polar(-5, 140), r: 15 },
  mesa: { ...polar(-58, 152), r: 12 },
  koala: { ...polar(-136, 152), r: 4 },
  birdTree: { ...polar(140, 76), r: 6 },
  roo: { ...polar(171, 99), r: 6 },
};
export function heritagePads(): Pad[] {
  return Object.values(SITES).map((s) => ({ x: s.x, z: s.z, y: baseHeight(s.x, s.z), r: s.r }));
}

/** Merge every static, untextured mesh under root into one mesh per material, to cut draw calls. */
function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || o.children.length) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (Array.isArray(m) || m.map || m.transparent) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(inv.clone().multiply(o.matrixWorld));
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m)!.push(g);
    merged.push(o);
  });
  for (const o of merged) o.removeFromParent();
  for (const [m, list] of buckets) root.add(mesh(mergeGeometries(list)!, m));
}

// ---------- animals ----------

function kangaroo() {
  const fur = mat('#b0703c');
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs up and down while hopping
  root.add(body);
  const torso = ball(0.42, fur, 0, 0.95, 0, 1);
  torso.scale.set(1.15, 1.25, 0.8);
  torso.rotation.z = -0.5;
  body.add(torso);
  const head = ball(0.2, fur, 0.45, 1.55, 0, 1);
  head.scale.set(1.4, 1, 0.9);
  body.add(head);
  body.add(mesh(new THREE.ConeGeometry(0.08, 0.3, 4), fur, 0.36, 1.82, 0.09), mesh(new THREE.ConeGeometry(0.08, 0.3, 4), fur, 0.36, 1.82, -0.09));
  body.add(ball(0.05, '#1b1e21', 0.66, 1.53, 0, 0));
  const tail = mesh(new THREE.ConeGeometry(0.16, 1.4, 6).rotateZ(Math.PI / 2 + 0.35), fur, -0.85, 0.55, 0);
  body.add(tail);
  for (const z of [-0.18, 0.18]) {
    body.add(box(0.7, 0.12, 0.14, fur, 0.1, 0.06, z)); // hind feet
    body.add(box(0.12, 0.3, 0.08, fur, 0.4, 1.0, z * 0.8)); // arms
  }
  return { root, body };
}

function emu() {
  const feathers = mat('#5b4b3e');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = ball(0.5, feathers, 0, 1.3, 0, 1);
  b.scale.set(1.25, 0.9, 0.8);
  body.add(b);
  const neck = cyl(0.07, 0.1, 0.9, '#6f7d88', 0.45, 1.75, 0, 6);
  neck.rotation.z = -0.25;
  body.add(neck, ball(0.13, '#5f6b74', 0.6, 2.2, 0, 1), box(0.16, 0.05, 0.06, '#3a3a3a', 0.75, 2.18, 0));
  const legs = [-0.14, 0.14].map((z) => {
    const leg = new THREE.Group();
    leg.position.set(0, 1, z);
    leg.add(cyl(0.05, 0.04, 1, '#7a6a55', 0, -0.5, 0, 5));
    body.add(leg);
    return leg;
  });
  return { root, body, legs };
}

function koala() {
  const g = new THREE.Group();
  const fur = mat('#9aa0a6');
  const body = ball(0.32, fur, 0, 0.32, 0, 1);
  body.scale.set(0.9, 1.1, 0.9);
  g.add(body, ball(0.26, fur, 0.12, 0.78, 0, 1));
  for (const z of [-0.22, 0.22]) g.add(ball(0.13, '#d9dcdf', 0.08, 0.98, z, 1));
  g.add(ball(0.08, '#2b2b2b', 0.36, 0.76, 0, 0));
  for (const z of [-0.2, 0.2]) g.add(box(0.12, 0.3, 0.1, fur, 0.28, 0.45, z)); // hugging the branch
  return g;
}

function crocodile() {
  const skin = mat('#4b5732');
  const root = new THREE.Group();
  root.add(box(2.4, 0.38, 0.75, skin, 0, 0, 0));
  root.add(box(1.1, 0.26, 0.42, skin, 1.7, -0.02, 0)); // snout
  for (const z of [-0.14, 0.14]) root.add(ball(0.08, '#c9b23a', 1.25, 0.22, z, 0)); // eyes
  const tail = new THREE.Group();
  tail.position.x = -1.2;
  tail.add(mesh(new THREE.ConeGeometry(0.34, 2.2, 5).rotateZ(Math.PI / 2), skin, -1.05, 0, 0));
  root.add(tail);
  for (let i = 0; i < 6; i++) root.add(box(0.14, 0.12, 0.5, mat('#3d4729'), 0.9 - i * 0.38, 0.22, 0)); // back scutes
  return { root, tail };
}

function turtle() {
  const root = new THREE.Group();
  const shell = ball(0.7, '#6b5a2e', 0, 0, 0, 1);
  shell.scale.set(1, 0.38, 0.85);
  root.add(shell, ball(0.2, '#8a9a5a', 0.8, 0, 0, 1));
  const flippers = [-1, 1].map((sz) => {
    const f = box(0.35, 0.05, 0.7, '#8a9a5a', 0.3, 0, sz * 0.75);
    root.add(f);
    return f;
  });
  return { root, flippers };
}

function cassowary() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = ball(0.55, '#141414', 0, 1.25, 0, 1);
  b.scale.set(1.25, 1, 0.9);
  body.add(b);
  const neck = cyl(0.09, 0.13, 0.75, '#2b7fd6', 0.5, 1.75, 0, 6);
  neck.rotation.z = -0.3;
  body.add(neck);
  body.add(ball(0.14, '#3a8de0', 0.68, 2.15, 0, 1));
  body.add(mesh(new THREE.ConeGeometry(0.08, 0.28, 5), mat('#7a5a3a'), 0.66, 2.36, 0)); // casque
  body.add(ball(0.08, '#d6332b', 0.62, 1.62, 0, 0)); // wattle
  body.add(box(0.18, 0.05, 0.06, '#3a3a3a', 0.84, 2.13, 0));
  const legs = [-0.16, 0.16].map((z) => {
    const leg = new THREE.Group();
    leg.position.set(0, 0.95, z);
    leg.add(cyl(0.07, 0.05, 0.95, '#9a8a5a', 0, -0.47, 0, 5));
    body.add(leg);
    return leg;
  });
  return { root, body, legs };
}

/** Raggiana bird of paradise, Papua New Guinea's national bird, with its red display plumes. */
function birdOfParadise() {
  const root = new THREE.Group();
  const body = ball(0.16, '#6b4a2b', 0, 0, 0, 1);
  body.scale.set(1.3, 1, 1);
  root.add(body, ball(0.11, '#f2d23c', 0.17, 0.12, 0, 1), box(0.06, 0.08, 0.14, '#2f9a55', 0.22, 0.02, 0), box(0.1, 0.03, 0.03, '#a6c8d6', 0.3, 0.12, 0));
  const plumes = new THREE.Group();
  plumes.position.set(-0.1, 0.02, 0);
  for (let i = 0; i < 9; i++) {
    const p = box(0.9, 0.025, 0.07, mat(i % 2 ? '#e2582a' : '#f07a3a'), -0.45, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.set((i - 4) * 0.16, 0, 0.35 + (i % 3) * 0.1);
    holder.add(p);
    plumes.add(holder);
  }
  for (const z of [-0.05, 0.05]) {
    const wire = box(1.2, 0.012, 0.012, '#2b2b2b', -0.6, -0.15, z);
    wire.rotation.z = -0.25;
    plumes.add(wire);
  }
  root.add(plumes);
  return { root, plumes };
}

function treeKangaroo() {
  const g = new THREE.Group();
  const fur = mat('#8a4a2a');
  const body = ball(0.3, fur, 0, 0.32, 0, 1);
  body.scale.set(0.9, 1.2, 0.85);
  g.add(body, ball(0.2, fur, 0.12, 0.75, 0, 1), ball(0.16, '#d9a35a', 0.15, 0.3, 0, 1));
  for (const z of [-0.12, 0.12]) g.add(ball(0.07, fur, 0.08, 0.93, z, 0));
  const tail = cyl(0.06, 0.03, 1.1, '#c98a4a', -0.18, -0.35, 0, 5); // long tail hanging off the branch
  g.add(tail);
  return { root: g, tail };
}

function elephant(caparison: boolean) {
  const skin = mat('#8b8f92');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = ball(1, skin, 0, 2, 0, 1);
  torso.scale.set(1.5, 1.05, 0.95);
  body.add(torso, ball(0.7, skin, 1.45, 2.35, 0, 1));
  for (const z of [-0.5, 0.5]) {
    const ear = ball(0.45, skin, 1.25, 2.35, z, 1);
    ear.scale.set(0.3, 1, 0.9);
    body.add(ear);
    body.add(mesh(new THREE.ConeGeometry(0.07, 0.6, 5).rotateZ(-Math.PI / 2 - 0.4), mat('#f4efe2'), 1.95, 1.75, z * 0.45)); // tusks
  }
  // trunk: three segments that swing
  const trunk = new THREE.Group();
  trunk.position.set(1.95, 2.2, 0);
  let seg: THREE.Object3D = trunk;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.add(cyl(0.2 - i * 0.05, 0.22 - i * 0.05, 0.6, skin, 0, -0.3, 0, 6));
    if (i > 0) s.position.y = -0.6;
    seg.add(s);
    segs.push(s);
    seg = s;
  }
  body.add(trunk);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.9, 0.45],
    [0.9, -0.45],
    [-0.9, 0.45],
    [-0.9, -0.45],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.4, z);
    leg.add(cyl(0.3, 0.32, 1.4, skin, 0, -0.7, 0, 7));
    body.add(leg);
    legs.push(leg);
  }
  if (caparison) {
    // a red and gold cloth over its back, as for a festival
    body.add(box(1.6, 0.08, 2.1, mat('#b3202a'), 0, 3.02, 0));
    for (const z of [-1.04, 1.04]) body.add(box(1.6, 0.9, 0.06, mat('#b3202a'), 0, 2.55, z), box(1.64, 0.12, 0.08, mat('#e8b93a'), 0, 2.1, z));
    body.add(box(0.06, 0.6, 0.5, mat('#e8b93a'), 2.12, 2.6, 0)); // forehead piece
  }
  return { root, body, segs, legs };
}

function tiger() {
  const fur = mat('#e07b28');
  const black = mat('#1d1a17');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.42, 1.5, 4, 10).rotateZ(Math.PI / 2), fur, 0, 0.95, 0));
  for (let i = 0; i < 7; i++) body.add(box(0.08, 0.86, 0.87, black, -0.75 + i * 0.25, 0.97, 0));
  body.add(ball(0.38, fur, 1.2, 1.15, 0, 1), ball(0.2, '#f4efe2', 1.48, 1.05, 0, 1), ball(0.05, black, 1.66, 1.12, 0, 0));
  for (const z of [-0.2, 0.2]) body.add(ball(0.1, fur, 1.12, 1.48, z, 0));
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.6, 0.25],
    [0.6, -0.25],
    [-0.6, 0.25],
    [-0.6, -0.25],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.75, z);
    leg.add(cyl(0.12, 0.1, 0.75, fur, 0, -0.37, 0, 6));
    body.add(leg);
    legs.push(leg);
  }
  const tail = cyl(0.06, 0.05, 1.1, fur, -1.35, 1.05, 0, 5);
  tail.rotation.z = 1.1;
  body.add(tail);
  return { root, legs };
}

function peacock() {
  const root = new THREE.Group();
  const blue = mat('#1f5fbf');
  const b = ball(0.24, blue, 0, 0.6, 0, 1);
  b.scale.set(1.3, 1, 0.9);
  const neck = cyl(0.06, 0.09, 0.45, blue, 0.2, 0.9, 0, 6);
  neck.rotation.z = -0.3;
  root.add(b, neck, ball(0.1, blue, 0.28, 1.12, 0, 1));
  for (let i = -1; i <= 1; i++) root.add(ball(0.03, blue, 0.26, 1.28, i * 0.05, 0)); // crest
  for (const z of [-0.08, 0.08]) root.add(cyl(0.03, 0.03, 0.45, '#9a8a6a', 0, 0.22, z, 4));
  const fan = new THREE.Group();
  fan.position.set(-0.25, 0.65, 0);
  for (let i = 0; i < 15; i++) {
    const a = -1.3 + (i / 14) * 2.6;
    const f = new THREE.Group();
    f.rotation.x = a;
    f.add(box(0.06, 1.4, 0.16, mat('#2f8a5a'), 0, 0.7, 0));
    f.add(ball(0.12, '#1a3f9a', 0.03, 1.32, 0, 0), ball(0.06, '#e8c43a', 0.08, 1.32, 0, 0));
    fan.add(f);
  }
  root.add(fan);
  return { root, fan };
}

// ---------- buildings and things ----------

/** Sepik-style haus tambaran (spirit house): a tall front gable over a raised floor, painted in red, ochre, black and white. */
function hausTambaran() {
  const g = new THREE.Group();
  const posts = mat('#4a3424');
  for (const x of [-4, -1.5, 1, 3.5]) for (const z of [-2.6, 2.6]) g.add(cyl(0.15, 0.18, 1.6, posts, x, 0.8, z, 6));
  g.add(box(9, 0.25, 5.6, mat('#6b4a32'), 0, 1.7, 0));
  // walls of woven sago palm
  g.add(box(8.6, 2.2, 5.2, mat('#b89466'), 0, 2.9, 0));
  // the roof rises steeply to a tall front gable (the +x end)
  const roofShape = new THREE.Shape([new THREE.Vector2(-3.4, 0), new THREE.Vector2(3.4, 0), new THREE.Vector2(0, 1)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 9.6, bevelEnabled: false }), mat('#7c6440'));
  roof.geometry.translate(0, 0, -9.6);
  roof.geometry.rotateY(-Math.PI / 2);
  // scale the height along the length: tall at the front, lower at the back
  const pos = roof.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getX(i) + 0) / 9.6; // 0 at the back, 1 at the front
    pos.setY(i, pos.getY(i) * (5 + 6 * t));
    pos.setX(i, pos.getX(i) - 4.8);
  }
  roof.geometry.computeVertexNormals();
  roof.position.y = 4;
  roof.castShadow = true;
  g.add(roof);
  // painted gable front
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 384;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#c9a26a';
  c.fillRect(0, 0, 256, 384);
  const bands = ['#a8321e', '#1d1a17', '#f2ead8', '#d98a2b'];
  for (let row = 0; row < 12; row++) {
    c.fillStyle = bands[row % bands.length];
    for (let col = 0; col < 8; col++) {
      // rows of chevrons
      c.beginPath();
      const x = col * 32 + (row % 2) * 16;
      const y = 384 - row * 30;
      c.moveTo(x, y);
      c.lineTo(x + 16, y - 22);
      c.lineTo(x + 32, y);
      c.lineTo(x + 24, y);
      c.lineTo(x + 16, y - 11);
      c.lineTo(x + 8, y);
      c.fill();
    }
  }
  c.fillStyle = '#1d1a17';
  c.beginPath();
  c.arc(128, 150, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f2ead8';
  c.beginPath();
  c.arc(128, 150, 20, 0, Math.PI * 2);
  c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const gableGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-3.3, 0), new THREE.Vector2(3.3, 0), new THREE.Vector2(0, 10.6)]));
  const uv = gableGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 3.3) / 6.6, uv.getY(i) / 10.6);
  const gable = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  gable.rotation.y = Math.PI / 2;
  gable.position.set(4.85, 4, 0);
  g.add(gable);
  // the finial pole with a carved bird on top
  g.add(cyl(0.08, 0.1, 2.4, posts, 4.8, 15.8, 0, 5), ball(0.3, '#1d1a17', 4.9, 17.1, 0, 0), box(0.5, 0.06, 1.2, '#1d1a17', 4.9, 17.1, 0));
  g.add(box(0.5, 0.12, 1.2, mat('#6b4a32'), 5.6, 0.9, 0), box(0.5, 0.12, 1.2, mat('#6b4a32'), 6.2, 0.4, 0)); // steps
  // a garamut slit drum on the ground out front
  const drum = mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 10).rotateX(Math.PI / 2), mat('#5a3a24'), 8, 0.55, 2);
  g.add(drum, box(0.12, 0.05, 2, '#1d1a17', 8, 1.08, 2));
  return g;
}

function stiltHouse(seed: number) {
  const g = new THREE.Group();
  const posts = mat('#5a4030');
  for (const x of [-2, 0, 2]) for (const z of [-1.5, 1.5]) g.add(cyl(0.12, 0.14, 5.5, posts, x, -1.2, z, 5));
  g.add(box(5, 0.2, 3.6, mat('#7a5a3c'), 0, 1.6, 0));
  g.add(box(4.4, 1.8, 3, mat(seed % 2 ? '#c9a46a' : '#b8935c'), 0, 2.6, 0));
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-2.2, 0), new THREE.Vector2(2.2, 0), new THREE.Vector2(0, 1.8)]), { depth: 5.2, bevelEnabled: false }), mat('#8a6a3a'));
  roof.geometry.translate(0, 0, -2.6).rotateY(Math.PI / 2);
  roof.position.y = 3.5;
  roof.castShadow = true;
  g.add(roof, box(1.2, 0.08, 0.9, mat('#7a5a3c'), 3.1, 1.6, 0)); // landing
  return g;
}

function outrigger(sail: boolean) {
  const g = new THREE.Group();
  const wood = mat('#7a5230');
  g.add(box(5, 0.45, 0.6, wood, 0, 0.1, 0));
  g.add(mesh(new THREE.ConeGeometry(0.32, 1, 4).rotateZ(-Math.PI / 2), wood, 3, 0.1, 0), mesh(new THREE.ConeGeometry(0.32, 1, 4).rotateZ(Math.PI / 2), wood, -3, 0.1, 0));
  const float = cyl(0.14, 0.14, 3.6, wood, 0, 0, 1.8, 6);
  float.rotation.z = Math.PI / 2;
  g.add(float);
  for (const x of [-1, 1]) g.add(box(0.1, 0.1, 1.8, wood, x, 0.38, 0.9));
  if (sail) {
    // a crab-claw sail, as on a lakatoi
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.6, 3.8), new THREE.Vector2(0.6, 4.2), new THREE.Vector2(-0.4, 0.6)]);
    g.add(mesh(new THREE.ShapeGeometry(shape), mat('#d9c39a', { side: THREE.DoubleSide }), -0.5, 0.35, 0));
  }
  const paddler = createFigure('#7a3a2a', { skin: '#7a5236', pants: '#3a3a3a' });
  paddler.root.position.set(1.2, -0.45, 0);
  paddler.root.scale.setScalar(0.8);
  g.add(paddler.root);
  return g;
}

function mangrove() {
  const g = new THREE.Group();
  const bark = mat('#5a4a3a');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const root = cyl(0.06, 0.08, 2.4, bark, Math.cos(a) * 0.7, 0.3, Math.sin(a) * 0.7, 4);
    root.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(root);
  }
  g.add(cyl(0.12, 0.16, 2, bark, 0, 2, 0, 5));
  const crown = ball(1.6, '#2f5f30', 0, 3.4, 0, 0);
  crown.scale.set(1, 0.6, 1);
  g.add(crown);
  return g;
}

/** A Rajasthani chhatri: a domed pavilion on a sandstone plinth, dressed for Diwali with marigolds, diyas and a rangoli. */
function chhatri() {
  const g = new THREE.Group();
  const stone = mat('#d9a066');
  const marble = mat('#f1e8d8');
  g.add(box(7, 0.9, 7, stone, 0, 0.45, 0), box(5.8, 0.3, 5.8, marble, 0, 1.05, 0));
  for (const x of [-2.4, 2.4]) for (const z of [-2.4, 2.4]) g.add(cyl(0.25, 0.3, 3.4, marble, x, 2.9, z, 8));
  g.add(box(6, 0.5, 6, stone, 0, 4.85, 0), box(6.6, 0.18, 6.6, stone, 0, 5.15, 0));
  g.add(mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), marble, 0, 5.2, 0));
  g.add(cyl(0.08, 0.15, 0.9, mat('#e8b93a', { metalness: 0.6, roughness: 0.3 }), 0, 7.8, 0, 6), ball(0.18, mat('#e8b93a', { metalness: 0.6, roughness: 0.3 }), 0, 8.3, 0, 1));
  for (const x of [-2.9, 2.9]) for (const z of [-2.9, 2.9]) g.add(mesh(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), marble, x, 5.25, z));
  // marigold garlands sagging between the pillars
  const marigold = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), mat('#ff9a1f'), 4 * 22);
  const yellow = new THREE.Color('#ffd23a');
  const m = new THREE.Matrix4();
  let n = 0;
  const corners = [
    [-2.4, -2.4],
    [2.4, -2.4],
    [2.4, 2.4],
    [-2.4, 2.4],
  ];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s];
    const [bx, bz] = corners[(s + 1) % 4];
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      m.makeTranslation(ax + (bx - ax) * t, 4.5 - Math.sin(t * Math.PI) * 0.8, az + (bz - az) * t);
      marigold.setMatrixAt(n, m);
      if (i % 2) marigold.setColorAt(n, yellow);
      n++;
    }
  }
  g.add(marigold);
  // diyas (clay oil lamps) along the plinth edge; the flames glow at dusk
  const flame = glow('#ffb347', 6);
  for (let i = 0; i < 20; i++) {
    const side = Math.floor(i / 5);
    const t = ((i % 5) + 0.5) / 5;
    const along = -3.3 + t * 6.6;
    const [x, z] = [
      [along, -3.3],
      [3.3, along],
      [-along, 3.3],
      [-3.3, -along],
    ][side];
    g.add(cyl(0.12, 0.07, 0.08, '#a0522d', x, 0.94, z, 8), ball(0.05, flame, x, 1.04, z, 0));
  }
  // rangoli on the ground in front of the steps
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  const colors = ['#e63946', '#ffb703', '#2a9d8f', '#8e44ad', '#ff6fa8', '#ffffff'];
  for (let ring = 5; ring >= 0; ring--) {
    const petals = 8 + ring * 2;
    c.fillStyle = colors[ring];
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      c.beginPath();
      c.ellipse(128 + Math.cos(a) * ring * 20, 128 + Math.sin(a) * ring * 20, 14, 7, a, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.fillStyle = '#ffb703';
  c.beginPath();
  c.arc(128, 128, 12, 0, Math.PI * 2);
  c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const rangoli = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  rangoli.position.set(6.2, 0.04, 0);
  g.add(rangoli, box(0.8, 0.45, 2.4, stone, 3.9, 0.22, 0)); // step down to it
  return g;
}

/** A Southern Cross style farm windmill and water tank. */
function windmill() {
  const g = new THREE.Group();
  const steel = mat('#8d949b');
  for (const [x, z] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [0.9, 0.9],
    [-0.9, 0.9],
  ]) {
    const leg = cyl(0.05, 0.06, 9, steel, x * 0.55, 4.5, z * 0.55, 4);
    leg.rotation.set(z * 0.1, 0, -x * 0.1);
    g.add(leg);
  }
  for (const y of [2, 4.5, 7]) g.add(box(1.8 - y * 0.15, 0.06, 0.06, steel, 0, y, 0), box(0.06, 0.06, 1.8 - y * 0.15, steel, 0, y, 0));
  const head = new THREE.Group();
  head.position.y = 9.2;
  const rotor = new THREE.Group();
  rotor.position.x = 0.4;
  for (let i = 0; i < 14; i++) {
    const blade = box(0.04, 1.4, 0.32, steel, 0, 1.1, 0);
    const holder = new THREE.Group();
    holder.rotation.x = (i / 14) * Math.PI * 2;
    blade.rotation.y = 0.5;
    holder.add(blade);
    rotor.add(holder);
  }
  head.add(rotor, box(2.4, 0.08, 0.08, steel, -1.1, 0, 0), box(0.9, 0.9, 0.04, mat('#c9ced3'), -2.3, 0, 0));
  g.add(head);
  const tank = cyl(1.6, 1.6, 2.2, mat('#a5acb2', { metalness: 0.5, roughness: 0.45 }), 4, 1.1, 0, 16);
  g.add(tank, box(3, 0.4, 0.7, mat('#7d858c'), 4, 0.2, 2.4));
  return { root: g, rotor };
}

function lifesavingTower() {
  const g = new THREE.Group();
  const red = mat('#d92b2b');
  const yellow = mat('#f2c230');
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(cyl(0.08, 0.1, 3, mat('#e9eef2'), x, 1.5, z, 5));
  g.add(box(2.6, 1.6, 2.6, yellow, 0, 3.8, 0), box(2.7, 0.6, 2.7, red, 0, 3.3, 0), box(3, 0.15, 3, red, 0, 4.7, 0));
  // red and yellow flags mark the patrolled swimming area
  const flags: THREE.Group[] = [];
  for (const z of [-7, 7]) {
    const f = new THREE.Group();
    f.position.set(3, 0, z);
    f.add(cyl(0.05, 0.05, 3.2, mat('#e9eef2'), 0, 1.6, 0, 5));
    const cloth = new THREE.Group();
    cloth.position.y = 2.7;
    cloth.add(mesh(new THREE.PlaneGeometry(1.1, 0.35), mat('#d92b2b', { side: THREE.DoubleSide }), 0.55, 0.17, 0));
    cloth.add(mesh(new THREE.PlaneGeometry(1.1, 0.35), mat('#f2c230', { side: THREE.DoubleSide }), 0.55, -0.18, 0));
    cloth.rotation.y = Math.PI / 2;
    f.add(cloth);
    g.add(f);
    flags.push(cloth);
  }
  const lifesaver = createFigure('#d92b2b', { pants: '#f2c230' });
  lifesaver.root.position.set(2.2, 0, 1.5);
  g.add(lifesaver.root);
  return { root: g, flags };
}

function autoRickshaw() {
  const g = new THREE.Group();
  const yellow = mat('#f2c230');
  const green = mat('#2f8f4f');
  g.add(box(2, 0.5, 1.2, green, 0, 0.55, 0));
  g.add(box(0.7, 0.9, 1.1, green, 0.9, 1.1, 0)); // cab nose
  g.add(box(2.1, 0.12, 1.3, mat('#1b1e21'), -0.1, 2.05, 0)); // canvas top
  g.add(box(1.5, 1.2, 1.24, yellow, -0.35, 1.4, 0));
  g.add(box(0.08, 0.6, 1.0, mat('#2b3540', { roughness: 0.2 }), 1.25, 1.55, 0)); // windscreen
  g.add(ball(0.12, glow('#fff3c4', 4), 1.3, 0.95, 0, 0)); // headlight
  for (const [x, z] of [
    [1.0, 0],
    [-0.7, 0.55],
    [-0.7, -0.55],
  ])
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2), mat('#1b1e21'), x, 0.3, z));
  const driver = createFigure('#f1e8d8', { skin: '#8a5a3a' });
  driver.root.scale.setScalar(0.75);
  driver.root.position.set(0.3, 0.6, 0);
  g.add(driver.root);
  return g;
}

function cricketPitch() {
  const g = new THREE.Group();
  // a mown outfield inside the rope
  const field = mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), mat('#6fae4f', { polygonOffset: true, polygonOffsetFactor: -1 }), 0, 0.03, 0);
  field.castShadow = false;
  g.add(field);
  for (let i = -3; i <= 3; i++) {
    const stripe = mesh(new THREE.PlaneGeometry(2, Math.sqrt(196 - (i * 4) ** 2) * 2 - 1).rotateX(-Math.PI / 2), mat('#79b85a', { polygonOffset: true, polygonOffsetFactor: -2 }), i * 4, 0.035, 0);
    stripe.castShadow = false;
    g.add(stripe);
  }
  g.add(mesh(new THREE.RingGeometry(14, 14.25, 64).rotateX(-Math.PI / 2), mat('#f4f7fa'), 0, 0.06, 0)); // boundary rope
  g.add(box(10.5, 0.05, 1.6, mat('#c9b27a'), 0, 0.03, 0));
  const white = mat('#f4f7fa');
  for (const x of [-4.4, 4.4]) {
    g.add(box(0.06, 0.07, 1.6, white, x, 0.06, 0));
    for (const z of [-0.12, 0, 0.12]) g.add(cyl(0.025, 0.025, 0.7, mat('#e8d9b0'), x - Math.sign(x) * 0.6, 0.35, z, 5));
    g.add(box(0.03, 0.03, 0.3, mat('#e8d9b0'), x - Math.sign(x) * 0.6, 0.71, 0));
  }
  const whites = (shirt = '#f4f1e8') => createFigure(shirt, { pants: '#f4f1e8' });
  const batter = whites();
  batter.root.position.set(4.6, 0, 0.35);
  batter.root.rotation.y = Math.PI; // faces the bowler
  const bat = box(0.08, 0.9, 0.14, mat('#d9b87a'), 0.15, -0.5, 0);
  batter.armR.add(bat);
  const bowler = whites();
  const keeper = whites('#2f6fb5');
  keeper.root.position.set(6.6, 0, 0);
  keeper.root.rotation.y = Math.PI;
  keeper.hip.position.y = 0.65;
  const fielders = [
    [-2, 7],
    [3, -9],
    [9, 6],
    [-9, -4],
    [-6, 10],
  ].map(([x, z]) => {
    const f = whites();
    f.root.position.set(x, 0, z);
    g.add(f.root);
    return f;
  });
  const ballMesh = ball(0.09, '#c0262d', 0, 0, 0, 1);
  g.add(batter.root, bowler.root, keeper.root, ballMesh);
  return { root: g, batter, bowler, ballMesh, fielders };
}

// ---------- placement ----------

export function buildHeritage(scene: THREE.Scene) {
  const colliders: Collider[] = [];
  const updates: ((dt: number, time: number) => void)[] = [];
  const at = (deg: number, r: number) => {
    const p = polar(deg, r);
    return new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z);
  };
  /** turn a group to face the mountain (or away from it with sign = -1) */
  const faceCentre = (o: THREE.Object3D, sign = 1) => {
    o.rotation.y = headingOf(-o.position.x * sign, -o.position.z * sign);
  };
  const place = (o: THREE.Object3D, p: THREE.Vector3) => {
    o.position.copy(p);
    scene.add(o);
    return o;
  };
  const r = rng(2024);

  // ===== Australia: the outback =====
  // a red sandstone mesa: flat top, steep banded sides, rubble at its feet
  const rock = new THREE.Group();
  const reds = ['#b4462a', '#9e3b22', '#c25a32'];
  const talus = mesh(new THREE.CylinderGeometry(11.5, 14, 1.6, 11), mat('#a8573a', { roughness: 1 }), 0, 0.8, 0);
  talus.scale.z = 0.6;
  rock.add(talus);
  for (let i = 0; i < 3; i++) {
    const layer = mesh(new THREE.CylinderGeometry(11 - i * 0.25, 11.2 - i * 0.25, 2.2, 11), mat(reds[i % 3], { roughness: 0.9 }), 0, 2.6 + i * 2.2, 0);
    layer.scale.z = 0.55;
    rock.add(layer);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const b = mesh(new THREE.DodecahedronGeometry(0.6 + r() * 1.1, 0), mat(reds[i % 3]), Math.cos(a) * 13.5, 0.4, Math.sin(a) * 8);
    rock.add(b);
  }
  place(rock, new THREE.Vector3(SITES.mesa.x, baseHeight(SITES.mesa.x, SITES.mesa.z) - 0.6, SITES.mesa.z));
  bake(rock);
  rock.rotation.y = headingOf(-rock.position.z, rock.position.x); // long side along the coast
  for (const dx of [-7, 0, 7]) {
    const v = new THREE.Vector3(dx, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rock.rotation.y);
    colliders.push({ x: rock.position.x + v.x, z: rock.position.z + v.z, r: 5.5 });
  }

  const mill = windmill();
  place(mill.root, at(-88, 150));
  faceCentre(mill.root);
  colliders.push({ x: mill.root.position.x, z: mill.root.position.z, r: 1.2 });
  updates.push((dt) => (mill.rotor.rotation.x += dt * 2.2));

  // termite mounds and spinifex across the red earth
  const mound = mat('#a8522c');
  const spin = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0).scale(1, 0.55, 1), mat('#b8a64a'), 160);
  let spinN = 0;
  let mounds = 0;
  const moundGroup = new THREE.Group();
  scene.add(moundGroup);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 2000 && (mounds < 26 || spinN < 160); i++) {
    const a = -100 + r() * 65;
    const rad = 35 + r() * 130;
    const p = at(a, rad);
    if (p.y < 2.2 || biomeAt(p.x, p.z) !== 'outback' || !clearOfRoad(p.x, p.z)) continue;
    if (p.distanceTo(rock.position) < 16 || p.distanceTo(mill.root.position) < 7) continue;
    if (mounds < 26 && r() < 0.25) {
      const h = 1.6 + r() * 2.4;
      const g = new THREE.Group();
      g.add(mesh(new THREE.ConeGeometry(0.7, h, 6), mound, 0, h / 2, 0), mesh(new THREE.ConeGeometry(0.4, h * 0.6, 5), mound, 0.4, h * 0.3, 0.3));
      g.position.copy(p);
      moundGroup.add(g);
      colliders.push({ x: p.x, z: p.z, r: 0.8 });
      mounds++;
    } else if (spinN < 160) {
      const k = 0.6 + r() * 0.8;
      m4.makeScale(k, k, k).setPosition(p.x, p.y + 0.1, p.z);
      spin.setMatrixAt(spinN++, m4);
    }
  }
  bake(moundGroup);
  spin.count = spinN;
  scene.add(spin);

  // a mob of kangaroos bounding in a loop
  const mob = at(-76, 138);
  const roos = [0, 1, 2, 3].map((i) => ({ ...kangaroo(), ph: i * 1.6, rad: 6 + i * 1.5 }));
  for (const k of roos) scene.add(k.root);
  updates.push((_dt, time) => {
    for (const k of roos) {
      const a = time * 0.35 + k.ph;
      const x = mob.x + Math.cos(a) * k.rad;
      const z = mob.z + Math.sin(a) * k.rad;
      k.root.position.set(x, heightAt(x, z), z);
      k.root.rotation.y = headingOf(-Math.sin(a), Math.cos(a));
      const hop = Math.abs(Math.sin(time * 4 + k.ph));
      k.body.position.y = hop * 0.7;
      k.body.rotation.z = -0.2 + hop * 0.25;
    }
  });

  // emus wandering
  const emuHome = at(-48, 132);
  const emus = [0, 1].map((i) => ({ ...emu(), ph: i * 2.2 }));
  for (const e of emus) scene.add(e.root);
  updates.push((_dt, time) => {
    for (const e of emus) {
      const a = time * 0.18 + e.ph;
      const x = emuHome.x + Math.cos(a) * 5;
      const z = emuHome.z + Math.sin(a * 1.3) * 4;
      const nx = emuHome.x + Math.cos(a + 0.05) * 5;
      const nz = emuHome.z + Math.sin((a + 0.05) * 1.3) * 4;
      e.root.position.set(x, heightAt(x, z), z);
      e.root.rotation.y = headingOf(nx - x, nz - z);
      e.legs.forEach((l, i) => (l.rotation.z = Math.sin(time * 6 + i * Math.PI) * 0.45));
      e.body.position.y = Math.abs(Math.sin(time * 6)) * 0.06;
    }
  });

  // ===== Australia: a koala up a big gum tree =====
  const gumAt = new THREE.Vector3(SITES.koala.x, baseHeight(SITES.koala.x, SITES.koala.z), SITES.koala.z);
  const gum = new THREE.Group();
  const bark = mat('#e6dfd2');
  gum.add(cyl(0.3, 0.5, 7, bark, 0, 3.5, 0, 7));
  const fork = cyl(0.18, 0.26, 3, bark, 0.9, 6.6, 0, 6);
  fork.rotation.z = -0.6;
  gum.add(fork);
  for (const [x, y, z, s] of [
    [0, 8.2, 0, 2.2],
    [1.9, 7.6, 0.6, 1.6],
    [-1.4, 7.2, -0.8, 1.5],
  ]) {
    const c = ball(s, '#7d9a6a', x, y, z, 0);
    c.scale.y = 0.6;
    gum.add(c);
  }
  const k = koala();
  k.position.set(0.55, 5.6, 0);
  k.rotation.z = -0.2;
  gum.add(k);
  place(gum, gumAt);
  faceCentre(gum);
  bake(gum);
  colliders.push({ x: gumAt.x, z: gumAt.z, r: 0.7 });

  // ===== Australia: surf lifesavers on the beach =====
  const tower = lifesavingTower();
  place(tower.root, at(80, 159));
  faceCentre(tower.root, -1);
  colliders.push({ x: tower.root.position.x, z: tower.root.position.z, r: 1.8 });
  updates.push((_dt, time) => tower.flags.forEach((f, i) => (f.rotation.x = Math.sin(time * 3 + i) * 0.15)));

  // ===== Papua New Guinea: rainforest =====
  const ht = SITES.hausTambaran;
  const house = hausTambaran();
  place(house, new THREE.Vector3(ht.x, baseHeight(ht.x, ht.z), ht.z));
  faceCentre(house, -1); // gable faces downhill, toward the road below
  bake(house);
  colliders.push({ x: ht.x, z: ht.z, r: 4.6 });

  const cass = cassowary();
  scene.add(cass.root);
  const cassHome = at(152, 96);
  updates.push((_dt, time) => {
    const a = time * 0.2;
    const x = cassHome.x + Math.cos(a) * 5;
    const z = cassHome.z + Math.sin(a) * 5;
    cass.root.position.set(x, heightAt(x, z), z);
    cass.root.rotation.y = headingOf(-Math.sin(a), Math.cos(a));
    cass.legs.forEach((l, i) => (l.rotation.z = Math.sin(time * 5 + i * Math.PI) * 0.4));
    cass.body.position.y = Math.abs(Math.sin(time * 5)) * 0.05;
  });

  /** A tall rainforest tree with a branch to perch on; returns the branch tip in world space. */
  const perchTree = (p: THREE.Vector3, h: number) => {
    const t = new THREE.Group();
    t.add(cyl(0.3, 0.55, h, '#5a3f2b', 0, h / 2, 0, 7));
    const branch = cyl(0.1, 0.16, 2.4, '#5a3f2b', 1.1, h - 2.2, 0, 5);
    branch.rotation.z = -1.2;
    t.add(branch);
    const crown = ball(2.6, '#2c6a2c', 0, h + 0.8, 0, 0);
    crown.scale.y = 0.6;
    t.add(crown);
    place(t, p);
    colliders.push({ x: p.x, z: p.z, r: 0.7 });
    return t;
  };
  const bopTree = perchTree(new THREE.Vector3(SITES.birdTree.x, baseHeight(SITES.birdTree.x, SITES.birdTree.z), SITES.birdTree.z), 9);
  const bop = birdOfParadise();
  bop.root.position.set(2.1, 9 - 1.65, 0);
  bop.root.scale.setScalar(1.8);
  bopTree.add(bop.root);
  updates.push((_dt, time) => {
    // the display: plumes lift and shiver
    bop.plumes.rotation.z = 0.25 + Math.max(0, Math.sin(time * 0.8)) * 0.6;
    bop.plumes.rotation.x = Math.sin(time * 9) * 0.05;
    bop.root.rotation.z = Math.max(0, Math.sin(time * 0.8)) * -0.4;
  });

  const tkTree = perchTree(new THREE.Vector3(SITES.roo.x, baseHeight(SITES.roo.x, SITES.roo.z), SITES.roo.z), 8);
  const tk = treeKangaroo();
  tk.root.position.set(1.9, 8 - 1.6, 0);
  tkTree.add(tk.root);
  updates.push((_dt, time) => (tk.tail.rotation.x = Math.sin(time * 0.9) * 0.15));

  // ===== Papua New Guinea: the coast =====
  // mangroves along the shoreline
  let mangroves = 0;
  const mangroveGroup = new THREE.Group();
  scene.add(mangroveGroup);
  for (let i = 0; i < 900 && mangroves < 32; i++) {
    const p = at(140 + r() * 60, 160 + r() * 22);
    if (p.y < -1.4 || p.y > 0.6 || !clearOfRoad(p.x, p.z)) continue;
    const t = mangrove();
    t.rotation.y = r() * 6.28;
    t.scale.setScalar(1 + r() * 0.6);
    t.position.set(p.x, Math.max(p.y, -1.2) - 0.4, p.z);
    mangroveGroup.add(t);
    mangroves++;
  }
  bake(mangroveGroup);

  // a stilt village over the water, with a boardwalk to shore
  const village = new THREE.Group();
  scene.add(village);
  for (const [i, deg] of [186, 193, 200].entries()) {
    const h = stiltHouse(i);
    h.position.copy(at(deg, 181)).setY(0);
    village.add(h);
    faceCentre(h);
    colliders.push({ x: h.position.x, z: h.position.z, r: 2.6 });
    const walk = box(1, 0.12, 12, mat('#7a5a3c'), 0, 1.6, 0);
    const mid = at(deg, 174);
    walk.position.set(mid.x, 1.5, mid.z);
    walk.rotation.y = h.rotation.y + Math.PI / 2;
    village.add(walk);
    for (let s = -5; s <= 5; s += 2.5) {
      const v = new THREE.Vector3(0, 0, s).applyAxisAngle(new THREE.Vector3(0, 1, 0), walk.rotation.y);
      village.add(cyl(0.08, 0.08, 4, mat('#5a4030'), mid.x + v.x, -0.5, mid.z + v.z, 4));
    }
  }
  bake(village);

  // outrigger canoes paddling along the coast
  const canoes = [outrigger(true), outrigger(false)].map((c, i) => ({ c, ph: i * Math.PI }));
  for (const { c } of canoes) scene.add(c);
  updates.push((_dt, time) => {
    for (const { c, ph } of canoes) {
      const s = Math.sin(time * 0.05 + ph); // back and forth along an arc
      const deg = 192 + s * 22;
      const p = polar(deg, 196);
      const dir = Math.cos(time * 0.05 + ph) >= 0 ? 1 : -1;
      const q = polar(deg + dir, 196);
      c.position.set(p.x, Math.sin(time * 1.2 + ph) * 0.08, p.z);
      c.rotation.y = headingOf(q.x - p.x, q.z - p.z);
    }
  });

  // a saltwater crocodile cruising the mangroves
  const croc = crocodile();
  scene.add(croc.root);
  updates.push((_dt, time) => {
    const a = time * 0.04;
    const deg = 158 + Math.sin(a) * 10;
    const p = polar(deg, 176 + Math.cos(a * 2) * 3);
    const q = polar(158 + Math.sin(a + 0.01) * 10, 176 + Math.cos((a + 0.01) * 2) * 3);
    croc.root.position.set(p.x, -0.12, p.z);
    croc.root.rotation.y = headingOf(q.x - p.x, q.z - p.z);
    croc.tail.rotation.y = Math.sin(time * 2) * 0.3;
  });

  // a sea turtle out by the reef
  const turt = turtle();
  scene.add(turt.root);
  const reef = polar(112, 186);
  updates.push((_dt, time) => {
    const a = time * 0.12;
    turt.root.position.set(reef.x + Math.cos(a) * 7, -2.6 + Math.sin(time * 0.5) * 0.3, reef.z + Math.sin(a) * 7);
    turt.root.rotation.y = headingOf(-Math.sin(a), Math.cos(a));
    turt.flippers.forEach((f, i) => (f.rotation.x = Math.sin(time * 2.5) * 0.5 * (i ? 1 : -1)));
  });

  // ===== India =====
  const ch = SITES.chhatri;
  const pav = chhatri();
  place(pav, new THREE.Vector3(ch.x, baseHeight(ch.x, ch.z), ch.z));
  faceCentre(pav);
  bake(pav);
  colliders.push({ x: ch.x, z: ch.z, r: 4.6 });

  const birds = [-1, 1].map((side) => {
    const b = peacock();
    b.root.scale.setScalar(1.6);
    const v = new THREE.Vector3(1.5, 0, side * 5.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), pav.rotation.y);
    b.root.position.copy(pav.position).add(v);
    b.root.rotation.y = pav.rotation.y + side * 0.6;
    scene.add(b.root);
    return b;
  });
  updates.push((_dt, time) => {
    birds.forEach((b, i) => {
      const open = THREE.MathUtils.smoothstep(Math.sin(time * 0.4 + i * 2), -0.2, 0.4);
      b.fan.scale.set(1, 0.25 + open * 0.75, 0.3 + open * 0.7);
      b.fan.rotation.z = 0.9 - open * 0.75;
    });
  });

  // an elephant in festival dress and her calf, ambling
  const herd = at(74, 114);
  const along = new THREE.Vector3(herd.z, 0, -herd.x).normalize(); // across the slope
  const mum = elephant(true);
  const calf = elephant(false);
  calf.root.scale.setScalar(0.55);
  scene.add(mum.root, calf.root);
  updates.push((_dt, time) => {
    const s = Math.sin(time * 0.06);
    const dir = Math.cos(time * 0.06) >= 0 ? 1 : -1;
    [mum, calf].forEach((e, i) => {
      const off = s * 9 - i * 4.5 * dir;
      const x = herd.x + along.x * off + (i ? 2 : 0);
      const z = herd.z + along.z * off;
      e.root.position.set(x, heightAt(x, z), z);
      e.root.rotation.y = headingOf(along.x * dir, along.z * dir);
      e.segs[0].rotation.z = 0.25 + Math.sin(time * 1.3 + i) * 0.25;
      e.segs[1].rotation.z = 0.2 + Math.sin(time * 1.3 + i + 0.5) * 0.2;
      e.segs[2].rotation.z = 0.3;
      e.legs.forEach((l, j) => (l.rotation.z = Math.sin(time * 1.8 + (j % 2 === 0 ? 0 : Math.PI) + (j > 1 ? Math.PI : 0)) * 0.18));
    });
  });

  // a tiger prowling the edge of the trees
  const tig = tiger();
  scene.add(tig.root);
  const den = at(50, 150);
  updates.push((_dt, time) => {
    const a = time * 0.16;
    const x = den.x + Math.cos(a) * 6;
    const z = den.z + Math.sin(a) * 4;
    const nx = den.x + Math.cos(a + 0.05) * 6;
    const nz = den.z + Math.sin(a + 0.05) * 4;
    tig.root.position.set(x, heightAt(x, z), z);
    tig.root.rotation.y = headingOf(nx - x, nz - z);
    tig.legs.forEach((l, i) => (l.rotation.z = Math.sin(time * 3.2 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.4));
  });

  // an auto-rickshaw puttering up and down the road
  const auto = autoRickshaw();
  scene.add(auto);
  updates.push((_dt, time) => {
    const phase = (time * 0.006) % 2; // up, then back down
    const u = phase < 1 ? phase : 2 - phase;
    const up = phase < 1;
    const { p, tangent, out } = pathAt(0.02 + u * 0.93);
    const lane = up ? -2 : 2;
    auto.position.set(p.x + out.x * lane, p.y + 0.14, p.z + out.z * lane);
    auto.rotation.y = headingOf(tangent.x * (up ? 1 : -1), tangent.z * (up ? 1 : -1));
    auto.position.y += Math.abs(Math.sin(time * 9)) * 0.04;
  });

  // ===== Australia and India: cricket =====
  const cr = SITES.cricket;
  const match = cricketPitch();
  place(match.root, new THREE.Vector3(cr.x, baseHeight(cr.x, cr.z), cr.z));
  faceCentre(match.root);
  const hitFrom = new THREE.Vector3(4.2, 0.7, 0);
  const hitTo = new THREE.Vector3();
  updates.push((_dt, time) => {
    // one delivery every five seconds: run-up, bowl, bounce, hit, field
    const t = time % 5;
    const target = Math.floor(time / 5) % match.fielders.length;
    hitTo.copy(match.fielders[target].root.position).setY(1.2);
    const run = Math.min(t / 1.4, 1);
    match.bowler.root.position.set(-11 + run * 6.6, 0, -0.3);
    match.bowler.legL.rotation.z = t < 1.4 ? Math.sin(t * 14) * 0.6 : 0;
    match.bowler.legR.rotation.z = t < 1.4 ? -Math.sin(t * 14) * 0.6 : 0;
    match.bowler.armR.rotation.z = t > 1.2 && t < 1.6 ? -((t - 1.2) / 0.4) * Math.PI * 2 : 0;
    const swing = t > 1.95 && t < 2.25 ? (t - 1.95) / 0.3 : t >= 2.25 && t < 3.5 ? 1 : 0;
    match.batter.armR.rotation.z = -0.4 + swing * 1.9;
    const b = match.ballMesh.position;
    if (t < 1.55) b.set(0, -5, 0); // still in the bowler's hand
    else if (t < 2.05) {
      // down the pitch, bouncing once in front of the batter
      const k = (t - 1.55) / 0.5;
      const y = k < 0.7 ? 2.1 - (k / 0.7) * 2 : 0.1 + Math.sin(((k - 0.7) / 0.3) * Math.PI * 0.5) * 0.7;
      b.set(-4 + k * 8.2, y, 0);
    } else if (t < 3.6) {
      const k = (t - 2.05) / 1.55;
      b.lerpVectors(hitFrom, hitTo, k);
      b.y += Math.sin(k * Math.PI) * 4;
    } else b.copy(hitTo);
    match.fielders.forEach((f, i) => {
      const reach = i === target && t > 2.6 && t < 4.4 ? 2.6 : 0;
      f.armL.rotation.z = reach;
      f.armR.rotation.z = reach;
    });
  });

  return {
    colliders,
    update(dt: number, time: number) {
      for (const u of updates) u(dt, time);
    },
  };
}
