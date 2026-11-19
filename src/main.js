// Starts the game: builds the world, wires the title screen, and hands control to the story.
import { Game, CONFIG } from './game.js';
import { buildLayout } from './layout.js';
import { $, store } from './util.js';
import { Polish } from './polish.js';
import { HarborDetail } from './harbor-detail.js';
import { InteractionEffects } from './interaction-effects.js';
import { DockGulls } from './dock-gulls.js';
import { setupVolume } from './volume.js';

const game = new Game();
window.game = game;   // test seam and console access

async function boot() {
  const bar = $('loadbar').firstElementChild, progress = (p) => { bar.style.width = Math.round(p * 100) + '%'; };
  try {
    // The smooth people built in Blender, loaded first because the player is one. A look whose kit is missing gets the low-polygon figure.
    try { const { loadPeople } = await import('./actors.js'); await loadPeople(); } catch (e) { console.warn('People kits not loaded:', e && e.message); }
    await game.init(progress);
    game.sites = buildLayout(game);
    if (game.sea.shore) game.sea.shore(game.world);
    try { const { Scatter } = await import('./scatter.js'); game.scatter = new Scatter(game); } catch (e) { console.warn('Ground cover not built:', e); }   // small things on the ground                       // foam around the quay and piers
    if (game.backdrop && game.backdrop.ready) await game.backdrop.ready.catch(() => {});   // so the mountains do not pop in
    progress(0.8);
    let story = null;
    try { story = await import('./story.js'); } catch (e) { console.warn('Story not loaded:', e); game.lastError = String(e && e.stack || e); }
    if (story) await story.setup(game);
    // People at work around the town. The game still runs if this part is missing.
    try { const life = await import('./life.js'); life.setupLife(game); } catch (e) { console.warn('People at work not loaded:', e && e.message); }
    // The districts: a name on entering each, its own light, and a few landmarks. The game still runs without them.
    try { const places = await import('./places.js'); places.setupPlaces(game); } catch (e) { console.warn('Districts not set up:', e && e.message); }
    // From the Codex copy (2026-11-19): presentation settings, harbor detail, altar effects, quay gulls.
    game.polish = new Polish(game);
    game.harbor = new HarborDetail(game);
    game.interactions = new InteractionEffects(game);
    game.dockGulls = new DockGulls(game);
    setupVolume(game);   // Sound and Music sliders (volume.js)
    progress(1);
    game.mode = 'menu';
    game.env('afternoon', 0);
    game.start();
    const begin = $('btnBegin'), cont = $('btnContinue'), save = game.loadSave();
    begin.disabled = false; begin.textContent = save ? 'Start over' : 'Begin';
    if (save) { cont.classList.remove('hidden', 'ghost'); begin.classList.add('ghost'); begin.parentNode.insertBefore(cont, begin); cont.focus(); } else begin.focus();
    const go = (fromSave) => {
      game.audio.unlock();
      $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
      game.mode = 'play'; game.canvas.focus(); game.snapCam = true;
      if (story) story.begin(game, fromSave ? save : null);
      else { game.teleport('world', 0, 46, Math.PI); }
    };
    begin.addEventListener('click', () => { if (save) store.del(CONFIG.saveKey); go(false); });
    cont.addEventListener('click', () => go(true));
    game.onRestart = () => { location.search.includes('seed') ? location.reload() : (window.location.href = window.location.pathname); };
    const q = new URLSearchParams(location.search);
    if (q.has('skip')) go(false);
    $('pauseKeys').innerHTML = 'W S or arrow keys: walk<br>A D: turn<br>Drag the mouse: look around<br>Mouse wheel: move the view closer or farther<br>Shift: run<br>E: talk or use<br>H: ask Mika for help<br>J: journal &nbsp; M: map<br>1 to 9: choose an answer &nbsp; Space: continue';
  } catch (e) {
    console.error(e);
    const p = document.querySelector('#title .sub'); p.textContent = 'The game could not start: ' + (e && e.message ? e.message : e);
    game.lastError = String(e && e.stack || e);
  }
}
boot();
