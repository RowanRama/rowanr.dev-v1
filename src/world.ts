import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Island: a ring of beach, one mountain in the middle, a spiral road up to the summit.
export const SIZE = 460; // terrain square, world units
const N = 200; // grid segments per side
const CELL = SIZE / N;
export const SEA = 0;
/** Sky colour at the horizon; the fog and clear colour match it so distant things fade into the sky. */
export const SKY_HORIZON = '#e6a493';

const R_START = 150;
const R_END = 10;
const TURNS = 1.75;
const ROAD_HALF = 4;
const PATH_SAMPLES = 1600;

export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function shape(r: number) {
  const island = smoothstep(200, 150, r);
  return -6 + 8 * island + 56 * Math.exp(-((r / 80) ** 2));
}

function rough(x: number, z: number) {
  const r = Math.hypot(x, z);
  const island = smoothstep(200, 150, r);
  const m = Math.exp(-((r / 80) ** 2));
  const a = Math.atan2(z, x);
  return (
    island *
    (1.4 * Math.sin(0.09 * x + 1.3) * Math.cos(0.08 * z) +
      0.8 * Math.sin(0.19 * x - 0.23 * z) +
      0.45 * Math.cos(0.31 * x + 0.27 * z) +
      5 * m * Math.sin(5 * a + r * 0.06) * smoothstep(8, 40, r))
  );
}

/** Terrain height before the road and pads are carved in. */
export const baseHeight = (x: number, z: number) => shape(Math.hypot(x, z)) + rough(x, z);

// ---------- biomes ----------
// Australian outback and gum forest on one side of the mountain, Papua New Guinea rainforest on the other.
export type Biome = 'outback' | 'gum' | 'rainforest' | 'meadow';
export function biomeAt(x: number, z: number): Biome {
  const r = Math.hypot(x, z);
  if (r < 22) return 'meadow';
  let a = (Math.atan2(z, x) * 180) / Math.PI;
  a += 9 * Math.sin(r * 0.07) + 5 * Math.sin(x * 0.05 + z * 0.03); // ragged borders
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  if (a >= -100 && a < -35) return 'outback';
  if (a >= -165 && a < -100) return 'gum';
  if (a >= 112 || a < -165) return 'rainforest';
  return 'meadow';
}

// ---------- the road ----------
export interface PathSample {
  p: THREE.Vector3;
  out: THREE.Vector3; // horizontal unit vector pointing away from the summit
}
const samples: PathSample[] = [];
const cum: number[] = [];
for (let i = 0; i <= PATH_SAMPLES; i++) {
  const s = i / PATH_SAMPLES;
  const theta = Math.PI / 2 + s * TURNS * Math.PI * 2;
  const r = R_START + (R_END - R_START) * s;
  const x = r * Math.cos(theta);
  const z = r * Math.sin(theta);
  const out = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  samples.push({ p: new THREE.Vector3(x, shape(r), z), out });
  cum.push(i === 0 ? 0 : cum[i - 1] + samples[i].p.distanceTo(samples[i - 1].p));
}
export const PATH_LENGTH = cum[cum.length - 1];

/** Point on the road at arc-length fraction u in [0, 1]. */
export function pathAt(u: number) {
  const d = Math.min(1, Math.max(0, u)) * PATH_LENGTH;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid;
    else hi = mid;
  }
  const f = cum[hi] === cum[lo] ? 0 : (d - cum[lo]) / (cum[hi] - cum[lo]);
  const p = samples[lo].p.clone().lerp(samples[hi].p, f);
  const tangent = samples[hi].p.clone().sub(samples[lo].p).setY(0).normalize();
  const out = samples[lo].out.clone().lerp(samples[hi].out, f).normalize();
  return { p, tangent, out };
}

/** Nearest arc-length fraction on the road to a world point. */
export function nearestU(x: number, z: number) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples.length; i += 2) {
    const d = (samples[i].p.x - x) ** 2 + (samples[i].p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return cum[best] / PATH_LENGTH;
}

// ---------- height grid ----------
const V = N + 1;
const heights = new Float32Array(V * V);
const roadDist = new Float32Array(V * V).fill(Infinity);
const roadY = new Float32Array(V * V);
const padMask = new Uint8Array(V * V);

export interface Pad {
  x: number;
  z: number;
  y: number;
  r: number;
}

const idx = (i: number, j: number) => j * V + i;
const toGrid = (w: number) => (w + SIZE / 2) / CELL;

function splat(cx: number, cz: number, radius: number, fn: (k: number, d: number) => void) {
  const i0 = Math.max(0, Math.floor(toGrid(cx - radius)));
  const i1 = Math.min(N, Math.ceil(toGrid(cx + radius)));
  const j0 = Math.max(0, Math.floor(toGrid(cz - radius)));
  const j1 = Math.min(N, Math.ceil(toGrid(cz + radius)));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = i * CELL - SIZE / 2;
      const z = j * CELL - SIZE / 2;
      const d = Math.hypot(x - cx, z - cz);
      if (d <= radius) fn(idx(i, j), d);
    }
  }
}

export function buildHeights(pads: Pad[]) {
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const x = i * CELL - SIZE / 2;
      const z = j * CELL - SIZE / 2;
      heights[idx(i, j)] = shape(Math.hypot(x, z)) + rough(x, z);
    }
  }
  for (const s of samples) {
    splat(s.p.x, s.p.z, ROAD_HALF + 8, (k, d) => {
      if (d < roadDist[k]) {
        roadDist[k] = d;
        roadY[k] = s.p.y;
      }
    });
  }
  for (let k = 0; k < heights.length; k++) {
    if (roadDist[k] === Infinity) continue;
    const w = 1 - smoothstep(ROAD_HALF + 0.5, ROAD_HALF + 8, roadDist[k]);
    heights[k] += (roadY[k] - heights[k]) * w;
  }
  for (const pad of pads) {
    splat(pad.x, pad.z, pad.r + 7, (k, d) => {
      const w = 1 - smoothstep(pad.r, pad.r + 7, d);
      heights[k] += (pad.y - heights[k]) * w;
      if (d < pad.r + 2) padMask[k] = 1;
    });
  }
}

/** Ground height at a world point (bilinear on the grid). */
export function heightAt(x: number, z: number) {
  const gx = Math.min(N - 1e-4, Math.max(0, toGrid(x)));
  const gz = Math.min(N - 1e-4, Math.max(0, toGrid(z)));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const h00 = heights[idx(i, j)];
  const h10 = heights[idx(i + 1, j)];
  const h01 = heights[idx(i, j + 1)];
  const h11 = heights[idx(i + 1, j + 1)];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

export function normalAt(x: number, z: number, target = new THREE.Vector3()) {
  const e = 1.2;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return target.set(-dx, 2 * e, -dz).normalize();
}

function nearRoad(x: number, z: number) {
  const k = idx(Math.round(toGrid(x)), Math.round(toGrid(z)));
  return roadDist[k] < ROAD_HALF + 6 || padMask[k] === 1;
}
/** True when a point is off the road, its verges and every flattened pad. */
export const clearOfRoad = (x: number, z: number) => !nearRoad(x, z);

// ---------- meshes ----------
const C = {
  sandWet: new THREE.Color('#b9a77a'),
  sand: new THREE.Color('#e6d29c'),
  grass: new THREE.Color('#79b25a'),
  grassDark: new THREE.Color('#5a9446'),
  rock: new THREE.Color('#8e8780'),
  rockDark: new THREE.Color('#6f6862'),
  snow: new THREE.Color('#f3f6fa'),
  red: new THREE.Color('#a8573a'),
  redDark: new THREE.Color('#934a30'),
  dry: new THREE.Color('#9da35a'),
  dryDark: new THREE.Color('#87904a'),
  jungle: new THREE.Color('#3e8038'),
  jungleDark: new THREE.Color('#2f6a2e'),
};
const GROUND: Record<Biome, [THREE.Color, THREE.Color]> = {
  meadow: [C.grass, C.grassDark],
  outback: [C.red, C.redDark],
  gum: [C.dry, C.dryDark],
  rainforest: [C.jungle, C.jungleDark],
};

function terrainMesh() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) {
    const i = Math.round(toGrid(pos.getX(k)));
    const j = Math.round(toGrid(pos.getZ(k)));
    pos.setY(k, heights[idx(i, j)]);
  }
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  const p = flat.attributes.position as THREE.BufferAttribute;
  const n = flat.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const r = rng(7);
  for (let t = 0; t < p.count; t += 3) {
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const ground = GROUND[biomeAt((p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3)];
    const ny = n.getY(t);
    const jitter = r() * 0.08 - 0.04;
    if (y < -0.4) c.copy(C.sandWet);
    else if (y < 1.8) c.copy(C.sand);
    else if (y > 33 && ny > 0.62) c.copy(C.snow);
    else if (ny < 0.72 || y > 30) c.copy(r() > 0.5 ? C.rock : C.rockDark);
    else c.copy(r() > 0.35 ? ground[0] : ground[1]);
    c.offsetHSL(0, 0, jitter);
    for (let v = 0; v < 3; v++) c.toArray(colors, (t + v) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    flat,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function roadTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2c313a';
  g.fillRect(0, 0, 128, 256);
  // the glow map: neon edge lines and a dashed centre, black everywhere else
  const gv = document.createElement('canvas');
  gv.width = 128;
  gv.height = 256;
  const e = gv.getContext('2d')!;
  e.fillStyle = '#000';
  e.fillRect(0, 0, 128, 256);
  for (const c of [g, e]) {
    c.fillStyle = '#36e0ff';
    c.fillRect(7, 0, 3, 256);
    c.fillRect(118, 0, 3, 256);
    c.fillStyle = '#c8f6ff';
    c.fillRect(63, 20, 2, 90);
    c.fillRect(63, 148, 2, 90);
  }
  const make = (cv: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  return { map: make(cv), glowMap: make(gv) };
}

function roadMesh() {
  const pts: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let v = 0;
  const step = 2;
  for (let i = 0, row = 0; i < samples.length; i += step, row++) {
    const s = samples[i];
    const prev = samples[Math.max(0, i - step)].p;
    const next = samples[Math.min(samples.length - 1, i + step)].p;
    const tan = next.clone().sub(prev).setY(0).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(ROAD_HALF);
    for (const sign of [-1, 1]) {
      const x = s.p.x + side.x * sign;
      const z = s.p.z + side.z * sign;
      pts.push(x, Math.max(heightAt(x, z), s.p.y) + 0.14, z);
      uvs.push(sign < 0 ? 0 : 1, v);
    }
    if (row > 0) {
      const a = (row - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    if (i + step < samples.length) v += samples[Math.min(samples.length - 1, i + step)].p.distanceTo(s.p) / 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const { map, glowMap } = roadTexture();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map,
      emissive: '#ffffff',
      emissiveMap: glowMap,
      emissiveIntensity: 1.4,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function sky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#141b45') },
      mid: { value: new THREE.Color('#5b4f9c') },
      horizon: { value: new THREE.Color(SKY_HORIZON) },
      bottom: { value: new THREE.Color('#3a4f86') },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    // dusk: a warm band on the horizon fading through violet to deep blue overhead
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c;
      if (h > 0.0) { c = mix(horizon, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.18, 0.75, h)); }
      else c = mix(horizon, bottom, min(1.0, -h * 4.0));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), mat);
  m.renderOrder = -1;
  // faint stars in the upper sky
  const r = rng(77);
  const pts: number[] = [];
  while (pts.length < 600 * 3) {
    const v = new THREE.Vector3(r() * 2 - 1, r(), r() * 2 - 1);
    if (v.lengthSq() > 1 || v.y < 0.35) continue;
    v.normalize().multiplyScalar(1300);
    pts.push(v.x, v.y, v.z);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
  stars.renderOrder = -1;
  const g = new THREE.Group();
  g.add(m, stars);
  return g;
}

function water() {
  const g = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(1300, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#2a8fb0',
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      metalness: 0.3,
      side: THREE.DoubleSide,
    }),
  );
  surface.position.y = SEA;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1300, 32).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#7d8f78', roughness: 1 }),
  );
  floor.position.y = -6.4;
  g.add(floor, surface);
  return g;
}

// tree shapes, each a trunk and a crown merged into one geometry per part
function treeKinds() {
  const pine = {
    trunk: new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5).translate(0, 0.8, 0),
    crown: new THREE.ConeGeometry(1.6, 4.2, 6).translate(0, 3.6, 0),
    trunkColor: '#6b4a32',
    crownColor: '#2f6f3e',
  };
  const gum = {
    trunk: mergeGeometries([
      new THREE.CylinderGeometry(0.16, 0.3, 4.4, 6).translate(0, 2.2, 0),
      new THREE.CylinderGeometry(0.08, 0.14, 2, 5).rotateZ(0.6).translate(-0.6, 3.6, 0),
    ]),
    crown: mergeGeometries([
      new THREE.IcosahedronGeometry(1.3, 0).scale(1, 0.6, 1).translate(0.3, 4.7, 0.2),
      new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1).translate(-1.2, 4.4, -0.3),
      new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.6, 1).translate(0.6, 3.8, -0.9),
    ]),
    trunkColor: '#e6dfd2', // pale gum bark
    crownColor: '#7d9a6a',
  };
  const broadleaf = {
    trunk: new THREE.CylinderGeometry(0.22, 0.45, 5, 6).translate(0, 2.5, 0),
    crown: mergeGeometries([
      new THREE.DodecahedronGeometry(2, 0).scale(1, 0.7, 1).translate(0, 5.3, 0),
      new THREE.DodecahedronGeometry(1.2, 0).scale(1, 0.7, 1).translate(1.1, 4.4, 0.7),
    ]),
    trunkColor: '#5a3f2b',
    crownColor: '#2c6a2c',
  };
  const fronds = [];
  for (let i = 0; i < 7; i++) fronds.push(new THREE.BoxGeometry(2.4, 0.06, 0.5).translate(1.1, 0, 0).rotateZ(-0.35).rotateY((i / 7) * Math.PI * 2).translate(0.5, 5, 0));
  const palm = {
    trunk: new THREE.CylinderGeometry(0.16, 0.24, 5.2, 6).translate(0, 2.6, 0).rotateZ(-0.1),
    crown: mergeGeometries(fronds),
    trunkColor: '#8b7355',
    crownColor: '#3f8a3a',
  };
  return { pine, gum, broadleaf, palm };
}
type TreeKind = keyof ReturnType<typeof treeKinds>;

function trees() {
  const r = rng(42);
  const spots: { p: THREE.Vector3; kind: TreeKind }[] = [];
  let guard = 0;
  // the rainforest gets extra trees; the outback is mostly open
  while (spots.length < 760 && guard++ < 40000) {
    const a = r() * Math.PI * 2;
    const rad = 20 + r() * 145;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const y = heightAt(x, z);
    if (y < 2.6 || y > 30) continue;
    if (normalAt(x, z).y < 0.8) continue;
    if (nearRoad(x, z)) continue;
    const biome = biomeAt(x, z);
    if (biome === 'outback' && r() > 0.12) continue;
    if (biome === 'meadow' && spots.length > 520) continue;
    if (biome === 'gum' && r() > 0.7) continue;
    const kind: TreeKind = biome === 'rainforest' ? (y < 7 && r() > 0.4 ? 'palm' : 'broadleaf') : biome === 'meadow' ? 'pine' : 'gum';
    spots.push({ p: new THREE.Vector3(x, y, z), kind });
  }
  const g = new THREE.Group();
  const kinds = treeKinds();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  for (const [name, kind] of Object.entries(kinds) as [TreeKind, (typeof kinds)[TreeKind]][]) {
    const list = spots.filter((s) => s.kind === name);
    if (!list.length) continue;
    const trunk = new THREE.InstancedMesh(kind.trunk, new THREE.MeshStandardMaterial({ color: kind.trunkColor, flatShading: true }), list.length);
    const crown = new THREE.InstancedMesh(kind.crown, new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true }), list.length);
    list.forEach(({ p }, i) => {
      const k = 0.7 + r() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(p, q, sc.set(k, k * (0.9 + r() * 0.4), k));
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      crown.setColorAt(i, col.set(kind.crownColor).offsetHSL(r() * 0.05 - 0.02, 0, r() * 0.1 - 0.05));
    });
    crown.castShadow = true;
    g.add(trunk, crown);
  }
  return g;
}

function rocks() {
  const r = rng(9);
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const count = 160;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#86807a', flatShading: true }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < 10000) {
    const a = r() * Math.PI * 2;
    const rad = 10 + r() * 160;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (nearRoad(x, z)) continue;
    const y = heightAt(x, z);
    if (y < 0.5) continue;
    const k = 0.4 + r() * 1.6;
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    m.compose(new THREE.Vector3(x, y + k * 0.2, z), q, new THREE.Vector3(k, k * 0.7, k));
    mesh.setMatrixAt(placed++, m);
  }
  mesh.count = placed;
  mesh.castShadow = true;
  return mesh;
}

function clouds() {
  const g = new THREE.Group();
  const r = rng(3);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  for (let c = 0; c < 9; c++) {
    const cloud = new THREE.Group();
    const parts = 4 + Math.floor(r() * 4);
    for (let p = 0; p < parts; p++) {
      const s = 4 + r() * 6;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat);
      puff.position.set(p * 6 - parts * 3, r() * 3, r() * 6 - 3);
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    const a = (c / 9) * Math.PI * 2;
    const rad = 120 + r() * 140;
    cloud.position.set(Math.cos(a) * rad, 78 + r() * 30, Math.sin(a) * rad);
    g.add(cloud);
  }
  return g;
}

export function buildWorld(scene: THREE.Scene, pads: Pad[]) {
  buildHeights(pads);
  const cloudLayer = clouds();
  // sci-fi landmarks: a glowing ring orbiting the mountain and a beacon beam from the summit
  const ring = new THREE.Group();
  const neon = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#36e0ff', emissiveIntensity: 3 });
  ring.add(new THREE.Mesh(new THREE.TorusGeometry(135, 0.6, 6, 160).rotateX(Math.PI / 2), neon));
  ring.add(new THREE.Mesh(new THREE.TorusGeometry(128, 0.25, 4, 160).rotateX(Math.PI / 2), neon));
  ring.position.y = 72;
  ring.rotation.z = 0.12;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.6, 600, 12, 1, true).translate(0, 300, 0),
    new THREE.MeshBasicMaterial({ color: '#7ff0ff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  beam.position.y = heightAt(0, 0);
  scene.add(sky(), water(), terrainMesh(), roadMesh(), trees(), rocks(), cloudLayer, ring, beam);
  return {
    update(dt: number) {
      cloudLayer.rotation.y += dt * 0.004;
      ring.rotation.y += dt * 0.03;
    },
  };
}

/** Colours for the minimap, sampled from the same rules as the terrain. */
export function minimapImage(size: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const c = new THREE.Color();
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * SIZE;
      const z = (py / size - 0.5) * SIZE;
      const y = heightAt(x, z);
      const k = idx(Math.round(toGrid(x)), Math.round(toGrid(z)));
      if (roadDist[k] < ROAD_HALF) c.set('#4a5057');
      else if (y < SEA) c.set('#2aa3b5').offsetHSL(0, 0, y * 0.02);
      else if (y < 1.8) c.copy(C.sand);
      else if (y > 33) c.copy(C.snow);
      else if (y > 26) c.copy(C.rock);
      else c.copy(GROUND[biomeAt(x, z)][0]).offsetHSL(0, 0, -y * 0.006);
      const o = (py * size + px) * 4;
      const hex = c.getHex(); // sRGB
      img.data[o] = (hex >> 16) & 255;
      img.data[o + 1] = (hex >> 8) & 255;
      img.data[o + 2] = hex & 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
