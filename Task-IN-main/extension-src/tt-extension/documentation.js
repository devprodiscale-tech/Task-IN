const FIREBASE_API_KEY = "AIzaSyD1Weyc2zdtdaO7JgrMRskXZaDOGTIbyqc";
const FIREBASE_PROJECT_ID = "trackingcallro";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

window.addEventListener('error', (e) => {
  const target = document.getElementById(activeTab === 'cases' ? 'cases-list' : 'docs-list');
  if (target) {
    target.innerHTML = `<div class="doc-empty">Erreur JavaScript.<br><span style="font-size:10px;color:#B0392E;">${String(e.message || e).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span></div>`;
  }
  console.error("[Task'in Documentation] uncaught error:", e.error || e.message);
});

let activeTab = 'docs';
let docsCache = null;
let casesCache = null;

const searchInput = document.getElementById('search-input');
const docsView = document.getElementById('docs-view');
const casesView = document.getElementById('cases-view');
const docsList = document.getElementById('docs-list');
const docsDetail = document.getElementById('docs-detail');
const casesList = document.getElementById('cases-list');
const casesDetail = document.getElementById('cases-detail');

// --- Palette par catégorie (icône + famille de couleur) -------------------
const COLOR_FAMILIES = {
  ocean: { bg: '#E6EDF6', accent: '#2B4C7E', text: '#1E3760' },
  clay: { bg: '#FBE9E6', accent: '#E98A7D', text: '#A8503F' },
  bloom: { bg: '#FBEAF0', accent: '#D4537E', text: '#A34C68' },
  amber: { bg: '#FCF1D6', accent: '#DCAE1D', text: '#8A6A0F' },
  green: { bg: '#E1F3EC', accent: '#3B8C6E', text: '#1F6B4F' }
};
const CATEGORY_STYLE = {
  'Transport': { family: 'clay', icon: '✈' },
  'Hébergement': { family: 'bloom', icon: '🏨' },
  'Finance': { family: 'amber', icon: '💳' },
  'Santé & assistance': { family: 'ocean', icon: '🏥' },
  'Activités & billetterie': { family: 'green', icon: '🎫' },
  'Restauration': { family: 'clay', icon: '🍽' },
  'Annulations': { family: 'amber', icon: '⚠' },
  'Connectivité': { family: 'ocean', icon: '📶' },
  'Fournisseurs': { family: 'ocean', icon: '🔒' },
  'Organisation équipe': { family: 'bloom', icon: '👥' }
};
function styleFor(category) {
  const entry = CATEGORY_STYLE[category] || { family: 'ocean', icon: '📄' };
  return { ...entry, ...COLOR_FAMILIES[entry.family] };
}

const URGENT_KEYWORDS = ['retard', 'manqu', 'urgence', 'urgent', 'sécurit', 'securit', 'annul', 'panne', 'accident', 'perdu', 'sinistre', 'grève', 'greve', 'force majeure'];
function isUrgentRow(r) {
  const hay = ((r.type || '') + ' ' + (r.subject || '')).toLowerCase();
  return URGENT_KEYWORDS.some(k => hay.includes(k));
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    docsView.classList.toggle('hidden', activeTab !== 'docs');
    casesView.classList.toggle('hidden', activeTab !== 'cases');
    searchInput.value = '';
    showList();
    loadActiveTab();
  });
});

searchInput.addEventListener('input', () => renderCurrentList());

// --- Ajout d'un cas complexe --------------------------------------------
const addCaseBtn = document.getElementById('add-case-btn');
const caseForm = document.getElementById('cases-form');
const caseFormCancel = document.getElementById('case-form-cancel');
const caseFormSave = document.getElementById('case-form-save');

addCaseBtn.addEventListener('click', () => {
  caseForm.classList.remove('hidden');
  casesList.classList.add('hidden');
  addCaseBtn.classList.add('hidden');
});

function closeCaseForm() {
  caseForm.classList.add('hidden');
  casesList.classList.remove('hidden');
  addCaseBtn.classList.remove('hidden');
  document.getElementById('case-title').value = '';
  document.getElementById('case-category').value = '';
  document.getElementById('case-assisted-by').value = '';
  document.getElementById('case-description').value = '';
  const err = caseForm.querySelector('.case-form-error');
  if (err) err.remove();
}
caseFormCancel.addEventListener('click', closeCaseForm);

caseFormSave.addEventListener('click', async () => {
  const title = document.getElementById('case-title').value.trim();
  const category = document.getElementById('case-category').value.trim();
  const assistedBy = document.getElementById('case-assisted-by').value.trim();
  const description = document.getElementById('case-description').value.trim();

  const oldErr = caseForm.querySelector('.case-form-error');
  if (oldErr) oldErr.remove();

  if (!title) {
    const err = document.createElement('div');
    err.className = 'case-form-error';
    err.textContent = 'Le titre est obligatoire.';
    caseForm.appendChild(err);
    return;
  }

  const data = {
    title,
    category,
    assistedBy,
    description,
    createdAt: new Date().toISOString()
  };

  caseFormSave.disabled = true;
  caseFormSave.textContent = 'Enregistrement…';
  try {
    const res = await fetch(`${BASE_URL}/complexCases?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(data) })
    });
    const result = await res.json();
    if (result.error) throw new Error(`${result.error.code} — ${result.error.message}`);
    casesCache = null;
    closeCaseForm();
    await loadCases();
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'case-form-error';
    err.textContent = "Erreur d'enregistrement : " + e.message;
    caseForm.appendChild(err);
  } finally {
    caseFormSave.disabled = false;
    caseFormSave.textContent = 'Enregistrer';
  }
});

function toFirestoreValue(v) {
  if (v === null || v === undefined || v === '') return { nullValue: null };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: v } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  Object.entries(obj).forEach(([k, v]) => { fields[k] = toFirestoreValue(v); });
  return fields;
}

function showList() {
  if (activeTab === 'docs') {
    docsList.classList.remove('hidden');
    docsDetail.classList.add('hidden');
  } else {
    casesList.classList.remove('hidden');
    casesDetail.classList.add('hidden');
  }
}

function loadActiveTab() {
  if (activeTab === 'docs') loadDocs();
  else loadCases();
}

async function loadDocs() {
  if (docsCache) { renderCurrentList(); return; }
  docsList.innerHTML = '<div class="doc-empty">Chargement…</div>';
  try {
    const res = await fetch(`${BASE_URL}/procedures?key=${FIREBASE_API_KEY}&pageSize=300`);
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.code} — ${data.error.message}`);
    docsCache = (data.documents || []).map(d => ({
      id: d.name.split('/').pop(),
      ...fsFields(d.fields)
    })).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    renderCurrentList();
  } catch (e) {
    console.error("[Task'in Documentation] loadDocs error:", e);
    docsList.innerHTML = `<div class="doc-empty">Erreur de chargement.<br><span style="font-size:10px;color:#B0392E;">${esc(e.message)}</span></div>`;
  }
}

async function loadCases() {
  if (casesCache) { renderCurrentList(); return; }
  casesList.innerHTML = '<div class="doc-empty">Chargement…</div>';
  try {
    const res = await fetch(`${BASE_URL}/complexCases?key=${FIREBASE_API_KEY}&pageSize=300`);
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.code} — ${data.error.message}`);
    casesCache = (data.documents || []).map(d => ({
      id: d.name.split('/').pop(),
      ...fsFields(d.fields)
    })).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    renderCurrentList();
  } catch (e) {
    console.error("[Task'in Documentation] loadCases error:", e);
    casesCache = [];
    renderCurrentList();
  }
}

function renderCurrentList() {
  const source = activeTab === 'docs' ? docsCache : casesCache;
  const listEl = activeTab === 'docs' ? docsList : casesList;
  if (!source) return;

  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? source.filter(p => (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
    : source;

  if (filtered.length === 0) {
    listEl.innerHTML = activeTab === 'cases'
      ? '<div class="doc-empty">Aucun cas complexe documenté pour le moment.<br>Ce raccourci s\'activera dès que votre équipe formatrice en ajoutera.</div>'
      : '<div class="doc-empty">Aucune procédure trouvée.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const s = styleFor(p.category);
    return `
    <div class="doc-item" data-id="${p.id}" style="background:${s.bg}22">
      <div class="doc-item-bar" style="position:absolute;left:0;top:6px;bottom:6px;width:4px;background:${s.accent};border-radius:0;"></div>
      <div class="doc-item-icon" style="background:${s.bg};color:${s.accent};">${s.icon}</div>
      <div>
        <div class="doc-item-title">${esc(p.title || 'Sans titre')}</div>
        <div class="doc-item-cat" style="color:${s.text};">${esc((p.category || (activeTab === 'cases' ? 'Cas documenté' : '')).toUpperCase())}</div>
        ${activeTab === 'cases' && p.assistedBy ? `<div class="doc-item-assist">Assisté par ${esc(p.assistedBy)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.doc-item').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
}

function openDetail(id) {
  const source = activeTab === 'docs' ? docsCache : casesCache;
  const listEl = activeTab === 'docs' ? docsList : casesList;
  const detailEl = activeTab === 'docs' ? docsDetail : casesDetail;
  const p = (source || []).find(x => x.id === id);
  if (!p) return;

  const s = styleFor(p.category);

  detailEl.innerHTML = `
    <div class="doc-detail-header" style="background:linear-gradient(135deg,${s.accent},${s.text});">
      <button class="back-btn" id="detail-back-btn">‹</button>
      <div class="doc-detail-icon">${s.icon}</div>
      <div>
        <div class="doc-detail-title">${esc(p.title || 'Sans titre')}</div>
        <div class="doc-detail-cat">${esc((p.category || '').toUpperCase())}${p.format ? ' · ' + esc(formatLabel(p.format)) : ''}</div>
      </div>
    </div>
    <div id="detail-body"></div>
  `;
  const body = detailEl.querySelector('#detail-body');
  if (activeTab === 'cases' && p.assistedBy) {
    body.innerHTML += `<div class="doc-block-callout" style="background:${s.bg};border-color:${s.accent}66;color:${s.text};">👤 Assisté par <b>${esc(p.assistedBy)}</b></div>`;
  }
  if (p.sections && p.sections.length) {
    body.innerHTML += p.sections.map(b => renderBlock(b, s)).join('');
  } else if (p.description) {
    body.innerHTML += `<div class="doc-block-text">${formatBold(p.description)}</div>`;
  } else if (!p.assistedBy) {
    body.innerHTML += '<div class="doc-empty">Contenu vide.</div>';
  }
  detailEl.querySelector('#detail-back-btn').addEventListener('click', showList);

  listEl.classList.add('hidden');
  detailEl.classList.remove('hidden');
}

function formatLabel(f) {
  return { narrative: 'Narrative', action_table: "Tableau d'action", supplier_guide: 'Fiche fournisseur', role_guide: 'Rôle / Organisation', hybrid: 'Hybride' }[f] || f;
}

function renderBlock(b, s) {
  if (b.type === 'text') return `<div class="doc-block-text">${formatBold(b.content)}</div>`;
  if (b.type === 'list') return `<ul class="doc-block-list">${(b.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  if (b.type === 'callout') return `<div class="doc-block-callout" style="background:${s.bg};border-color:${s.accent}66;color:${s.text};">${formatBold(b.content)}</div>`;
  if (b.type === 'contact') return `<div class="doc-block-text">${(b.entries || []).map(e => `<div><b>${esc(e.label)}:</b> ${esc(e.value)}</div>`).join('')}</div>`;
  if (b.type === 'table') return (b.rows || []).map((r, i) => {
    if (isUrgentRow(r)) {
      return `<div class="doc-urgent" style="background:${COLOR_FAMILIES.clay.bg};border-color:${COLOR_FAMILIES.clay.accent}88;">
        <span class="doc-urgent-tag" style="color:${COLOR_FAMILIES.clay.text};">⚠ URGENT</span>
        <div class="doc-urgent-title">${esc(r.type)}</div>
        <div class="doc-urgent-body">${esc(r.subject)}${r.actionSteps ? ' — ' + esc(r.actionSteps) : ''}</div>
      </div>`;
    }
    return `<div class="doc-step">
      <div class="doc-step-num" style="background:${s.accent};">${i + 1}</div>
      <div class="doc-step-body"><b>${esc(r.type)}</b><br>${esc(r.subject)}${r.actionSteps ? '<br>' + esc(r.actionSteps) : ''}</div>
    </div>`;
  }).join('');
  return '';
}

function fsValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue' in v) return fsFields(v.mapValue.fields || {});
  return null;
}
function fsFields(fields) {
  const o = {};
  Object.entries(fields || {}).forEach(([k, v]) => { o[k] = fsValue(v); });
  return o;
}
function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function formatBold(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }

if (location.hash === '#cases') {
  document.querySelector('.tab-btn[data-tab="cases"]').click();
} else {
  loadActiveTab();
}
