import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Low-poly, flat-shaded primitives. Every model is built from code, so there are no assets to load.
const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = color + JSON.stringify(opts);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...opts });
    mats.set(key, m);
  }
  return m;
}
export const glow = (color: string, intensity = 1.6) => mat(color, { emissive: color, emissiveIntensity: intensity });

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export const box = (w: number, h: number, d: number, color: string | THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color, x, y, z);
export const cyl = (rt: number, rb: number, h: number, color: string | THREE.Material, x = 0, y = 0, z = 0, seg = 12) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color, x, y, z);
export const ball = (r: number, color: string | THREE.Material, x = 0, y = 0, z = 0, detail = 1) =>
  mesh(new THREE.IcosahedronGeometry(r, detail), typeof color === 'string' ? mat(color) : color, x, y, z);

// ---------- six-axis arm ----------
export interface ArmStyle {
  body: string;
  accent: string;
  base: string;
  l1?: number; // upper arm
  l2?: number; // forearm
  tool?: 'gripper' | 'pen';
}
export interface Arm {
  root: THREE.Group;
  joints: THREE.Group[];
  tip: THREE.Object3D;
  S: number;
  L1: number;
  L2: number;
  LT: number;
  set(q: number[]): void;
  /** Point the tool straight down at a target in the arm's root frame. Returns false if out of reach. */
  reachDown(target: THREE.Vector3): boolean;
  /** Joint angles that put the tool straight down at a target in the arm's root frame (clamped to reach). */
  solveDown(target: THREE.Vector3): number[];
}

export function createArm(style: ArmStyle): Arm {
  const L1 = style.l1 ?? 0.62;
  const L2 = style.l2 ?? 0.58;
  const S = 0.42;
  const LT = style.tool === 'pen' ? 0.16 : 0.2;
  const root = new THREE.Group();
  root.add(cyl(0.22, 0.26, 0.2, style.base, 0, 0.1, 0, 16));

  const j1 = new THREE.Group();
  j1.position.y = 0.2;
  j1.add(cyl(0.17, 0.2, 0.3, style.body, 0, 0.12, 0, 16));
  const shoulderCap = cyl(0.13, 0.13, 0.32, style.accent, 0, S - 0.2, 0, 16);
  shoulderCap.rotation.x = Math.PI / 2;
  j1.add(shoulderCap);

  const j2 = new THREE.Group();
  j2.position.y = S - 0.2;
  j2.add(mesh(new RoundedBoxGeometry(0.15, L1 + 0.1, 0.12, 2, 0.04), mat(style.body), 0, L1 / 2, 0.08));

  const j3 = new THREE.Group();
  j3.position.y = L1;
  const elbowCap = cyl(0.1, 0.1, 0.3, style.accent, 0, 0, 0.04, 14);
  elbowCap.rotation.x = Math.PI / 2;
  j3.add(elbowCap);

  const j4 = new THREE.Group();
  j4.add(cyl(0.06, 0.085, L2, style.body, 0, L2 / 2, 0, 12));

  const j5 = new THREE.Group();
  j5.position.y = L2;
  const wristCap = cyl(0.06, 0.06, 0.16, style.accent, 0, 0, 0, 12);
  wristCap.rotation.x = Math.PI / 2;
  j5.add(wristCap);

  const j6 = new THREE.Group();
  j6.add(cyl(0.055, 0.055, 0.06, style.base, 0, 0.06, 0, 12));
  const tip = new THREE.Object3D();
  tip.position.y = LT;
  if (style.tool === 'pen') {
    j6.add(cyl(0.025, 0.025, 0.08, '#2b2f33', 0, 0.12, 0, 8));
    j6.add(cyl(0.012, 0.004, 0.03, '#1b1e21', 0, 0.16 - 0.015, 0, 6));
  } else {
    j6.add(box(0.16, 0.04, 0.06, style.base, 0, 0.1, 0));
    j6.add(box(0.03, 0.1, 0.05, '#c9ced3', -0.06, 0.16, 0));
    j6.add(box(0.03, 0.1, 0.05, '#c9ced3', 0.06, 0.16, 0));
  }
  j6.add(tip);

  root.add(j1);
  j1.add(j2);
  j2.add(j3);
  j3.add(j4);
  j4.add(j5);
  j5.add(j6);
  const joints = [j1, j2, j3, j4, j5, j6];

  // Joint i rotates about Y (1, 4, 6) or Z (2, 3, 5). Positive "lean" angles tip the arm toward +X.
  const set = (q: number[]) => {
    j1.rotation.y = q[0];
    j2.rotation.z = -q[1];
    j3.rotation.z = -q[2];
    j4.rotation.y = q[3];
    j5.rotation.z = -q[4];
    j6.rotation.y = q[5];
  };

  const solveDown = (t: THREE.Vector3) => {
    const yaw = Math.atan2(-t.z, t.x);
    const x = Math.hypot(t.x, t.z);
    const y = t.y + LT - S; // wrist centre above the target, relative to the shoulder
    let D = Math.hypot(x, y);
    const max = L1 + L2 - 1e-3;
    const ok = D <= max;
    D = Math.min(D, max);
    const c2 = Math.min(1, Math.max(-1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
    const p2 = Math.acos(c2);
    const alpha = Math.atan2(x, y);
    const p1 = alpha - Math.atan2(L2 * Math.sin(p2), L1 + L2 * Math.cos(p2));
    return { q: [yaw, p1, p2, 0, Math.PI - p1 - p2, 0], ok };
  };
  const reachDown = (t: THREE.Vector3) => {
    const { q, ok } = solveDown(t);
    set(q);
    return ok;
  };

  return { root, joints, tip, S, L1, L2, LT, set, reachDown, solveDown: (t: THREE.Vector3) => solveDown(t).q };
}

// ---------- AMR with an industrial arm on top ----------
export function createAMR() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(new RoundedBoxGeometry(2.4, 0.55, 1.6, 3, 0.14), mat('#2f3439'), 0, 0.5, 0));
  body.add(mesh(new RoundedBoxGeometry(2.3, 0.08, 1.5, 2, 0.03), mat('#5a6168'), 0, 0.81, 0));
  // status light strip and safety bumpers
  body.add(box(2.42, 0.06, 0.04, glow('#36d1ff', 1.2), 0, 0.42, 0.81));
  body.add(box(2.42, 0.06, 0.04, glow('#36d1ff', 1.2), 0, 0.42, -0.81));
  body.add(box(0.06, 0.14, 1.5, mat('#f2c230'), 1.22, 0.36, 0));
  body.add(box(0.06, 0.14, 1.5, mat('#f2c230'), -1.22, 0.36, 0));
  body.add(cyl(0.13, 0.15, 0.14, '#16191c', 1.0, 0.92, 0, 16)); // lidar
  body.add(cyl(0.11, 0.11, 0.04, glow('#ff4d4d', 0.6), 0.98, 1.0, 0, 16));
  body.add(cyl(0.08, 0.08, 0.08, '#d93a2b', -1.0, 0.89, 0.6, 12)); // e-stop
  body.add(box(0.3, 0.02, 0.2, glow('#7cf29a', 0.9), -0.95, 0.86, -0.5));

  const wheels: THREE.Mesh[] = [];
  for (const z of [-0.8, 0.8]) {
    const w = cyl(0.24, 0.24, 0.14, '#16191c', 0, 0.24, z, 14);
    w.rotation.x = Math.PI / 2;
    body.add(w);
    wheels.push(w);
  }
  for (const [x, z] of [
    [0.95, 0.6],
    [0.95, -0.6],
    [-0.95, 0.6],
    [-0.95, -0.6],
  ]) {
    body.add(ball(0.1, '#16191c', x, 0.1, z, 0));
  }

  const arm = createArm({ body: '#f2c200', accent: '#262a2e', base: '#3a3f45' });
  arm.root.position.set(-0.25, 0.85, 0);
  arm.root.scale.setScalar(0.95);
  body.add(arm.root);

  // a crate in the gripper's reach, just for character
  body.add(box(0.5, 0.36, 0.5, mat('#b98552'), 0.55, 1.03, 0.35));
  return { root, body, wheels, arm };
}

// ---------- quadcopter ----------
export function createDrone(opts: { color?: string; gimbal?: boolean; scale?: number } = {}) {
  const root = new THREE.Group();
  const color = opts.color ?? '#2b3036';
  root.add(mesh(new RoundedBoxGeometry(0.62, 0.2, 0.42, 2, 0.06), mat(color), 0, 0, 0));
  root.add(box(0.2, 0.06, 0.18, mat('#1a1d20'), 0, 0.13, 0));
  const props: THREE.Group[] = [];
  for (const [x, z] of [
    [0.55, 0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [-0.55, -0.55],
  ]) {
    const arm = box(0.8, 0.05, 0.07, mat(color), x / 2, 0.02, z / 2);
    arm.rotation.y = -Math.atan2(z, x);
    root.add(arm);
    root.add(cyl(0.07, 0.07, 0.1, '#16191c', x, 0.07, z, 10));
    const prop = new THREE.Group();
    prop.position.set(x, 0.14, z);
    prop.add(box(0.62, 0.012, 0.06, mat('#d9dde1'), 0, 0, 0));
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.31, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.15, depthWrite: false }),
    );
    prop.add(disc);
    root.add(prop);
    props.push(prop);
  }
  root.add(box(0.04, 0.03, 0.04, glow('#4dff88'), 0.32, 0.02, 0));
  root.add(box(0.04, 0.03, 0.04, glow('#ff4d4d'), -0.32, 0.02, 0));
  for (const z of [-0.18, 0.18]) root.add(box(0.5, 0.03, 0.03, mat('#16191c'), 0, -0.22, z));
  for (const [x, z] of [
    [0.18, 0.18],
    [-0.18, 0.18],
    [0.18, -0.18],
    [-0.18, -0.18],
  ])
    root.add(box(0.03, 0.14, 0.03, mat('#16191c'), x, -0.15, z));

  let gimbal: THREE.Group | undefined;
  if (opts.gimbal) {
    gimbal = new THREE.Group();
    gimbal.position.y = 0.2;
    gimbal.add(box(0.05, 0.16, 0.05, mat('#16191c'), 0, 0.08, 0));
    const head = new THREE.Group();
    head.add(box(0.2, 0.14, 0.16, mat('#d4d9de'), 0, 0, 0));
    const lens = cyl(0.045, 0.045, 0.06, '#16191c', 0.12, 0, 0, 10);
    lens.rotation.z = Math.PI / 2;
    head.add(lens);
    head.add(box(0.04, 0.05, 0.14, glow('#fff3c4', 2), 0.1, 0.09, 0));
    head.position.y = 0.2;
    gimbal.add(head);
    root.add(gimbal);
    gimbal.userData.head = head;
  }
  root.scale.setScalar(opts.scale ?? 1);
  const update = (dt: number) => {
    for (const p of props) p.rotation.y += dt * 40;
  };
  return { root, props, gimbal, update };
}

// ---------- six-wheel rover ----------
export function createRover() {
  const root = new THREE.Group();
  root.add(box(1.4, 0.3, 0.9, mat('#e8eaec'), 0, 0.75, 0));
  root.add(box(1.2, 0.04, 0.8, mat('#2b5aa8', { metalness: 0.4, roughness: 0.3 }), 0, 0.94, 0));
  root.add(box(1.42, 0.05, 0.92, mat('#2366c9'), 0, 0.62, 0));
  const wheels: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    root.add(box(1.3, 0.06, 0.06, mat('#9aa3ab'), 0, 0.5, side * 0.55));
    for (const x of [-0.55, 0, 0.55]) {
      const w = cyl(0.2, 0.2, 0.16, '#26292d', x, 0.2, side * 0.62, 12);
      w.rotation.x = Math.PI / 2;
      root.add(w);
      wheels.push(w);
      root.add(box(0.05, 0.32, 0.05, mat('#9aa3ab'), x, 0.36, side * 0.55));
    }
  }
  root.add(cyl(0.04, 0.04, 0.7, '#9aa3ab', 0.45, 1.25, 0, 8));
  const head = new THREE.Group();
  head.position.set(0.45, 1.62, 0);
  head.add(box(0.2, 0.14, 0.34, mat('#e8eaec')));
  for (const z of [-0.09, 0.09]) {
    const lens = cyl(0.04, 0.04, 0.06, '#16191c', 0.11, 0, z, 10);
    lens.rotation.z = Math.PI / 2;
    head.add(lens);
  }
  root.add(head);
  // small arm on the front
  const arm = createArm({ body: '#e8eaec', accent: '#2366c9', base: '#9aa3ab', l1: 0.35, l2: 0.3 });
  arm.root.scale.setScalar(0.7);
  arm.root.position.set(-0.4, 0.9, 0.2);
  arm.set([0.4, 0.6, 1.6, 0, 1.0, 0]);
  root.add(arm.root);
  return { root, wheels, head };
}

// ---------- people ----------
export function createFigure(shirt: string, opts: { pants?: string; skin?: string; helmet?: string } = {}) {
  const root = new THREE.Group();
  const pants = opts.pants ?? '#34404c';
  const skin = opts.skin ?? '#d9a37e';
  const hip = new THREE.Group();
  hip.position.y = 0.9;
  root.add(hip);
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(0, 0, 0.13);
  legR.position.set(0, 0, -0.13);
  legL.add(box(0.18, 0.88, 0.2, pants, 0, -0.44, 0));
  legR.add(box(0.18, 0.88, 0.2, pants, 0, -0.44, 0));
  hip.add(legL, legR);
  const torso = mesh(new THREE.CapsuleGeometry(0.22, 0.45, 3, 8), mat(shirt), 0, 0.42, 0);
  hip.add(torso);
  const head = ball(0.19, skin, 0, 0.98, 0, 1);
  hip.add(head);
  if (opts.helmet) hip.add(mesh(new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(opts.helmet), 0, 1.0, 0));
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(0, 0.75, 0.3);
  armR.position.set(0, 0.75, -0.3);
  armL.add(box(0.14, 0.7, 0.14, shirt, 0, -0.35, 0));
  armR.add(box(0.14, 0.7, 0.14, shirt, 0, -0.35, 0));
  hip.add(armL, armR);
  return { root, hip, legL, legR, armL, armR };
}

// ---------- signs ----------
export function signSprite(title: string) {
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = 512 * dpr;
  cv.height = 128 * dpr;
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  g.font = '700 54px "Space Grotesk", system-ui, sans-serif';
  const w = Math.min(500, g.measureText(title).width + 64);
  const x = (512 - w) / 2;
  g.fillStyle = 'rgba(14, 26, 35, 0.86)';
  g.beginPath();
  g.roundRect(x, 18, w, 92, 22);
  g.fill();
  g.fillStyle = '#ffb347';
  g.beginPath();
  g.roundRect(x, 18, 12, 92, [22, 0, 0, 22]);
  g.fill();
  g.fillStyle = '#f4f7fa';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, 256 + 6, 66, 440);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, alphaTest: 0.1 }));
  sprite.scale.set(12, 3, 1);
  return sprite;
}
