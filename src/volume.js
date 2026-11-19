// Sound and Music volume (2026-11-19). Roman: "when I click sound/music I should be able to adjust the volume rather
// than just turn it off". Clicking either button opens a slider under it, with a button that turns that sound off and
// back on; the button shows the level ("Sound 60%", "Music off"). Escape, a click elsewhere, or the button again
// closes it. While it is open its keys do not reach the game. The levels are kept in this browser.
import { $, store } from './util.js';

const KEY = 'city-in-speech-volume';

export function setupVolume(g) {
  const saved = store.get(KEY) || {};
  const num = (v, d) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
  const vol = { sound: num(saved.sound, 1), music: num(saved.music, 1) }, last = { sound: vol.sound || 1, music: vol.music || 1 };
  const btn = { sound: $('btnSound'), music: $('btnMusic') }, name = { sound: 'Sound', music: 'Music' };
  const label = (k) => { const v = Math.round(vol[k] * 100); btn[k].textContent = v ? name[k] + ' ' + v + '%' : name[k] + ' off'; btn[k].setAttribute('aria-expanded', String(open === k)); };
  const apply = (k) => { if (k === 'sound') g.audio.setVolume(vol.sound); else g.music.setVolume(vol.music); label(k); };
  const keep = () => store.set(KEY, vol);

  const pop = document.createElement('div'); pop.className = 'vol-pop hidden'; pop.setAttribute('role', 'group');
  const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '5';
  const val = document.createElement('span'); val.className = 'vol-val';
  const off = document.createElement('button'); off.type = 'button'; off.className = 'chip';
  pop.append(range, val, off);
  document.getElementById('hud').append(pop);
  let open = null;
  const sync = () => { const v = Math.round(vol[open] * 100); range.value = String(v); val.textContent = v ? v + '%' : 'off'; off.textContent = v ? 'Off' : 'On'; };
  const show = (k) => {
    open = k; range.setAttribute('aria-label', name[k] + ' volume'); sync();
    const r = btn[k].getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 6) + 'px'; pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    pop.classList.remove('hidden'); label('sound'); label('music'); range.focus();
  };
  const hide = () => { if (!open) return; open = null; pop.classList.add('hidden'); label('sound'); label('music'); g.canvas.focus(); };
  for (const k of ['sound', 'music']) btn[k].onclick = () => { g.audio.unlock(); if (open === k) hide(); else show(k); };
  range.addEventListener('input', () => { vol[open] = +range.value / 100; if (vol[open] > 0) last[open] = vol[open]; apply(open); sync(); keep(); });
  off.onclick = () => { vol[open] = vol[open] > 0 ? 0 : last[open] || 1; apply(open); sync(); keep(); range.focus(); };
  pop.addEventListener('keydown', (e) => { if (e.code === 'Escape') { e.preventDefault(); hide(); } e.stopPropagation(); });
  pop.addEventListener('keyup', (e) => e.stopPropagation());
  document.addEventListener('pointerdown', (e) => { if (open && !pop.contains(e.target) && !btn[open].contains(e.target)) hide(); });
  apply('sound'); apply('music');
}
