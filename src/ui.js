// Everything drawn in the page rather than in the 3D view: conversation, choices, cards, journal, menus.
import { $, el, clamp } from './util.js';
import { passageBrowser } from './passage-browser.js';

export class UI {
  constructor(game) {
    this.g = game;
    this.auto = null;          // set by tests: a function that answers prompts without a person
    this.waiting = null;       // resolver for the line or choice on screen
    this.choiceEls = []; this.sel = 0; this.typing = null;
    this.bubbles = new Map();
    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey);
    $('dialogue').addEventListener('click', (e) => { if (!e.target.closest('.choice')) this.advance(); });
    $('pickCancel').addEventListener('click', () => this._pickDone(null));
  }

  announce(text) { $('live').textContent = text; }

  // ---------- conversation ----------
  // Show one line and wait for the player to continue.
  say(name, text, opts = {}) {
    if (this.auto) { this.g.log.push({ t: 'say', name, text }); return Promise.resolve(); }
    const history=this.g.dialogueHistory || (this.g.dialogueHistory=[]);
    history.push({speaker:name || 'Narration',text});if(history.length>80)history.shift();
    const box = $('dialogue'); box.classList.remove('hidden');
    // A line with no speaker is narration. It is drawn differently from speech (italic, centered, on a dark band),
    // because Roman found that it "blends too easy with dialogue" (2026-11-16).
    box.classList.toggle('narr', !name); box.classList.remove('wasNarr','council');
    $('choices').innerHTML = ''; this.choiceEls = [];
    const nm = $('dlgName'); nm.innerHTML = '';
    if (name) { nm.append(document.createTextNode(name)); if (opts.role) nm.append(el('em', null, opts.role)); }
    const tx = $('dlgText'); tx.textContent = '';
    $('dlgMore').textContent = 'Space to continue'; $('dlgNote').textContent = opts.note || '';
    this.announce((name ? name + ': ' : '') + text + (opts.note ? ' ' + opts.note : ''));
    return new Promise((res) => {
      let i = 0; const full = text, speed = this.g.reduceMotion ? Infinity : (this.g.reading?.rate ?? 95);
      const start = performance.now();
      const tick = () => {
        i = Math.min(full.length, Math.floor((performance.now() - start) / 1000 * speed));
        tx.textContent = full.slice(0, i);
        if (i < full.length) this.typing = requestAnimationFrame(tick); else this.typing = null;
      };
      if(Number.isFinite(speed))this.typing = requestAnimationFrame(tick);
      else {this.typing=null;tx.textContent=full;}
      this.waiting = { kind: 'line', finish: () => { if (this.typing) { cancelAnimationFrame(this.typing); this.typing = null; tx.textContent = full; return false; } return true; }, res };
    });
  }

  // Show options and wait for one. Options are strings or { text, note }.
  choose(options, opts = {}) {
    const opt = options.map((o) => (typeof o === 'string' ? { text: o } : o));
    if (this.auto) { const i = clamp(this.auto('choose', opt, opts) | 0, 0, opt.length - 1); this.g.log.push({ t: 'choose', options: opt.map((o) => o.text), pick: i }); return Promise.resolve(i); }
    const box = $('dialogue'); box.classList.remove('hidden');
    // The choices are always on the paper box. Narration left above them, or a prompt with no speaker, stays italic.
    const it = opts.prompt != null ? !opts.name : box.classList.contains('narr') || box.classList.contains('wasNarr');
    box.classList.remove('narr'); box.classList.toggle('wasNarr', it);
    box.classList.toggle('council',!!opts.council);
    $('dlgNote').textContent = opts.note || '';
    if (opts.prompt != null) { $('dlgName').textContent = opts.name || ''; $('dlgText').textContent = opts.prompt; }
    $('dlgMore').textContent = 'Press a number, or click';
    const wrap = $('choices'); wrap.innerHTML = ''; this.choiceEls = [];
    return new Promise((res) => {
      opt.forEach((o, i) => {
        const b = el('button', 'choice');
        b.type='button';b.disabled=!!o.disabled;
        b.append(el('kbd', null, String(i + 1)));
        const span = el('span', null, o.text); if (o.note) span.append(el('small', null, o.note));
        b.append(span);
        if(o.portrait){const avatar=el('i','reader-seal',o.portrait.letter);avatar.style.background=o.portrait.color;avatar.setAttribute('aria-hidden','true');b.append(avatar);}
        b.addEventListener('click', (e) => { e.stopPropagation(); done(i); });
        b.addEventListener('focus',()=>{this.sel=i;this._markSel();});
        wrap.append(b); this.choiceEls.push(b);
      });
      this.sel = Math.max(0,opt.findIndex(o=>!o.disabled)); this._markSel();
      const done = (i) => { if(!opt[i] || opt[i].disabled)return;this.waiting = null; wrap.innerHTML = ''; this.choiceEls = []; this.g.audio.blip('pick'); res(i); };
      this.waiting = { kind: 'choice', done, n: opt.length, enabled:opt.map(o=>!o.disabled) };
    });
  }
  _markSel() { this.choiceEls.forEach((b, i) => b.classList.toggle('sel', i === this.sel)); }
  advance() {
    const w = this.waiting; if (!w || w.kind !== 'line') return;
    if (!w.finish()) return;
    this.waiting = null; this.g.audio.blip('next'); w.res();
  }
  closeDialogue() { $('dialogue').classList.add('hidden'); $('choices').innerHTML = ''; }
  onKey(e) {
    if(this.g.mode==='paused')return;
    if(this.g.cityStudy)return;
    if(this.g.photo?.active)return;
    if (this.g.evidenceTable) return;
    const w = this.waiting;
    if (this.pickRes && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this._pickDone(null); return; }
    if(e.ctrlKey || e.metaKey || e.altKey)return;
    if(!$('journal').classList.contains('hidden') || !$('map').classList.contains('hidden'))return;
    if (!w) return;
    if(w.kind==='line' && e.repeat){if(['Space','Enter','KeyE'].includes(e.code))e.preventDefault();return;}
    if (w.kind === 'line' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) { e.preventDefault(); this.advance(); }
    else if (w.kind === 'choice') {
      if(e.repeat && !['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();return;}
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= w.n) { e.preventDefault(); w.done(n - 1); }
      else if (e.code === 'ArrowDown' || e.code==='ArrowUp') {
        e.preventDefault();const direction=e.code==='ArrowDown'?1:-1;let next=this.sel;
        for(let i=0;i<w.n;i++){next=(next+direction+w.n)%w.n;if(w.enabled[next]){this.sel=next;break;}}
        this._markSel();
      }
      else if (e.code === 'Enter') { e.preventDefault(); w.done(this.sel); }
    }
  }

  // ---------- passage cards ----------
  cardEl(card, asButton, tags) {
    const c = el(asButton ? 'button' : 'div', 'card');
    c.append(el('div', 'ref', (/^[0-9]/.test(card.ref) ? 'Republic ' : '') + card.ref), el('b', null, card.title), el('p', null, card.text));
    if (card.quote) c.append(el('q', null, card.quote));
    if (tags && tags.length) { const t = el('div', 'tags'); tags.forEach((x) => t.append(el('span', null, x))); c.append(t); }
    return c;
  }
  // Let the player pick one passage. Resolves with its id or null.
  pickCard(cards, title, sub) {
    if (this.auto) { const id = this.auto('card', cards, { title }); this.g.log.push({ t: 'card', pick: id }); return Promise.resolve(id); }
    $('pickTitle').textContent = title; $('pickSub').textContent = sub || '';
    const wrap = $('pickCards'); wrap.innerHTML = '';
    return new Promise((res) => {
      this.pickRes = res;
      wrap.append(passageBrowser(this.g,cards,id=>this._pickDone(id)));
      $('picker').classList.remove('hidden');
      const first = wrap.querySelector('input'); if (first) first.focus();
    });
  }
  _pickDone(id) { if (!this.pickRes) return; const r = this.pickRes; this.pickRes = null; $('picker').classList.add('hidden'); $('pickCards').replaceChildren();this.g.keys.clear();this.g.pressed.clear();$('view').focus(); r(id); }

  // ---------- small notices ----------
  toast(title, body, tag) {
    if (this.auto) return;
    const t = el('div', 'toast'); if (tag) t.append(el('i', null, tag), document.createElement('br'));
    if(tag && /passage/i.test(tag))t.classList.add('passage-discovery');
    if(this.g.reduceMotion)t.style.animation='none';
    t.append(el('b', null, title)); if (body) { t.append(document.createElement('br')); t.append(document.createTextNode(body)); }
    $('toasts').append(t);
    setTimeout(() => { t.style.transition = 'opacity .6s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 650); }, 5200);
    this.announce(title + (body ? '. ' + body : ''));
  }
  area(title, sub) {
    const a = $('area'); a.querySelector('b').textContent = title; a.querySelector('span').textContent = sub || '';
    a.classList.add('on'); clearTimeout(this._areaT); this._areaT = setTimeout(() => a.classList.remove('on'), 3800);
  }
  objective(text) { $('objText').textContent = text || ''; $('objective').classList.toggle('hidden', !text); if (text) this.announce('Now: ' + text); }
  prompt(text) { const p = $('prompt'); if (!text) { p.classList.add('hidden'); return; } if (this._prompt !== text) { p.innerHTML = ''; p.append(el('kbd', null, 'E'), document.createTextNode(text)); this._prompt = text; } p.classList.remove('hidden'); }
  hint(text) { const h = $('hint'); h.textContent = text || ''; h.classList.toggle('hidden', !text); }
  wax(left, total) {
    const w = $('wax'); if (left == null) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden'); w.innerHTML = 'Tries left';
    for (let i = 0; i < total; i++) w.append(el('span', i < left ? '' : 'used'));
  }
  compass(angle, dist, label) {
    const c = $('compass'); if (angle == null) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden'); $('compArrow').style.transform = 'rotate(' + angle + 'rad)';
    $('compText').textContent = label + ' · ' + Math.round(dist) + ' m';
  }
  // Darkened edges and a label, shown while a remembered scene from last night is playing.
  memory(label) { const m = $('memory'); if (!label) { m.classList.remove('on'); return; } m.querySelector('span').textContent = label; m.classList.add('on'); }
  // Text over the picture, for story-within-a-story narration.
  story(text) { const s = $('story'); if (!text) { s.classList.remove('on'); return; } s.textContent = text; s.classList.add('on'); this.announce(text); }
  fade(to, seconds = 0.8, color = '#000') {
    const f = $('fade'); f.style.background = color;
    if (this.auto || this.g.reduceMotion) seconds = Math.min(seconds, 0.05);
    f.style.transition = 'opacity ' + seconds + 's ease'; f.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, seconds * 1000 + 30));
  }

  // ---------- speech bubbles over heads ----------
  bubble(id, name, text, seconds = 4, wide = false) {
    let b = this.bubbles.get(id);
    if (!b) { b = { el: el('div', 'bubble') }; $('bubbles').append(b.el); this.bubbles.set(id, b); }
    b.el.innerHTML = ''; b.el.append(el('b', null, name), document.createTextNode(text)); b.until = this.g.time + seconds; b.el.style.opacity = '1'; b.el.classList.toggle('wide', !!wide);
  }
  placeBubble(id, sx, sy, visible) {
    const b = this.bubbles.get(id); if (!b) return;
    if (this.g.time > b.until) { b.el.remove(); this.bubbles.delete(id); return; }
    b.el.style.display = visible ? '' : 'none';
    if (visible) { b.el.style.left = sx + 'px'; b.el.style.top = sy + 'px'; }
  }
  clearBubbles() { for (const b of this.bubbles.values()) b.el.remove(); this.bubbles.clear(); }
}
