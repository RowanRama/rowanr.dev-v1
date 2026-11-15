import * as THREE from 'three';
import { box, cyl, glow, mat } from './models';
import type { Collider } from './stations';
import { heightAt, PATH_LENGTH, pathAt } from './world';

// Billboards for each job (read from the "Where I've worked" list in index.html)
// and small year markers along the road, all as glowing holograms, plus light pylons lining the road.

const YEAR_AT: [number, number][] = [
  [2017, 0.05],
  [2019, 0.125],
  [2020, 0.2],
  [2021, 0.29],
  [2022, 0.35],
  [2024, 0.45],
  [2025, 0.54],
  [2026, 0.76],
];

function yearToU(year: number) {
  for (let i = 1; i < YEAR_AT.length; i++) {
    const [y0, u0] = YEAR_AT[i - 1];
    const [y1, u1] = YEAR_AT[i];
    if (year <= y1) return u0 + ((year - y0) / (y1 - y0)) * (u1 - u0);
  }
  return YEAR_AT.at(-1)![1];
}

/** A spot beside the road at u, `offset` from the centre line (positive = downhill side), facing oncoming traffic. */
function roadside(u: number, offset: number, turn: number) {
  const { p, tangent, out } = pathAt(u);
  const x = p.x + out.x * offset;
  const z = p.z + out.z * offset;
  // face back down the road toward the driver, angled a little toward the carriageway
  const face = tangent.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * Math.sign(offset));
  return { x, z, roadY: p.y, groundY: heightAt(x, z), yaw: Math.atan2(face.x, face.z) };
}

function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function billboardTexture(org: string, role: string, dates: string, what: string, accent: string) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(8, 22, 34, 0.55)';
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(140, 230, 255, 0.07)'; // scanlines
  for (let y = 0; y < 512; y += 6) g.fillRect(0, y, 1024, 2);
  g.strokeStyle = accent;
  g.lineWidth = 8;
  g.strokeRect(4, 4, 1016, 504);
  g.fillStyle = accent;
  g.fillRect(0, 0, 24, 512);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#f4f7fa';
  g.font = '700 92px "Space Grotesk", system-ui, sans-serif';
  g.fillText(org, 70, 140, 900);
  g.fillStyle = accent;
  g.font = '600 46px Inter, system-ui, sans-serif';
  g.fillText(`${role}, ${dates}`, 70, 215, 900);
  g.fillStyle = '#c3d0da';
  g.font = '400 42px Inter, system-ui, sans-serif';
  wrap(g, what, 880)
    .slice(0, 3)
    .forEach((l, i) => g.fillText(l, 70, 310 + i * 58));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function yearTexture(year: number) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 192;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(8, 22, 34, 0.7)';
  g.beginPath();
  g.roundRect(4, 4, 248, 184, 22);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#36e0ff';
  g.beginPath();
  g.roundRect(14, 14, 228, 164, 14);
  g.stroke();
  g.fillStyle = '#c8f6ff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 86px "Space Grotesk", system-ui, sans-serif';
  g.fillText(String(year), 128, 100);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildRoadside(scene: THREE.Scene): Collider[] {
  const colliders: Collider[] = [];
  const steel = mat('#2f3540', { metalness: 0.6, roughness: 0.35 });

  // ---------- job billboards ----------
  for (const li of document.querySelectorAll<HTMLElement>('[data-billboard]')) {
    const text = (sel: string) => li.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const u = Number(li.dataset.u);
    const accent = li.dataset.color ?? '#ffb347';
    const spot = roadside(u, 11, 0.45);
    const W = 10;
    const Hb = 5;
    const bottom = Math.max(spot.roadY, spot.groundY) + 3.2;
    const g = new THREE.Group();
    g.position.set(spot.x, 0, spot.z);
    g.rotation.y = spot.yaw;
    for (const px of [-W / 3, W / 3]) {
      const len = bottom - spot.groundY;
      g.add(cyl(0.16, 0.24, len, steel, px, spot.groundY + len / 2, 0, 8));
      g.add(box(0.06, len * 0.9, 0.34, glow(accent, 3), px, spot.groundY + len * 0.5, 0)); // light strip
    }
    // projector bar under the hologram, glowing in the company colour
    g.add(box(W + 0.4, 0.35, 0.6, steel, 0, bottom - 0.1, 0));
    g.add(box(W + 0.2, 0.08, 0.3, glow(accent, 4), 0, bottom + 0.1, 0));
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(W, Hb),
      new THREE.MeshBasicMaterial({
        map: billboardTexture(text('.org'), text('.role'), text('.dates'), text('.what'), accent),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    face.position.set(0, bottom + 0.3 + Hb / 2, 0);
    g.add(face);
    scene.add(g);
    for (const px of [-W / 3, W / 3]) {
      const v = new THREE.Vector3(px, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw);
      colliders.push({ x: spot.x + v.x, z: spot.z + v.z, r: 0.4 });
    }
  }

  // ---------- year markers ----------
  for (let year = 2017; year <= 2026; year++) {
    const spot = roadside(yearToU(year), -5.6, 0.25);
    const g = new THREE.Group();
    g.position.set(spot.x, spot.groundY, spot.z);
    g.rotation.y = spot.yaw;
    const top = Math.max(0, spot.roadY - spot.groundY) + 2.6;
    g.add(cyl(0.07, 0.07, top, steel, 0, top / 2, -0.06, 6));
    g.add(box(1.7, 0.08, 0.12, glow('#36e0ff', 4), 0, top - 0.68, 0));
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.2),
      new THREE.MeshBasicMaterial({ map: yearTexture(year), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    plate.position.set(0, top, 0.0);
    g.add(plate);
    scene.add(g);
    colliders.push({ x: spot.x, z: spot.z, r: 0.3 });
  }

  // ---------- light pylons along the outer edge of the road ----------
  const spots: THREE.Vector3[] = [];
  const gap = 16 / PATH_LENGTH;
  for (let u = 0.02; u < 0.985; u += gap) {
    const s = roadside(u, 5.4, 0);
    spots.push(new THREE.Vector3(s.x, Math.max(s.roadY, s.groundY), s.z));
    colliders.push({ x: s.x, z: s.z, r: 0.3 });
  }
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 6).translate(0, 1.2, 0), steel, spots.length);
  const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(0, 2.6, 0), glow('#36e0ff', 3), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    post.setMatrixAt(i, m);
    cap.setMatrixAt(i, m);
  });
  scene.add(post, cap);
  return colliders;
}
