import * as THREE from 'three';
import { box, createArm, createDrone, cyl, glow, mat, type Arm } from './models';

/*
  A small, honest version of the research planner, running live:
  - the "G-code" is a set of contours on a whiteboard, each inner contour depends on its outer one (layers)
  - each free arm claims the best available contour it can reach (nearest to its base, then nearest to its pen)
  - a claim is only allowed if a conservative prefilter says it's safe against whatever the other arm is doing:
    task regions must be apart by a margin, and neither arm's base-to-task line may pass through the other's region
  - taking an arm offline replans from that moment: its in-progress contour is dropped (successors stay blocked),
    the remaining work goes to the arm that's left, if it can reach it
*/

const W = 1.4; // board size (m)
const D = 0.7;
const H = 0.9; // board top = pedestal top, so the board is level with the arm bases
const UP = 0.07; // pen-up height
const V_DRAW = 0.15;
const V_TRAVEL = 0.55;
const SAFE = 0.06;
const SAFE_LINK = 0.05;

type V2 = { x: number; z: number };
interface Contour {
  id: number;
  pts: V2[];
  center: V2;
  radius: number;
  dep: number | null;
  reach: boolean[];
  state: 'todo' | 'taken' | 'dropped';
}
interface Block {
  agent: number;
  kind: 'travel' | 'draw' | 'home';
  cid: number | null;
  t0: number;
  t1: number; // when the block ends (may be cut short)
  tFull: number; // when it would have ended, for interpolation
  poly: THREE.Vector3[];
  cum: number[];
  drawn: number;
}
interface Agent {
  id: number;
  name: string;
  base: V2;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  freeAt: number;
  enabled: boolean;
  finished: boolean;
  blocks: Block[];
  offlineAt: number | null;
  arm: Arm;
}

function shapePts(kind: number, cx: number, cz: number, r: number): V2[] {
  const out: V2[] = [];
  const poly = (n: number, rot: number) => {
    for (let i = 0; i <= n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
  };
  switch (kind % 5) {
    case 0:
      poly(4, Math.PI / 4);
      break;
    case 1:
      poly(36, 0);
      break;
    case 2:
      poly(6, 0);
      break;
    case 3:
      poly(3, -Math.PI / 2);
      break;
    default:
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        out.push({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr });
      }
  }
  return out;
}

const cumLen = (poly: THREE.Vector3[]) => {
  const c = [0];
  for (let i = 1; i < poly.length; i++) c.push(c[i - 1] + poly[i].distanceTo(poly[i - 1]));
  return c;
};
function pointAt(poly: THREE.Vector3[], cum: number[], d: number, out = new THREE.Vector3()) {
  const total = cum[cum.length - 1];
  if (d <= 0 || total === 0) return out.copy(poly[0]);
  if (d >= total) return out.copy(poly[poly.length - 1]);
  let i = 1;
  while (cum[i] < d) i++;
  const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return out.copy(poly[i - 1]).lerp(poly[i], f);
}
function segDist(a: V2, b: V2, p: V2) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
}

export function createAmpfCell(gantt: HTMLCanvasElement | null) {
  const root = new THREE.Group(); // in metres; the caller scales it

  // lab floor, table legs, whiteboard
  root.add(box(3.2, 0.04, 2.4, mat('#c9cdd1'), 0, 0.02, -0.15));
  root.add(box(W + 0.06, 0.04, D + 0.06, mat('#8d949b'), 0, H - 0.03, 0));
  for (const [x, z] of [
    [-W / 2 + 0.05, -D / 2 + 0.05],
    [W / 2 - 0.05, -D / 2 + 0.05],
    [-W / 2 + 0.05, D / 2 - 0.05],
    [W / 2 - 0.05, D / 2 - 0.05],
  ])
    root.add(box(0.05, H - 0.05, 0.05, mat('#5d646b'), x, (H - 0.05) / 2, z));

  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g2 = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
  board.position.y = H + 0.001;
  board.receiveShadow = true;
  root.add(board);
  const px = (x: number) => ((x + W / 2) / W) * cv.width;
  const pz = (z: number) => ((z + D / 2) / D) * cv.height;

  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const colors = {
    a: token('--arm-a', '#e8590c'),
    b: token('--arm-b', '#1971c2'),
    ghost: token('--board-ghost', '#c7ccd1'),
    ink: token('--ink', '#e9eef2'),
    muted: token('--ink-muted', '#9fb0bd'),
    line: token('--line', '#3a4a57'),
  };
  const agentColor = (i: number) => (i === 0 ? colors.a : colors.b);

  // two pedestal-mounted arms in line along the back edge of the board
  const bases: V2[] = [
    { x: -0.38, z: -0.55 },
    { x: 0.38, z: -0.55 },
  ];
  const agents: Agent[] = bases.map((b, i) => {
    root.add(box(0.3, H, 0.3, mat('#6b737b'), b.x, H / 2, b.z));
    root.add(box(0.34, 0.03, 0.34, mat('#4b5258'), b.x, H - 0.015, b.z));
    const arm = createArm({ body: '#eef0f2', accent: '#3a3f45', base: '#55606a', l1: 0.7, l2: 0.65, tool: 'pen' });
    arm.root.position.set(b.x, H, b.z);
    root.add(arm.root);
    root.add(box(0.06, 0.02, 0.06, glow(agentColor(i), 1.4), b.x + 0.12, H + 0.06, b.z + 0.12));
    const home = new THREE.Vector3(b.x * 0.9, UP + 0.18, -D / 2 + 0.02);
    return {
      id: i,
      name: i === 0 ? 'Arm A' : 'Arm B',
      base: b,
      home,
      pos: home.clone(),
      freeAt: 0,
      enabled: true,
      finished: false,
      blocks: [],
      offlineAt: null,
      arm,
    };
  });

  // a screen on a stand, mirroring the live schedule
  let screenTex: THREE.CanvasTexture | null = null;
  if (gantt) {
    screenTex = new THREE.CanvasTexture(gantt);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Group();
    screen.add(box(0.05, 1.3, 0.05, mat('#3a3f45'), 0, 0.65, 0));
    screen.add(box(0.98, 0.32, 0.04, mat('#16191c'), 0, 1.42, 0));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.28), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    face.position.set(0, 1.42, 0.021);
    screen.add(face);
    screen.position.set(1.05, 0, -0.45);
    screen.rotation.y = -0.35;
    root.add(screen);
  }

  let contours: Contour[] = [];
  let doneAt = new Map<number, number>();
  let t = 0;
  let seed = 0;
  let endT = 0;

  const reachable = (a: Agent, c: Contour) =>
    c.pts.every((p) => {
      const x = Math.hypot(p.x - a.base.x, p.z - a.base.z);
      const y = a.arm.LT - a.arm.S;
      return Math.hypot(x, y) < a.arm.L1 + a.arm.L2 - 0.02 && x > 0.2;
    });

  function newJob() {
    seed++;
    contours = [];
    const cols = [-0.54, -0.27, 0, 0.27, 0.54];
    const rows = [-0.15, 0.17];
    let id = 0;
    rows.forEach((z, ri) =>
      cols.forEach((x, ci) => {
        const k = ci + ri * 2 + seed;
        const outer: Contour = { id: id++, pts: shapePts(k, x, z, 0.105), center: { x, z }, radius: 0.105, dep: null, reach: [], state: 'todo' };
        const inner: Contour = { id: id++, pts: shapePts(k + 2, x, z, 0.05), center: { x, z }, radius: 0.05, dep: outer.id, reach: [], state: 'todo' };
        contours.push(outer, inner);
      }),
    );
    for (const c of contours) c.reach = agents.map((a) => reachable(a, c));
    doneAt = new Map();
    t = 0;
    for (const a of agents) {
      a.blocks = [];
      a.pos = a.home.clone();
      a.freeAt = 0;
      a.enabled = true;
      a.finished = false;
      a.offlineAt = null;
    }
    g2.fillStyle = '#fbfcfd';
    g2.fillRect(0, 0, cv.width, cv.height);
    g2.setLineDash([10, 10]);
    g2.lineWidth = 3;
    g2.strokeStyle = colors.ghost;
    for (const c of contours) strokePts(c.pts.map((p) => ({ x: px(p.x), y: pz(p.z) })));
    g2.setLineDash([]);
    tex.needsUpdate = true;
    plan();
  }

  function strokePts(p: { x: number; y: number }[]) {
    g2.beginPath();
    p.forEach((q, i) => (i ? g2.lineTo(q.x, q.y) : g2.moveTo(q.x, q.y)));
    g2.stroke();
  }

  function addBlock(a: Agent, kind: Block['kind'], cid: number | null, t0: number, poly: THREE.Vector3[], speed: number) {
    const cum = cumLen(poly);
    const dur = Math.max(0.05, cum[cum.length - 1] / speed);
    const b: Block = { agent: a.id, kind, cid, t0, t1: t0 + dur, tFull: t0 + dur, poly, cum, drawn: 0 };
    a.blocks.push(b);
    a.pos = poly[poly.length - 1].clone();
    a.freeAt = b.t1;
    return b;
  }

  function safe(a: Agent, c: Contour, t0: number, t1: number) {
    for (const o of agents) {
      if (o === a) continue;
      for (const b of o.blocks) {
        if (b.cid === null || b.t1 <= t0 || b.t0 >= t1) continue;
        const oc = contours[b.cid];
        if (Math.hypot(c.center.x - oc.center.x, c.center.z - oc.center.z) < c.radius + oc.radius + SAFE) return false;
        if (segDist(a.base, c.center, oc.center) < oc.radius + SAFE_LINK) return false;
        if (segDist(o.base, oc.center, c.center) < c.radius + SAFE_LINK) return false;
      }
    }
    return true;
  }

  function plan() {
    for (let guard = 0; guard < 4000; guard++) {
      const live = agents.filter((a) => a.enabled && !a.finished);
      if (!live.length) break;
      const a = live.reduce((m, x) => (x.freeAt < m.freeAt ? x : m));
      const now = a.freeAt;
      const open = contours.filter(
        (c) => c.state === 'todo' && c.reach[a.id] && (c.dep === null || (doneAt.has(c.dep) && doneAt.get(c.dep)! <= now)),
      );
      const later = (): number => {
        const ts: number[] = [];
        for (const v of doneAt.values()) if (v > now) ts.push(v);
        for (const o of agents) for (const b of o.blocks) if (b.t1 > now) ts.push(b.t1);
        return ts.length ? Math.min(...ts) : Infinity;
      };
      const stillPossible = contours.some(
        (c) => c.state === 'todo' && c.reach[a.id] && (c.dep === null || doneAt.has(c.dep) || contours[c.dep].state === 'todo'),
      );
      if (!open.length) {
        const next = later();
        if (stillPossible && next < Infinity) {
          a.freeAt = next;
          continue;
        }
        finish(a, now);
        continue;
      }
      const score = (c: Contour) =>
        Math.hypot(c.center.x - a.base.x, c.center.z - a.base.z) + 0.3 * Math.hypot(c.pts[0].x - a.pos.x, c.pts[0].z - a.pos.z);
      open.sort((p, q) => score(p) - score(q));
      let claimed = false;
      for (const c of open) {
        const start = new THREE.Vector3(c.pts[0].x, 0, c.pts[0].z);
        const travel = [a.pos.clone(), a.pos.clone().setY(UP), start.clone().setY(UP), start];
        const drawPoly = c.pts.map((p) => new THREE.Vector3(p.x, 0, p.z));
        const tt = cumLen(travel).at(-1)! / V_TRAVEL;
        const td = cumLen(drawPoly).at(-1)! / V_DRAW;
        if (!safe(a, c, now, now + tt + td)) continue;
        c.state = 'taken';
        addBlock(a, 'travel', c.id, now, travel, V_TRAVEL);
        const b = addBlock(a, 'draw', c.id, a.freeAt, drawPoly, V_DRAW);
        doneAt.set(c.id, b.t1);
        claimed = true;
        break;
      }
      if (!claimed) {
        const next = later();
        a.freeAt = next < Infinity ? next : now + 0.25;
      }
    }
    endT = Math.max(...agents.map((a) => a.blocks.at(-1)?.t1 ?? 0));
  }

  function finish(a: Agent, now: number) {
    a.finished = true;
    if (a.pos.distanceTo(a.home) > 1e-3) addBlock(a, 'home', null, now, [a.pos.clone(), a.pos.clone().setY(UP), a.home.clone()], V_TRAVEL);
  }

  function penAt(a: Agent, time: number, out: THREE.Vector3) {
    let last: Block | null = null;
    for (const b of a.blocks) {
      if (time < b.t0) break;
      last = b;
      if (time < b.t1) {
        const f = (time - b.t0) / (b.tFull - b.t0);
        return { p: pointAt(b.poly, b.cum, f * b.cum.at(-1)!, out), block: b };
      }
    }
    if (!last) return { p: out.copy(a.home), block: null };
    const f = (last.t1 - last.t0) / (last.tFull - last.t0);
    return { p: pointAt(last.poly, last.cum, f * last.cum.at(-1)!, out), block: null };
  }

  function takeOffline(index: number) {
    const off = agents[index];
    if (!off.enabled) return;
    const tr = t;
    const pen = new THREE.Vector3();
    for (const a of agents) {
      if (!a.enabled) continue;
      const keep: Block[] = [];
      let resumeAt = tr;
      penAt(a, tr, pen);
      a.pos.copy(pen);
      for (const b of a.blocks) {
        if (b.t1 <= tr) {
          keep.push(b);
          continue;
        }
        if (b.t0 >= tr) {
          // planned but not started: hand the contour back
          if (b.cid !== null && b.kind === 'travel') {
            contours[b.cid].state = 'todo';
            doneAt.delete(b.cid);
          }
          continue;
        }
        // in progress at tr
        if (a === off || b.kind === 'home') {
          b.t1 = tr;
          keep.push(b);
          if (a === off && b.cid !== null) {
            // mid-draw: dropped, successors stay blocked. Still travelling: the contour goes back in the pool.
            contours[b.cid].state = b.kind === 'draw' ? 'dropped' : 'todo';
            doneAt.delete(b.cid);
          }
        } else {
          keep.push(b);
          resumeAt = b.t1;
          a.pos.copy(b.poly.at(-1)!);
          if (b.kind === 'travel' && b.cid !== null) {
            // the draw that follows this travel is part of the same claim; keep it
            const draw = a.blocks.find((x) => x.kind === 'draw' && x.cid === b.cid);
            if (draw) {
              keep.push(draw);
              resumeAt = draw.t1;
              a.pos.copy(draw.poly.at(-1)!);
              contours[b.cid].state = 'taken';
              doneAt.set(b.cid, draw.t1);
            }
          }
        }
      }
      a.blocks = keep.filter((b, i, arr) => arr.indexOf(b) === i);
      a.freeAt = resumeAt;
      a.finished = false;
    }
    off.enabled = false;
    off.offlineAt = tr;
    off.finished = true;
    addBlock(off, 'home', null, tr, [off.pos.clone(), off.pos.clone().setY(UP), off.home.clone()], V_TRAVEL);
    plan();
  }

  const pen = new THREE.Vector3();
  const target = new THREE.Vector3();
  const ink: { x: number; y: number }[] = [];

  function update(dt: number) {
    t += dt;
    if (t > endT + 4) newJob();
    for (const a of agents) {
      penAt(a, t, pen);
      target.set(pen.x - a.base.x, pen.y + 0.004, pen.z - a.base.z);
      a.arm.reachDown(target);
      // ink: any draw block that has started gets stroked up to where the pen is now
      g2.lineWidth = 5;
      g2.lineCap = 'round';
      g2.lineJoin = 'round';
      g2.strokeStyle = agentColor(a.id);
      for (const b of a.blocks) {
        if (b.kind !== 'draw' || t <= b.t0) continue;
        const total = b.cum.at(-1)!;
        const upto = Math.min(total, ((Math.min(t, b.t1) - b.t0) / (b.tFull - b.t0)) * total);
        if (upto <= b.drawn + 1e-4) continue;
        ink.length = 0;
        const p = new THREE.Vector3();
        pointAt(b.poly, b.cum, b.drawn, p);
        ink.push({ x: px(p.x), y: pz(p.z) });
        for (let i = 1; i < b.poly.length; i++) if (b.cum[i] > b.drawn && b.cum[i] < upto) ink.push({ x: px(b.poly[i].x), y: pz(b.poly[i].z) });
        pointAt(b.poly, b.cum, upto, p);
        ink.push({ x: px(p.x), y: pz(p.z) });
        strokePts(ink);
        b.drawn = upto;
        tex.needsUpdate = true;
      }
    }
  }

  function drawGantt() {
    if (!gantt) return;
    const g = gantt.getContext('2d')!;
    const Wd = gantt.width;
    const Hd = gantt.height;
    g.clearRect(0, 0, Wd, Hd);
    g.fillStyle = '#0e1a23';
    g.fillRect(0, 0, Wd, Hd);
    const left = 96;
    const right = Wd - 16;
    const span = Math.max(endT, 1);
    const X = (time: number) => left + (time / span) * (right - left);
    g.font = '600 22px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    agents.forEach((a, i) => {
      const y = 46 + i * 64;
      g.fillStyle = colors.ink;
      g.fillText(a.name, 14, y);
      g.fillStyle = colors.line;
      g.fillRect(left, y - 1, right - left, 2);
      for (const b of a.blocks) {
        if (b.kind === 'draw') {
          g.fillStyle = agentColor(i);
          g.globalAlpha = b.cid !== null && contours[b.cid].state === 'dropped' ? 0.35 : 1;
          g.fillRect(X(b.t0), y - 18, Math.max(2, X(b.t1) - X(b.t0) - 2), 36);
          g.globalAlpha = 1;
        } else {
          g.fillStyle = colors.muted;
          g.fillRect(X(b.t0), y - 4, Math.max(1, X(b.t1) - X(b.t0)), 8);
        }
      }
      if (a.offlineAt !== null) {
        g.fillStyle = colors.muted;
        g.fillText('offline', Math.min(right - 80, X(a.offlineAt) + 10), y - 30);
      }
    });
    const done = contours.filter((c) => c.state === 'taken' && (doneAt.get(c.id) ?? Infinity) <= t).length;
    const never = contours.filter((c) => c.state !== 'taken').length;
    g.fillStyle = colors.muted;
    g.font = '400 20px Inter, system-ui, sans-serif';
    g.fillText(`${done} of ${contours.length} contours drawn${never ? `, ${never} left unassigned` : ''}`, 14, Hd - 22);
    g.fillStyle = colors.ink;
    g.fillRect(X(Math.min(t, span)) - 1, 14, 3, Hd - 56);
    if (screenTex) screenTex.needsUpdate = true;
  }

  newJob();
  return {
    root,
    update,
    drawGantt,
    reset: newJob,
    dropB: () => takeOffline(1),
    get bOnline() {
      return agents[1].enabled;
    },
  };
}

// ---------- a drone swarm sharing survey points with the same greedy idea ----------
export function createSwarm(points: THREE.Vector3[], palette: string[]) {
  const root = new THREE.Group();
  const beacons = points.map((p) => {
    const g = new THREE.Group();
    g.position.copy(p);
    g.add(cyl(0.08, 0.1, 1.6, '#4b5258', 0, 0.8, 0, 6));
    const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), mat('#cfd6dc', { emissive: '#000000' }));
    light.position.y = 1.9;
    g.add(light);
    root.add(g);
    return { pos: p.clone().setY(p.y + 4.5), light, claimedBy: -1, done: false };
  });
  const drones = palette.map((color, i) => {
    const d = createDrone({ color: '#2b3036', scale: 1.4 });
    d.root.add(box(0.5, 0.04, 0.5, glow(color, 1.4), 0, -0.13, 0));
    d.root.position.copy(beacons[i % beacons.length].pos).add(new THREE.Vector3(0, 6, 0));
    root.add(d.root);
    return { ...d, color, target: -1, hover: 0 };
  });
  const tmp = new THREE.Vector3();
  let resetIn = 0;
  function update(dt: number, time: number) {
    if (beacons.every((b) => b.done)) {
      resetIn += dt;
      if (resetIn > 3) {
        resetIn = 0;
        for (const b of beacons) {
          b.done = false;
          b.claimedBy = -1;
          b.light.material = mat('#cfd6dc', { emissive: '#000000' });
        }
      }
    }
    drones.forEach((d, i) => {
      d.update(dt);
      if (d.target < 0) {
        let best = -1;
        let bestD = Infinity;
        beacons.forEach((b, k) => {
          if (b.done || b.claimedBy >= 0) return;
          const dd = b.pos.distanceTo(d.root.position);
          if (dd < bestD) {
            bestD = dd;
            best = k;
          }
        });
        if (best >= 0) {
          d.target = best;
          beacons[best].claimedBy = i;
          beacons[best].light.material = mat(d.color, { emissive: d.color, emissiveIntensity: 0.4 });
        }
      }
      const goal = d.target >= 0 ? beacons[d.target].pos : tmp.set(Math.cos(time * 0.3 + i * 2) * 6, 14, Math.sin(time * 0.3 + i * 2) * 6);
      const to = goal.clone().sub(d.root.position);
      const dist = to.length();
      if (dist > 0.2) d.root.position.addScaledVector(to.normalize(), Math.min(dist, dt * 9));
      d.root.rotation.z = THREE.MathUtils.lerp(d.root.rotation.z, -Math.min(0.3, dist * 0.05), dt * 4);
      d.root.position.y += Math.sin(time * 3 + i) * 0.004;
      if (d.target >= 0 && dist < 0.4) {
        d.hover += dt;
        if (d.hover > 1.6) {
          const b = beacons[d.target];
          b.done = true;
          b.light.material = glow(d.color, 1.6);
          d.target = -1;
          d.hover = 0;
        }
      }
    });
  }
  return { root, update };
}
