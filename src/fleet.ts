import * as THREE from 'three';
import { ball, box, cyl, glow, mat, mesh } from './models';
import { pathAt } from './world';

// Out at sea off the simulation stop (2022 to 2024, defence training simulators):
// two frigates and a helicopter on patrol, a submarine running at periscope depth,
// a twin-prop trainer circling the fleet and a pair of jets looping the island.

const GREY = '#8e979e';
const DARK = '#5c656c';
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Heading for a model that faces +x, given a horizontal direction. */
const headingOf = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** Flat hull with a pointed bow, deck at y = height - draft. */
function hullGeometry(length: number, width: number, height: number, bow: number, draft: number) {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, -width / 2);
  s.lineTo(length / 2 - bow, -width / 2);
  s.lineTo(length / 2, 0);
  s.lineTo(length / 2 - bow, width / 2);
  s.lineTo(-length / 2, width / 2);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -draft, 0);
}

function wake(length: number, width: number) {
  const g = new THREE.BufferGeometry();
  // a thin wedge trailing behind the stern
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -width / 2, 0, 0, width / 2, -length, 0, 0], 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = 0.08;
  return m;
}

function frigate() {
  const g = new THREE.Group();
  g.add(mesh(hullGeometry(30, 4.4, 2.6, 8, 1.3), mat(GREY)));
  // neon trim along the deck edge and red/green navigation lights
  for (const z of [-2.22, 2.22]) g.add(box(21, 0.08, 0.05, glow('#36e0ff', 4), -4.5, 1.1, z));
  g.add(ball(0.18, glow('#ff4d5e', 5), 0, 5.2, -1.85, 0));
  g.add(ball(0.18, glow('#45ff8a', 5), 0, 5.2, 1.85, 0));
  const top = new THREE.Group();
  top.position.y = 1.3; // deck height above the water
  top.add(box(9, 2.4, 3.6, GREY, -1, 1.2, 0)); // superstructure
  top.add(box(4, 1.4, 3, GREY, 1.4, 3, 0)); // bridge
  top.add(box(4.1, 0.4, 3.1, DARK, 1.5, 3.5, 0)); // bridge windows
  top.add(box(5, 2, 3.6, GREY, -9, 1, 0)); // hangar
  top.add(box(4, 0.06, 3.8, mat('#5a6268'), -13, 0.05, 0)); // flight deck
  top.add(cyl(0.9, 1.1, 1.6, GREY, -4.4, 3, 0, 8)); // funnel
  top.add(cyl(0.15, 0.3, 6, GREY, 1, 6.6, 0, 6)); // mast
  top.add(box(0.1, 0.1, 3, DARK, 1, 7.6, 0)); // yard
  const radar = new THREE.Group();
  radar.position.set(1, 9.8, 0);
  radar.add(box(0.3, 0.9, 2.6, DARK));
  top.add(radar);
  top.add(cyl(0.9, 1, 0.8, GREY, 8.2, 0.4, 0, 8)); // gun mount
  const barrel = cyl(0.12, 0.12, 3.2, DARK, 9.6, 0.7, 0, 6);
  barrel.rotation.z = -Math.PI / 2 + 0.1;
  top.add(barrel);
  g.add(top);
  const w = wake(26, 6);
  w.position.x = -15;
  g.add(w);
  return { g, radar };
}

function submarine() {
  const g = new THREE.Group();
  const hullMat = mat('#262b30', { roughness: 0.8 });
  const hull = mesh(new THREE.CapsuleGeometry(1.5, 20, 4, 10).rotateZ(Math.PI / 2), hullMat);
  g.add(hull);
  g.add(box(4, 2.8, 1.1, hullMat, 4, 2.6, 0)); // sail
  g.add(box(0.6, 0.1, 4.2, hullMat, 4.6, 3.2, 0)); // sail planes
  g.add(box(4.05, 0.08, 1.15, glow('#36e0ff', 4), 4, 3.6, 0)); // neon band round the sail
  for (let i = 0; i < 4; i++) {
    const fin = box(1.8, 0.12, 2.4, hullMat, -10.6, 0, 0);
    fin.geometry.translate(0, 0, 1.2);
    fin.rotation.x = Math.PI / 4 + (i * Math.PI) / 2; // X-form rudders
    g.add(fin);
  }
  g.add(cyl(0.12, 0.12, 2, DARK, 3.4, 4.8, 0, 6)); // periscope
  g.add(cyl(0.08, 0.08, 1.4, DARK, 4.6, 4.5, 0, 6)); // mast
  const w = wake(10, 2.4);
  g.add(w);
  return { g, wake: w };
}

function jet() {
  const g = new THREE.Group();
  const body = mat('#7c8790');
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 8).rotateZ(-Math.PI / 2), body));
  g.add(mesh(new THREE.ConeGeometry(0.35, 2, 8).rotateZ(-Math.PI / 2), body, 4.5, 0, 0)); // nose
  g.add(box(1.2, 0.35, 0.6, mat('#2b3540', { roughness: 0.2 }), 2.4, 0.4, 0)); // canopy
  for (const side of [1, -1]) {
    const wing = new THREE.Shape([
      new THREE.Vector2(1.4, 0),
      new THREE.Vector2(-1.4, 3.6 * side),
      new THREE.Vector2(-2.4, 3.6 * side),
      new THREE.Vector2(-1.6, 0),
    ]);
    g.add(mesh(new THREE.ExtrudeGeometry(wing, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2), body));
  }
  for (const z of [-0.5, 0.5]) {
    const tail = box(1.4, 1.5, 0.08, body, -3, 0.9, z);
    tail.rotation.x = z * 0.5;
    g.add(tail);
  }
  g.add(cyl(0.3, 0.3, 0.3, glow('#ff9f43', 5), -3.65, 0, 0, 8).rotateZ(Math.PI / 2)); // afterburner glow
  return g;
}

function turboprop() {
  const g = new THREE.Group();
  const white = mat('#eef1f3');
  g.add(mesh(new THREE.CapsuleGeometry(0.5, 6, 4, 8).rotateZ(Math.PI / 2), white));
  g.add(box(1.6, 0.12, 11, white, 0.4, -0.1, 0)); // wing
  g.add(box(1.2, 1.6, 0.1, white, -3.2, 0.9, 0)); // fin
  g.add(box(0.9, 0.1, 3.6, white, -3.4, 1.7, 0)); // T-tail
  g.add(box(6.2, 0.14, 1.02, glow('#36e0ff', 3), 0, 0, 0)); // cheat line
  g.add(ball(0.16, glow('#ff4d5e', 5), 0.4, -0.1, -5.5, 0)); // wingtip lights
  g.add(ball(0.16, glow('#45ff8a', 5), 0.4, -0.1, 5.5, 0));
  const props: THREE.Mesh[] = [];
  for (const z of [-2, 2]) {
    g.add(cyl(0.3, 0.3, 1.8, white, 1.2, -0.1, z, 8).rotateZ(Math.PI / 2));
    const p = box(0.06, 2, 0.16, DARK, 2.15, -0.1, z);
    g.add(p);
    props.push(p);
  }
  return { g, props };
}

function helicopter() {
  const g = new THREE.Group();
  const body = mat('#6c767e');
  g.add(mesh(new THREE.CapsuleGeometry(0.8, 2.4, 4, 8).rotateZ(Math.PI / 2), body));
  g.add(box(4.2, 0.4, 0.35, body, -3.2, 0.3, 0)); // tail boom
  g.add(box(0.8, 1.2, 0.1, body, -5.2, 0.8, 0)); // fin
  const rotor = new THREE.Group();
  rotor.position.y = 1.2;
  for (let i = 0; i < 4; i++) {
    const b = box(4.4, 0.05, 0.22, DARK, 2.2, 0, 0);
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    arm.add(b);
    rotor.add(arm);
  }
  g.add(rotor);
  const tailRotor = box(0.05, 1.4, 0.16, DARK, -5.2, 0.9, 0.2);
  g.add(tailRotor);
  return { g, rotor, tailRotor };
}

export function buildFleet(scene: THREE.Scene) {
  // the patrol area sits offshore from the simulation stop
  const { out } = pathAt(0.38);
  const radial = new THREE.Vector3(out.x, 0, out.z).normalize();
  const along = radial.clone().applyAxisAngle(Y_AXIS, Math.PI / 2);
  const centre = radial.clone().multiplyScalar(268);
  /** Point on a racetrack-ish ellipse around the patrol centre (a along the coast, b out to sea). */
  const ellipse = (phi: number, a: number, b: number, shift = 0) =>
    centre
      .clone()
      .addScaledVector(along, Math.cos(phi) * a)
      .addScaledVector(radial, Math.sin(phi) * b + shift);

  const ships = [0, Math.PI].map((ph, i) => ({ ...frigate(), ph, a: 70 - i * 8, b: 20 + i * 6, shift: i * 6 }));
  for (const s of ships) scene.add(s.g);
  const sub = submarine();
  scene.add(sub.g);
  const prop = turboprop();
  scene.add(prop.g);
  const jets = [jet(), jet()];
  for (const j of jets) scene.add(j);
  const heli = helicopter();
  scene.add(heli.g);

  const tmp = new THREE.Vector3();
  const lastHeading = new Map<THREE.Object3D, number>();
  /** Place a model at p moving toward next, banked into the turn when bank > 0. */
  function fly(o: THREE.Object3D, p: THREE.Vector3, next: THREE.Vector3, dt: number, bank = 0) {
    o.position.copy(p);
    const h = headingOf(next.x - p.x, next.z - p.z);
    o.rotation.order = 'YXZ';
    o.rotation.y = h;
    if (bank && dt > 0) {
      const prev = lastHeading.get(o) ?? h;
      const turn = Math.atan2(Math.sin(h - prev), Math.cos(h - prev)) / dt;
      o.rotation.x = THREE.MathUtils.clamp(-turn * bank, -1, 1);
    }
    lastHeading.set(o, h);
  }

  return {
    update(dt: number, time: number) {
      for (const s of ships) {
        const phi = time * 0.035 + s.ph;
        const p = ellipse(phi, s.a, s.b, s.shift);
        fly(s.g, p, tmp.copy(ellipse(phi + 0.01, s.a, s.b, s.shift)), dt);
        s.g.position.y = Math.sin(time * 0.9 + s.ph) * 0.12; // gentle swell
        s.g.rotation.x = Math.sin(time * 0.7 + s.ph) * 0.02;
        s.radar.rotation.y = time * 2.4;
      }

      // the submarine crosses the patrol area, surfacing and diving to periscope depth
      const sp = time * 0.02 + 1;
      const subP = ellipse(sp, 95, 22, 52);
      fly(sub.g, subP, tmp.copy(ellipse(sp + 0.01, 95, 22, 52)), dt);
      const dive = THREE.MathUtils.smoothstep(Math.sin(time * 0.08), -0.3, 0.3); // 0 surfaced, 1 dived
      sub.g.position.y = THREE.MathUtils.lerp(0.4, -4.3, dive);
      sub.wake.position.set(dive > 0.5 ? 3.4 : -11, -sub.g.position.y + 0.08, 0);
      sub.wake.scale.setScalar(dive > 0.5 ? 0.5 : 1);

      // twin-prop trainer circling the fleet
      const tp = time * 0.11;
      const circle = (a: number, r: number, y: number) => centre.clone().addScaledVector(along, Math.cos(a) * r).addScaledVector(radial, Math.sin(a) * r).setY(y);
      fly(prop.g, circle(tp, 75, 44), circle(tp + 0.01, 75, 44), dt, 2.2);
      for (const p of prop.props) p.rotation.x = time * 40;

      // a pair of jets looping the whole island
      const ja = -time * 0.09;
      jets.forEach((j, i) => {
        const r = 225 + i * 9;
        const y = 82 + Math.sin(time * 0.3) * 8 - i * 2;
        const back = i * 0.045;
        const at = (a: number) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        fly(j, at(ja + back), at(ja + back - 0.01), dt, 3);
      });

      // helicopter keeping station off the lead frigate's stern
      const lead = ships[0].g;
      const off = new THREE.Vector3(-22, 14 + Math.sin(time * 0.8) * 0.6, 8).applyAxisAngle(Y_AXIS, lead.rotation.y);
      heli.g.position.copy(lead.position).add(off);
      heli.g.rotation.y = lead.rotation.y;
      heli.g.rotation.z = -0.08;
      heli.rotor.rotation.y = time * 22;
      heli.tailRotor.rotation.z = time * 40;
    },
  };
}
