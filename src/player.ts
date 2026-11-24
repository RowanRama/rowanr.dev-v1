import * as THREE from 'three';
import { createAMR } from './models';
import type { Collider } from './stations';
import { heightAt, normalAt, pathAt, SEA } from './world';

export interface Input {
  forward: number; // -1..1
  turn: number; // -1..1, positive = left
  boost: boolean;
}

const ACCEL = 16;
const MAX_V = 13;
const BOOST_V = 24;
const REVERSE_V = 6;
const TURN = 2.1;
const WORLD_R = 205;

export function createPlayer(scene: THREE.Scene, colliders: Collider[]) {
  const amr = createAMR();
  scene.add(amr.root);
  const start = pathAt(0);
  const s = {
    x: start.p.x,
    z: start.p.z,
    heading: Math.atan2(-start.tangent.z, start.tangent.x),
    v: 0,
  };
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const q = [0, 0.35, 1.5, 0, 1.0, 0];
  const qGoal = q.slice();
  const tmp = new THREE.Vector3();

  function place(dt: number) {
    const y = heightAt(s.x, s.z);
    normalAt(s.x, s.z, n);
    up.lerp(n, 1 - Math.exp(-dt * 8)).normalize();
    fwd.set(Math.cos(s.heading), 0, -Math.sin(s.heading));
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    right.crossVectors(fwd, up).normalize();
    basis.makeBasis(fwd, up, right);
    amr.root.quaternion.setFromRotationMatrix(basis);
    amr.root.position.set(s.x, y, s.z);
    for (const w of amr.wheels) w.rotation.y -= (s.v * dt) / 0.24;
  }

  function drive(dt: number, input: Input) {
    const under = heightAt(s.x, s.z) < SEA - 0.5;
    const top = (input.boost ? BOOST_V : MAX_V) * (under ? 0.6 : 1);
    if (input.forward !== 0) {
      s.v += input.forward * ACCEL * dt;
    } else {
      s.v *= Math.exp(-dt * 2.8);
      if (Math.abs(s.v) < 0.05) s.v = 0;
    }
    s.v = Math.max(-REVERSE_V, Math.min(top, s.v));
    s.heading += input.turn * TURN * dt * (s.v < -0.1 ? -1 : 1);
    s.x += Math.cos(s.heading) * s.v * dt;
    s.z += -Math.sin(s.heading) * s.v * dt;
    for (const c of colliders) {
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 1.3;
      if (d < min && d > 1e-4) {
        s.x = c.x + (dx / d) * min;
        s.z = c.z + (dz / d) * min;
        s.v *= 0.6;
      }
    }
    const r = Math.hypot(s.x, s.z);
    if (r > WORLD_R) {
      s.x *= WORLD_R / r;
      s.z *= WORLD_R / r;
      s.v *= 0.5;
    }
    place(dt);
  }

  let lastU = 0;
  function tour(dt: number, u: number) {
    const { p, tangent } = pathAt(u);
    s.v = ((u - lastU) * 1000) / Math.max(dt, 1e-3);
    lastU = u;
    s.x = p.x;
    s.z = p.z;
    s.heading = Math.atan2(-tangent.z, tangent.x);
    place(dt);
  }

  function teleport(x: number, z: number, heading: number) {
    s.x = x;
    s.z = z;
    s.heading = heading;
    s.v = 0;
    place(1);
  }

  /** The arm idles, or turns to face a station and waves; an override drives it to set joint angles instead. */
  function animateArm(dt: number, time: number, look: THREE.Vector3 | null, override?: { q: number[]; rate: number } | null) {
    if (override) {
      qGoal.splice(0, 6, ...override.q);
    } else if (look) {
      tmp.copy(look);
      amr.arm.root.worldToLocal(tmp);
      const yaw = Math.atan2(-tmp.z, tmp.x);
      qGoal.splice(0, 6, yaw, 0.15, 0.9 + Math.sin(time * 5) * 0.25, Math.sin(time * 6) * 0.6, 0.6, 0);
    } else {
      qGoal.splice(0, 6, Math.sin(time * 0.4) * 0.4, 0.35 + Math.sin(time * 0.7) * 0.08, 1.55, 0, 1.0 + Math.sin(time) * 0.1, 0);
    }
    const k = 1 - Math.exp(-dt * (override?.rate ?? 3));
    for (let i = 0; i < 6; i++) {
      let d = qGoal[i] - q[i];
      if (i === 0) d = Math.atan2(Math.sin(d), Math.cos(d));
      q[i] += d * k;
    }
    amr.arm.set(q);
  }

  return {
    amr,
    state: s,
    drive,
    tour,
    teleport,
    animateArm,
    get position() {
      return amr.root.position;
    },
    forward(target: THREE.Vector3) {
      return target.set(Math.cos(s.heading), 0, -Math.sin(s.heading));
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;

/** Chase camera that stays above ground and frames the free area of the screen. */
export function createCameraRig(camera: THREE.PerspectiveCamera) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const want = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const f = new THREE.Vector3();
  const arm = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  let first = true;
  return {
    /** orbit.yaw swings the camera round the AMR, orbit.pitch raises or lowers it (both radians) */
    update(dt: number, player: Player, mode: 'drive' | 'tour', focus: THREE.Vector3 | null, orbit = { yaw: 0, pitch: 0 }) {
      const p = player.position;
      player.forward(f);
      let rate = 4;
      if (focus && Math.hypot(p.x - focus.x, p.z - focus.z) > 6) {
        const away = new THREE.Vector3(p.x - focus.x, 0, p.z - focus.z).normalize();
        want.copy(p).addScaledVector(away, 8).addScaledVector(f, -4).add(new THREE.Vector3(0, 6.5, 0));
        wantLook.copy(p).lerp(focus, 0.65).add(new THREE.Vector3(0, 2.5, 0));
        rate = 2.2;
      } else if (mode === 'drive') {
        const back = 10 + Math.min(4, Math.abs(player.state.v) * 0.15);
        want.copy(p).addScaledVector(f, -back).add(new THREE.Vector3(0, 5.2, 0));
        wantLook.copy(p).addScaledVector(f, 4).add(new THREE.Vector3(0, 1.4, 0));
      } else {
        // a slightly side-on view from the downhill side, so the station and the climb both show
        const out = new THREE.Vector3(p.x, 0, p.z).normalize();
        want.copy(p).addScaledVector(f, -9).addScaledVector(out, 7).add(new THREE.Vector3(0, 6.5, 0));
        wantLook.copy(p).addScaledVector(f, 3).add(new THREE.Vector3(0, 1.2, 0));
      }
      if (orbit.yaw !== 0 || orbit.pitch !== 0) {
        // swing the camera round the AMR, keeping its distance
        arm.copy(want).sub(p).applyAxisAngle(Y, orbit.yaw);
        const flat = Math.hypot(arm.x, arm.z);
        const len = arm.length();
        const elev = THREE.MathUtils.clamp(Math.atan2(arm.y, flat) + orbit.pitch, 0.05, 1.35);
        arm.set((arm.x / flat) * Math.cos(elev) * len, Math.sin(elev) * len, (arm.z / flat) * Math.cos(elev) * len);
        want.copy(p).add(arm);
        wantLook.copy(p).add(new THREE.Vector3(0, 1.4, 0));
        rate = 10;
      }
      const k = first ? 1 : 1 - Math.exp(-dt * rate);
      first = false;
      pos.lerp(want, k);
      look.lerp(wantLook, k);
      const floor = heightAt(pos.x, pos.z) + 1.6;
      if (pos.y < floor) pos.y = floor;
      camera.position.copy(pos);
      camera.lookAt(look);
    },
    snap() {
      first = true;
    },
  };
}
