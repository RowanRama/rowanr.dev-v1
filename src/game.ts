import * as THREE from 'three';
import { createHud, createInput, createScrollTour, readArticles, type Mode } from './hud';
import { createCameraRig, createPlayer } from './player';
import { buildRoadside } from './roadside';
import { buildFleet } from './fleet';
import { buildStations, stationPads, type Station } from './stations';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildWorld, nearestU, pathAt, SEA, SKY_HORIZON } from './world';

const root = document.documentElement;
const modeBtn = document.getElementById('mode-toggle') as HTMLButtonElement;

/** Builds the island and starts the render loop. Loaded on demand by main.ts, so the text version never downloads three.js. */
export async function startGame() {
  const loading = document.getElementById('loading')!;

  // signs and billboards are drawn to canvas, so wait briefly for both faces
  // (the font stylesheet loads without blocking render, so wait for it before asking for the faces)
  const fontCss = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css2"]');
  const cssReady = fontCss && !fontCss.sheet ? new Promise((r) => fontCss.addEventListener('load', r, { once: true })) : Promise.resolve();
  await Promise.race([
    cssReady.then(() =>
      Promise.all([document.fonts.load('700 54px "Space Grotesk"'), document.fonts.load('600 46px Inter'), document.fonts.load('400 42px Inter')]),
    ),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('world')!.append(renderer.domElement);

  const scene = new THREE.Scene();
  const skyFog = new THREE.Fog(SKY_HORIZON, 140, 620);
  const seaFog = new THREE.Fog('#0f6275', 2, 55);
  scene.fog = skyFog;
  const camera = new THREE.PerspectiveCamera(coarse ? 62 : 55, innerWidth / innerHeight, 0.3, 3000);

  // bloom makes the neon (road lines, pylons, holograms, LEDs) glow; only very bright pixels bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.2, 1.4));
  composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight('#c7c4ff', '#5a5266', 1.15));
  const sun = new THREE.DirectionalLight('#ffc9a3', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -45;
  sc.right = sc.top = 45;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const articles = readArticles();
  const world = buildWorld(scene, stationPads());
  const stations = buildStations(scene, articles);
  const stops = stations.filter((s) => s.onTimeline);
  const colliders = [...stations.flatMap((s) => s.colliders), ...buildRoadside(scene)];
  const fleet = buildFleet(scene);
  const player = createPlayer(scene, colliders);
  const rig = createCameraRig(camera);
  const tour = createScrollTour(stops);

  let mode: Mode = coarse ? 'tour' : 'drive';
  let tourU = 0;
  const hud = createHud(stops, articles, (st) => jumpTo(st));
  const readInput = createInput(() => {
    if (mode === 'tour' && !coarse) setMode('drive');
  });

  function jumpTo(st: Station) {
    if (mode === 'tour') {
      tour.scrollToU(st.u, !reduceMotion.matches);
    } else {
      // arrive a little before the stop, facing it, as if driving in
      const { p, tangent } = pathAt(Math.max(0, st.u - 0.008));
      player.teleport(p.x, p.z, Math.atan2(-tangent.z, tangent.x));
      rig.snap();
    }
  }

  function setMode(next: Mode) {
    mode = next;
    root.classList.toggle('tour', mode === 'tour');
    root.classList.toggle('drive', mode === 'drive');
    modeBtn.textContent = mode === 'tour' ? 'Drive mode' : 'Tour mode';
    document.getElementById('joystick')!.hidden = !(mode === 'drive' && coarse);
    document.getElementById('hint')!.textContent =
      mode === 'drive' ? 'WASD to drive, Shift to boost, drag to look around' : 'Scroll to move along the road';
    if (mode === 'tour') {
      const u = nearestU(player.state.x, player.state.z);
      tourU = u;
      requestAnimationFrame(() => tour.scrollToU(u, false));
    }
  }
  modeBtn.hidden = false;
  modeBtn.addEventListener('click', () => setMode(mode === 'tour' ? 'drive' : 'tour'));
  // main.ts owns the text version toggle; re-apply the open card when coming back to 3D
  addEventListener('textmodechange', () => hud.reset());
  (document.querySelector('.hud-bottom') as HTMLElement).hidden = false;
  document.querySelector<HTMLElement>('#ampf .demo')!.hidden = false;
  setMode(mode);

  // frame the part of the screen the info panel doesn't cover
  const panel = document.getElementById('stations')!;
  let shiftX = 0;
  let shiftY = 0;
  function frame(dt: number) {
    const open = panel.hasAttribute('data-open');
    const wide = innerWidth >= 900;
    const wantX = open && wide ? panel.offsetWidth + 24 : 0;
    const wantY = open && !wide ? panel.offsetHeight : 0;
    const k = 1 - Math.exp(-dt * 5);
    shiftX += (wantX - shiftX) * k;
    shiftY += (wantY - shiftY) * k;
    const w = innerWidth;
    const h = innerHeight;
    camera.setViewOffset(w + shiftX, h + shiftY, shiftX, shiftY, w, h);
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // hold the left or right mouse button and drag to look around; it eases back behind the AMR after release
  const orbit = { yaw: 0, pitch: 0 };
  let dragging = false;
  let released = 0;
  const worldEl = document.getElementById('world')!;
  worldEl.addEventListener('contextmenu', (e) => e.preventDefault());
  worldEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || (e.button !== 0 && e.button !== 2)) return;
    dragging = true;
    worldEl.setPointerCapture(e.pointerId);
    worldEl.classList.add('dragging');
  });
  worldEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    orbit.yaw -= e.movementX * 0.006;
    orbit.pitch += e.movementY * 0.004;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch, -0.6, 0.9);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    released = 0;
    worldEl.classList.remove('dragging');
  };
  worldEl.addEventListener('pointerup', endDrag);
  worldEl.addEventListener('pointercancel', endDrag);
  worldEl.addEventListener('lostpointercapture', endDrag);

  const timer = new THREE.Timer();
  let freeCam: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  if (import.meta.env.DEV) Object.assign(window, { __dbg: { camera, scene, player, stations, setFreeCam: (v: typeof freeCam) => (freeCam = v) } });
  let time = 0;
  let first = true;
  let idle = 0;
  const lookAt = new THREE.Vector3();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    if (root.classList.contains('text-mode')) return;
    const dt = Math.min(0.05, timer.getDelta());
    const ambient = reduceMotion.matches ? 0.35 : 1;
    time += dt * ambient;

    if (mode === 'drive') {
      player.drive(dt, readInput());
    } else {
      const target = tour.progress();
      tourU += (target - tourU) * (reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 5));
      player.tour(dt, tourU);
    }

    // the nearest stop opens its card
    const p = player.position;
    let near: Station | null = null;
    if (mode === 'tour') {
      near = stops.reduce((m, s) => (Math.abs(s.u - tourU) < Math.abs(m.u - tourU) ? s : m));
    } else {
      let best = 18;
      for (const s of stops) {
        const d = Math.min(s.stop.distanceTo(p), s.group.position.distanceTo(p) - 6);
        if (d < best) {
          best = d;
          near = s;
        }
      }
    }
    hud.setActive(near?.id ?? null);
    for (const s of stations) {
      const isNear = s === near;
      s.update(dt * ambient, time, isNear);
      (s.ring.material as THREE.MeshBasicMaterial).opacity = isNear ? 0.85 : 0.45;
    }
    player.animateArm(dt, time, near ? lookAt.copy(near.group.position).setY(near.group.position.y + 3) : null);
    world.update(dt * ambient);
    fleet.update(dt * ambient, time);

    // parked at a stop: frame the AMR and the station together
    idle = Math.abs(player.state.v) < 0.6 ? idle + dt : 0;
    const parked = near && (mode === 'tour' ? Math.abs(near.u - tourU) < 0.015 : idle > 0.4);
    frame(dt);
    if (!dragging) {
      released += dt;
      if (released > 1.2) {
        const k = 1 - Math.exp(-dt * 2.5);
        orbit.yaw -= Math.atan2(Math.sin(orbit.yaw), Math.cos(orbit.yaw)) * k;
        orbit.pitch -= orbit.pitch * k;
        if (Math.abs(orbit.yaw) < 1e-3 && Math.abs(orbit.pitch) < 1e-3) orbit.yaw = orbit.pitch = 0;
      }
    }
    rig.update(dt, player, mode, parked && near ? near.group.position : null, orbit);
    if (freeCam) {
      camera.position.copy(freeCam.pos);
      camera.lookAt(freeCam.look);
    }
    const under = camera.position.y < SEA;
    scene.fog = under ? seaFog : skyFog;
    renderer.setClearColor(under ? '#0f6275' : SKY_HORIZON);
    sun.position.copy(p).add(new THREE.Vector3(90, 70, 30));
    sun.target.position.copy(p);
    if (innerWidth >= 900) hud.drawMinimap(p.x, p.z, player.state.heading);

    composer.render(dt);
    if (first) {
      first = false;
      loading.hidden = true;
      root.classList.add('ready');
    }
  });
}
