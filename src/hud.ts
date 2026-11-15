import type { Input } from './player';
import type { Station } from './stations';
import { minimapImage, SIZE } from './world';

export type Mode = 'drive' | 'tour';

export function readArticles() {
  const map = new Map<string, HTMLElement>();
  for (const a of document.querySelectorAll<HTMLElement>('#stations > article[data-station]')) map.set(a.dataset.station!, a);
  return map;
}

/** Keyboard plus an on-screen stick for touch screens that choose to drive. */
export function createInput(onDriveKey: () => void) {
  const keys = new Set<string>();
  const stick = { x: 0, y: 0 };
  const input: Input = { forward: 0, turn: 0, boost: false };
  const driveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  addEventListener('keydown', (e) => {
    const t = e.target;
    if ((t instanceof Element && t.closest('input, textarea, select')) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (driveKeys.has(e.code) || e.code.startsWith('Shift')) {
      if (driveKeys.has(e.code)) onDriveKey();
      if (e.code.startsWith('Arrow') && document.documentElement.classList.contains('drive')) e.preventDefault();
      keys.add(e.code);
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const pad = document.getElementById('joystick')!;
  const knob = pad.querySelector('span')!;
  let pointer: number | null = null;
  const move = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    stick.x = dx * k;
    stick.y = dy * k;
    knob.style.translate = `${stick.x * 34}px ${stick.y * 34}px`;
  };
  pad.addEventListener('pointerdown', (e) => {
    pointer = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    move(e);
  });
  pad.addEventListener('pointermove', (e) => e.pointerId === pointer && move(e));
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    stick.x = stick.y = 0;
    knob.style.translate = '';
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  return () => {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const t = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    input.forward = f || -stick.y;
    input.turn = t || -stick.x;
    input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > 0.95;
    return input;
  };
}

export function createHud(stations: Station[], articles: Map<string, HTMLElement>, onJump: (s: Station) => void) {
  const nav = document.querySelector<HTMLElement>('.timeline')!;
  const dots = new Map<string, HTMLButtonElement>();
  for (const st of stations) {
    const art = articles.get(st.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `dot ${art?.dataset.kind ?? 'chapter'}`;
    const label = art?.dataset.sign ?? st.id;
    b.setAttribute('aria-label', `Go to ${label}`);
    b.title = label;
    b.addEventListener('click', () => onJump(st));
    nav.append(b);
    dots.set(st.id, b);
  }
  nav.hidden = false;

  const panel = document.getElementById('stations')!;
  let active: string | null | undefined;
  function setActive(id: string | null) {
    if (id === active) return;
    active = id;
    for (const [key, art] of articles) art.hidden = key !== id;
    panel.toggleAttribute('data-open', id !== null);
    for (const [key, d] of dots) {
      if (key === id) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    }
    if (id) panel.scrollTop = 0;
  }

  // minimap
  const mm = document.getElementById('minimap') as HTMLCanvasElement;
  const g = mm.getContext('2d')!;
  const bg = minimapImage(160);
  const toMap = (x: number, z: number) => [((x / SIZE + 0.5) * mm.width), ((z / SIZE + 0.5) * mm.height)] as const;
  function drawMinimap(px: number, pz: number, heading: number) {
    const w = mm.width;
    g.save();
    g.clearRect(0, 0, w, w);
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.drawImage(bg, 0, 0, w, w);
    for (const st of stations) {
      const [x, y] = toMap(st.stop.x, st.stop.z);
      g.fillStyle = st.id === active ? '#ffffff' : articles.get(st.id)?.dataset.kind === 'interest' ? '#5fd4c4' : '#ffb347';
      g.beginPath();
      g.arc(x, y, st.id === active ? 9 : 6, 0, Math.PI * 2);
      g.fill();
    }
    const [x, y] = toMap(px, pz);
    g.translate(x, y);
    g.rotate(-heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0e1a23';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(-9, 8);
    g.lineTo(-5, 0);
    g.lineTo(-9, -8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  return {
    setActive,
    drawMinimap,
    /** forget the open card, so the next setActive re-applies visibility (after the text version) */
    reset() {
      active = undefined;
    },
  };
}

/** Tall scroll track with one snap point per station, for the scroll-to-drive tour. */
export function createScrollTour(stations: Station[]) {
  const track = document.getElementById('scroll-track')!;
  for (const st of stations) {
    const m = document.createElement('div');
    m.className = 'snap';
    m.style.top = `calc(${st.u} * (100% - 100lvh))`;
    track.append(m);
  }
  const progress = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  const scrollToU = (u: number, smooth: boolean) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: u * max, behavior: smooth ? 'smooth' : 'instant' });
  };
  return { progress, scrollToU };
}
