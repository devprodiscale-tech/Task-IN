// ===== RENDER =====
function fmtDuration(sec) {
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  if (h>0) return `${h}h${String(m).padStart(2,'0')}`;
  return `${m}min`;
}

function sourceTag(s) {
  if (s==='inbound' || s==='ringover') return '<span class="source-tag src-inbound">📞↘ Appel entrant</span>';
  if (s==='outbound') return '<span class="source-tag src-outbound">📞↗ Appel sortant</span>';
  if (s==='chat' || s==='crisp') return '<span class="source-tag src-chat">💬 Crisp Chat</span>';
  if (s==='email') return '<span class="source-tag src-email">✉️ Crisp Email</span>';
  return '<span class="source-tag src-ticket">🎫 Ticket/Manuel</span>';
}

function agentCell(id) {
  const u = teamById.get(id) || TEAM.find(t=>t.id===id);
  if (!u) return '—';
  return `<div class="agent-cell"><div class="mini-avatar" style="background:${u.color}20;color:${u.color}">${u.initials}</div>${u.name}</div>`;
}

function getEntryDate(iso) {
  if (!iso) return null;
  if (entryDateCache.has(iso)) return entryDateCache.get(iso);
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  entryDateCache.set(iso, date);
  return date;
}

let dateContext = null;
function getDateContext() {
  const now = new Date();
  const dayKey = now.toDateString();
  if (dateContext && dateContext.dayKey === dayKey) return dateContext;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  dateContext = {
    dayKey,
    weekStartMs: weekStart.getTime(),
    month: now.getMonth(),
    year: now.getFullYear(),
  };
  return dateContext;
}

function isToday(iso) {
  const d = getEntryDate(iso);
  return !!d && d.toDateString() === getDateContext().dayKey;
}

function isThisWeek(iso) {
  const d = getEntryDate(iso);
  return !!d && d.getTime() >= getDateContext().weekStartMs;
}

let filterCache = { key: '', entriesRef: null, value: [] };

function invalidateFilterCache() {
  filterCache.key = '';
  filterCache.entriesRef = null;
}

function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    requestAnimationFrame(renderAll);
  }, 160);
}

// ===== P1+P2 : BOUTON TOGGLE APPLIQUER / RÉINITIALISER =====
let dateFilterApplied = false;

function onDateInputChange() {
  // Dès que l'utilisateur modifie une date, passer en état "Appliquer"
  dateFilterApplied = false;
  const btn = document.getElementById('date-action-btn');
  if (btn) { btn.textContent = 'Appliquer'; btn.className = 'date-action-btn pending'; }
  const from = document.getElementById('filter-date-from').value;
  const to   = document.getElementById('filter-date-to').value;
  const el   = document.getElementById('date-range-label');
  if (el) el.textContent = (from || '…') + (from || to ? ' → ' : '') + (to || (from ? '…' : ''));
}

function onDateActionBtn() {
  if (!dateFilterApplied) {
    // État 1 → Appliquer
    dateFilterApplied = true;
    const btn = document.getElementById('date-action-btn');
    if (btn) { btn.textContent = '✕ Réinitialiser'; btn.className = 'date-action-btn applied'; }
    applyDateFilter();
  } else {
    // État 2 → Réinitialiser
    resetDateFilters();
  }
}

function applyDateFilter() {
  updateDateRangeLabel();
  renderAll();
  // Recalculer leaderboard et vue globale sur la plage sélectionnée
  if (currentUser && (currentUser.role === 'supervisor' || currentUser.role === 'admin')) {
    renderSupKpis();
    renderLeaderboard();
    if (document.getElementById('mosaic-grid')) renderMosaicKpis();
  }
}

function resetDateFilters() {
  dateFilterApplied = false;
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  const el = document.getElementById('date-range-label');
  if (el) el.textContent = '';
  const btn = document.getElementById('date-action-btn');
  if (btn) { btn.textContent = 'Appliquer'; btn.className = 'date-action-btn pending'; }
  renderAll();
  if (currentUser && (currentUser.role === 'supervisor' || currentUser.role === 'admin')) {
    renderSupKpis();
    renderLeaderboard();
    if (document.getElementById('mosaic-grid')) renderMosaicKpis();
  }
}

function updateDateRangeLabel() {
  const from = document.getElementById('filter-date-from').value;
  const to   = document.getElementById('filter-date-to').value;
  const el   = document.getElementById('date-range-label');
  if (!el) return;
  if (from || to) {
    const fmt = v => v ? new Date(v+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}) : '…';
    el.textContent = fmt(from) + ' → ' + fmt(to);
  } else {
    el.textContent = '';
  }
}

function getFiltered() {
  const source = document.getElementById('filter-source').value;
  let agent = document.getElementById('filter-agent').value;
  const treatment = document.getElementById('filter-treatment')?.value || '';
  const search = document.getElementById('search-input').value.toLowerCase();
  const fromVal = document.getElementById('filter-date-from')?.value;
  const toVal = document.getElementById('filter-date-to')?.value;
  const fromDate = fromVal ? new Date(fromVal + 'T00:00:00') : null;
  const toDate = toVal ? new Date(toVal + 'T23:59:59') : null;
  updateDateRangeLabel();

  const fInb = document.getElementById('f-inb')?.value.toLowerCase() || '';
  const fStart = document.getElementById('f-start')?.value.toLowerCase() || '';
  const fSrc = document.getElementById('f-src')?.value || '';
  const fDescTbl = document.getElementById('f-desc-tbl')?.value.toLowerCase() || '';
  const fAgt = document.getElementById('f-agt')?.value || '';
  const fDur = document.getElementById('f-dur')?.value.toLowerCase() || '';

  const filterKey = JSON.stringify({ source, agent, treatment, search, fromVal, toVal, currentView, dateFilterApplied, fInb, fStart, fSrc, fDescTbl, fAgt, fDur, user: currentUser?.id || '' });
  if (filterCache.entriesRef === entries && filterCache.key === filterKey) return filterCache.value;

  let list = entries;
  if (currentUser.role === 'agent') { agent = currentUser.id; }

  if (currentView === 'today') list = list.filter(e=>isToday(e.startTimeStr));
  else if (currentView === 'week') list = list.filter(e=>isThisWeek(e.startTimeStr));

  const filtered = list.filter(e => {
    const dt = getEntryDate(e.startTimeStr);
    if (!dt) return false;

    if (fromDate && dt < fromDate) return false;
    if (toDate && dt > toDate) return false;
    if (source && e.source!==source) return false;
    if (agent && e.agent!==agent) return false;
    if (treatment && e.treatment!==treatment && !e.desc.includes(treatment)) return false;
    if (search && !e.desc.toLowerCase().includes(search)) return false;
    if (fInb && !(e.inboundTime||'--:--').toLowerCase().includes(fInb)) return false;
    if (fStart) {
      const startStr = dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
      if (!startStr.includes(fStart)) return false;
    }
    if (fSrc && e.source !== fSrc) return false;
    if (fDescTbl && !e.desc.toLowerCase().includes(fDescTbl)) return false;
    if (fAgt && e.agent !== fAgt) return false;
    if (fDur && !(`${Math.ceil(e.durationSec / 60)} min`).includes(fDur)) return false;
    return true;
  });
  filterCache = { key: filterKey, entriesRef: entries, value: filtered };
  return filtered;
}

function renderAll() {
  const filtered = getFiltered();
  document.getElementById('entry-count').textContent = filtered.length + ' entrée' + (filtered.length!==1?'s':'');
  renderStats(filtered);
  renderTable(filtered);
}

// ===== VUE GLOBALE : période + agent individuel =====
let supPeriod = 'day';

function setSupPeriod(p, btn) {
  supPeriod = p;
  document.querySelectorAll('.sup-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderSupKpis();
  // P2 : synchroniser le leaderboard sur la même période
  lbPeriod = p;
  document.querySelectorAll('.lb-period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lbp === p);
  });
  renderLeaderboard();
}

function getSupEntries() {
  const now = new Date();
  const agentId = document.getElementById('sup-agent-filter')?.value || '';
  let pool = entries;
  if (agentId) pool = pool.filter(e => e.agent === agentId);
  // Si filtre date appliqué, il prime
  const fromVal = document.getElementById('filter-date-from')?.value;
  const toVal   = document.getElementById('filter-date-to')?.value;
  if (dateFilterApplied && (fromVal || toVal)) {
    const fromDate = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const toDate   = toVal   ? new Date(toVal   + 'T23:59:59') : null;
    return pool.filter(e => {
      const d = getEntryDate(e.startTimeStr);
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }
  if (supPeriod === 'day')   return pool.filter(e => isToday(e.startTimeStr));
  if (supPeriod === 'week')  return pool.filter(e => isThisWeek(e.startTimeStr));
  if (supPeriod === 'month') return pool.filter(e => {
    const d = getEntryDate(e.startTimeStr);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  return pool;
}

function renderSupKpis() {
  const pool = getSupEntries();
  const agentId = document.getElementById('sup-agent-filter')?.value || '';
  const agentObj = agentId ? (teamById.get(agentId) || TEAM.find(u => u.id === agentId)) : null;

  // Label contextuel
  const periodLabels = { day: 'Aujourd\'hui', week: 'Cette semaine', month: 'Ce mois' };
  const scopeLabel = agentObj ? agentObj.name : 'Équipe';
  const el = document.getElementById('sup-period-label');
  if (el) el.textContent = `${scopeLabel} · ${periodLabels[supPeriod] || ''}`;

  // Label du stat-card total
  const totalLabel = document.getElementById('sup-s-total-label');
  if (totalLabel) totalLabel.textContent = `Total (${periodLabels[supPeriod] || ''})`;

  const kpi = calcKpiSet(pool);
  document.getElementById('sup-s-total').textContent = kpi.total;
  document.getElementById('sup-s-dmt').textContent   = kpi.dmt;
  document.getElementById('sup-s-frt').textContent   = kpi.frt;
  document.getElementById('sup-s-count').textContent = kpi.count;
}

// Fonction calcKpiSet extraite — partagée avec renderStats et renderLeaderboard
function calcKpiSet(list) {
  if (!list.length) return { total: '0h00', dmt: '0min', frt: '--', count: 0 };
  let totalSec = 0, validFrtSec = 0, frtCount = 0;
  list.forEach(e => {
    totalSec += e.durationSec;
    if (e.inboundTime && e.inboundTime !== '--:--') {
      const [inH, inM] = e.inboundTime.split(':').map(Number);
      if (!isNaN(inH) && !isNaN(inM)) {
        const startDt = new Date(e.startTimeStr);
        const inDt = new Date(startDt);
        inDt.setHours(inH, inM, 0, 0);
        const diff = Math.floor((startDt - inDt) / 1000);
        if (diff >= 0 && diff < 86400) { validFrtSec += diff; frtCount++; }
      }
    }
  });
  return {
    total: fmtDuration(totalSec),
    dmt: Math.floor((totalSec / list.length) / 60) + 'min',
    frt: frtCount > 0 ? Math.floor((validFrtSec / frtCount) / 60) + 'min' : '--',
    count: list.length
  };
}

function renderStats(filtered) {
  let baseEntries = entries;
  if (currentUser.role === 'agent') {
    baseEntries = entries.filter(e => e.agent === currentUser.id);
  }
  const todayEntries = baseEntries.filter(e => isToday(e.startTimeStr));

  const myKpi = calcKpiSet(todayEntries);
  document.getElementById('s-total').textContent = myKpi.total;
  document.getElementById('s-dmt').textContent   = myKpi.dmt;
  document.getElementById('s-frt').textContent   = myKpi.frt;
  document.getElementById('s-count').textContent = myKpi.count;

  // FEAT 2+3 : barres de progression + historique 7j
  if (currentUser.role === 'agent') {
    // C6 : passer les valeurs numériques brutes pour que parseMinVal fonctionne correctement
    const totalMin = Math.round(todayEntries.reduce((s,e)=>s+e.durationSec,0) / 60);
    const dmtMin   = todayEntries.length ? Math.floor(todayEntries.reduce((s,e)=>s+e.durationSec,0) / todayEntries.length / 60) : 0;
    const frtVals  = todayEntries.reduce((acc,e) => {
      if (e.inboundTime && e.inboundTime !== '--:--') {
        const [ih,im] = e.inboundTime.split(':').map(Number);
        if (!isNaN(ih)&&!isNaN(im)) {
          const sd=new Date(e.startTimeStr); const ind=new Date(sd); ind.setHours(ih,im,0,0);
          const diff=Math.floor((sd-ind)/1000);
          if (diff>=0&&diff<86400) acc.push(Math.floor(diff/60));
        }
      }
      return acc;
    }, []);
    const frtMin = frtVals.length ? Math.round(frtVals.reduce((s,v)=>s+v,0)/frtVals.length) : null;
    renderKpiProgressBars(totalMin, dmtMin, frtMin, todayEntries.length);
    renderAgentHistory();
  }

  // Accordéon Sup/Admin — délégué à renderSupKpis()
  if (currentUser.role === 'supervisor' || currentUser.role === 'admin') {
    renderSupKpis();
  }
}

function renderTable(filtered) {
  const body = document.getElementById('entries-body');
  const canEdit = currentUser.role === 'admin';
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty">Aucune entrée pour cette période.</div></td></tr>';
    return;
  }
  body.innerHTML = filtered.map(e => {
    let sourceKey = 'manual';
    if(e.source==='ringover'||e.source==='inbound'||e.source==='outbound') sourceKey = 'ringover';
    else if(e.source==='crisp'||e.source==='chat'||e.source==='email') sourceKey = 'crisp';
    const dmt = sourceDMT[sourceKey] ?? sourceDMT.manual;
    const ratio = dmt ? e.durationSec / dmt : 0;
    let durClass = '';
    if (ratio > 1.2) durClass = 'dur-over';
    else if (ratio > 1) durClass = 'dur-warn';
    const startDate = getEntryDate(e.startTimeStr);
    const startStr = startDate ? startDate.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
    return `<tr>
      <td class="dur-cell" style="font-weight:600">${e.inboundTime || '--:--'}</td>
      <td class="dur-cell">${startStr}</td>
      <td>${sourceTag(e.source)}</td>
      <td id="desc-${e.id}" style="width:35%">${e.desc}</td>
      <td>${agentCell(e.agent)}</td>
      <td class="dur-cell ${durClass}" title="DMT cible : ${fmtDuration(dmt)}">${Math.ceil(e.durationSec/60)} min</td>
      <td><div class="row-actions">
        ${canEdit ? `<button class="icon-btn" onclick="editEntry('${e.id}')" title="Modifier">✎</button>` : ''}
        ${canEdit ? `<button class="icon-btn" onclick="deleteEntry('${e.id}')" title="Supprimer">✕</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

function editEntry(id) {
  if (currentUser.role !== 'admin') return;
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  const cell = document.getElementById('desc-' + id);
  const current = entry.desc;
  cell.innerHTML = `<input class="form-input" id="edit-input-${id}" value="${current.replace(/"/g,'&quot;')}" placeholder="Ex: Ticket #68554..." style="padding:5px 8px; font-size:13px; width:100%; box-sizing:border-box;" />`;
  const input = document.getElementById('edit-input-' + id);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  const save = async () => {
    const newDesc = input.value.trim() || current;
    entry.desc = newDesc;
    cell.textContent = newDesc;
    saveTimeEntry(entry);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
}

function toggleAdminSidebar(force) {
  const collapsed = typeof force === 'boolean' ? force : !document.body.classList.contains('admin-sidebar-collapsed');
  document.body.classList.toggle('admin-sidebar-collapsed', collapsed);
  try { localStorage.setItem('taskin_admin_sidebar_collapsed', collapsed ? '1' : '0'); } catch (_) {}
  const toggle = document.querySelector('.admin-sidebar-toggle');
  if (toggle) {
    const icon = toggle.querySelector('.admin-sidebar-toggle-icon');
    const label = toggle.querySelector('.admin-sidebar-toggle-label');
    if (icon) icon.textContent = collapsed ? '›' : '‹';
    if (label) label.textContent = collapsed ? 'Développer' : 'Réduire';
    if (!icon && !label) toggle.textContent = collapsed ? '›' : '‹';
    toggle.setAttribute('aria-label', collapsed ? 'Développer le menu Admin' : 'Réduire le menu Admin');
    toggle.title = collapsed ? 'Développer le menu' : 'Réduire le menu';
  }
}

const roleTabItems = {
  supervisor: [['supervision','👁️ Supervision'],['team','👥 Équipe'],['leaderboard','📊 Performance']],
  formateur: [['training','🎓 Formation'],['documentation','📄 Documentation']],
};
function renderRoleTabs(role) {
  const rail=document.getElementById('role-tabs'); if(!rail) return;
  const supervisor=role==='supervisor';
  document.querySelector('#supervision-panel .sv-tabs')?.classList.add('hidden');
  const title=document.getElementById('role-page-title'), subtitle=document.getElementById('role-page-subtitle'), context=document.getElementById('role-context-label'), eyebrow=document.getElementById('role-page-eyebrow');
  if(title) title.textContent=supervisor?'Supervision opérationnelle':'Espace Formation';
  if(subtitle) subtitle.textContent=supervisor?'Suis les performances, les cas complexes et les alertes de l’équipe.':'Centralise les parcours, les quiz, les procédures et la montée en compétence.';
  if(context) context.textContent=supervisor?'Équipe en direct':'Learning & Knowledge';
  if(eyebrow) eyebrow.textContent=supervisor?'SUPERVISION':'FORMATION';
  if (supervisor) {
    const subViews=[['overview','🧭 Vue d’ensemble'],['escalations','🚩 Cas complexes'],['reviews','🎧 Grille d’écoute'],['coaching','🤝 Coaching 1:1'],['reporting','📊 Reporting']];
    const workspaceViews=[['team','👥 Équipe'],['leaderboard','🏆 Classement'],['documentation','📄 Documentation']];
    const items=[...subViews,...workspaceViews];
    rail.innerHTML=items.map(([view,label])=>{
      const isSubView=subViews.some(([id])=>id===view);
      return isSubView
        ? `<button type="button" class="role-tab sv-tab-btn" id="sv-tab-${view}" data-role-tab="${view}">${label}</button>`
        : `<button type="button" class="role-tab" data-role-tab="${view}">${label}</button>`;
    }).join('');
  } else {
    rail.innerHTML=(roleTabItems[role]||[]).map(([view,label])=>`<button type="button" class="role-tab" data-role-tab="${view}">${label}</button>`).join('');
  }
  rail.querySelectorAll('[data-role-tab]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const view = button.dataset.roleTab;
      if (supervisor && ['overview','escalations','reviews','coaching','reporting'].includes(view)) {
        // Le rail peut être visible avant le chargement différé de Supervision.
        // Le premier clic charge le module puis rejoue l’action au lieu d’être perdu.
        void (async () => {
          if (typeof svSwitchSubTab !== 'function' && typeof loadModule === 'function') {
            await loadModule('10-supervision.js');
          }
          if (typeof svSwitchSubTab === 'function') svSwitchSubTab(view);
        })();
      } else if (typeof switchTab === 'function') {
        void switchTab(view, button);
      }
    });
  });
  setRoleTabActive(currentView);
}
function setRoleTabActive(view){
  document.querySelectorAll('[data-role-tab]').forEach(link => {
    const active = link.dataset.roleTab === view;
    link.classList.toggle('active', active);
    link.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function setAdminSidebarActive(view) {
  const activeView = view === 'admin-training' ? 'admin-training' : view;
  document.querySelectorAll('[data-admin-nav]').forEach(link => link.classList.toggle('active', link.dataset.adminNav === activeView));
}

function taskinViewKey(role = currentUser?.role) { return `taskin_view_${role || 'guest'}`; }
function getPersistedTaskinView(role = currentUser?.role) {
  try {
    const value = sessionStorage.getItem(taskinViewKey(role));
    const allowed = role === 'admin'
      ? ['admin','workflow-kpi','stat','quality','admin-training','admin-settings','team']
      : ['home','team','today','documentation','supervision','training','leaderboard'];
    return allowed.includes(value) ? value : null;
  } catch (_) { return null; }
}
function rememberTaskinView(view, replace = false) {
  try { sessionStorage.setItem(taskinViewKey(), view); } catch (_) {}
  const state = { taskin: true, view };
  if (replace) history.replaceState(state, '', window.location.href);
  else if (history.state?.taskin !== true || history.state.view !== view) history.pushState(state, '', window.location.href);
}
window.addEventListener('popstate', event => {
  const view = event.state?.taskin ? event.state.view : getPersistedTaskinView();
  if (view && currentUser) switchTab(view, document.querySelector(`[data-admin-nav="${view}"], #tab-${view}`), { history: false });
});
let navigationSequence = 0;
const adminSubPanelIds = ['admin-overview-panel','admin-workflow-panel','admin-stat-panel','admin-quality-panel','admin-training-panel','admin-settings-panel'];

function hideAdminSubPanels() {
  adminSubPanelIds.forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

async function preloadAdminInterfaces() {
  if (!currentUser || currentUser.role !== 'admin') return;
  await Promise.all(['05-training.js','09-documentation.js','10-supervision.js'].map(name => loadModule(name)));
  const renders = [];
  const panelReady = id => document.getElementById(id)?.dataset.adminReady === '1';
  if (!panelReady('admin-overview-panel')) renders.push(['admin-overview-panel', async () => renderAdminOverview(await loadActiveTimers())]);
  if (!panelReady('admin-workflow-panel')) renders.push(['admin-workflow-panel', () => adminWorkflowRender()]);
  if (!panelReady('admin-stat-panel')) renders.push(['admin-stat-panel', () => adminStatRender()]);
  if (!panelReady('admin-quality-panel')) renders.push(['admin-quality-panel', () => adminQualityRender()]);
  if (!panelReady('admin-training-panel')) renders.push(['admin-training-panel', () => adminTrainingRender()]);
  if (!panelReady('admin-settings-panel')) renders.push(['admin-settings-panel', () => adminSettingsRender()]);
  const results = await Promise.allSettled(renders.map(([, render]) => Promise.resolve().then(render)));
  results.forEach((result, index) => {
    const [id] = renders[index];
    const panel = document.getElementById(id);
    if (result.status === 'fulfilled') panel?.setAttribute('data-admin-ready', '1');
    else {
      panel?.removeAttribute('data-admin-ready');
      console.error(`Rendu Admin impossible pour ${id}:`, result.reason);
    }
  });
}

// Point 5 : switchTab renforcé — guards stricts pour agent et non-admin
async function switchTab(view, btn, options = {}) {
  const sequence = ++navigationSequence;
  const adminSubViews = {
    'workflow-kpi': { panel: 'admin-workflow-panel', render: () => adminWorkflowRender() },
    'stat': { panel: 'admin-stat-panel', render: () => adminStatRender() },
    'quality': { panel: 'admin-quality-panel', render: async () => { await loadModule('10-supervision.js'); if (typeof svInit === 'function') await svInit(); return adminQualityRender(); } },
    'admin-training': { panel: 'admin-training-panel', render: () => adminTrainingRender() },
    'admin-settings': { panel: 'admin-settings-panel', render: () => adminSettingsRender() },
  };
  if (adminSubViews[view]) {
    if (!currentUser || currentUser.role !== 'admin') return;
    setAdminSidebarActive(view);
    currentView = view;
    if (options.history !== false) rememberTaskinView(view);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    hideAdminSubPanels();
    ['admin-panel','team-live-panel','leaderboard-panel','documentation-panel','supervision-panel','training-panel','channel-matrix-panel'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    // Le nouvel arbre admin-* est la seule architecture active.
    document.getElementById('admin-panel')?.classList.add('hidden');
    document.querySelector('.toolbar')?.classList.add('hidden');
    document.querySelector('.entries-table-wrap')?.classList.add('hidden');
    document.getElementById('date-filter-bar')?.classList.add('hidden');
    ['admin-workflow-panel','admin-stat-panel','admin-quality-panel','admin-training-panel','admin-settings-panel'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(adminSubViews[view].panel)?.classList.remove('hidden');
    const panel = document.getElementById(adminSubViews[view].panel);
    if (panel?.dataset.adminReady !== '1') {
      await adminSubViews[view].render();
      panel?.setAttribute('data-admin-ready', '1');
    }
    if (sequence !== navigationSequence || currentView !== view) return;
    return;
  }
  if (currentUser.role === 'agent' && (view === 'admin' || view === 'supervision' || view === 'team' || view === 'leaderboard')) return;
  if (currentUser.role !== 'admin' && view === 'admin') return;
  if (currentUser.role === 'formateur' && (view === 'supervision' || view === 'admin')) return;

  currentView = view;
  if (options.history !== false) rememberTaskinView(view);
  if (currentUser.role === 'admin') setAdminSidebarActive(view);
  if (currentUser.role === 'supervisor' || currentUser.role === 'formateur') setRoleTabActive(view);
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.taskin-view-enter').forEach(el => el.classList.remove('taskin-view-enter'));
  requestAnimationFrame(() => {
    const routePanel = document.getElementById(view === 'documentation' ? 'documentation-panel' : view === 'training' ? 'training-panel' : view === 'leaderboard' ? 'leaderboard-panel' : view === 'team' ? 'team-live-panel' : null);
    routePanel?.classList.add('taskin-view-enter');
  });

  const isAdminView = view === 'admin';
  const isHomeView = view === 'home';
  const isTeamView = view === 'team';
  const isLeaderboard = view === 'leaderboard';
  const isDocView = view === 'documentation';
  const isSupervisionView = view === 'supervision';
  const isTrainingView = view === 'training';
  // La matrice analytique appartient à Statistiques, pas à Équipe ni au Hub.
  const isChannelView = false;
  const showTable = !isAdminView && !isHomeView && !isLeaderboard && !isDocView && !isSupervisionView && !isTrainingView;

  document.querySelector('.toolbar').classList.toggle('hidden', !showTable);
  document.querySelector('.entries-table-wrap').classList.toggle('hidden', !showTable);
  document.getElementById('admin-panel')?.classList.add('hidden');
  document.getElementById('team-live-panel').classList.toggle('hidden', !isHomeView && !isTeamView);
  document.getElementById('leaderboard-panel').classList.toggle('hidden', !isLeaderboard && !isTeamView);
  document.getElementById('documentation-panel').classList.toggle('hidden', !isDocView);
  document.getElementById('supervision-panel').classList.toggle('hidden', !isSupervisionView);
  document.getElementById('training-panel').classList.toggle('hidden', !isTrainingView);
  document.getElementById('channel-matrix-panel').classList.toggle('hidden', !isChannelView);
  document.getElementById('mosaic-section')?.classList.toggle('hidden', isTeamView);
  document.querySelectorAll('#team-live-panel .team-live-edit-only').forEach(el => el.classList.toggle('hidden', isTeamView || currentUser.role === 'agent'));
  hideAdminSubPanels();
  if (isAdminView) document.getElementById('admin-overview-panel')?.classList.remove('hidden');
  const adminOverviewPanel = document.getElementById('admin-overview-panel');
  if (adminOverviewPanel) adminOverviewPanel.classList.toggle('hidden', !isAdminView);
  document.getElementById('date-filter-bar').classList.toggle('hidden', isDocView || isSupervisionView || isTrainingView);

  if (isAdminView) {
    const panel = document.getElementById('admin-overview-panel');
    if (panel?.dataset.adminReady !== '1') {
      renderAdminOverview(await loadActiveTimers());
      panel?.setAttribute('data-admin-ready', '1');
    }
    if (sequence !== navigationSequence || currentView !== view) return;
    return;
  }
  if (isHomeView || isTeamView) {
    await renderRoleHome(sequence);
    if (sequence !== navigationSequence || currentView !== view) return;
    if (isTeamView && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) renderLeaderboard();
    return;
  }
  if (isLeaderboard) { renderLeaderboard(); return; }
  if (isDocView) {
    await loadModule('09-documentation.js');
    if (sequence !== navigationSequence || currentView !== view) return;
    docRenderList();
    return;
  }
  if (isSupervisionView) {
    await loadModule('09-documentation.js');
    await loadModule('10-supervision.js');
    if (sequence !== navigationSequence || currentView !== view) return;
    await svInit();
    return;
  }
  if (isTrainingView) {
    await loadModule('05-training.js');
    await loadModule('09-documentation.js');
    if (sequence !== navigationSequence || currentView !== view) return;
    renderTrainingHub();
    return;
  }
  renderAll();
}

// ===== ROLE HOME =====
async function renderRoleHome(routeSequence) {
  const activeTimers = await loadActiveTimers();
  if (routeSequence !== undefined && (routeSequence !== navigationSequence || (currentView !== 'home' && currentView !== 'team'))) return;
  document.querySelectorAll('.admin-home-legacy').forEach(element => {
    element.classList.toggle('hidden', currentUser.role === 'admin');
  });
  if (currentUser.role === 'supervisor') { renderSupervisorBanner(activeTimers); }
  if (currentUser.role === 'admin') {
    renderAdminBanner();
    renderAdminOverview(activeTimers);
  }
  renderTeamLiveList(activeTimers);
  // P3 : mosaïque — passe les timers actifs pour les pastilles live
  renderMosaicKpis(activeTimers);
  // FEAT 3 : objectifs lisibles par Sup aussi
  renderGoalInputs();
}

function agentsOnly() { return TEAM.filter(u => u.role === 'agent'); }

function renderSupervisorBanner(activeTimers) {
  const agents = agentsOnly(); const activeIds = new Set(activeTimers.map(t => t.agentId));
  const activeAgents = agents.filter(a => activeIds.has(a.id));
  const avatarsHtml = activeAgents.slice(0,3).map(a => `<div class="role-banner-avatar" style="background:${a.color};margin-right:-8px">${a.initials}</div>`).join('') + (agents.length > 3 ? `<div class="role-banner-avatar role-banner-avatar-more">+${agents.length-3}</div>` : '');
  document.getElementById('sup-banner-avatars').innerHTML = avatarsHtml || '<div class="role-banner-avatar role-banner-avatar-more">0</div>';
  document.getElementById('sup-banner-title').textContent = `${activeAgents.length} sur ${agents.length} agents actifs`;
  const idleAgent = findLongestIdleAgent(agents, activeIds);
  document.getElementById('sup-banner-sub').textContent = idleAgent || 'Tout le monde est à jour';
  document.getElementById('sup-banner-dot').style.background = activeAgents.length > 0 ? '#3B8C6E' : '#A0AAB8';
}

function findLongestIdleAgent(agents, activeIds) {
  const idle = agents.filter(a => !activeIds.has(a.id));
  if (!idle.length) return null;
  return `${idle[0].name} inactif`;
}

function renderAdminBanner() {
  const now = new Date(); const weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay()+1); weekStart.setHours(0,0,0,0);
  const weekEntries = entries.filter(e => new Date(e.startTimeStr) >= weekStart);
  const total = weekEntries.reduce((s,e)=>s+e.durationSec,0);
  document.getElementById('adm-banner-total').textContent = fmtDuration(total);
  document.getElementById('adm-banner-title').textContent = `${agentsOnly().length} agents · ${customTreatmentTypes.length} types de traitement`;
  document.getElementById('adm-banner-sub').textContent = '';
}

function renderTeamLiveList(activeTimers) {
  const agents = agentsOnly(); document.getElementById('team-live-count').textContent = agents.length + ' agents';
  const timerByAgent = {}; activeTimers.forEach(t => timerByAgent[t.agentId] = t);
  document.getElementById('team-live-list').innerHTML = agents.map(a => {
    const t = timerByAgent[a.id];
    if (t) {
      const elapsed = Math.floor((Date.now() - t.startTime)/1000);
      const mins = Math.floor(elapsed/60); const secs = elapsed%60;
      const timeStr = mins + ':' + String(secs).padStart(2,'0');
      return `<div class="team-row" onclick="viewAgentDetail('${a.id}')" style="cursor:pointer">
        <div class="mini-avatar" style="background:${a.color}20;color:${a.color}">${a.initials}</div>
        <div class="team-row-info"><div class="team-row-name">${a.name}</div><div class="team-row-role">${t.desc}</div></div>
        <span class="team-row-timer">${timeStr}</span></div>`;
    }
    return `<div class="team-row" onclick="viewAgentDetail('${a.id}')" style="cursor:pointer">
      <div class="mini-avatar" style="background:var(--border2);color:var(--text2)">${a.initials}</div>
      <div class="team-row-info"><div class="team-row-name">${a.name}</div><div class="team-row-role" style="color:var(--text3)">Inactif</div></div>
      <span class="team-row-timer" style="color:var(--text3)">—</span></div>`;
  }).join('');
}

function viewAgentDetail(agentId) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const agentTab = document.querySelector('.tab.agent-only');
  if (agentTab) { agentTab.classList.remove('hidden'); agentTab.classList.add('active'); }
  currentView = 'today';
  document.getElementById('team-live-panel').classList.add('hidden');
  document.getElementById('admin-panel').classList.add('hidden');
  document.querySelector('.toolbar').classList.remove('hidden');
  document.querySelector('.entries-table-wrap').classList.remove('hidden');
  document.getElementById('filter-agent').value = agentId;
  renderAll();
}
