window.addEventListener('error', (e) => {
  const target = document.getElementById('docs-list');
  if (target) {
    target.innerHTML = `<div class="doc-empty">Erreur JavaScript.<br><span style="font-size:10px;color:#B0392E;">${String(e.message || e).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span></div>`;
  }
  console.error("[Task'in Documentation] uncaught error:", e.error || e.message);
});

// Les cas complexes ne sont plus dans l'extension : c'est le même système que « Remonter un ticket »
// de la web app (le pop-up y mène directement). Cette fenêtre ne garde que la documentation.
const activeTab = 'docs';
let docsCache = null;

const searchInput = document.getElementById('search-input');
const docsView = document.getElementById('docs-view');
const docsList = document.getElementById('docs-list');
const docsDetail = document.getElementById('docs-detail');

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

searchInput.addEventListener('input', () => renderCurrentList());

function showList() {
  docsList.classList.remove('hidden');
  docsDetail.classList.add('hidden');
}

function loadActiveTab() { loadDocs(); }

async function loadDocs() {
  if (docsCache) { renderCurrentList(); return; }
  docsList.innerHTML = '<div class="doc-empty">Chargement…</div>';
  try {
    const rows = await supabaseClient.request('/rest/v1/procedures?select=*&limit=300');
    docsCache = (rows || []).map(row => ({
      id: row.id,
      title: row.title || '',
      category: row.category || '',
      description: row.description || '',
      sections: row.sections || [],
      ...(row.source_metadata?.taskin || {})
    })).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    renderCurrentList();
  } catch (e) {
    console.error("[Task'in Documentation] loadDocs error:", e);
    docsList.innerHTML = `<div class="doc-empty">Erreur de chargement.<br><span style="font-size:10px;color:#B0392E;">${esc(e.message)}</span></div>`;
  }
}

function renderCurrentList() {
  const source = docsCache;
  const listEl = docsList;
  if (!source) return;

  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? source.filter(p => (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
    : source;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="doc-empty">Aucune procédure trouvée.</div>';
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
        <div class="doc-item-cat" style="color:${s.text};">${esc((p.category || '').toUpperCase())}</div>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.doc-item').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
}

function openDetail(id) {
  const source = docsCache;
  const listEl = docsList;
  const detailEl = docsDetail;
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
  if (p.sections && p.sections.length) {
    body.innerHTML += p.sections.map(b => renderBlock(b, s)).join('');
  } else if (p.description) {
    body.innerHTML += `<div class="doc-block-text">${formatBold(p.description)}</div>`;
  } else {
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

function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function formatBold(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }

loadActiveTab();
