/* Nail Design Planner — plain JavaScript, no libraries, no network. */
'use strict';
(() => {
  // ---------- constants ----------
  const SEASONS = ['fall', 'winter', 'spring', 'summer'];
  const SEASON_LABEL = { fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer' };
  const FINISHES = { creme: 'Crème', shimmer: 'Shimmer', glitter: 'Glitter', matte: 'Matte', sheer: 'Sheer' };
  const TYPES = { french: 'French tip', gems: 'Gems on top', accent: 'Accent nail', solid: 'Solid' };
  const FINGERS = ['L pinky', 'L ring', 'L middle', 'L index', 'L thumb', 'R thumb', 'R index', 'R middle', 'R ring', 'R pinky'];
  const FINGER_SHORT = ['Pinky', 'Ring', 'Middle', 'Index', 'Thumb', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtShort = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const safeColor = (c, fallback = '#CCCCCC') => (HEX.test(c) ? c : fallback);
  function currentSeason() { const m = new Date().getMonth(); return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'fall'; }

  // ---------- local storage ----------
  const KEY = 'ndp.';
  function load(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
  function persist(...keys) {
    for (const k of keys) {
      try { localStorage.setItem(KEY + k, JSON.stringify(state[k])); }
      catch { toast('Storage is full. Export a backup, then delete a few photos.'); }
    }
  }
  const state = {
    polishes: load('polishes', []),
    designs: load('designs', []),
    ideas: load('ideas', []),
    seq: load('seq', 0),
    season: load('season', currentSeason()),
    tab: load('tab', 'polishes'),
    current: null,
    currentSaved: false,
  };
  if (!SEASONS.includes(state.season)) state.season = currentSeason();
  if (!['polishes', 'designs', 'ideas', 'history'].includes(state.tab)) state.tab = 'polishes';

  // ---------- IndexedDB for photos ----------
  const photos = new Map();
  const idb = {
    db: null,
    open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('nail-design-planner', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('photos');
          r.onsuccess = () => { this.db = r.result; res(true); };
          r.onerror = () => res(false);
          r.onblocked = () => res(false);
        } catch { res(false); }
      });
    },
    run(mode, fn) {
      return new Promise((res, rej) => {
        if (!this.db) return res();
        const t = this.db.transaction('photos', mode);
        fn(t.objectStore('photos'));
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    },
    put(id, v) { return this.run('readwrite', (s) => s.put(v, id)); },
    del(id) { return this.run('readwrite', (s) => s.delete(id)); },
    clear() { return this.run('readwrite', (s) => s.clear()); },
    loadAll() {
      return new Promise((res) => {
        if (!this.db) return res();
        const r = this.db.transaction('photos').objectStore('photos').openCursor();
        r.onsuccess = () => { const c = r.result; if (c) { photos.set(c.key, c.value); c.continue(); } else res(); };
        r.onerror = () => res();
      });
    },
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- small pieces ----------
  const capHTML = (p, size = '') => `<span class="cap ${size}" data-finish="${esc(p.finish || 'creme')}" style="--c:${safeColor(p.color)}" aria-hidden="true"></span>`;
  const seasonTag = (s) => `<span class="tag tag-${s}">${SEASON_LABEL[s]}</span>`;
  const tagsHTML = (p) => p.seasons.map(seasonTag).join('') + (p.base ? '<span class="tag tag-base">Base</span>' : '');
  const emptyHTML = (art, title, next) => `<div class="empty"><div class="empty-art">${art}</div><p class="empty-title">${title}</p><p class="empty-next">${next}</p></div>`;
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7m-8 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const ART = {
    bottle: `<svg viewBox="0 0 84 84"><rect x="32" y="6" width="20" height="24" rx="5" fill="#3A1426"/><rect x="35" y="9" width="4" height="17" rx="2" fill="#fff" opacity=".35"/><path d="M22 34h40a8 8 0 0 1 8 8v26a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10V42a8 8 0 0 1 8-8Z" fill="#B0245A"/><path d="M21 40c0-2 1-3 3-3h4v32h-4a3 3 0 0 1-3-3Z" fill="#fff" opacity=".45"/><path d="M60 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#D4A24C"/></svg>`,
    photo: `<svg viewBox="0 0 84 84"><rect x="8" y="16" width="68" height="54" rx="12" fill="#fff" stroke="#B0245A" stroke-width="4"/><circle cx="30" cy="36" r="7" fill="#D4A24C"/><path d="M14 62l18-16 12 11 9-8 17 13" fill="none" stroke="#B0245A" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><path d="M66 4l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5Z" fill="#D4A24C"/></svg>`,
    sparkle: `<svg viewBox="0 0 84 84"><path d="M42 8c2 16 10 24 26 26-16 2-24 10-26 26-2-16-10-24-26-26 16-2 24-10 26-26Z" fill="#B0245A"/><path d="M66 54c1 7 4 10 11 11-7 1-10 4-11 11-1-7-4-10-11-11 7-1 10-4 11-11Z" fill="#D4A24C"/></svg>`,
    chart: `<svg viewBox="0 0 84 84"><rect x="12" y="44" width="14" height="28" rx="5" fill="#F1BFD0"/><rect x="35" y="24" width="14" height="48" rx="5" fill="#B0245A"/><rect x="58" y="36" width="14" height="36" rx="5" fill="#D4A24C"/><path d="M8 76h68" stroke="#3A1426" stroke-width="4" stroke-linecap="round"/></svg>`,
  };

  // ---------- hand drawing ----------
  let svgSeq = 0;
  const FINGER_GEOM = (() => {
    const L = [
      { cx: 26, top: 60, rot: -10, w: 20, h: 22 },
      { cx: 53, top: 36, rot: -4, w: 22, h: 24 },
      { cx: 82, top: 26, rot: 0, w: 23, h: 25 },
      { cx: 111, top: 38, rot: 5, w: 22, h: 24 },
      { cx: 136, top: 96, rot: 32, w: 25, h: 24 },
    ];
    const R = L.map((f) => ({ ...f, cx: 360 - f.cx, rot: -f.rot })).reverse();
    return [...L, ...R];
  })();
  const nailPath = (x, y, w, h) => { const r = w / 2; return `M${x},${y + h}L${x},${y + r}A${r},${r} 0 0 1 ${x + w},${y + r}L${x + w},${y + h}Q${x + r},${y + h + 3} ${x},${y + h}Z`; };

  function handSVG(nails, label) {
    const p = 'h' + (++svgSeq);
    let fingers = '';
    let tops = '';
    FINGER_GEOM.forEach((f, i) => {
      const fw = f.w + 8;
      const rot = `rotate(${f.rot} ${f.cx} 168)`;
      fingers += `<rect transform="${rot}" x="${f.cx - fw / 2}" y="${f.top}" width="${fw}" height="${172 - f.top}" rx="${fw / 2}" class="skin"/>`;
      const n = nails[i] || {};
      const nx = f.cx - f.w / 2;
      const ny = f.top + 4;
      const d = nailPath(nx, ny, f.w, f.h);
      let g = `<path d="${d}" fill="${safeColor(n.color, '#F3DDE4')}" stroke="rgba(58,20,38,.25)" stroke-width="1"/>`;
      if (n.tip && HEX.test(n.tip)) {
        const th = f.h * 0.36;
        g += `<clipPath id="${p}c${i}"><path d="${d}"/></clipPath><path clip-path="url(#${p}c${i})" d="M${nx - 2},${ny - 2}H${nx + f.w + 2}V${ny + th + 3}Q${f.cx},${ny + th - 7} ${nx - 2},${ny + th + 3}Z" fill="${n.tip}"/>`;
      }
      g += `<path d="${d}" fill="url(#${p}gl)"/>`;
      const sx = nx + f.w * 0.3, sy = ny + f.h * 0.42;
      g += `<ellipse cx="${sx}" cy="${sy}" rx="${f.w * 0.1}" ry="${f.h * 0.24}" fill="#fff" opacity="${n.finish === 'matte' ? 0.45 : 0.88}" transform="rotate(-8 ${sx} ${sy})"/>`;
      g += `<circle cx="${nx + f.w * 0.44}" cy="${ny + f.h * 0.14}" r="1.3" fill="#fff" opacity=".8"/>`;
      if (n.gems) {
        [[0.34, 3], [0.58, 4], [0.84, 3]].forEach(([t, r]) => {
          g += `<circle cx="${f.cx + f.w * 0.06}" cy="${ny + f.h * t}" r="${r}" fill="url(#${p}gem)" stroke="#fff" stroke-width=".7"/>`;
        });
      }
      tops += `<g transform="${rot}">${g}</g>`;
    });
    return `<svg class="hand" viewBox="0 20 360 150" role="img" aria-label="${esc(label || 'Nail idea drawing')}">
      <defs>
        <linearGradient id="${p}gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
        <radialGradient id="${p}gem" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#F6DFA6"/><stop offset="1" stop-color="#D4A24C"/></radialGradient>
      </defs>
      ${fingers}
      <rect x="6" y="122" width="134" height="60" rx="28" class="skin"/>
      <rect x="220" y="122" width="134" height="60" rx="28" class="skin"/>
      ${tops}
    </svg>`;
  }

  // ---------- tabs ----------
  function showTab(tab) {
    state.tab = tab;
    persist('tab');
    document.body.dataset.tab = tab;
    $$('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + tab; });
    $$('.tabbar button').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#fab').setAttribute('aria-label', tab === 'designs' ? 'Add a design photo' : 'Add a polish');
    if (tab === 'history') renderHistory();
    window.scrollTo(0, 0);
  }

  // ---------- polishes ----------
  function renderPolishes() {
    const list = $('#polishList');
    $('#polishCount').textContent = state.polishes.length || '';
    if (!state.polishes.length) {
      list.innerHTML = emptyHTML(ART.bottle, 'No polishes yet.', 'Tap + to add one.');
      return;
    }
    const sorted = [...state.polishes].sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = sorted.map((p) => `
      <button type="button" class="card polish-card" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">
        ${capHTML(p)}
        <span class="pc-body">
          <span class="pc-name">${esc(p.name)}</span>
          <span class="pc-finish">${esc(FINISHES[p.finish] || 'Crème')}</span>
          <span class="tags">${tagsHTML(p)}</span>
        </span>
      </button>`).join('');
  }

  let editingPolish = null;
  function buildPolishForm() {
    $('#pFinish').innerHTML = Object.entries(FINISHES).map(([k, v]) =>
      `<label class="chip"><input type="radio" name="finish" value="${k}"><span>${v}</span></label>`).join('');
    $('#pSeasons').innerHTML = SEASONS.map((s) =>
      `<label class="chip s-${s}"><input type="checkbox" name="season" value="${s}"><span>${SEASON_LABEL[s]}</span></label>`).join('');
  }
  function updateCapPreview() {
    const cap = $('#pCapPreview');
    cap.style.setProperty('--c', safeColor($('#pColor').value));
    const f = $('#pFinish input:checked');
    cap.dataset.finish = f ? f.value : 'creme';
  }
  function openPolish(p) {
    editingPolish = p || null;
    $('#polishDialogTitle').textContent = p ? 'Edit polish' : 'New polish';
    $('#pName').value = p ? p.name : '';
    $('#pColor').value = p ? safeColor(p.color) : '#B0245A';
    const finish = p ? p.finish : 'creme';
    $$('#pFinish input').forEach((i) => { i.checked = i.value === finish; });
    $$('#pSeasons input').forEach((i) => { i.checked = p ? p.seasons.includes(i.value) : false; });
    $('#pBase').checked = p ? !!p.base : false;
    $('#polishDelete').hidden = !p;
    $('#polishError').textContent = '';
    updateCapPreview();
    $('#polishDialog').showModal();
  }
  function savePolish(e) {
    e.preventDefault();
    const name = $('#pName').value.trim();
    const seasons = $$('#pSeasons input:checked').map((i) => i.value);
    if (!name) { $('#polishError').textContent = 'Give your polish a name.'; $('#pName').focus(); return; }
    if (!seasons.length) { $('#polishError').textContent = 'Pick at least one season.'; return; }
    const data = {
      name: name.slice(0, 60),
      color: safeColor($('#pColor').value).toUpperCase(),
      finish: ($('#pFinish input:checked') || {}).value || 'creme',
      seasons,
      base: $('#pBase').checked,
    };
    if (editingPolish) Object.assign(editingPolish, data);
    else state.polishes.push({ id: uid(), ...data });
    persist('polishes');
    $('#polishDialog').close();
    renderPolishes();
    toast(editingPolish ? 'Polish updated ✦' : `${data.name} added ✦`);
  }
  function deletePolish() {
    if (!editingPolish) return;
    if (!confirm(`Delete “${editingPolish.name}”? Saved ideas keep their colors.`)) return;
    state.polishes = state.polishes.filter((p) => p !== editingPolish);
    persist('polishes');
    $('#polishDialog').close();
    renderPolishes();
    toast('Polish deleted');
  }

  // ---------- designs ----------
  function renderDesigns() {
    const list = $('#designList');
    $('#designCount').textContent = state.designs.length || '';
    if (!state.designs.length) {
      list.innerHTML = emptyHTML(ART.photo, 'No design photos yet.', 'Tap + to add one from your camera or photos.');
      return;
    }
    list.innerHTML = [...state.designs].sort((a, b) => b.num - a.num).map((d) => {
      const src = photos.get(d.id);
      const fingers = d.fingers.length ? ` · ${d.fingers.length} ${d.type === 'gems' ? 'with gems' : 'accent'}` : '';
      return `<button type="button" class="card design-card" data-id="${esc(d.id)}" aria-label="Edit photo ${d.num}">
        ${src ? `<img src="${esc(src)}" alt="Design photo ${d.num}" loading="lazy">` : '<span class="no-photo">Photo missing</span>'}
        <span class="design-meta">
          <b><span class="num-badge">#${d.num}</span>${esc(TYPES[d.type])}</b>
          <span>${d.colors} color${d.colors === 1 ? '' : 's'}${fingers}</span>
        </span>
      </button>`;
    }).join('');
  }

  let editingDesign = null;
  let pendingPhoto = null;
  function buildDesignForm() {
    $('#dType').innerHTML = Object.entries(TYPES).map(([k, v]) =>
      `<label class="chip"><input type="radio" name="dtype" value="${k}"><span>${v}</span></label>`).join('');
    $('#dColors').innerHTML = [1, 2, 3, 4, 5].map((n) =>
      `<label class="chip"><input type="radio" name="dcolors" value="${n}"><span>${n}</span></label>`).join('');
    const row = (label, idxs) => `<div class="hand-row"><b>${label}</b>${idxs.map((i) =>
      `<label class="chip"><input type="checkbox" name="finger" value="${i}" aria-label="${FINGERS[i]}"><span>${FINGER_SHORT[i]}</span></label>`).join('')}</div>`;
    $('#dFingers').innerHTML = row('Left', [0, 1, 2, 3, 4]) + row('Right', [5, 6, 7, 8, 9]);
  }
  function updateFingerField() {
    const t = ($('#dType input:checked') || {}).value;
    const show = t === 'accent' || t === 'gems';
    $('#dFingerField').hidden = !show;
    $('#dFingerLegend').textContent = t === 'gems' ? 'Which fingers get gems?' : 'Which fingers get the accent?';
  }
  function showPreview(src) {
    const box = $('#dPreview');
    box.classList.toggle('has-photo', !!src);
    box.innerHTML = src ? `<img src="${esc(src)}" alt="Selected design photo">` : '<span>Add a photo of a design you love</span>';
  }
  function openDesign(d) {
    editingDesign = d || null;
    pendingPhoto = null;
    $('#designDialogTitle').textContent = d ? `Edit photo #${d.num}` : 'New design';
    showPreview(d ? photos.get(d.id) : null);
    $$('#dType input').forEach((i) => { i.checked = d ? i.value === d.type : false; });
    $$('#dColors input').forEach((i) => { i.checked = Number(i.value) === (d ? d.colors : 1); });
    $$('#dFingers input').forEach((i) => { i.checked = d ? d.fingers.includes(Number(i.value)) : false; });
    $('#designDelete').hidden = !d;
    $('#designError').textContent = '';
    updateFingerField();
    $('#designDialog').showModal();
  }
  function readImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        const w = img.naturalWidth, h = img.naturalHeight;
        const s = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }
  async function onPhotoChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      pendingPhoto = await readImage(file);
      showPreview(pendingPhoto);
      $('#designError').textContent = '';
    } catch {
      $('#designError').textContent = 'That photo could not be opened. Try another one.';
    }
  }
  async function saveDesign(e) {
    e.preventDefault();
    const type = ($('#dType input:checked') || {}).value;
    const colors = Number(($('#dColors input:checked') || {}).value || 1);
    let fingers = $$('#dFingers input:checked').map((i) => Number(i.value));
    const hasPhoto = pendingPhoto || (editingDesign && photos.get(editingDesign.id));
    const err = $('#designError');
    if (!hasPhoto) { err.textContent = 'Add a photo first.'; return; }
    if (!type) { err.textContent = 'Pick a design type.'; return; }
    if (type === 'accent' || type === 'gems') {
      if (!fingers.length) { err.textContent = type === 'gems' ? 'Tap the fingers that get gems.' : 'Tap the fingers that get the accent.'; return; }
      if (type === 'accent' && fingers.length === 10) { err.textContent = 'Leave at least one finger without the accent.'; return; }
    } else fingers = [];
    let d = editingDesign;
    if (d) Object.assign(d, { type, colors, fingers });
    else {
      state.seq += 1;
      d = { id: uid(), num: state.seq, type, colors, fingers, createdAt: new Date().toISOString() };
      state.designs.push(d);
    }
    if (pendingPhoto) {
      photos.set(d.id, pendingPhoto);
      try { await idb.put(d.id, pendingPhoto); } catch { toast('Photo could not be saved on this device.'); }
    }
    persist('designs', 'seq');
    $('#designDialog').close();
    renderDesigns();
    toast(editingDesign ? 'Design updated ✦' : `Photo #${d.num} added ✦`);
  }
  async function deleteDesign() {
    const d = editingDesign;
    if (!d) return;
    if (!confirm(`Delete photo #${d.num}? Saved ideas keep their nail drawing.`)) return;
    state.designs = state.designs.filter((x) => x !== d);
    photos.delete(d.id);
    try { await idb.del(d.id); } catch { /* ignore */ }
    persist('designs');
    $('#designDialog').close();
    renderDesigns();
    toast('Design deleted');
  }

  // ---------- idea rules ----------
  const snap = (p) => ({ color: p.color, name: p.name, finish: p.finish });
  const line = (label, p, why) => ({ label, text: `${p.name} (${why})`, color: p.color, finish: p.finish });
  function fillDesign(d, season) {
    const sl = SEASON_LABEL[season].toLowerCase();
    const S = state.polishes.filter((p) => p.seasons.includes(season));
    const B = state.polishes.filter((p) => p.base);
    const layout = { label: 'Layout', text: `${TYPES[d.type]}, photo #${d.num}` };
    const fingerNames = d.fingers.map((i) => FINGERS[i]).join(', ');
    const fail = (need) => ({ ok: false, design: d, msg: need });
    let nails, lines;

    if (d.type === 'french') {
      const pairs = [];
      for (const b of B) for (const t of S) if (b.id !== t.id) pairs.push([b, t]);
      if (!pairs.length) return fail(`Photo #${d.num} is a French tip. It needs one polish tagged Base and a different polish tagged ${SEASON_LABEL[season]}.`);
      const [b, t] = pick(pairs);
      nails = Array.from({ length: 10 }, () => ({ ...snap(b), tip: t.color }));
      lines = [line('Base', b, 'tagged base'), line('Tip', t, `tagged ${sl}`), layout];
    } else if (d.type === 'gems') {
      const pool = state.polishes.filter((p) => p.base || p.seasons.includes(season));
      if (!pool.length) return fail(`Photo #${d.num} has gems on top. It needs a polish tagged Base or ${SEASON_LABEL[season]}.`);
      if (!d.fingers.length) return fail(`Photo #${d.num} doesn't say which fingers get gems. Tap it in Designs to choose.`);
      const p = pick(pool);
      const why = [p.base ? 'base' : null, p.seasons.includes(season) ? sl : null].filter(Boolean).join(' + ');
      nails = Array.from({ length: 10 }, (_, i) => ({ ...snap(p), gems: d.fingers.includes(i) }));
      lines = [line('Color', p, `tagged ${why}`), { label: 'Gems', text: `${fingerNames} (tagged fingers)`, gem: true }, layout];
    } else if (d.type === 'accent') {
      if (S.length < 2) return fail(`Photo #${d.num} is an accent nail. It needs two different polishes tagged ${SEASON_LABEL[season]}.`);
      if (!d.fingers.length) return fail(`Photo #${d.num} doesn't say which fingers get the accent. Tap it in Designs to choose.`);
      const [a, r] = shuffle(S);
      nails = Array.from({ length: 10 }, (_, i) => snap(d.fingers.includes(i) ? a : r));
      lines = [
        { label: 'Accent', text: `${a.name} (tagged ${sl}) on ${fingerNames}`, color: a.color, finish: a.finish },
        line('Rest', r, `tagged ${sl}`),
        layout,
      ];
    } else {
      if (!S.length) return fail(`Photo #${d.num} is a solid color. It needs a polish tagged ${SEASON_LABEL[season]}.`);
      const p = pick(S);
      nails = Array.from({ length: 10 }, () => snap(p));
      lines = [line('Color', p, `tagged ${sl}`), layout];
    }
    return { ok: true, idea: { season, designId: d.id, designNum: d.num, type: d.type, nails, lines } };
  }
  function generateIdea() {
    if (!state.designs.length) return { ok: false, title: 'No design photos yet.', msg: 'Add one in Designs, then tap New idea.' };
    if (!state.polishes.length) return { ok: false, title: 'No polishes yet.', msg: 'Add a few in Polishes, then tap New idea.' };
    let firstFail = null;
    for (const d of shuffle(state.designs)) {
      const r = fillDesign(d, state.season);
      if (r.ok) return r;
      if (!firstFail) firstFail = r;
    }
    return { ok: false, title: 'Not enough polishes for this one yet 💅', msg: `${firstFail.msg} Add one in Polishes and try again.` };
  }

  // ---------- ideas UI ----------
  function linesHTML(lines) {
    return `<ul class="why">${lines.map((l) => {
      const icon = l.color ? capHTML(l, 'cap-sm') : `<span class="dot" aria-hidden="true">${l.gem ? '◆' : '✦'}</span>`;
      return `<li>${icon}<span><b>${esc(l.label)}:</b> ${esc(l.text)}</span></li>`;
    }).join('')}</ul>`;
  }
  function stageHTML(idea) {
    const src = photos.get(idea.designId);
    const label = `${TYPES[idea.type]} idea for ${SEASON_LABEL[idea.season]}`;
    return `<div class="idea-stage">
      <div class="idea-hand">${handSVG(idea.nails, label)}</div>
      <figure class="idea-photo">
        ${src ? `<img src="${esc(src)}" alt="Inspiration photo ${idea.designNum}">` : '<span class="no-photo">Photo deleted</span>'}
        <figcaption>Photo #${idea.designNum}</figcaption>
      </figure>
    </div>`;
  }
  function renderSeasonPicker() {
    $('#seasonPicker').innerHTML = SEASONS.map((s) =>
      `<label class="s-${s}"><input type="radio" name="season" value="${s}" ${s === state.season ? 'checked' : ''}><span>${SEASON_LABEL[s]}</span></label>`).join('');
  }
  function renderCurrent() {
    const box = $('#currentIdea');
    const c = state.current;
    if (!c) {
      box.innerHTML = state.ideas.length ? '' : emptyHTML(ART.sparkle, 'Pick a season, then tap New idea.', 'You’ll get a look made from your own polishes.');
      return;
    }
    if (!c.ok) {
      box.innerHTML = `<div class="notice"><b>${esc(c.title)}</b><p>${esc(c.msg)}</p></div>`;
      return;
    }
    box.innerHTML = `<div class="card idea-card pop">
      ${stageHTML(c.idea)}
      ${linesHTML(c.idea.lines)}
      <div class="idea-actions">
        <button type="button" class="btn btn-secondary" data-action="save-current" ${state.currentSaved ? 'disabled' : ''}>${state.currentSaved ? 'Saved ✓' : '♡ Save idea'}</button>
      </div>
    </div>`;
  }
  function renderSaved() {
    const list = $('#savedIdeas');
    $('#savedTitle').hidden = !state.ideas.length;
    list.innerHTML = [...state.ideas].reverse().map((i) => {
      const worn = (i.worn || []).slice().sort().reverse();
      return `<article class="card idea-card" data-id="${esc(i.id)}">
        <div class="idea-head">${seasonTag(i.season)}<small class="muted">Saved ${esc(new Date(i.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</small></div>
        ${stageHTML(i)}
        ${linesHTML(i.lines)}
        ${worn.length ? `<div class="worn-list"><b>Worn:</b> ${worn.map((d) => `<button type="button" class="worn-chip" data-action="unwear" data-date="${esc(d)}" aria-label="Remove worn date ${esc(fmtDate(d))}">${esc(fmtDate(d))} ×</button>`).join('')}</div>` : ''}
        <div class="idea-actions">
          <button type="button" class="btn btn-secondary btn-small" data-action="wear">💅 I wore this</button>
          <button type="button" class="trash" data-action="delete-idea" aria-label="Delete this idea">${TRASH}</button>
        </div>
      </article>`;
    }).join('');
  }
  function renderIdeas() { renderCurrent(); renderSaved(); }

  function saveCurrent() {
    const c = state.current;
    if (!c || !c.ok || state.currentSaved) return;
    state.ideas.push({ id: uid(), createdAt: new Date().toISOString(), worn: [], ...JSON.parse(JSON.stringify(c.idea)) });
    state.currentSaved = true;
    persist('ideas');
    renderIdeas();
    toast('Idea saved ✦');
  }

  let wearingIdea = null;
  function openWorn(idea) {
    wearingIdea = idea;
    $('#wornDate').value = ymd(new Date());
    $('#wornDialog').showModal();
  }
  function saveWorn(e) {
    e.preventDefault();
    const v = $('#wornDate').value;
    if (!DATE_RE.test(v) || !wearingIdea) return;
    wearingIdea.worn = wearingIdea.worn || [];
    if (!wearingIdea.worn.includes(v)) wearingIdea.worn.push(v);
    persist('ideas');
    $('#wornDialog').close();
    renderSaved();
    toast('Logged ✦ Looking good!');
  }

  // ---------- history ----------
  function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function renderHistory() {
    const body = $('#historyBody');
    const worn = [];
    state.ideas.forEach((i) => (i.worn || []).forEach((d) => worn.push({ date: d, season: i.season })));
    if (!worn.length) {
      body.innerHTML = emptyHTML(ART.chart, 'No looks worn yet.', 'Save an idea, then tap “I wore this.”');
      return;
    }
    // weekly bars: last 8 weeks
    const thisWeek = weekStart(new Date());
    const weeks = Array.from({ length: 8 }, (_, k) => { const d = new Date(thisWeek); d.setDate(d.getDate() - 7 * (7 - k)); return { start: d, n: 0 }; });
    worn.forEach((w) => {
      const ws = weekStart(parseYmd(w.date)).getTime();
      const wk = weeks.find((x) => x.start.getTime() === ws);
      if (wk) wk.n += 1;
    });
    const max = Math.max(1, ...weeks.map((w) => w.n));
    const W = 340, H = 180, top = 22, bottom = 30, left = 6, gap = 8;
    const bw = (W - left * 2 - gap * 7) / 8;
    const bars = weeks.map((w, k) => {
      const h = w.n ? Math.max(6, ((H - top - bottom) * w.n) / max) : 3;
      const x = left + k * (bw + gap);
      const y = H - bottom - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="${Math.min(8, bw / 2)}" fill="${w.n ? 'url(#barg)' : '#F1BFD0'}"/>
        ${w.n ? `<rect x="${x + 4}" y="${y + 3}" width="${Math.max(2, bw * 0.22)}" height="${Math.max(0, h - 8)}" rx="2" fill="#fff" opacity=".35"/><text class="val" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="12">${w.n}</text>` : ''}
        <text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="10">${esc(fmtShort(w.start))}</text>`;
    }).join('');
    const weekSVG = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Looks worn per week for the last 8 weeks: ${weeks.map((w) => `${fmtShort(w.start)} ${w.n}`).join(', ')}">
      <defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C93A72"/><stop offset="1" stop-color="#8A1945"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="#F1BFD0" stroke-width="2"/>
      ${bars}</svg>`;

    // seasons
    const counts = SEASONS.map((s) => ({ s, n: worn.filter((w) => w.season === s).length })).sort((a, b) => b.n - a.n);
    const smax = Math.max(1, counts[0].n);
    const SW = 340, rowH = 40;
    const seasonColor = { fall: '#B4521A', winter: '#A9DDF3', spring: '#BFE6B4', summer: '#FF8A73' };
    const rows = counts.map((c, k) => {
      const y = k * rowH + 6;
      const bwid = c.n ? Math.max(14, ((SW - 110) * c.n) / smax) : 4;
      return `<text x="0" y="${y + 20}" font-size="13" font-weight="700" fill="#3A1426">${SEASON_LABEL[c.s]}</text>
        <rect x="70" y="${y + 4}" width="${bwid}" height="24" rx="12" fill="${seasonColor[c.s]}"/>
        ${c.n ? `<rect x="78" y="${y + 8}" width="${Math.max(0, bwid - 20)}" height="5" rx="2.5" fill="#fff" opacity=".45"/>` : ''}
        <text class="val" x="${70 + bwid + 8}" y="${y + 21}" font-size="13">${c.n}</text>`;
    }).join('');
    const seasonSVG = `<svg class="chart" viewBox="0 0 ${SW} ${counts.length * rowH + 6}" role="img" aria-label="Looks worn by season: ${counts.map((c) => `${SEASON_LABEL[c.s]} ${c.n}`).join(', ')}">${rows}</svg>`;

    const recent = weeks.reduce((a, w) => a + w.n, 0);
    body.innerHTML = `
      <div class="stat-row">
        <div class="card stat"><b>${worn.length}</b><span>look${worn.length === 1 ? '' : 's'} worn in all</span></div>
        <div class="card stat"><b>${SEASON_LABEL[counts[0].s]}</b><span>favorite season</span></div>
      </div>
      <div class="card chart-card"><h3>Looks worn per week</h3><p>${recent} in the last 8 weeks</p>${weekSVG}</div>
      <div class="card chart-card"><h3>Most-used seasons</h3><p>Based on the season of each look you wore</p>${seasonSVG}</div>`;
  }

  // ---------- backup ----------
  async function exportData() {
    const data = {
      app: 'nail-design-planner', version: 1, exportedAt: new Date().toISOString(),
      seq: state.seq, polishes: state.polishes, designs: state.designs, ideas: state.ideas,
      photos: Object.fromEntries(photos),
    };
    const name = `nail-planner-backup-${ymd(new Date())}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: 'Nail Planner backup' });
        toast('Backup ready ✦');
        return;
      }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Backup saved ✦');
  }

  const str = (v, max = 200) => String(v ?? '').slice(0, max);
  function cleanPolish(p) {
    if (!p || typeof p !== 'object') return null;
    const name = str(p.name, 60).trim();
    if (!name) return null;
    return {
      id: str(p.id || uid(), 40), name, color: safeColor(p.color).toUpperCase(),
      finish: FINISHES[p.finish] ? p.finish : 'creme',
      seasons: [...new Set((Array.isArray(p.seasons) ? p.seasons : []).filter((s) => SEASONS.includes(s)))],
      base: !!p.base,
    };
  }
  const cleanFingers = (f) => [...new Set((Array.isArray(f) ? f : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 9))];
  function cleanDesign(d) {
    if (!d || typeof d !== 'object' || !TYPES[d.type]) return null;
    const num = Number(d.num);
    return {
      id: str(d.id || uid(), 40), num: Number.isInteger(num) && num > 0 ? num : 0, type: d.type,
      colors: Math.min(5, Math.max(1, Number(d.colors) || 1)),
      fingers: d.type === 'accent' || d.type === 'gems' ? cleanFingers(d.fingers) : [],
      createdAt: str(d.createdAt, 40),
    };
  }
  function cleanIdea(i) {
    if (!i || typeof i !== 'object' || !TYPES[i.type] || !SEASONS.includes(i.season) || !Array.isArray(i.nails)) return null;
    const nails = Array.from({ length: 10 }, (_, k) => {
      const n = i.nails[k] || {};
      const o = { color: safeColor(n.color), name: str(n.name, 60), finish: FINISHES[n.finish] ? n.finish : 'creme' };
      if (HEX.test(n.tip)) o.tip = n.tip;
      if (n.gems) o.gems = true;
      return o;
    });
    const lines = (Array.isArray(i.lines) ? i.lines : []).slice(0, 6).map((l) => {
      const o = { label: str(l && l.label, 20), text: str(l && l.text, 200) };
      if (l && HEX.test(l.color)) { o.color = l.color; o.finish = FINISHES[l.finish] ? l.finish : 'creme'; }
      if (l && l.gem) o.gem = true;
      return o;
    });
    const created = DATE_RE.test(str(i.createdAt).slice(0, 10)) ? str(i.createdAt, 40) : new Date().toISOString();
    return {
      id: str(i.id || uid(), 40), createdAt: created, season: i.season, type: i.type,
      designId: str(i.designId, 40), designNum: Number(i.designNum) || 0, nails, lines,
      worn: [...new Set((Array.isArray(i.worn) ? i.worn : []).filter((d) => DATE_RE.test(d)))],
    };
  }
  async function importData(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('That file isn’t a Nail Planner backup.'); return; }
    if (!data || data.app !== 'nail-design-planner') { toast('That file isn’t a Nail Planner backup.'); return; }
    const polishes = (data.polishes || []).map(cleanPolish).filter(Boolean);
    const designs = (data.designs || []).map(cleanDesign).filter(Boolean);
    const ideas = (data.ideas || []).map(cleanIdea).filter(Boolean);
    let seq = Math.max(Number(data.seq) || 0, ...designs.map((d) => d.num), 0);
    designs.forEach((d) => { if (!d.num) d.num = ++seq; });
    const pics = Object.entries(data.photos && typeof data.photos === 'object' ? data.photos : {})
      .filter(([k, v]) => typeof v === 'string' && v.startsWith('data:image/') && designs.some((d) => d.id === k));
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleDateString() : 'this file';
    if (!confirm(`Replace everything on this phone with the backup from ${when}?\n\n${polishes.length} polishes · ${designs.length} designs · ${ideas.length} saved ideas`)) return;
    Object.assign(state, { polishes, designs, ideas, seq, current: null, currentSaved: false });
    persist('polishes', 'designs', 'ideas', 'seq');
    photos.clear();
    try {
      await idb.clear();
      for (const [k, v] of pics) { photos.set(k, v); await idb.put(k, v); }
    } catch { pics.forEach(([k, v]) => photos.set(k, v)); toast('Some photos could not be saved on this device.'); }
    $('#backupDialog').close();
    renderAll();
    toast('Backup restored ✦');
  }

  // ---------- wiring ----------
  function renderAll() { renderPolishes(); renderDesigns(); renderSeasonPicker(); renderIdeas(); if (state.tab === 'history') renderHistory(); }

  function wire() {
    $$('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#fab').addEventListener('click', () => (state.tab === 'designs' ? openDesign() : openPolish()));
    $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    // tap the dark backdrop to close a sheet
    $$('dialog.sheet').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }));

    $('#polishList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (card) openPolish(state.polishes.find((p) => p.id === card.dataset.id));
    });
    $('#polishForm').addEventListener('submit', savePolish);
    $('#polishDelete').addEventListener('click', deletePolish);
    $('#pColor').addEventListener('input', updateCapPreview);
    $('#pFinish').addEventListener('change', updateCapPreview);

    $('#designList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (card) openDesign(state.designs.find((d) => d.id === card.dataset.id));
    });
    $('#designForm').addEventListener('submit', saveDesign);
    $('#designDelete').addEventListener('click', deleteDesign);
    $('#dType').addEventListener('change', updateFingerField);
    $('#dCamBtn').addEventListener('click', () => $('#dCam').click());
    $('#dLibBtn').addEventListener('click', () => $('#dLib').click());
    $('#dCam').addEventListener('change', onPhotoChosen);
    $('#dLib').addEventListener('change', onPhotoChosen);

    $('#seasonPicker').addEventListener('change', (e) => {
      if (e.target.name !== 'season') return;
      state.season = e.target.value;
      persist('season');
      state.current = null;
      renderCurrent();
    });
    $('#newIdeaBtn').addEventListener('click', () => {
      state.current = generateIdea();
      state.currentSaved = false;
      renderCurrent();
    });
    $('#currentIdea').addEventListener('click', (e) => { if (e.target.closest('[data-action="save-current"]')) saveCurrent(); });
    $('#savedIdeas').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const idea = state.ideas.find((i) => i.id === btn.closest('[data-id]').dataset.id);
      if (!idea) return;
      if (btn.dataset.action === 'wear') openWorn(idea);
      else if (btn.dataset.action === 'unwear') {
        if (!confirm(`Remove ${fmtDate(btn.dataset.date)} from this look?`)) return;
        idea.worn = idea.worn.filter((d) => d !== btn.dataset.date);
        persist('ideas'); renderSaved();
      } else if (btn.dataset.action === 'delete-idea') {
        if (!confirm('Delete this saved idea? Its worn dates go too.')) return;
        state.ideas = state.ideas.filter((i) => i !== idea);
        persist('ideas'); renderIdeas();
        toast('Idea deleted');
      }
    });
    $('#wornForm').addEventListener('submit', saveWorn);

    $('#backupBtn').addEventListener('click', () => $('#backupDialog').showModal());
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importData(f);
    });
  }

  async function init() {
    buildPolishForm();
    buildDesignForm();
    wire();
    const ok = await idb.open();
    if (ok) await idb.loadAll();
    else toast('Photos can’t be stored in this browser mode. Export often!');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    renderAll();
    showTab(state.tab);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  init();
})();
