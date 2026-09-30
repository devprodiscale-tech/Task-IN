// ======================= RÉSULTATS OSC DU JOUR (Admin & Superviseur) =======================
// Les agents n'ont pas d'accès admin à OSC / Ringover / Crisp : chaque jour, l'admin ou le
// superviseur recopie ici les chiffres « Activité agents » de chacun (capture à l'appui) ou
// importe un CSV brut. Table Supabase agent_daily_stats (migration 011), captures dans
// l'espace privé « daily-stats ». Lecture : toute l'équipe. Écriture : admin et superviseur.

const DR_FIELDS = [
  { key: 'worked_minutes', label: 'Travaillé', type: 'duration', help: 'Colonne « Travaillé » d’OSC, ex. 8h 3m' },
  { key: 'calls_in', label: 'Appels entrants', type: 'int' },
  { key: 'calls_out', label: 'Appels sortants', type: 'int' },
  { key: 'call_minutes', label: 'Temps d’appel', type: 'duration', help: 'ex. 29m ou 1h 05m' },
  { key: 'tasks_open', label: 'Tâches en cours', type: 'int', help: 'Tickets OSC, 1er chiffre (0 dans 0/20)' },
  { key: 'tickets_assigned', label: 'Tickets assignés', type: 'int', help: 'Tickets OSC, 2e chiffre (20 dans 0/20)' },
  { key: 'actions', label: 'Actions', type: 'int' },
  { key: 'created', label: 'Créés', type: 'int' },
  { key: 'resolved', label: 'Résolus', type: 'int' },
  { key: 'crisp_conversations', label: 'Conversations Crisp', type: 'int' },
  { key: 'crisp_messages', label: 'Messages Crisp', type: 'int', help: 'Si l’export le permet : révèle les conversations bâclées' },
];
const DR_FIELD_KEYS = DR_FIELDS.map(f => f.key);
const DR_MAX_SHOTS = 10;
const DR_BUCKET = 'daily-stats';

let drState = { day: '', pole: 'all', rows: new Map(), loading: false, error: '' };
let drEdit = null;
let drImport = null;

function drCanWrite() { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor'); }
function drEl(id) { return document.getElementById(id); }
function drLocalDay(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function drShiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  return drLocalDay(new Date(y, m - 1, d + delta));
}
function drDayLabel(day) {
  const [y, m, d] = day.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = drLocalDay();
  const suffix = day === today ? ' · aujourd’hui' : day === drShiftDay(today, -1) ? ' · hier' : '';
  return label.charAt(0).toUpperCase() + label.slice(1) + suffix;
}

// « 8h 3m », « 8h03 », « 1:05 », « 29m », « 29 » → minutes. Vide → null. Illisible → NaN.
function drParseDuration(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  let m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = text.match(/^(?:(\d{1,2})h)?(?:(\d{1,3})(?:m|min|mn)?)?$/);
  if (m && (m[1] !== undefined || m[2] !== undefined)) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return NaN;
}
function drFormatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '—';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
function drFormatValue(field, value) {
  if (value === null || value === undefined) return '—';
  return field.type === 'duration' ? drFormatDuration(value) : String(value);
}

// ---------- Accès Supabase (REST + Storage) ----------
function drConfig() { return window.TASKIN_SUPABASE_CONFIG || {}; }
async function drFetch(path, init = {}) {
  const provider = window.taskinDataProviders?.active?.();
  const cfg = drConfig();
  if (!provider || !cfg.url) throw new Error('Supabase n’est pas configuré.');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', cfg.anonKey);
  const response = await provider.authFetch(`${cfg.url.replace(/\/+$/, '')}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || payload?.error || `Erreur ${response.status}`);
  }
  return response;
}
async function drLoadDay(day) {
  const response = await drFetch(`/rest/v1/agent_daily_stats?select=*&day=eq.${day}`, { headers: { Accept: 'application/json' } });
  return response.json();
}
async function drLoadDays(days) {
  if (!days.length) return [];
  const response = await drFetch(`/rest/v1/agent_daily_stats?select=*&day=in.(${days.join(',')})`, { headers: { Accept: 'application/json' } });
  return response.json();
}
async function drUpsert(rows) {
  const response = await drFetch('/rest/v1/agent_daily_stats?on_conflict=agent_id,day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
  const saved = await response.json();
  // Sans ligne en retour, les règles d'accès ont bloqué l'écriture sans erreur.
  if (!Array.isArray(saved) || saved.length !== rows.length) throw new Error('Enregistrement refusé : seuls l’admin et le superviseur peuvent saisir les résultats.');
  return saved;
}
function drObjectPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
async function drUploadShot(blob, agentId, day) {
  const path = `${agentId}/${day}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await drFetch(`/storage/v1/object/${DR_BUCKET}/${drObjectPath(path)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob });
  return path;
}
async function drDeleteShot(path) {
  try { await drFetch(`/storage/v1/object/${DR_BUCKET}/${drObjectPath(path)}`, { method: 'DELETE' }); } catch (e) { console.warn('Capture non supprimée :', e.message); }
}
const drShotUrls = new Map();
async function drShotUrl(path) {
  if (drShotUrls.has(path)) return drShotUrls.get(path);
  const response = await drFetch(`/storage/v1/object/authenticated/${DR_BUCKET}/${drObjectPath(path)}`);
  const url = URL.createObjectURL(await response.blob());
  drShotUrls.set(path, url);
  return url;
}

// Capture d'écran → JPEG allégé (texte lisible, ~150–300 Ko).
async function drCompressImage(file) {
  if (!/^image\//.test(file.type)) throw new Error('Ce fichier n’est pas une image.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image illisible.')), 'image/jpeg', 0.85));
}

// ---------- Page ----------
function drAgents() {
  const agents = (typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(u => u.role === 'agent'));
  return drState.pole === 'all' ? agents : agents.filter(a => a.pole === drState.pole);
}

async function renderDailyResults() {
  const panel = drEl('daily-results-panel');
  if (!panel || !currentUser) return;
  if (!drState.day) drState.day = drLocalDay();
  drState.loading = true; drState.error = '';
  drPaint();
  try {
    const rows = await drLoadDay(drState.day);
    drState.rows = new Map(rows.map(r => [r.agent_id, r]));
  } catch (e) {
    drState.rows = new Map();
    drState.error = e.message;
  }
  drState.loading = false;
  drPaint();
}

function drSwitchHtml() {
  if (currentUser?.role !== 'admin') return '';
  return `<div class="dr-switch" role="tablist"><button type="button" onclick="switchTab('stat', document.querySelector('[data-admin-nav=&quot;stat&quot;]'))">Analyse</button><button type="button" class="active" aria-selected="true">Résultats OSC</button></div>`;
}

function drPaint() {
  const panel = drEl('daily-results-panel');
  if (!panel) return;
  const agents = drAgents();
  const write = drCanWrite();
  const rows = agents.map(a => ({ agent: a, row: drState.rows.get(a.id) || null }));
  const filled = rows.filter(r => r.row).length;
  const sum = key => rows.reduce((s, r) => s + (Number(r.row?.[key]) || 0), 0);
  const conv = sum('crisp_conversations'), msgs = sum('crisp_messages');
  const poles = [['all', 'Tous'], ['fo', 'FO'], ['bo', 'BO'], ['reconf', 'Reconf']];
  const body = drState.loading
    ? '<div class="dr-empty">Chargement des résultats…</div>'
    : drState.error
      ? `<div class="dr-empty dr-error">Impossible de charger les résultats : ${escHtml(drState.error)}</div>`
      : !rows.length
        ? '<div class="dr-empty">Aucun agent dans ce pôle.</div>'
        : `<div class="dr-table-wrap"><table class="dr-table">
          <thead><tr><th>Agent</th><th>Travaillé</th><th>Appels<small>entr. · sort.</small></th><th>Temps d’appel</th><th>Tickets<small>en cours / assignés</small></th><th>Actions</th><th>Créés</th><th>Résolus</th><th>Crisp<small>conv. · msg/conv.</small></th><th>Preuve</th><th></th></tr></thead>
          <tbody>${rows.map(({ agent, row }) => drRowHtml(agent, row, write)).join('')}</tbody>
          <tfoot><tr><td>Total équipe</td><td>${drFormatDuration(sum('worked_minutes'))}</td><td>${sum('calls_in')} · ${sum('calls_out')}</td><td>${drFormatDuration(sum('call_minutes'))}</td><td>${sum('tasks_open')} / ${sum('tickets_assigned')}</td><td>${sum('actions')}</td><td>${sum('created')}</td><td>${sum('resolved')}</td><td>${conv}${msgs && conv ? ` · ${(msgs / conv).toFixed(1).replace('.', ',')}` : ''}</td><td colspan="2"></td></tr></tfoot>
        </table></div>`;
  panel.innerHTML = `<section class="dr-shell">
    <div class="dr-head">
      <div>${drSwitchHtml()}<span class="admin-overview-section-label">Stat · résultats OSC saisis</span><h2>Résultats du jour</h2>
        <p>Chiffres « Activité agents » d’OSC, Ringover et Crisp, saisis ${write ? 'par toi ou importés en CSV' : 'par l’admin ou le superviseur'}, preuve à l’appui.</p></div>
      ${write ? '<div class="dr-head-actions"><button type="button" class="btn btn-ghost" onclick="drOpenImport()">Importer un CSV</button></div>' : ''}
    </div>
    <div class="dr-toolbar">
      <div class="dr-daynav">
        <button type="button" class="dr-icon-btn" onclick="drGoDay(-1)" aria-label="Jour précédent">‹</button>
        <input type="date" class="form-input" id="dr-day" value="${drState.day}" max="${drLocalDay()}" onchange="drSetDay(this.value)">
        <button type="button" class="dr-icon-btn" onclick="drGoDay(1)" aria-label="Jour suivant" ${drState.day >= drLocalDay() ? 'disabled' : ''}>›</button>
        <strong>${escHtml(drDayLabel(drState.day))}</strong>
      </div>
      <div class="dr-poles">${poles.map(([k, l]) => `<button type="button" class="${drState.pole === k ? 'active' : ''}" onclick="drSetPole('${k}')">${l}</button>`).join('')}</div>
      <span class="dr-progress ${filled === rows.length && rows.length ? 'is-done' : ''}">${filled} agent${filled > 1 ? 's' : ''} saisi${filled > 1 ? 's' : ''} sur ${rows.length}</span>
    </div>
    ${body}
  </section>`;
}

function drRowHtml(agent, row, write) {
  const v = key => row?.[key];
  const dash = x => (x === null || x === undefined ? '—' : x);
  const shots = Array.isArray(row?.screenshots) ? row.screenshots.length : 0;
  const ratio = v('crisp_messages') && v('crisp_conversations') ? (v('crisp_messages') / v('crisp_conversations')) : null;
  const who = row?.entered_by ? (TEAM || []).find(u => u.id === row.entered_by)?.name : '';
  const pole = typeof poleLabel === 'function' ? poleLabel(agent.pole) : '';
  return `<tr class="${row ? '' : 'is-missing'}">
    <td><div class="dr-agent"><span class="dr-avatar" style="--c:${safeColor(agent.color)}">${escHtml(agent.initials || '??')}</span><div><strong>${escHtml(agent.name)}</strong>${pole ? `<em class="dr-pole dr-pole-${escHtml(agent.pole)}">${pole}</em>` : ''}</div></div></td>
    <td>${drFormatDuration(v('worked_minutes'))}</td>
    <td>${row ? `${dash(v('calls_in'))} · ${dash(v('calls_out'))}` : '—'}</td>
    <td>${drFormatDuration(v('call_minutes'))}</td>
    <td>${row ? `${dash(v('tasks_open'))} / ${dash(v('tickets_assigned'))}` : '—'}</td>
    <td>${dash(v('actions'))}</td><td>${dash(v('created'))}</td><td>${dash(v('resolved'))}</td>
    <td>${dash(v('crisp_conversations'))}${ratio !== null ? ` · <span class="dr-ratio ${ratio < 2 ? 'is-low' : ''}" title="${ratio < 2 ? 'Moins de 2 messages par conversation : suivi à vérifier' : 'Messages par conversation'}">${ratio.toFixed(1).replace('.', ',')}</span>` : ''}</td>
    <td>${shots ? `<button type="button" class="dr-shot-btn" onclick="drOpenShots('${agent.id}')">${shots} capture${shots > 1 ? 's' : ''}</button>` : row ? '<span class="dr-muted">aucune</span>' : ''}</td>
    <td class="dr-row-action">${write ? `<button type="button" class="dr-edit-btn" onclick="drOpenEdit('${agent.id}')">${row ? 'Modifier' : 'Saisir'}</button>` : ''}${row ? `<small title="${escHtml(new Date(row.updated_at).toLocaleString('fr-FR'))}">${row.source === 'csv' ? 'CSV' : row.source === 'mixed' ? 'CSV + saisie' : 'saisie'}${who ? ' · ' + escHtml(who) : ''}</small>` : ''}</td>
  </tr>`;
}

function drSetDay(day) { if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= drLocalDay()) { drState.day = day; renderDailyResults(); } }
function drGoDay(delta) { drSetDay(drShiftDay(drState.day, delta)); }
function drSetPole(pole) { drState.pole = pole; drPaint(); }

// ---------- Fenêtre de saisie ----------
function drOverlay(id, onClose) {
  let overlay = drEl(id);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'modal-overlay hidden';
    overlay.addEventListener('click', e => { if (e.target === overlay) onClose(); });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function drOpenEdit(agentId) {
  if (!drCanWrite()) return;
  const agent = (TEAM || []).find(u => u.id === agentId);
  if (!agent) return;
  const row = drState.rows.get(agentId) || null;
  drEdit = { agent, row, shots: (row?.screenshots || []).map(s => ({ ...s })), added: [], removed: [], busy: false };
  const overlay = drOverlay('dr-edit-overlay', drCloseEdit);
  overlay.innerHTML = `<div class="modal dr-modal" role="dialog" aria-modal="true" aria-labelledby="dr-edit-title">
    <div class="modal-header">
      <div class="modal-title" id="dr-edit-title">${escHtml(agent.name)} — ${escHtml(drDayLabel(drState.day))}</div>
      <button class="modal-close" type="button" onclick="drCloseEdit()" aria-label="Fermer">×</button>
    </div>
    <div class="modal-body">
      <div class="dr-form-grid">${DR_FIELDS.map(f => `<label class="dr-field"><span>${f.label}</span>
        <input class="form-input" data-dr-field="${f.key}" inputmode="${f.type === 'int' ? 'numeric' : 'text'}" autocomplete="off" placeholder="${f.type === 'duration' ? '0h 00m' : '—'}" value="${row && row[f.key] !== null && row[f.key] !== undefined ? escHtml(f.type === 'duration' ? drFormatDuration(row[f.key]) : String(row[f.key])) : ''}">
        ${f.help ? `<small>${f.help}</small>` : ''}</label>`).join('')}</div>
      <label class="dr-field dr-field-wide"><span>Note (contexte du shift, dispatch, incident…)</span><textarea class="form-input" id="dr-note" rows="2" maxlength="2000">${escHtml(row?.note || '')}</textarea></label>
      <div class="dr-shots-label">Captures d’écran (preuve) <small>glisse, colle (Ctrl+V) ou choisis jusqu’à ${DR_MAX_SHOTS} images</small></div>
      <div class="dr-drop" id="dr-drop" tabindex="0">
        <div class="dr-thumbs" id="dr-thumbs"></div>
        <label class="dr-drop-add"><input type="file" accept="image/*" multiple id="dr-file" hidden>+ Ajouter</label>
      </div>
      <div class="dr-status" id="dr-edit-status" role="status"></div>
    </div>
    <div class="modal-footer">
      ${row ? '<button class="btn btn-ghost dr-delete" type="button" onclick="drDeleteRow()">Supprimer la saisie</button>' : ''}
      <button class="btn btn-ghost" type="button" onclick="drCloseEdit()">Annuler</button>
      <button class="btn btn-ghost" type="button" id="dr-save-next" onclick="drSave(true)">Enregistrer et suivant</button>
      <button class="btn btn-primary" type="button" id="dr-save" onclick="drSave(false)">Enregistrer</button>
    </div>
  </div>`;
  overlay.classList.remove('hidden');
  drEl('dr-file').addEventListener('change', e => { drAddFiles([...e.target.files]); e.target.value = ''; });
  const drop = drEl('dr-drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); drAddFiles([...e.dataTransfer.files]); });
  document.addEventListener('paste', drOnPaste);
  drPaintThumbs();
  overlay.querySelector('[data-dr-field]')?.focus();
}

function drOnPaste(e) {
  if (!drEdit) return;
  const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); drAddFiles(files); }
}

async function drAddFiles(files) {
  if (!drEdit) return;
  const state = drEdit;
  const status = drEl('dr-edit-status');
  for (const file of files) {
    if (state.shots.length >= DR_MAX_SHOTS) { status.textContent = `${DR_MAX_SHOTS} captures maximum.`; break; }
    const temp = { path: '', name: file.name || 'capture', uploading: true, at: new Date().toISOString() };
    state.shots.push(temp);
    drPaintThumbs();
    try {
      const blob = await drCompressImage(file);
      temp.preview = URL.createObjectURL(blob);
      drPaintThumbs();
      temp.path = await drUploadShot(blob, state.agent.id, drState.day);
      if (drEdit !== state) { drDeleteShot(temp.path); return; } // fenêtre fermée entre-temps
      drShotUrls.set(temp.path, temp.preview);
      state.added.push(temp.path);
      temp.uploading = false;
    } catch (e) {
      state.shots.splice(state.shots.indexOf(temp), 1);
      status.textContent = `Capture non envoyée : ${e.message}`;
    }
    drPaintThumbs();
  }
}

async function drPaintThumbs() {
  const box = drEl('dr-thumbs');
  if (!box || !drEdit) return;
  box.innerHTML = drEdit.shots.map((s, i) => `<figure class="dr-thumb ${s.uploading ? 'is-loading' : ''}">
    ${s.preview ? `<img src="${s.preview}" alt="">` : `<span class="dr-thumb-ph" data-dr-thumb="${i}"></span>`}
    ${s.uploading ? '<figcaption>Envoi…</figcaption>' : `<button type="button" aria-label="Retirer" onclick="drRemoveShot(${i})">×</button>`}
  </figure>`).join('');
  for (const [i, s] of drEdit.shots.entries()) {
    if (s.preview || !s.path) continue;
    try { s.preview = await drShotUrl(s.path); const ph = box.querySelector(`[data-dr-thumb="${i}"]`); if (ph) ph.outerHTML = `<img src="${s.preview}" alt="">`; } catch (_) {}
  }
}

function drRemoveShot(index) {
  if (!drEdit) return;
  const [shot] = drEdit.shots.splice(index, 1);
  if (shot?.path) {
    if (drEdit.added.includes(shot.path)) { drEdit.added = drEdit.added.filter(p => p !== shot.path); drDeleteShot(shot.path); }
    else drEdit.removed.push(shot.path);
  }
  drPaintThumbs();
}

function drCloseEdit() {
  document.removeEventListener('paste', drOnPaste);
  if (drEdit?.added.length) drEdit.added.forEach(drDeleteShot); // captures envoyées mais jamais enregistrées
  drEdit = null;
  drEl('dr-edit-overlay')?.classList.add('hidden');
}

function drReadForm() {
  const values = {};
  const errors = [];
  DR_FIELDS.forEach(f => {
    const input = document.querySelector(`#dr-edit-overlay [data-dr-field="${f.key}"]`);
    const raw = input.value.trim();
    let value = null;
    if (raw) value = f.type === 'duration' ? drParseDuration(raw) : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    const invalid = Number.isNaN(value) || (f.type === 'duration' && value > 1440);
    input.classList.toggle('is-invalid', invalid);
    if (invalid) errors.push(f.label);
    values[f.key] = invalid ? null : value;
  });
  return { values, errors };
}

async function drSave(goNext) {
  if (!drEdit || drEdit.busy) return;
  const status = drEl('dr-edit-status');
  if (drEdit.shots.some(s => s.uploading)) { status.textContent = 'Attends la fin de l’envoi des captures.'; return; }
  const { values, errors } = drReadForm();
  if (errors.length) { status.textContent = `Valeur illisible : ${errors.join(', ')}.`; return; }
  if (DR_FIELD_KEYS.every(k => values[k] === null) && !drEdit.shots.length) { status.textContent = 'Saisis au moins un chiffre ou ajoute une capture.'; return; }
  const state = drEdit;
  state.busy = true;
  drEl('dr-save').disabled = drEl('dr-save-next').disabled = true;
  status.textContent = 'Enregistrement…';
  try {
    const row = {
      agent_id: state.agent.id, day: drState.day, ...values,
      note: drEl('dr-note').value.trim() || null,
      screenshots: state.shots.map(s => ({ path: s.path, name: String(s.name || '').slice(0, 120), at: s.at })),
      source: state.row && state.row.source !== 'manual' ? 'mixed' : 'manual',
      entered_by: currentUser.id,
    };
    const [saved] = await drUpsert([row]);
    drState.rows.set(state.agent.id, saved);
    state.added = [];
    state.removed.forEach(drDeleteShot);
    const agents = drAgents();
    const next = goNext ? agents.slice(agents.findIndex(a => a.id === state.agent.id) + 1).find(a => !drState.rows.has(a.id)) || null : null;
    drCloseEdit();
    drPaint();
    if (next) drOpenEdit(next.id);
  } catch (e) {
    state.busy = false;
    status.textContent = e.message;
    drEl('dr-save').disabled = drEl('dr-save-next').disabled = false;
  }
}

async function drDeleteRow() {
  if (!drEdit?.row || drEdit.busy) return;
  if (!confirm(`Supprimer la saisie de ${drEdit.agent.name} pour ce jour ?`)) return;
  const state = drEdit;
  state.busy = true;
  try {
    const response = await drFetch(`/rest/v1/agent_daily_stats?id=eq.${state.row.id}`, { method: 'DELETE', headers: { Prefer: 'return=representation', Accept: 'application/json' } });
    const deleted = await response.json();
    if (!Array.isArray(deleted) || !deleted.length) throw new Error('Suppression refusée.');
    (state.row.screenshots || []).forEach(s => s.path && drDeleteShot(s.path));
    drState.rows.delete(state.agent.id);
    drCloseEdit();
    drPaint();
  } catch (e) {
    state.busy = false;
    drEl('dr-edit-status').textContent = e.message;
  }
}

// ---------- Visionneuse ----------
async function drOpenShots(agentId) {
  const row = drState.rows.get(agentId);
  const agent = (TEAM || []).find(u => u.id === agentId);
  if (!row || !agent) return;
  const overlay = drOverlay('dr-shots-overlay', () => overlay.classList.add('hidden'));
  const shots = row.screenshots || [];
  overlay.innerHTML = `<div class="modal dr-viewer" role="dialog" aria-modal="true">
    <div class="modal-header"><div class="modal-title">Captures — ${escHtml(agent.name)} · ${escHtml(drDayLabel(drState.day))}</div>
    <button class="modal-close" type="button" onclick="document.getElementById('dr-shots-overlay').classList.add('hidden')" aria-label="Fermer">×</button></div>
    <div class="modal-body"><div class="dr-viewer-list">${shots.map((s, i) => `<a class="dr-viewer-item" data-dr-view="${i}" target="_blank" rel="noopener"><span>Chargement…</span></a>`).join('')}</div></div>
  </div>`;
  overlay.classList.remove('hidden');
  for (const [i, s] of shots.entries()) {
    const slot = overlay.querySelector(`[data-dr-view="${i}"]`);
    try { const url = await drShotUrl(s.path); slot.href = url; slot.innerHTML = `<img src="${url}" alt="Capture ${i + 1}">`; }
    catch (e) { slot.innerHTML = `<span>Capture illisible : ${escHtml(e.message)}</span>`; }
  }
}

// ---------- Import CSV ----------
function drParseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = [';', ',', '\t'].map(d => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  const headers = (rows.shift() || []).map((h, i) => h.trim() || `Colonne ${i + 1}`);
  return { headers, rows: rows.map(r => headers.map((_, i) => (r[i] ?? '').trim())) };
}

// Jour local AAAA-MM-JJ depuis les formats courants d'export (ISO, JJ/MM/AAAA, horodatage Unix).
function drParseDay(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{10}(\d{3})?$/.test(text)) return drLocalDay(new Date(Number(text) * (text.length === 10 ? 1000 : 1)));
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    if (m[4] !== undefined && /(Z|[+-]\d{2}:?\d{2})$/.test(text)) { const d = new Date(text); if (!Number.isNaN(d.getTime())) return drLocalDay(d); }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b]; // JJ/MM par défaut, MM/JJ si évident
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : drLocalDay(d);
}

function drNorm(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim(); }
function drMatchAgent(csvName) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('taskin_csv_agent_map') || '{}'); } catch (_) {}
  const agents = (typeof agentsOnly === 'function' ? agentsOnly() : []);
  if (saved[csvName] && agents.some(a => a.id === saved[csvName])) return saved[csvName];
  const n = drNorm(csvName);
  if (!n) return '';
  const exact = agents.find(a => drNorm(a.name) === n || drNorm(a.email) === n);
  if (exact) return exact.id;
  // Mêmes mots dans un autre ordre (« Tina, Diary » = « Diary Tina »), puis correspondance partielle unique.
  const words = x => drNorm(x).split(/[\s.]+/).filter(Boolean).sort().join(' ');
  const sameWords = agents.filter(a => words(a.name) === words(csvName));
  if (sameWords.length === 1) return sameWords[0].id;
  const first = n.split(' ')[0];
  const partial = agents.filter(a => { const an = drNorm(a.name); return an && (n.includes(an) || an.includes(n) || an.split(' ')[0] === first); });
  return partial.length === 1 ? partial[0].id : '';
}
function drGuessColumn(headers, patterns) {
  const i = headers.findIndex(h => patterns.some(p => p.test(drNorm(h))));
  return i < 0 ? '' : String(i);
}

function drOpenImport() {
  if (!drCanWrite()) return;
  drImport = { csv: null, fileName: '' };
  const overlay = drOverlay('dr-import-overlay', drCloseImport);
  overlay.innerHTML = `<div class="modal dr-modal dr-import-modal" role="dialog" aria-modal="true" aria-labelledby="dr-import-title">
    <div class="modal-header"><div class="modal-title" id="dr-import-title">Importer un CSV brut (Crisp, Ringover, OSC…)</div>
    <button class="modal-close" type="button" onclick="drCloseImport()" aria-label="Fermer">×</button></div>
    <div class="modal-body">
      <label class="dr-drop dr-import-drop" id="dr-import-drop"><input type="file" accept=".csv,text/csv,text/plain" id="dr-import-file" hidden>
        <strong>Choisir ou glisser un fichier CSV</strong><small>Séparateur , ; ou tabulation détecté automatiquement.</small></label>
      <div id="dr-import-config"></div>
      <div class="dr-status" id="dr-import-status" role="status"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" type="button" onclick="drCloseImport()">Annuler</button>
      <button class="btn btn-primary" type="button" id="dr-import-run" disabled onclick="drRunImport()">Importer</button></div>
  </div>`;
  overlay.classList.remove('hidden');
  const input = drEl('dr-import-file'), drop = drEl('dr-import-drop');
  input.addEventListener('change', () => input.files[0] && drReadCsvFile(input.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); e.dataTransfer.files[0] && drReadCsvFile(e.dataTransfer.files[0]); });
}
function drCloseImport() { drImport = null; drEl('dr-import-overlay')?.classList.add('hidden'); }

async function drReadCsvFile(file) {
  const status = drEl('dr-import-status');
  if (file.size > 20 * 1024 * 1024) { status.textContent = 'Fichier trop lourd (20 Mo maximum).'; return; }
  const csv = drParseCsv(await file.text());
  if (!csv.headers.length || !csv.rows.length) { status.textContent = 'Aucune ligne lisible dans ce fichier.'; return; }
  drImport = { csv, fileName: file.name };
  status.textContent = '';
  const h = csv.headers;
  const opts = (sel, withNone) => `${withNone ? `<option value="">${withNone}</option>` : ''}${h.map((x, i) => `<option value="${i}" ${String(i) === sel ? 'selected' : ''}>${escHtml(x)}</option>`).join('')}`;
  const agentCol = drGuessColumn(h, [/operator/, /agent/, /assign/, /user ?name/, /^name$/, /nom/, /email/]);
  const dateCol = drGuessColumn(h, [/date/, /created/, /started/, /updated/, /time/, /jour/]);
  drEl('dr-import-config').innerHTML = `
    <p class="dr-import-file">${escHtml(file.name)} · <b>${csv.rows.length}</b> ligne${csv.rows.length > 1 ? 's' : ''} · ${h.length} colonnes</p>
    <div class="dr-import-grid">
      <label class="dr-field"><span>Colonne de l’agent</span><select class="form-input" data-dr-imp="agent">${opts(agentCol || '0')}</select></label>
      <label class="dr-field"><span>Colonne de la date</span><select class="form-input" data-dr-imp="date">${opts(dateCol, `Aucune — tout au ${drDayLabel(drState.day)}`)}</select></label>
      <label class="dr-field"><span>Calcul</span><select class="form-input" data-dr-imp="measure"><option value="count">Compter les lignes</option><option value="distinct">Compter les valeurs différentes de…</option><option value="sum">Additionner la colonne…</option></select></label>
      <label class="dr-field" data-dr-imp-wrap="measureCol" hidden><span>Colonne à compter / additionner</span><select class="form-input" data-dr-imp="measureCol">${opts(drGuessColumn(h, [/conversation/, /session/, /ticket/, /id$/]) || '0')}</select></label>
      <label class="dr-field"><span>Filtre (optionnel)</span><select class="form-input" data-dr-imp="filterCol">${opts('', 'Aucun filtre')}</select></label>
      <label class="dr-field" data-dr-imp-wrap="filterText" hidden><span>… contient</span><input class="form-input" data-dr-imp="filterText" placeholder="ex. operator"></label>
      <label class="dr-field"><span>Enregistrer dans</span><select class="form-input" data-dr-imp="target">${DR_FIELDS.map(f => `<option value="${f.key}" ${f.key === 'crisp_conversations' ? 'selected' : ''}>${f.label}${f.type === 'duration' ? ' (minutes)' : ''}</option>`).join('')}</select></label>
    </div>
    <div class="dr-import-preview" id="dr-import-preview"></div>`;
  drEl('dr-import-config').querySelectorAll('[data-dr-imp]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', drImportPreview));
  drImportPreview();
}

function drImportSettings() {
  const get = k => drEl('dr-import-config').querySelector(`[data-dr-imp="${k}"]`)?.value ?? '';
  return { agent: get('agent'), date: get('date'), measure: get('measure'), measureCol: get('measureCol'), filterCol: get('filterCol'), filterText: get('filterText').trim(), target: get('target') };
}

// Regroupe le CSV par (nom dans le CSV, jour) selon le calcul choisi.
function drImportAggregate() {
  const s = drImportSettings();
  const groups = new Map();
  let skippedDate = 0, skippedFilter = 0;
  for (const r of drImport.csv.rows) {
    if (s.filterCol !== '' && s.filterText && !drNorm(r[s.filterCol]).includes(drNorm(s.filterText))) { skippedFilter++; continue; }
    const name = r[s.agent] || '';
    if (!name) continue;
    const day = s.date === '' ? drState.day : drParseDay(r[s.date]);
    if (!day || day > drLocalDay()) { skippedDate++; continue; }
    const key = `${name}\u0000${day}`;
    if (!groups.has(key)) groups.set(key, { name, day, count: 0, distinct: new Set(), sum: 0 });
    const g = groups.get(key);
    g.count++;
    if (s.measure === 'distinct') g.distinct.add(r[s.measureCol]);
    if (s.measure === 'sum') { const n = Number(String(r[s.measureCol]).replace(',', '.').replace(/\s/g, '')); if (!Number.isNaN(n)) g.sum += n; }
  }
  const list = [...groups.values()].map(g => ({ name: g.name, day: g.day, value: Math.round(s.measure === 'count' ? g.count : s.measure === 'distinct' ? g.distinct.size : g.sum) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  return { s, list, skippedDate, skippedFilter };
}

function drImportPreview() {
  if (!drImport?.csv) return;
  const cfg = drEl('dr-import-config');
  const s = drImportSettings();
  cfg.querySelector('[data-dr-imp-wrap="measureCol"]').hidden = s.measure === 'count';
  cfg.querySelector('[data-dr-imp-wrap="filterText"]').hidden = s.filterCol === '';
  const { list, skippedDate, skippedFilter } = drImportAggregate();
  const names = [...new Set(list.map(g => g.name))];
  const agents = (typeof agentsOnly === 'function' ? agentsOnly() : []);
  const prev = drImport.mapping || {};
  drImport.mapping = Object.fromEntries(names.map(n => [n, n in prev ? prev[n] : drMatchAgent(n)]));
  const target = DR_FIELDS.find(f => f.key === s.target);
  const days = [...new Set(list.map(g => g.day))];
  drEl('dr-import-preview').innerHTML = !list.length
    ? '<div class="dr-empty">Aucune ligne retenue avec ces réglages.</div>'
    : `<div class="dr-import-summary"><b>${list.length}</b> résultat${list.length > 1 ? 's' : ''} · ${days.length} jour${days.length > 1 ? 's' : ''} (${days.length > 1 ? `${escHtml(days[0])} → ${escHtml(days[days.length - 1])}` : escHtml(days[0])})${skippedDate ? ` · ${skippedDate} ligne(s) sans date valide ignorée(s)` : ''}${skippedFilter ? ` · ${skippedFilter} ligne(s) filtrée(s)` : ''}</div>
      <div class="dr-import-map">${names.map(n => {
        const total = list.filter(g => g.name === n).reduce((a, g) => a + g.value, 0);
        return `<label><span title="${escHtml(n)}">${escHtml(n)}</span><em>${escHtml(target?.label || '')} : <b>${total}</b></em>
          <select class="form-input" data-dr-map="${escHtml(n)}"><option value="">Ignorer</option>${agents.map(a => `<option value="${a.id}" ${drImport.mapping[n] === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>`;
      }).join('')}</div>`;
  drEl('dr-import-preview').querySelectorAll('[data-dr-map]').forEach(sel => sel.addEventListener('change', () => { drImport.mapping[sel.dataset.drMap] = sel.value; drImportRefreshButton(); }));
  drImportRefreshButton();
}
function drImportRefreshButton() {
  const n = drImport?.mapping ? Object.values(drImport.mapping).filter(Boolean).length : 0;
  const btn = drEl('dr-import-run');
  if (btn) { btn.disabled = !n; btn.textContent = n ? `Importer pour ${n} agent${n > 1 ? 's' : ''}` : 'Importer'; }
}

async function drRunImport() {
  if (!drImport?.csv) return;
  const status = drEl('dr-import-status');
  const btn = drEl('dr-import-run');
  const { s, list } = drImportAggregate();
  const perAgentDay = new Map();
  for (const g of list) {
    const agentId = drImport.mapping[g.name];
    if (!agentId) continue;
    const key = `${agentId}|${g.day}`;
    perAgentDay.set(key, (perAgentDay.get(key) || 0) + g.value);
  }
  if (!perAgentDay.size) return;
  const field = DR_FIELDS.find(f => f.key === s.target);
  const max = field.type === 'duration' ? 1440 : 100000;
  btn.disabled = true;
  status.textContent = 'Import en cours…';
  try {
    const days = [...new Set([...perAgentDay.keys()].map(k => k.split('|')[1]))];
    const existing = new Map((await drLoadDays(days)).map(r => [`${r.agent_id}|${r.day}`, r]));
    const rows = [...perAgentDay.entries()].map(([key, value]) => {
      const [agent_id, day] = key.split('|');
      const old = existing.get(key);
      return { agent_id, day, [s.target]: Math.min(max, value), source: !old || old.source === 'csv' ? 'csv' : 'mixed', entered_by: currentUser.id };
    });
    const saved = [];
    for (let i = 0; i < rows.length; i += 200) saved.push(...await drUpsert(rows.slice(i, i + 200)));
    try {
      const map = JSON.parse(localStorage.getItem('taskin_csv_agent_map') || '{}');
      Object.entries(drImport.mapping).forEach(([n, id]) => { if (id) map[n] = id; });
      localStorage.setItem('taskin_csv_agent_map', JSON.stringify(map));
    } catch (_) {}
    status.textContent = `${saved.length} résultat${saved.length > 1 ? 's' : ''} importé${saved.length > 1 ? 's' : ''} dans « ${field.label} ».`;
    if (days.includes(drState.day)) renderDailyResults();
    const done = drImport;
    setTimeout(() => { if (drImport === done) drCloseImport(); }, 1400);
  } catch (e) {
    btn.disabled = false;
    status.textContent = `Import impossible : ${e.message}`;
  }
}
