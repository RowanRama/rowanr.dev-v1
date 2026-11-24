import * as THREE from 'three';
import { ball, box, cyl, glow, mat, mesh } from './models';
import type { Player } from './player';
import type { Station } from './stations';
import { heightAt, pathAt, SEA, SKY_HORIZON } from './world';

// Easter egg: Herald, the little bugler, paces beside the road. Grab him with the AMR's arm and carry him to the
// summit, and the mountain takes him, erupts and sinks the island. You end up on a raft.

const INK = '#3b2414';
const CRIMSON = '#9e1b1b';
const GOLD = '#e0a526';
const SKIN = '#f1c27d';
const NAVY = '#2b3a67';
const WHITE = '#fffdf5';
const brass = () => mat('#d9a93a', { metalness: 0.6, roughness: 0.35 });

/** Herald in low poly: feet at the origin, facing +X, about 1 unit tall. */
function createHerald() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const leg = (z: number, color: string) => {
    const g = new THREE.Group();
    g.position.set(0, 0.38, z);
    g.add(cyl(0.045, 0.05, 0.34, color, 0, -0.17, 0, 8));
    g.add(box(0.15, 0.05, 0.08, INK, 0.03, -0.36, 0));
    body.add(g);
    return g;
  };
  const legL = leg(0.07, NAVY);
  const legR = leg(-0.07, GOLD);
  // tabard, crimson and gold halves, belt and a white shield
  body.add(box(0.18, 0.32, 0.14, CRIMSON, 0, 0.52, 0.07), box(0.18, 0.32, 0.14, GOLD, 0, 0.52, -0.07));
  body.add(box(0.19, 0.04, 0.29, INK, 0, 0.44, 0));
  body.add(box(0.02, 0.1, 0.08, WHITE, 0.095, 0.58, 0.02));
  const arm = (z: number, color: string) => {
    const g = new THREE.Group();
    g.position.set(0, 0.64, z);
    g.add(cyl(0.035, 0.035, 0.27, color, 0, -0.135, 0, 8));
    g.add(ball(0.045, SKIN, 0, -0.29, 0, 0));
    body.add(g);
    return g;
  };
  const armL = arm(0.17, CRIMSON); // the bugle arm
  const armR = arm(-0.17, GOLD);
  const bugle = new THREE.Group();
  bugle.add(cyl(0.016, 0.016, 0.24, brass(), 0, 0.12, 0, 6));
  bugle.add(mesh(new THREE.CylinderGeometry(0.065, 0.016, 0.09, 10), brass(), 0, 0.28, 0));
  bugle.position.y = -0.29;
  bugle.rotation.z = 2.41; // points forward when the arm is raised to play
  armL.add(bugle);

  const head = new THREE.Group();
  head.position.y = 0.68;
  head.add(ball(0.12, SKIN, 0, 0.12, 0, 1));
  for (const z of [-0.045, 0.045]) head.add(ball(0.018, '#1e140c', 0.105, 0.14, z, 0));
  head.add(ball(0.03, '#e8a56a', 0.12, 0.1, 0, 0));
  const cap = new THREE.Group();
  cap.add(mesh(new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(CRIMSON), 0, 0.16, 0));
  cap.add(cyl(0.135, 0.135, 0.035, GOLD, 0, 0.16, 0, 12));
  const feather = mesh(new THREE.ConeGeometry(0.035, 0.4, 5), mat(WHITE), -0.22, 0.33, 0.1);
  feather.rotation.z = 1;
  cap.add(feather);
  head.add(cap);
  body.add(head);

  // a big invisible target, so he's easy to tap
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.5;
  root.add(hit);
  return { root, body, legL, legR, armL, armR, head, cap, bugle, hit };
}
type Herald = ReturnType<typeof createHerald>;

type Pose = 'idle' | 'run' | 'flail';
function pose(h: Herald, p: Pose, t: number) {
  h.armL.rotation.set(0, 0, 0);
  h.armR.rotation.set(0, 0, 0);
  h.head.rotation.set(0, 0, 0);
  h.body.position.y = 0;
  if (p === 'idle') {
    h.legL.rotation.z = h.legR.rotation.z = 0;
    h.armL.rotation.z = 2.3 + Math.sin(t * 9) * 0.05;
    h.armR.rotation.z = 0.15;
    h.head.rotation.z = 0.15 + Math.sin(t * 4.5) * 0.08; // tooting, chin up
  } else if (p === 'run') {
    const s = Math.sin(t * 16);
    h.legL.rotation.z = s * 0.8;
    h.legR.rotation.z = -s * 0.8;
    h.armL.rotation.z = 1.3 - s * 0.4;
    h.armR.rotation.z = s * 0.7;
    h.body.position.y = Math.abs(s) * 0.05;
  } else {
    h.legL.rotation.z = Math.sin(t * 20) * 0.9;
    h.legR.rotation.z = -Math.sin(t * 20) * 0.9;
    h.armL.rotation.x = -(1.7 + Math.sin(t * 24) * 0.9);
    h.armR.rotation.x = 1.7 + Math.cos(t * 24) * 0.9;
    h.head.rotation.x = Math.sin(t * 30) * 0.3;
  }
}

/** A sprite whose text can change: a parchment speech bubble, or a music note. */
function textSprite(w: number, h: number, draw: (g: CanvasRenderingContext2D, text: string) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  let current: string | null = null;
  return {
    sprite,
    set(text: string) {
      sprite.visible = text !== '';
      if (text === current) return;
      current = text;
      g.clearRect(0, 0, w, h);
      if (text) draw(g, text);
      tex.needsUpdate = true;
    },
  };
}

function bubble() {
  const b = textSprite(1024, 192, (g, text) => {
    g.font = '700 64px Georgia, "Times New Roman", serif';
    const tw = Math.min(980, g.measureText(text).width + 70);
    const x = (1024 - tw) / 2;
    g.fillStyle = '#fbf1d6';
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(x, 10, tw, 130, 30);
    g.moveTo(500, 140);
    g.lineTo(512, 182);
    g.lineTo(540, 140);
    g.fill();
    g.stroke();
    g.fillStyle = '#fbf1d6';
    g.fillRect(503, 132, 34, 12);
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 512, 77, 940);
  });
  b.sprite.scale.set(2.8, 0.525, 1);
  b.sprite.renderOrder = 10;
  return b;
}

/** Herald is drawn about 1 unit tall, then scaled up so he reads from the chase camera. */
const SCALE = 1.5;
const HANG = 0.98 * SCALE; // tip of the gripper to his feet
const PANIC = ['Help!', 'Unhand me!', 'Mercy!', 'Put me down!', 'Egad!', 'Aaaah!', 'Not the hat!', 'Knave!'];
const CARRY = [0, -0.1, 0.2, 0, Math.PI - 0.1, 0];
const REST = [0, 0.35, 1.5, 0, 1.0, 0];

interface Deps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: Player;
  stations: Station[];
  world: { skyUniforms: Record<string, THREE.IUniform>; beam: THREE.Mesh; offIsland: THREE.Object3D[] };
  /** scene children that stay put when the island sinks (besides lights and offIsland) */
  keep: THREE.Object3D[];
  skyFog: THREE.Fog;
  coarse: boolean;
  reduceMotion: MediaQueryList;
}

type State = 'free' | 'reach' | 'snatch' | 'held' | 'offer' | 'thrown' | 'erupt' | 'raft';

export function createHeraldEgg(d: Deps) {
  const { scene, camera, player } = d;
  const h = createHerald();
  h.root.scale.setScalar(SCALE);
  scene.add(h.root);
  const say = bubble();
  say.sprite.position.y = 1.4;
  say.sprite.scale.divideScalar(SCALE);
  h.root.add(say.sprite);
  const notes = [0, 1, 2].map(() => {
    const n = textSprite(64, 64, (g, t) => {
      g.font = '700 52px "Segoe UI Symbol", serif';
      g.fillStyle = '#ffd66b';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, 32, 34);
    });
    n.sprite.scale.setScalar(0.32);
    scene.add(n.sprite);
    return { ...n, life: 1 + Math.random(), at: new THREE.Vector3() };
  });

  // he paces on the downhill verge, a little past the Georgia Tech stop
  const road = pathAt(0.515);
  const home = road.p.clone().addScaledVector(road.out, 8);
  const pos = home.clone();
  let facing = Math.atan2(road.tangent.z, -road.tangent.x);
  const LEASH = 4.5;

  const summitStation = d.stations.find((s) => s.id === 'summit')!;
  const summitStop = pathAt(1).p;
  const padY = summitStation.group.position.y;

  let state: State = 'free';
  let st = 0; // time in the current state
  let line = 0;
  let armOverride: { q: number[]; rate: number } | null = null;
  const tip = new THREE.Vector3();
  const from = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const setState = (s: State) => {
    state = s;
    st = 0;
  };

  // ---------- grabbing ----------
  let mode: 'drive' | 'tour' = 'drive';
  const amrPos = () => player.position;
  const reach = () => (mode === 'tour' ? 10 : 4.4);
  const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
  function tryGrab() {
    if (state !== 'free' || flat(pos, amrPos()) > reach()) return false;
    from.copy(pos);
    setState('reach');
    return true;
  }
  addEventListener('keydown', (e) => {
    const t = e.target;
    if ((t instanceof Element && t.closest('input, textarea, select, button, a')) || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.code === 'KeyE' || e.code === 'Space') && tryGrab()) e.preventDefault();
  });
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || state !== 'free') return;
    if (!(e.target instanceof Element && e.target.closest('#world, #scroll-track'))) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(h.hit, false).length) tryGrab();
  });

  // ---------- the eruption ----------
  const fx = new THREE.Group();
  scene.add(fx);
  const LAVA = 260;
  const lava = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), glow('#ff5a1f', 2.6), LAVA);
  lava.frustumCulled = false;
  const lp = Array.from({ length: LAVA }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0, alive: false }));
  const SMOKE = 18;
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#2e2a2c', flatShading: true, roughness: 1, transparent: true, opacity: 0.88 });
  const smoke = Array.from({ length: SMOKE }, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), smokeMat);
    m.visible = false;
    fx.add(m);
    return { m, age: 0, life: 1, v: new THREE.Vector3() };
  });
  const ASH = new THREE.Color('#2e2a2c');
  const STEAM = new THREE.Color('#e9e4e0');
  const glowLight = new THREE.PointLight('#ff4a1a', 0, 0, 0);
  fx.add(lava, glowLight);
  const pool = mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), glow('#ff4a12', 2.2), 0, 0.15, 0);
  pool.castShadow = false;
  pool.visible = false;
  summitStation.group.add(pool);

  const sinker = new THREE.Group();
  let sinkY = 0;
  const skyFrom = {
    top: new THREE.Color('#141b45'),
    mid: new THREE.Color('#5b4f9c'),
    horizon: new THREE.Color(SKY_HORIZON),
    bottom: new THREE.Color('#3a4f86'),
  };
  const skyTo = { top: new THREE.Color('#1c0606'), mid: new THREE.Color('#6a1a10'), horizon: new THREE.Color('#ff6a3a'), bottom: new THREE.Color('#3a1a1a') };
  function tintSky(k: number) {
    for (const key of ['top', 'mid', 'horizon', 'bottom'] as const) (d.world.skyUniforms[key].value as THREE.Color).lerpColors(skyFrom[key], skyTo[key], k);
    d.skyFog.color.lerpColors(skyFrom.horizon, skyTo.horizon, k);
  }

  function sinkIsland() {
    const keep = new Set<THREE.Object3D>([...d.world.offIsland, ...d.keep, fx, sinker]);
    for (const o of [...scene.children]) if (!keep.has(o) && !(o as THREE.Light).isLight) sinker.attach(o);
    scene.add(sinker);
  }

  const vent = new THREE.Vector3();
  let spawnAcc = 0;
  function updateLava(dt: number, erupting: boolean) {
    vent.set(0, padY + 3 + sinkY, 0);
    const steam = vent.y < SEA + 1;
    if (erupting && !steam) {
      spawnAcc += dt * 140;
      for (const q of lp) {
        if (spawnAcc < 1) break;
        if (q.alive) continue;
        spawnAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const out = 4 + Math.random() * 14;
        q.p.copy(vent).add(tmp.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(Math.random() * 2));
        q.v.set(Math.cos(a) * out, 22 + Math.random() * 26, Math.sin(a) * out);
        q.s = 0.4 + Math.random() * 1.1;
        q.alive = true;
      }
    }
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    lp.forEach((q, i) => {
      if (q.alive) {
        q.v.y -= 24 * dt;
        q.p.addScaledVector(q.v, dt);
        const floor = Math.max(SEA - 1, heightAt(q.p.x, q.p.z) + sinkY - 0.3);
        if (q.p.y < floor && q.v.y < 0) q.alive = false;
      }
      lava.setMatrixAt(i, q.alive ? m.makeScale(q.s, q.s, q.s).setPosition(q.p) : zero);
    });
    lava.instanceMatrix.needsUpdate = true;
    // smoke, or steam once the vent is under the sea
    smokeMat.color.lerp(steam ? STEAM : ASH, 1 - Math.exp(-dt));
    for (const s of smoke) {
      s.age += dt;
      if ((!s.m.visible || s.age > s.life) && erupting) {
        s.age = Math.random() * 0.5;
        s.life = 5 + Math.random() * 3;
        s.m.position.set(Math.random() * 6 - 3, steam ? SEA : vent.y, Math.random() * 6 - 3);
        s.v.set(Math.random() * 3 - 1.5, (steam ? 5 : 11) + Math.random() * 5, Math.random() * 3 - 1.5);
        s.m.visible = true;
      }
      if (!s.m.visible) continue;
      s.m.position.addScaledVector(s.v, dt);
      const k = s.age / s.life;
      s.m.scale.setScalar((steam ? 2 : 4) + k * (steam ? 6 : 16) * (1 - Math.max(0, k - 0.85) * 6));
    }
    glowLight.position.copy(vent).setY(vent.y + 8);
  }

  // ---------- the raft ----------
  const raft = new THREE.Group();
  const raftAt = new THREE.Vector3(24, SEA, 30);
  for (let i = 0; i < 6; i++) raft.add(box(4.4, 0.28, 0.62, i % 2 ? '#7a5a37' : '#8b6a43', 0, 0, -1.65 + i * 0.66));
  for (const x of [-1.6, 1.6]) raft.add(box(0.3, 0.2, 4.2, '#5e4329', x, 0.18, 0));
  raft.add(cyl(0.07, 0.07, 3.2, '#5e4329', -1.8, 1.7, 1.6, 6));
  const rag = mesh(new THREE.PlaneGeometry(1.3, 0.8), mat('#ff922b', { side: THREE.DoubleSide }), -1.15, 2.8, 1.6);
  raft.add(rag);
  raft.visible = false;
  const floater = h.bugle.clone();
  floater.visible = false;
  const hatInHand = h.cap.clone();
  hatInHand.position.y = -0.36;
  hatInHand.scale.setScalar(2.6);

  // ---------- overlay ----------
  const fade = document.createElement('div');
  fade.className = 'egg-fade';
  const card = document.createElement('div');
  card.className = 'egg-end';
  card.innerHTML = `<div class="egg-card" role="dialog" aria-labelledby="egg-title">
    <h2 id="egg-title">You sacrificed Herald</h2>
    <p>He was a small herald with a bugle. All he ever did was announce things. You fed him to a mountain, the mountain
    erupted, and the island went down with him: the road, the robots, the whole timeline.</p>
    <p>Now you are drifting on a raft with an AMR and his hat. Was it worth it?</p>
    <button type="button" class="btn">Rebuild the island</button></div>`;
  card.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.append(fade, card);

  // ---------- camera ----------
  const cam = new THREE.Vector3();
  const look = new THREE.Vector3();
  const wantCam = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  function lockCamera() {
    cam.copy(camera.position);
    camera.getWorldDirection(look).multiplyScalar(10).add(camera.position);
  }
  function moveCamera(dt: number, rate: number, shake: number) {
    const k = 1 - Math.exp(-dt * rate);
    cam.lerp(wantCam, k);
    look.lerp(wantLook, k);
    camera.position.copy(cam);
    if (!d.reduceMotion.matches && shake > 0)
      camera.position.add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
    camera.lookAt(look);
  }

  let raftT = 0;
  function update(dt: number, time: number, m: 'drive' | 'tour') {
    mode = m;
    st += dt;
    const amr = amrPos();
    const dist = flat(pos, amr);
    player.amr.arm.tip.getWorldPosition(tip);
    armOverride = null;

    if (state === 'free') {
      const alarmed = dist < 10;
      let moving = false;
      if (alarmed && mode === 'drive') {
        // run away from the AMR, but not far from home
        tmp.set(pos.x - amr.x, 0, pos.z - amr.z).normalize();
        pos.addScaledVector(tmp, 3.4 * dt);
        tmp.set(pos.x - home.x, 0, pos.z - home.z);
        if (tmp.length() > LEASH) pos.copy(home).addScaledVector(tmp.normalize(), LEASH);
        facing = Math.atan2(-(pos.z - amr.z), pos.x - amr.x);
        moving = true;
      } else if (!alarmed) {
        // pace up and down, stopping to play
        const pace = Math.sin(time * 0.35);
        tmp.copy(home).addScaledVector(road.tangent, pace * 2.5);
        moving = Math.abs(Math.cos(time * 0.35)) > 0.35;
        if (moving) {
          const was = pos.clone();
          pos.lerp(tmp, 1 - Math.exp(-dt * 2));
          if (pos.distanceToSquared(was) > 1e-6) facing = Math.atan2(-(pos.z - was.z), pos.x - was.x);
        }
      } else {
        facing = Math.atan2(-(amr.z - pos.z), amr.x - pos.x); // tour: he stares at you
      }
      // never under the wheels
      if (dist < 1.8) pos.add(tmp.set(pos.x - amr.x, 0, pos.z - amr.z).setLength(1.8 - dist));
      pos.y = heightAt(pos.x, pos.z);
      h.root.position.copy(pos);
      h.root.rotation.set(0, facing, 0);
      pose(h, moving ? 'run' : alarmed ? 'flail' : 'idle', time);
      if (alarmed) say.set(dist < reach() ? (d.coarse ? 'Hark! Tap me if you dare' : 'Hark! A robot!') : 'Egad! A robot!');
      else say.set('');
      // tooting: notes drift up out of the bugle
      for (const n of notes) {
        n.life += dt;
        if (n.life > 1.6 && !moving && !alarmed) {
          n.life = Math.random() * 0.4;
          h.bugle.localToWorld(n.at.set(0, 0.32, 0));
          n.set(Math.random() > 0.5 ? '♪' : '♫');
        }
        n.sprite.visible = n.life < 1.6;
        n.sprite.position.copy(n.at).add(tmp.set(Math.sin(n.life * 5) * 0.15, n.life * 0.6, 0));
        n.sprite.material.opacity = 1 - n.life / 1.6;
      }
    } else {
      for (const n of notes) n.sprite.visible = false;
    }

    if (state === 'reach') {
      // the arm lunges at him; he flails where he stands
      tmp.copy(from).setY(from.y + SCALE);
      armOverride = { q: player.amr.arm.solveDown(player.amr.arm.root.worldToLocal(tmp)), rate: 12 };
      pose(h, 'flail', time);
      say.set('Unhand me!');
      if (st > 0.45) setState('snatch');
    } else if (state === 'snatch' || state === 'held') {
      armOverride = state === 'snatch' ? { q: player.amr.arm.solveDown(player.amr.arm.root.worldToLocal(tmp.copy(from).setY(from.y + SCALE))), rate: 12 } : { q: CARRY, rate: 4 };
      tmp.copy(tip).setY(tip.y - HANG);
      if (state === 'snatch') h.root.position.lerpVectors(from, tmp, Math.min(1, st / 0.3));
      else h.root.position.copy(tmp);
      h.root.rotation.set(Math.sin(time * 3.1) * 0.12, player.state.heading + Math.sin(time * 1.7) * 0.8, Math.sin(time * 2.3) * 0.15);
      pose(h, 'flail', time);
      if (state === 'snatch' && st > 0.3) setState('held');
      if (state === 'held') {
        if (st > 2.2) {
          st = 0;
          line = (line + 1) % PANIC.length;
        }
        say.set(PANIC[line]);
        if (flat(amr, summitStop) < 8) {
          lockCamera();
          document.documentElement.classList.add('egg-on');
          setState('offer');
        }
      }
    } else if (state === 'offer') {
      // hold him out over the summit
      tmp.set(0, padY + 4, 0);
      player.amr.arm.root.worldToLocal(tmp);
      armOverride = { q: [Math.atan2(-tmp.z, tmp.x), 0.4, 0.15, 0, Math.PI - 0.55, 0], rate: 3 };
      tmp.copy(tip).setY(tip.y - HANG);
      h.root.position.copy(tmp);
      h.root.rotation.set(Math.sin(time * 3.1) * 0.12, Math.atan2(-(0 - tmp.z), 0 - tmp.x), Math.sin(time * 2.3) * 0.15);
      pose(h, 'flail', time);
      say.set(st < 1.1 ? 'Wait. Why is it warm up here?' : 'NOT THE MOUNTAIN!');
      const out = tmp.set(amr.x, 0, amr.z).normalize();
      wantCam.copy(amr).addScaledVector(out, 9).add(new THREE.Vector3(0, 4.5, 0));
      wantLook.set(amr.x * 0.4, padY + 3, amr.z * 0.4);
      moveCamera(dt, 2, 0);
      if (st > 2.2) {
        from.copy(h.root.position);
        setState('thrown');
      }
    } else if (state === 'thrown') {
      armOverride = { q: REST, rate: 3 };
      const top = tmp.set(0, padY + 6.5, 0);
      const beam = d.world.beam.material as THREE.MeshBasicMaterial;
      if (st < 0.9) {
        const s = st / 0.9;
        h.root.position.lerpVectors(from, top, s).y += Math.sin(Math.PI * s) * 3;
        h.root.rotation.z += dt * 10;
      } else {
        // the beam takes him
        const k = st - 0.9;
        h.root.position.set(0, top.y + 16 * k * k, 0);
        h.root.rotation.set(0, h.root.rotation.y + dt * 25, 0);
        h.root.scale.setScalar(SCALE * Math.max(0.05, 1 - k * 0.6));
        beam.color.set('#ff3b1f');
        beam.opacity = Math.min(1, 0.3 + k * 2);
      }
      pose(h, 'flail', time);
      say.set(st < 1.4 ? 'Aaaaaah!' : '');
      wantLook.set(0, h.root.position.y * 0.6 + padY * 0.4, 0);
      moveCamera(dt, 2, 0);
      if (st > 2.4) {
        h.root.visible = false;
        beam.opacity = 0.5;
        // pull back to a wide shot from offshore, on the side the camera is already on
        const dir = tmp.set(cam.x, 0, cam.z).normalize();
        wantCam.copy(dir).multiplyScalar(165).setY(48);
        setState('erupt');
      }
    } else if (state === 'erupt') {
      armOverride = { q: REST, rate: 3 };
      const t = st;
      pool.visible = true;
      pool.scale.setScalar(Math.min(7, 0.5 + t * 2.5));
      glowLight.intensity = Math.min(4, t * 1.2);
      if (t > 2.5) tintSky(Math.min(1, (t - 2.5) / 3.5));
      if (t > 5 && sinker.parent !== scene) sinkIsland();
      if (t > 5) {
        const k = Math.min(1, (t - 5) / 10);
        sinkY = -78 * k * k * (3 - 2 * k);
        sinker.position.set(Math.sin(t * 37) * 0.25, sinkY, Math.cos(t * 41) * 0.25);
      }
      updateLava(dt, t > 2.5);
      wantLook.set(0, Math.max(6, 24 + sinkY * 0.5), 0);
      const shake = t < 2.5 ? t * 0.12 : t < 15 ? 0.9 : 0.3;
      moveCamera(dt, 0.9, shake);
      if (t > 14.6) fade.classList.add('on');
      if (t > 15.6) {
        // adrift: the island is gone, the AMR is on a raft with his hat
        sinker.visible = false;
        pool.visible = false;
        glowLight.intensity = 1.2;
        tintSky(0.55);
        raft.position.copy(raftAt);
        raft.rotation.y = Math.atan2(raftAt.z, -raftAt.x);
        raft.visible = true;
        scene.add(raft);
        player.amr.root.position.set(0.2, 0.15, -0.3);
        player.amr.root.quaternion.identity();
        raft.add(player.amr.root);
        player.amr.arm.tip.add(hatInHand);
        floater.visible = true;
        floater.position.set(raftAt.x + 3.5, SEA + 0.05, raftAt.z - 2.5);
        floater.rotation.set(Math.PI / 2, 0, 0.6);
        scene.add(floater);
        for (const s of smoke) s.m.visible = false; // only small steam from here on
        fade.classList.remove('on');
        setState('raft');
      }
    } else if (state === 'raft') {
      raftT += dt;
      // the arm holds his hat up high, in memoriam
      armOverride = { q: [Math.sin(time * 0.5) * 0.3, 0.05, 0.15, 0, 0.1, 0], rate: 2 };
      raft.position.y = SEA + 0.05 + Math.sin(time * 1.3) * 0.12;
      raft.rotation.x = Math.sin(time * 0.9) * 0.04;
      raft.rotation.z = Math.sin(time * 1.1) * 0.05;
      floater.position.y = SEA + 0.05 + Math.sin(time * 1.7) * 0.08;
      updateLava(dt, true);
      const a = Math.atan2(raftAt.z, raftAt.x) + raftT * 0.07;
      wantCam.set(raftAt.x + Math.cos(a) * 9, 3.4, raftAt.z + Math.sin(a) * 9);
      wantLook.copy(raftAt).setY(0.6);
      if (raftT < 0.1) {
        cam.copy(wantCam);
        look.copy(wantLook);
      }
      moveCamera(dt, 3, 0);
      if (raftT > 1.5) card.classList.add('on');
    }
  }

  return {
    update,
    /** true once the summit sequence has the AMR and the camera */
    get locked() {
      return state === 'offer' || state === 'thrown' || state === 'erupt' || state === 'raft';
    },
    get armOverride() {
      return armOverride;
    },
    /** what the hint should say, or null for the usual hint */
    hint(): string | null {
      if (state === 'free' && flat(pos, amrPos()) < 14) return d.coarse ? 'Tap Herald to grab him' : 'Herald! Press E to grab him';
      if (state === 'reach' || state === 'snatch' || state === 'held') return 'The mountain wants Herald. Take him to the summit';
      return null;
    },
  };
}
