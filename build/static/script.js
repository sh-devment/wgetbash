// ── STATE ──
let groups    = [];
let selGrp    = null;
let confirmCb = null;
let userHash  = '';

// ── UTILS ──
const $      = id => document.getElementById(id);
const esc    = s  => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isMob  = () => window.innerWidth <= 1024;
function grp(id)      { return groups.find(g => g.id === id); }
function sc(gid, sid) { return grp(gid)?.scripts?.find(s => s.id === sid); }
function init(name)   { return name.trim().charAt(0).toUpperCase(); }

// ── ICONS ──
const ICO = {
  chevD:  `<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 1.5L4.5 5L8 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevU:  `<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 5.5L4.5 2L8 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pencil: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7.5 1.5L9 3L3.5 9H1.5V7L7.5 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  clip:   `<svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="2.5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 2.5V1.8C3.5 1.36 3.86 1 4.3 1H5.7C6.14 1 6.5 1.36 6.5 1.8V2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  check:  `<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7.5L10 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock:   `<svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="6.2" rx="1.4" stroke="currentColor" stroke-width="1.2"/><path d="M3 5V3.4C3 2.07 3.9 1 5 1s2 1.07 2 2.4V5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  x:      `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

// ── HELPERS ──
function autoResize(ta) {
  // Setting height to 'auto' momentarily collapses the textarea; since it lives
  // inside the scrolling .sc-list, that reflow clamps the list's scrollTop and
  // jumps the view. Save/restore it around the measure.
  const list = document.getElementById('scList');
  const top = list ? list.scrollTop : 0;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
  if (list) list.scrollTop = top;
}

// Most recently edited first — the same order the API returns, kept here so the
// list re-orders on save without a round trip. updated_at is unix seconds from
// the server; ties (every script the migration backfill stamped at once) fall
// back to newest-created.
function sortScripts(g) {
  if (!g || !g.scripts) return;
  g.scripts.sort((a, b) => ((b.updated_at || 0) - (a.updated_at || 0)) || (b.id - a.id));
}

// Saving re-orders the list, so the script just edited can jump out of view.
// renderScripts restores scrollTop in a rAF, so queue this after that one.
function keepInView(sid) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector(`.sc-item[data-id="${sid}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }));
}

function highlightBash(text) {
  return text.split('\n').map(line => {
    const idx = line.indexOf('#');
    if (idx === -1) return esc(line);
    return esc(line.slice(0, idx)) + '<span class="cm">' + esc(line.slice(idx)) + '</span>';
  }).join('\n');
}

// ── API ──
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── LOAD DATA ──
async function loadGroups() {
  try {
    const data = await api('GET', '/api/groups');
    groups = data.map(g => ({ ...g, scripts: [], loaded: false }));
    if (groups.length) {
      selGrp = groups[0].id;
      await loadScripts(selGrp);
    }
    render();
  } catch {
    toast(TEXT.loadGroupsFailed);
  }
}

async function loadScripts(gid) {
  const g = grp(gid);
  if (!g || g.loaded) return;
  try {
    const data = await api('GET', `/api/groups/${gid}/scripts`);
    g.scripts = data.map(s => ({ ...s, exp: false, edit: false }));
    g.loaded  = true;
    sortScripts(g);
  } catch {
    toast(TEXT.loadScriptsFailed);
  }
}

// ── RENDER ──
function render() {
  renderGroups();
  renderScripts();
  renderHead();
}

function renderGroups() {
  const list = $('grpList');
  list.innerHTML = '';
  const q = $('sbSearch').value.trim().toLowerCase();

  const visible = q
    ? groups.filter(g =>
        g.name.toLowerCase().includes(q) ||
        (g.scripts || []).some(s => s.name.toLowerCase().includes(q))
      )
    : groups;

  visible.forEach(g => {
    const d = document.createElement('div');
    d.className = 'grp-row' + (g.id === selGrp ? ' active' : '');
    d.innerHTML = `<div class="grp-init">${init(g.name)}</div><span class="grp-lbl">${esc(g.name)}</span>`;
    d.addEventListener('click', () => selectGrp(g.id));
    list.appendChild(d);
  });

  const addRow = document.createElement('div');
  addRow.className = 'sb-add';
  addRow.title     = TEXT.addChapter;
  addRow.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  addRow.addEventListener('click', addGroup);
  list.appendChild(addRow);
}

function renderScripts() {
  const list = $('scList');
  const prevScroll = list.scrollTop;
  list.innerHTML = '';
  const g = grp(selGrp);

  if (g) {
    const q = $('sbSearch').value.trim().toLowerCase();
    const scripts = q ? g.scripts.filter(s => s.name.toLowerCase().includes(q)) : g.scripts;

    scripts.forEach(s => {
      const item = document.createElement('div');
      item.className  = 'sc-item';
      item.dataset.id = s.id;

      const row = document.createElement('div');
      row.className = 'sc-row';

      const expBtn = document.createElement('button');
      expBtn.className = 'ib sm';
      expBtn.title     = s.exp ? TEXT.collapse : TEXT.expand;
      expBtn.innerHTML = s.exp ? ICO.chevU : ICO.chevD;
      expBtn.addEventListener('click', () => toggleScript(s.id));

      let nameEl;
      if (s.edit) {
        nameEl = document.createElement('input');
        nameEl.className    = 'sc-name-inp';
        nameEl.value        = s._name !== undefined ? s._name : s.name;
        nameEl.autocomplete = 'off';
        nameEl.addEventListener('input',   e => { s._name = e.target.value; });
        nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') saveScript(s.id); });
      } else {
        nameEl = document.createElement('span');
        nameEl.className   = 'sc-name';
        nameEl.textContent = s.name || TEXT.unnamed;
      }

      let lockEl = null;
      if (s.private && !s.edit) {
        lockEl = document.createElement('span');
        lockEl.className = 'sc-lock';
        lockEl.title     = TEXT.privateLock;
        lockEl.innerHTML = ICO.lock;
      }

      const actBtn = document.createElement('button');
      if (!s.exp) {
        actBtn.className = 'ib sm';
        actBtn.title     = TEXT.copyScript;
        actBtn.innerHTML = ICO.clip;
        actBtn.addEventListener('click', e => { e.stopPropagation(); copyContent(s); });
      } else if (s.edit) {
        actBtn.className = 'ib sm amber';
        actBtn.title     = TEXT.save;
        actBtn.innerHTML = ICO.check;
        actBtn.addEventListener('click', () => saveScript(s.id));
      } else {
        actBtn.className = 'ib sm amber';
        actBtn.title     = TEXT.edit;
        actBtn.innerHTML = ICO.pencil;
        actBtn.addEventListener('click', () => startEdit(s.id));
      }

      const wb = document.createElement('button');
      wb.className   = 'wget-btn';
      wb.textContent = 'wget';
      wb.title       = TEXT.copyWget;
      wb.addEventListener('click', e => { e.stopPropagation(); copyWget(s); });

      row.appendChild(expBtn);
      if (lockEl) row.appendChild(lockEl);
      row.appendChild(nameEl);
      row.appendChild(actBtn);
      row.appendChild(wb);
      item.appendChild(row);

      if (s.exp) {
        const cont = document.createElement('div');
        cont.className = 'sc-content';

        // Two views of one text: editing shows it raw — the textarea and its
        // highlight mirror have to line up character for character — while
        // reading shows it through MD.render (markdown.js). What is stored, and
        // what /run serves to wget, is the raw text either way.
        let body, ta = null;

        if (s.edit) {
          body = document.createElement('div');
          body.className = 'ta-wrap';

          const hl = document.createElement('div');
          hl.className = 'sc-hl';
          hl.setAttribute('aria-hidden', 'true');
          hl.innerHTML = highlightBash(s.content || '');

          ta = document.createElement('textarea');
          ta.className  = 'sc-ta';
          ta.value      = s.content || '';
          ta.spellcheck = false;

          ta.addEventListener('input', e => {
            s._content = e.target.value;
            hl.innerHTML = highlightBash(e.target.value);
            autoResize(ta);
          });
          ta.addEventListener('keydown', e => {
            if (e.key === 'Backspace') handleBackspaceLine(e, ta, s, hl);
          });
          ta.addEventListener('beforeinput', e => {
            if (e.inputType === 'deleteContentBackward') handleBackspaceLine(e, ta, s, hl);
          });

          body.appendChild(hl);
          body.appendChild(ta);
        } else {
          body = document.createElement('div');
          body.className = 'sc-view';
          body.innerHTML = MD.render(s.content || '');
        }

        const foot = document.createElement('div');
        foot.className = 'sc-foot';

        // "make:" is a plain-text prefix; the button carries the target state,
        // so purple offers private and grey offers the way back. The current
        // state shows as the lock in the row.
        const privWrap = document.createElement('div');
        privWrap.className = 'priv-wrap';

        const privLbl = document.createElement('span');
        privLbl.className   = 'priv-lbl';
        privLbl.textContent = TEXT.make;

        const privBtn = document.createElement('button');
        privBtn.className   = 'priv-btn' + (s.private ? '' : ' on');
        privBtn.textContent = s.private ? TEXT.public : TEXT.private;
        privBtn.title       = s.private
          ? TEXT.nowPrivateHint
          : TEXT.nowPublicHint;
        privBtn.addEventListener('click', e => { e.stopPropagation(); togglePrivate(s.id); });

        privWrap.appendChild(privLbl);
        privWrap.appendChild(privBtn);
        foot.appendChild(privWrap);

        const delBtn = document.createElement('button');
        delBtn.className = 'ib sm danger';
        delBtn.title     = TEXT.deleteScript;
        delBtn.innerHTML = ICO.x;
        delBtn.addEventListener('click', () => confirmDel(() => deleteScript(s.id)));
        foot.appendChild(delBtn);

        cont.appendChild(body);
        cont.appendChild(foot);
        item.appendChild(cont);

        if (ta) requestAnimationFrame(() => autoResize(ta));
      }

      list.appendChild(item);
    });
  }

  if (selGrp) {
    const addRow = document.createElement('div');
    addRow.className = 'rp-add';
    addRow.title     = TEXT.addScript;
    addRow.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    addRow.addEventListener('click', addScript);
    list.appendChild(addRow);
  }

  // Restore scroll position so re-rendering (edit/save/toggle) doesn't jump the
  // list to the top. Queued after the per-textarea autoResize rAFs (line ~228)
  // so the content is at full height before we set scrollTop, otherwise it clamps.
  requestAnimationFrame(() => { list.scrollTop = prevScroll; });
}

function handleBackspaceLine(e, ta, s, hl) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  if (start !== end || start === 0) return;
  if (ta.value[start - 1] !== '\n') return;
  e.preventDefault();
  ta.value = ta.value.slice(0, start - 1) + ta.value.slice(start);
  ta.selectionStart = ta.selectionEnd = start - 1;
  s._content = ta.value;
  hl.innerHTML = highlightBash(ta.value);
  autoResize(ta);
}

function renderHead() {
  const g = grp(selGrp);
  $('rpTitle').textContent          = g ? g.name : '—';
  $('grpMenuWrap').style.visibility = g ? 'visible' : 'hidden';
  const nd = $('grpNameDisplay');
  if (nd && g) nd.textContent = g.name;
}

// ── ACTIONS ──
async function selectGrp(id) {
  const prev = grp(selGrp);
  if (prev) prev.scripts.forEach(s => { applyEdits(s); s.exp = false; s.edit = false; });
  selGrp = id;
  await loadScripts(id);
  render();
  if (isMob()) { document.body.className = 'vs'; $('backBtn').style.display = 'inline-flex'; }
}

function toggleScript(sid) {
  const s = sc(selGrp, sid);
  if (!s) return;
  if (s.exp) { applyEdits(s); s.exp = false; s.edit = false; }
  else       { s.exp = true; }
  renderScripts();
}

function startEdit(sid) {
  const s = sc(selGrp, sid);
  if (!s) return;
  s.edit = true; s._name = s.name; s._content = s.content;
  renderScripts();
  requestAnimationFrame(() => {
    const inp = document.querySelector(`.sc-item[data-id="${sid}"] .sc-name-inp`);
    if (inp) inp.focus({ preventScroll: true });
  });
}

async function saveScript(sid) {
  const s = sc(selGrp, sid);
  if (!s) return;
  applyEdits(s);
  s.edit = false;
  try {
    const res = await api('PUT', `/api/scripts/${sid}`, { name: s.name, content: s.content });
    // the server owns the clock — take its value so the order here matches what
    // a reload would show
    if (res && typeof res.updated_at === 'number') s.updated_at = res.updated_at;
    sortScripts(grp(selGrp));
  } catch {
    toast(TEXT.saveFailed);
  }
  renderScripts();
  keepInView(sid);
}

function applyEdits(s) {
  if (s._name    !== undefined) { if (s._name.trim()) s.name = s._name.trim(); delete s._name; }
  if (s._content !== undefined) { s.content = s._content; delete s._content; }
}

async function deleteScript(sid) {
  const g = grp(selGrp);
  if (!g) return;
  try {
    await api('DELETE', `/api/scripts/${sid}`);
    g.scripts = g.scripts.filter(s => s.id !== sid);
  } catch {
    toast(TEXT.deleteFailed);
  }
  renderScripts();
}

async function togglePrivate(sid) {
  const s = sc(selGrp, sid);
  if (!s) return;
  const next = !s.private;
  try {
    await api('PUT', `/api/scripts/${sid}/private`, { private: next });
    s.private = next;
    toast(next ? TEXT.madePrivate : TEXT.madePublic);
  } catch {
    toast(TEXT.visibilityFailed);
  }
  renderScripts();
}

function copyContent(s) {
  navigator.clipboard?.writeText(s.content).catch(() => {});
  toast(TEXT.scriptCopied);
}

function copyWget(s) {
  const cmd = `wget -qO- ${window.location.origin}/run/${userHash}/${s.hash} | bash`;
  navigator.clipboard?.writeText(cmd).catch(() => {});
  toast(s.private ? TEXT.wgetCopiedPrivate : TEXT.wgetCopied);
}

async function addGroup() {
  const list = $('grpList');
  if (list.querySelector('.new-grp-inp')) return;
  const row = document.createElement('div');
  row.className = 'new-grp-row';
  const inp = document.createElement('input');
  inp.className    = 'new-grp-inp';
  inp.placeholder  = TEXT.chapterName;
  inp.autocomplete = 'off';
  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const name = inp.value.trim();
    row.remove();
    if (!name) return;
    try {
      const g = await api('POST', '/api/groups', { name });
      groups.push({ ...g, scripts: [], loaded: true });
      renderGroups();
      selectGrp(g.id);
    } catch {
      toast(TEXT.createChapterFailed);
    }
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { committed = true; row.remove(); }
  });
  inp.addEventListener('blur', commit);
  row.appendChild(inp);
  const addBtn = list.querySelector('.sb-add');
  list.insertBefore(row, addBtn);
  inp.focus();
}

async function addScript() {
  const g = grp(selGrp);
  if (!g) return;
  try {
    const s = await api('POST', `/api/groups/${selGrp}/scripts`, { name: '', content: '' });
    g.scripts.push({ ...s, exp: true, edit: true, _name: '', _content: '' });
    sortScripts(g);
    renderScripts();
    requestAnimationFrame(() => {
      const inp = document.querySelector(`.sc-item[data-id="${s.id}"] .sc-name-inp`);
      if (inp) inp.focus();
    });
  } catch {
    toast(TEXT.createScriptFailed);
  }
}

function enterGrpEditMode() {
  const row = $('grpNameRow');
  const g = grp(selGrp);

  const inp = document.createElement('input');
  inp.className    = 'drop-inp';
  inp.id           = 'grpRenameInp';
  inp.value        = g ? g.name : '';
  inp.placeholder  = TEXT.newName;
  inp.autocomplete = 'off';

  const btn = $('grpRenameBtn');
  btn.innerHTML = ICO.check;
  btn.title     = TEXT.save;
  btn.onclick   = e => { e.stopPropagation(); saveGroupName(); };

  row.replaceChild(inp, $('grpNameDisplay'));
  inp.focus();
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveGroupName();
    if (e.key === 'Escape') exitGrpEditMode();
  });
}

function exitGrpEditMode() {
  const row = $('grpNameRow');
  const inp = $('grpRenameInp');
  if (!inp) return;

  const span = document.createElement('span');
  span.className    = 'drop-lbl';
  span.id           = 'grpNameDisplay';
  span.textContent  = grp(selGrp)?.name ?? '';
  span.style.cursor = 'pointer';
  span.addEventListener('click', e => { e.stopPropagation(); enterGrpEditMode(); });
  row.replaceChild(span, inp);

  const btn = $('grpRenameBtn');
  btn.innerHTML = ICO.pencil;
  btn.title     = TEXT.editName;
  btn.onclick   = e => { e.stopPropagation(); enterGrpEditMode(); };
}

async function saveGroupName() {
  const g   = grp(selGrp);
  const val = ($('grpRenameInp')?.value ?? '').trim();
  exitGrpEditMode();
  if (!g || !val) return;
  try {
    await api('PUT', `/api/groups/${selGrp}`, { name: val });
    g.name = val;
    renderGroups();
    renderHead();
  } catch {
    toast(TEXT.renameFailed);
  }
  $('grpDrop').style.display = 'none';
}

function toggleDrop(id) {
  const d    = $(id);
  const open = d.style.display === 'none';
  closeAllDrops();
  if (open) d.style.display = 'block';
}

function closeAllDrops() {
  $('grpDrop').style.display = 'none';
  $('userDrop').classList.remove('open');
  $('userTrig').classList.remove('open');
}

// ── CONFIRM MODAL ──
function confirmDel(cb) {
  confirmCb = cb;
  $('confirmOverlay').style.display = 'flex';
}
$('confirmYes').addEventListener('click', () => {
  $('confirmOverlay').style.display = 'none';
  if (confirmCb) { confirmCb(); confirmCb = null; }
});
$('confirmNo').addEventListener('click', () => {
  $('confirmOverlay').style.display = 'none'; confirmCb = null;
});

// ── TOAST ──
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── EVENT WIRING ──
$('sbSearch').addEventListener('input', render);
$('backBtn').addEventListener('click', () => { document.body.className = 'vg'; $('backBtn').style.display = 'none'; });

$('userTrig').addEventListener('click', e => {
  e.stopPropagation();
  $('grpDrop').style.display = 'none';
  const open = $('userDrop').classList.toggle('open');
  $('userTrig').classList.toggle('open', open);
});
$('grpTrig').addEventListener('click',  e => { e.stopPropagation(); toggleDrop('grpDrop'); });
$('grpRenameBtn').addEventListener('click',  e => { e.stopPropagation(); enterGrpEditMode(); });
$('grpNameDisplay').addEventListener('click', e => { e.stopPropagation(); enterGrpEditMode(); });
$('grpNameDisplay').style.cursor = 'pointer';
$('delGrpRow').addEventListener('click', e => {
  e.stopPropagation();
  $('grpDrop').style.display = 'none';
  confirmDel(async () => {
    try {
      await api('DELETE', `/api/groups/${selGrp}`);
      groups = groups.filter(g => g.id !== selGrp);
      selGrp = groups.length ? groups[0].id : null;
      if (selGrp) await loadScripts(selGrp);
      render();
    } catch {
      toast(TEXT.deleteChapterFailed);
    }
  });
});
document.addEventListener('click', e => {
  if (!e.target.closest('.dd') && !e.target.closest('.profile-area')) closeAllDrops();
});

// ── VIEW ROUTING ──
const VIEWS = ['wgetbash', 'loger'];

function viewFromUrl() {
  const v = new URLSearchParams(location.search).get('view');
  return VIEWS.includes(v) ? v : null;
}

function setView(name, updateUrl = true) {
  if (!VIEWS.includes(name)) name = 'wgetbash';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.view[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('view', name);
    history.replaceState(null, '', url.pathname + url.search);
  }
}

// ── AUTH ──
$('doLogin').addEventListener('click', () => {
  // The OAuth redirect lands back on "/", dropping any ?view= — stash it so we
  // can restore the requested view after login completes.
  const v = viewFromUrl();
  if (v) localStorage.setItem('pendingView', v);
  else   localStorage.removeItem('pendingView');
  window.location.href = '/auth/login';
});

async function initAuth() {
  try {
    const res  = await fetch('/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error();
    const user = await res.json();
    $('userInitial').textContent  = init(user.username);
    $('userName').textContent     = user.username;
    $('userUid').textContent      = user.uid || '';
    $('userProvider').textContent = user.provider || '';
    userHash                      = user.user_hash;
    $('loginWrap').style.display = 'none';
    $('appWrap').style.display   = 'flex';
    if (!isMob()) $('backBtn').style.display = 'none';
    else document.body.className = 'vg';
    await loadGroups();
    // Activate requested view: ?view= param, else the one saved before login, else default.
    const fromUrl = viewFromUrl();
    const pending = localStorage.getItem('pendingView');
    localStorage.removeItem('pendingView');
    setView(fromUrl || pending || 'wgetbash', Boolean(fromUrl || pending));
  } catch {
    $('loginWrap').style.display = 'flex';
    $('appWrap').style.display   = 'none';
  }
}

$('logoutRow').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.reload();
});

initAuth();

// ── TAB SWITCHING ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', () => setView(tab.dataset.tab));
});

// ── LOGER ─────────────────────────────────────────────────────────────────
(function () {
  // state
  let rawLines = [];
  let grepConds   = [];  // { id, pattern, enabled }
  let removeConds = [];  // { id, pattern, enabled }
  let mathConds   = [];  // { id, prefix, op, value, enabled }
  let focusOn = true;
  let nextId  = 1;

  // dom refs
  const lgrLoad      = document.getElementById('lgrLoad');
  const lgrWorkspace = document.getElementById('lgrWorkspace');
  const lgrDropZone  = document.getElementById('lgrDropZone');
  const lgrFile      = document.getElementById('lgrFile');
  const lgrPaste     = document.getElementById('lgrPaste');
  const lgrPasteLoad = document.getElementById('lgrPasteLoad');
  const lgrDisplay   = document.getElementById('lgrDisplay');
  const lgrGrepList  = document.getElementById('lgrGrepList');
  const lgrRemoveList= document.getElementById('lgrRemoveList');
  const lgrMathList  = document.getElementById('lgrMathList');
  const lgrAddGrep   = document.getElementById('lgrAddGrep');
  const lgrAddRemove = document.getElementById('lgrAddRemove');
  const lgrAddMath   = document.getElementById('lgrAddMath');
  const lgrActs      = document.getElementById('lgrActs');
  const lgrCount     = document.getElementById('lgrCount');
  const lgrLoadNewBtn= document.getElementById('lgrLoadNewBtn');
  const lgrClearBtn  = document.getElementById('lgrClearBtn');
  const lgrSelectBtn = document.getElementById('lgrSelectBtn');
  const lgrNewWinBtn = document.getElementById('lgrNewWindowBtn');
  const lgrDropErr   = document.getElementById('lgrDropErr');
  const lgrFocusCenter = document.getElementById('lgrFocusCenter');
  const lgrFocusBefore = document.getElementById('lgrFocusBefore');
  const lgrFocusAfter  = document.getElementById('lgrFocusAfter');
  const lgrFocusToggle = document.getElementById('lgrFocusToggle');
  const lgrFocusReset  = document.getElementById('lgrFocusReset');

  // ── utils ──────────────────────────────────────────────────────────────
  // "<shown> / <total> lines" in the region's wording (TEXT.lines: %d, %d)
  function lines(shown, total) {
    return TEXT.lines.replace('%d', shown).replace('%d', total);
  }

  function escH(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function globRe(pat) {
    const tl = /^\*[^*]+$/.test(pat), ld = /^[^*]+\*$/.test(pat);
    const esc = pat.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*?').replace(/\?/g,'.');
    return new RegExp((ld ? '^' : '') + esc + (tl ? '$' : ''), 'i');
  }
  function globReHl(pat) {
    const esc = pat.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'[^",:{}\\[\\]]*?').replace(/\?/g,'[^",:{}\\[\\]]');
    return new RegExp(esc, 'gi');
  }
  function lineMatches(line, pat) {
    if (!pat.trim()) return false;
    try { return globRe(pat).test(line); } catch { return line.toLowerCase().includes(pat.toLowerCase()); }
  }
  function detectLevel(line) {
    const l = line.toLowerCase();
    if (/\b(error|err|fatal|crit)\b/.test(l)) return 'error';
    if (/\b(warn|warning)\b/.test(l))         return 'warn';
    if (/\b(debug|dbg)\b/.test(l))            return 'debug';
    if (/\b(trace|verbose)\b/.test(l))        return 'trace';
    return 'info';
  }

  // ── focus ──────────────────────────────────────────────────────────────
  function applyFocus(lines) {
    if (!focusOn) return { lines, offset: 0 };
    const center = parseInt(lgrFocusCenter.value) || 0;
    if (!center) return { lines, offset: 0 };
    const before = parseInt(lgrFocusBefore.value) || 0;
    const after  = parseInt(lgrFocusAfter.value)  || 0;
    const z = center - 1;
    const s = Math.max(0, z - before), e = Math.min(lines.length - 1, z + after);
    return { lines: lines.slice(s, e + 1), offset: s };
  }
  lgrFocusCenter.addEventListener('input', renderLogs);
  lgrFocusBefore.addEventListener('input', renderLogs);
  lgrFocusAfter.addEventListener('input',  renderLogs);
  lgrFocusToggle.addEventListener('click', () => {
    focusOn = !focusOn;
    lgrFocusToggle.classList.toggle('active', focusOn);
    lgrFocusToggle.innerHTML = focusOn
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${TEXT.on}`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> ${TEXT.off}`;
    renderLogs();
  });
  lgrFocusReset.addEventListener('click', () => {
    lgrFocusCenter.value = lgrFocusBefore.value = lgrFocusAfter.value = 0;
    focusOn = true;
    lgrFocusToggle.classList.add('active');
    lgrFocusToggle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${TEXT.on}`;
    renderLogs();
  });

  // ── math ───────────────────────────────────────────────────────────────
  const OPS = ['>', '<', '>=', '<=', '==', '!='];
  const NUM_RE = /-?\d+(?:\.\d+)?/g;
  function evalOp(n, op, v) {
    return op==='>'?n>v:op==='<'?n<v:op==='>='?n>=v:op==='<='?n<=v:op==='=='?n===v:n!==v;
  }
  function mathPass(line, active) {
    if (!active.length) return true;
    return active.every(c => {
      if (c.prefix && c.prefix.trim()) {
        const e = c.prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const m = new RegExp(e+'(-?\\d+(?:\\.\\d+)?)','i').exec(line);
        return m ? evalOp(parseFloat(m[1]), c.op, c.value) : false;
      }
      return [...line.matchAll(NUM_RE)].some(m => evalOp(parseFloat(m[0]), c.op, c.value));
    });
  }

  // ── remove classification ──────────────────────────────────────────────
  function classifyRm(pat) {
    const p = pat.trim(), lead = p.startsWith('*'), trail = p.endsWith('*');
    const stripped = p.replace(/^\*+/,'').replace(/\*+$/,'').trim();
    if (lead && trail)  return { type:'hide',  literal: stripped };
    if (lead && !trail) return { type:'left',  literal: stripped };
    if (!lead && trail) return { type:'right', literal: stripped };
    const si = p.indexOf('*');
    if (si > 0 && si === p.lastIndexOf('*') && !p.includes('?'))
      return { type:'span', prefix: p.slice(0, si), suffix: p.slice(si + 1) };
    if (/[*?]/.test(p)) return { type:'hide', literal: p };
    return { type:'literal', literal: p };
  }
  function redactIntervals(text, instrs) {
    const ivs = [];
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    instrs.forEach(instr => {
      if (instr.type === 'span') {
        if (!instr.prefix && !instr.suffix) return;
        const m = new RegExp(esc(instr.prefix)+'[\\s\\S]*?'+esc(instr.suffix),'i').exec(text);
        if (m && !ivs.some(iv => iv.s<=m.index && iv.e>=m.index+m[0].length))
          ivs.push({ s: m.index, e: m.index+m[0].length });
        return;
      }
      const { literal } = instr;
      if (!literal) return;
      const re = new RegExp(esc(literal),'gi'); let m;
      if (instr.type === 'right') {
        let last = null;
        while ((m = re.exec(text)) !== null)
          if (!ivs.some(iv=>iv.s<=m.index&&iv.e>=m.index+m[0].length)) last = m;
        if (last) ivs.push({ s: last.index+last[0].length, e: text.length });
        return;
      }
      while ((m = re.exec(text)) !== null) {
        if (ivs.some(iv=>iv.s<=m.index&&iv.e>=m.index+m[0].length)) continue;
        ivs.push({ s: instr.type==='left'?0:m.index, e: instr.type==='left'?m.index:m.index+m[0].length });
        break;
      }
    });
    return ivs;
  }
  function stripRedacted(text, instrs) {
    const ivs = redactIntervals(text, instrs).sort((a,b)=>a.s-b.s);
    let r='', pos=0;
    for (const iv of ivs) { if (iv.s>pos) r+=text.slice(pos,iv.s); pos=iv.e; }
    return r + text.slice(pos);
  }

  // ── line HTML builder ──────────────────────────────────────────────────
  const PRIO = { rm:3, mhl:2, hl:1 };
  function buildLineHtml(text, hlPats, instrs, mathPfx=[], mathHlNums=false) {
    const n = text.length;
    const ct = new Array(n).fill(null);
    const paint = (s,e,t) => { for(let i=s;i<e;i++) if(!ct[i]||PRIO[t]>PRIO[ct[i]]) ct[i]=t; };
    hlPats.forEach(p => { if(!p.trim()) return; const re=globReHl(p); let m; while((m=re.exec(text))!==null){paint(m.index,m.index+m[0].length,'hl');if(!m[0].length)re.lastIndex++;} });
    mathPfx.forEach(p => { if(!p) return; const re=new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); let m; while((m=re.exec(text))!==null) paint(m.index,m.index+m[0].length,'mhl'); });
    if (mathHlNums) { const re=/-?\d+(?:\.\d+)?/g; let m; while((m=re.exec(text))!==null) paint(m.index,m.index+m[0].length,'mhl'); }
    redactIntervals(text, instrs).forEach(iv => paint(iv.s, iv.e, 'rm'));
    if (ct.every(t=>t===null)) return escH(text);
    let html='', i=0;
    while(i<n){const t=ct[i];let j=i+1;while(j<n&&ct[j]===t)j++;const c=text.slice(i,j);
      html += t===null?escH(c):t==='hl'?`<mark class="lgr-hl">${escH(c)}</mark>`:t==='mhl'?`<mark class="lgr-hl-m">${escH(c)}</mark>`:`<span class="lgr-rm"></span>`;
      i=j;}
    return html;
  }

  // ── render logs ────────────────────────────────────────────────────────
  function renderLogs() {
    const aGrep   = grepConds.filter(c=>c.enabled&&c.pattern.trim());
    const aRemove = removeConds.filter(c=>c.enabled&&c.pattern.trim());
    const aMath   = mathConds.filter(c=>c.enabled&&c.value!==null&&c.value!==undefined&&c.value!=='');
    const classified = aRemove.map(c=>({cond:c,cls:classifyRm(c.pattern)}));
    const globRms    = classified.filter(({cls})=>cls.type==='hide');
    const inlineRm   = classified.filter(({cls})=>cls.type!=='hide').map(({cls})=>cls);
    const { lines: fl, offset: fo } = applyFocus(rawLines);
    const filtered=[], nums=[];
    fl.forEach((line, i) => {
      const orig = fo + i + 1;
      if (globRms.some(({cond})=>lineMatches(line,cond.pattern))) return;
      const vis = inlineRm.length ? stripRedacted(line, inlineRm) : line;
      if (aGrep.length && !aGrep.every(c=>lineMatches(vis,c.pattern))) return;
      if (!mathPass(vis, aMath)) return;
      filtered.push(line); nums.push(orig);
    });
    if (!filtered.length && rawLines.length) {
      lgrDisplay.innerHTML = `<div class="lgr-empty">${TEXT.noMatch}</div>`;
      lgrCount.textContent = lines(0, rawLines.length); return;
    }
    lgrCount.textContent = lines(filtered.length, rawLines.length);
    const hlPats = aGrep.map(c=>c.pattern).filter(p=>p.trim());
    const allMath = mathConds.filter(c=>c.enabled);
    const mathPfx = allMath.map(c=>c.prefix&&c.prefix.trim()).filter(Boolean);
    const mathHlNums = allMath.some(c=>!(c.prefix&&c.prefix.trim()));
    const focCenter = parseInt(lgrFocusCenter.value)||0;
    const frag = document.createDocumentFragment();
    filtered.forEach((line,i) => {
      const div = document.createElement('div');
      div.className = 'lgr-line' + (focusOn&&focCenter>0&&nums[i]===focCenter?' center':'');
      const num = document.createElement('span');
      num.className = 'lgr-num'; num.textContent = nums[i];
      const txt = document.createElement('span');
      txt.className = `lgr-txt lvl-${detectLevel(line)}`;
      txt.innerHTML = buildLineHtml(line, hlPats, inlineRm, mathPfx, mathHlNums);
      div.appendChild(num); div.appendChild(txt); frag.appendChild(div);
    });
    lgrDisplay.innerHTML = ''; lgrDisplay.appendChild(frag);
  }

  // ── condition UI ───────────────────────────────────────────────────────
  function makePill(type, cond) {
    const pill = document.createElement('div');
    pill.className = `lgr-pill ${type}-pill${cond.enabled?'':' off'}`;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = cond.pattern;
    inp.placeholder = type==='grep' ? TEXT.grepPlaceholder : TEXT.removePlaceholder;
    inp.style.width = Math.max(80, inp.value.length*8)+'px';
    inp.addEventListener('input', () => {
      cond.pattern = inp.value;
      inp.style.width = Math.max(80, inp.value.length*8)+'px';
      renderLogs();
    });
    const tog = document.createElement('button');
    tog.className = 'lgr-pbtn tog'; tog.title = cond.enabled?TEXT.disable:TEXT.enable;
    tog.innerHTML = cond.enabled
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    tog.addEventListener('click', () => { cond.enabled=!cond.enabled; renderConds(); renderLogs(); });
    const del = document.createElement('button');
    del.className = 'lgr-pbtn del'; del.title = TEXT.delete;
    del.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener('click', () => {
      if (type==='grep') grepConds = grepConds.filter(c=>c.id!==cond.id);
      else removeConds = removeConds.filter(c=>c.id!==cond.id);
      renderConds(); renderLogs();
    });
    pill.appendChild(inp); pill.appendChild(tog); pill.appendChild(del);
    return pill;
  }

  function makeMathPill(cond) {
    const pill = document.createElement('div');
    pill.className = 'lgr-math-pill' + (cond.enabled?'':' off');
    const pfx = document.createElement('input'); pfx.type='text'; pfx.className='lgr-mpfx';
    pfx.value=cond.prefix||''; pfx.placeholder='N'; pfx.title=TEXT.prefixHint;
    pfx.style.width=Math.max(20,(cond.prefix||'').length*8)+'px';
    pfx.addEventListener('input', () => { cond.prefix=pfx.value; pfx.style.width=Math.max(20,pfx.value.length*8)+'px'; renderLogs(); });
    const op = document.createElement('select'); op.className='lgr-mop';
    OPS.forEach(o => { const opt=document.createElement('option'); opt.value=o; opt.textContent=o; if(o===cond.op) opt.selected=true; op.appendChild(opt); });
    op.addEventListener('change', () => { cond.op=op.value; renderLogs(); });
    const val = document.createElement('input'); val.type='number'; val.className='lgr-mval';
    val.value=cond.value??''; val.placeholder='0';
    val.addEventListener('input', () => { cond.value=val.value===''?null:parseFloat(val.value); renderLogs(); });
    const tog = document.createElement('button'); tog.className='lgr-pbtn tog'; tog.title=cond.enabled?TEXT.disable:TEXT.enable;
    tog.innerHTML = cond.enabled
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    tog.addEventListener('click', () => { cond.enabled=!cond.enabled; renderMath(); renderLogs(); });
    const del = document.createElement('button'); del.className='lgr-pbtn del'; del.title=TEXT.delete;
    del.innerHTML=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener('click', () => { mathConds=mathConds.filter(c=>c.id!==cond.id); renderMath(); renderLogs(); });
    pill.appendChild(pfx); pill.appendChild(op); pill.appendChild(val); pill.appendChild(tog); pill.appendChild(del);
    return pill;
  }

  function renderConds() {
    lgrGrepList.innerHTML = ''; lgrRemoveList.innerHTML = '';
    grepConds.forEach(c => lgrGrepList.appendChild(makePill('grep', c)));
    removeConds.forEach(c => lgrRemoveList.appendChild(makePill('remove', c)));
  }
  function renderMath() {
    lgrMathList.innerHTML = '';
    mathConds.forEach(c => lgrMathList.appendChild(makeMathPill(c)));
  }

  lgrAddGrep.addEventListener('click',   () => { grepConds.push({id:nextId++,pattern:'',enabled:true}); renderConds(); lgrGrepList.lastElementChild?.querySelector('input')?.focus(); });
  lgrAddRemove.addEventListener('click', () => { removeConds.push({id:nextId++,pattern:'',enabled:true}); renderConds(); lgrRemoveList.lastElementChild?.querySelector('input')?.focus(); });
  lgrAddMath.addEventListener('click',   () => { mathConds.push({id:nextId++,prefix:'',op:'>',value:null,enabled:true}); renderMath(); lgrMathList.lastElementChild?.querySelector('input')?.focus(); });

  // ── load ───────────────────────────────────────────────────────────────
  const ALLOWED = new Set(['.log','.txt','.out','.err','.json','.jsonl','.ndjson','.csv']);
  function getExt(n) { const m=n.match(/(\.[^.]+)$/); return m?m[1].toLowerCase():''; }
  function allowed(n) { return ALLOWED.has(getExt(n)); }
  function showErr(n) {
    lgrDropErr.textContent = TEXT.unsupported.replace('%s', getExt(n)||TEXT.noExt);
    lgrDropErr.classList.add('show');
    setTimeout(() => lgrDropErr.classList.remove('show'), 3000);
  }

  function loadText(text) {
    rawLines = text.split('\n');
    while (rawLines.length && !rawLines[rawLines.length-1].trim()) rawLines.pop();
    if (!rawLines.length) return;
    lgrLoad.style.display = 'none';
    lgrWorkspace.style.display = 'flex';
    lgrWorkspace.style.flexDirection = 'column';
    lgrActs.style.display = 'flex';
    renderLogs();
  }

  lgrDropZone.addEventListener('click', () => lgrFile.click());
  lgrFile.addEventListener('change', () => {
    const f = lgrFile.files[0]; if (!f) return; lgrFile.value='';
    if (!allowed(f.name)) { showErr(f.name); return; }
    const r = new FileReader(); r.onload = e => loadText(e.target.result); r.readAsText(f);
  });
  lgrDropZone.addEventListener('dragover', e => { e.preventDefault(); lgrDropZone.classList.add('over'); });
  lgrDropZone.addEventListener('dragleave', () => lgrDropZone.classList.remove('over'));
  lgrDropZone.addEventListener('drop', e => {
    e.preventDefault(); lgrDropZone.classList.remove('over');
    const f = e.dataTransfer.files[0]; if (!f) return;
    if (!allowed(f.name)) { showErr(f.name); return; }
    const r = new FileReader(); r.onload = ev => loadText(ev.target.result); r.readAsText(f);
  });
  lgrPasteLoad.addEventListener('click', () => {
    const t = lgrPaste.value.trim(); if (!t) return;
    loadText(t); lgrPaste.value = '';
  });
  lgrPaste.addEventListener('keydown', e => { if (e.key==='Enter'&&(e.ctrlKey||e.metaKey)) lgrPasteLoad.click(); });

  document.addEventListener('paste', e => {
    if (document.querySelector('.tab[data-tab="loger"]')?.classList.contains('active') &&
        lgrLoad.style.display !== 'none') {
      const t = e.clipboardData.getData('text');
      if (t && t.includes('\n')) { loadText(t); e.preventDefault(); }
    }
  });

  function resetAll() {
    grepConds=[]; removeConds=[]; mathConds=[];
    lgrFocusCenter.value=lgrFocusBefore.value=lgrFocusAfter.value=0;
    focusOn=true; lgrFocusToggle.classList.add('active');
    lgrFocusToggle.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${TEXT.on}`;
    renderConds(); renderMath();
  }

  lgrLoadNewBtn.addEventListener('click', () => {
    rawLines = []; lgrLoad.style.display = ''; lgrWorkspace.style.display = 'none'; lgrActs.style.display = 'none';
    lgrCount.textContent = lines(0, 0); resetAll();
  });
  lgrClearBtn.addEventListener('click', () => { resetAll(); renderLogs(); });
  lgrSelectBtn.addEventListener('click', () => {
    const r = document.createRange(); r.selectNodeContents(lgrDisplay);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  lgrNewWinBtn.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('view', 'loger');
    window.open(url.toString(), '_blank');
  });
})();
