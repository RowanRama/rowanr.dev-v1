import './style.css';

// Entry point: decides between the 3D island and the text version, and only downloads the
// 3D code (three.js is most of the bundle) when someone actually views the island.
const root = document.documentElement;
const textBtn = document.getElementById('text-toggle') as HTMLButtonElement;

function webglOk() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function setTextMode(on: boolean) {
  root.classList.toggle('text-mode', on);
  textBtn.setAttribute('aria-pressed', String(on));
  textBtn.textContent = on ? '3D version' : 'Text version';
  if (on) {
    for (const a of document.querySelectorAll<HTMLElement>('#stations > article')) a.hidden = false;
    document.getElementById('stations')!.scrollTop = 0;
  }
  try {
    localStorage.setItem('text-mode', on ? '1' : '0');
  } catch {
    /* storage can be unavailable; the toggle still works */
  }
  dispatchEvent(new Event('textmodechange'));
}

let game: Promise<void> | null = null;
function loadGame() {
  game ??= (async () => {
    document.getElementById('loading')!.hidden = false;
    const { startGame } = await import('./game');
    await startGame();
  })();
  return game;
}

if (!webglOk()) {
  root.classList.add('text-mode', 'no-webgl');
} else {
  // is-3d keeps the header fixed in both versions, so the toggle never moves
  root.classList.add('is-3d');
  textBtn.hidden = false;
  textBtn.addEventListener('click', () => {
    const on = !root.classList.contains('text-mode');
    setTextMode(on);
    if (!on) loadGame();
  });
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('text-mode');
  } catch {
    /* ignore */
  }
  if (stored === '1') setTextMode(true);
  else loadGame();
}
