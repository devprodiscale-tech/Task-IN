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
  return `<div class="agent-cell"><div class="mini-avatar" style="background:${u.color}20;color:${u.color}">${escHtml(u.initials)}</div>${escHtml(u.name)}</div>`;
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
  // Les cartes KPI Sup ne sont pas présentes sur tous les écrans : écriture sans erreur.
  [['sup-s-total', kpi.total], ['sup-s-dmt', kpi.dmt], ['sup-s-frt', kpi.frt], ['sup-s-count', kpi.count]].forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
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
    const startTime = startDate ? startDate.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
    // Hors aujourd'hui, le jour précède l'heure (sinon « Cette semaine » mélange des heures sans date).
    const startStr = startDate && !isToday(e.startTimeStr) ? `${startDate.toLocaleDateString('fr-FR', {weekday:'short', day:'numeric'}).replace('.', '')} · ${startTime}` : startTime;
    return `<tr>
      <td class="dur-cell" style="font-weight:600">${escHtml(e.inboundTime || '--:--')}</td>
      <td class="dur-cell">${startStr}</td>
      <td>${sourceTag(e.source)}</td>
      <td id="desc-${e.id}" style="width:35%">${escHtml(e.desc)}</td>
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
  cell.innerHTML = `<input class="form-input" id="edit-input-${id}" value="${escHtml(current)}" placeholder="Ex: Ticket #68554..." style="padding:5px 8px; font-size:13px; width:100%; box-sizing:border-box;" />`;
  const input = document.getElementById('edit-input-' + id);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  let finished = false;
  const save = async () => {
    if (finished) return;
    finished = true;
    const newDesc = input.value.trim() || current;
    cell.textContent = newDesc;
    if (newDesc === current) return;
    entry.desc = newDesc;
    // Mise à jour de l'entrée existante (et non création d'une nouvelle, refusée comme doublon).
    try {
      await window.taskinDataProviders.supabase.updateTimeEntry(id, { description: newDesc });
      if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
    } catch (error) {
      console.error('Modification de la description impossible:', error);
      entry.desc = current;
      if (cell.isConnected) cell.textContent = current;
      alert('La modification n’a pas pu être enregistrée. Vérifie ta connexion puis réessaie.');
    }
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

const ADMIN_SIDEBAR_NARROW = '(max-width: 850px)';
function adminSidebarIsNarrow() { return window.matchMedia?.(ADMIN_SIDEBAR_NARROW).matches === true; }

// options.instant : applique l'état sans animation (restauration au chargement).
// options.persist : false pour ne pas mémoriser (repli automatique sur petit écran).
function toggleAdminSidebar(force, options = {}) {
  const body = document.body;
  const collapsed = typeof force === 'boolean' ? force : !body.classList.contains('admin-sidebar-collapsed');
  if (options.instant) body.classList.add('admin-sidebar-instant');
  body.classList.toggle('admin-sidebar-collapsed', collapsed);
  if (options.instant) requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('admin-sidebar-instant')));
  if (options.persist !== false && !adminSidebarIsNarrow()) {
    try { localStorage.setItem('taskin_admin_sidebar_collapsed', collapsed ? '1' : '0'); } catch (_) {}
  }
  const toggle = document.querySelector('.admin-sidebar-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Développer le menu Admin' : 'Réduire le menu Admin');
    toggle.dataset.tooltip = collapsed ? 'Développer le menu' : 'Réduire le menu';
  }
  adminSidebarHideTooltip();
  adminSidebarSetupTooltips();
}

// Info-bulles des icônes quand la sidebar est repliée (la sidebar coupe tout débordement).
let adminSidebarTooltipEl = null;
function adminSidebarHideTooltip() { adminSidebarTooltipEl?.classList.remove('visible'); }
function adminSidebarShowTooltip(target) {
  if (!document.body.classList.contains('admin-sidebar-collapsed')) return;
  const text = target.dataset.tooltip || target.querySelector('.admin-sidebar-label')?.textContent?.trim();
  if (!text) return;
  if (!adminSidebarTooltipEl) {
    adminSidebarTooltipEl = document.createElement('div');
    adminSidebarTooltipEl.className = 'admin-sidebar-tooltip';
    adminSidebarTooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(adminSidebarTooltipEl);
  }
  const rect = target.getBoundingClientRect();
  adminSidebarTooltipEl.textContent = text;
  adminSidebarTooltipEl.style.left = `${Math.round(rect.right + 10)}px`;
  adminSidebarTooltipEl.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
  adminSidebarTooltipEl.classList.add('visible');
}
function adminSidebarSetupTooltips() {
  const sidebar = document.getElementById('admin-sidebar');
  if (!sidebar || sidebar.dataset.tooltipsReady) return;
  sidebar.dataset.tooltipsReady = '1';
  // La sidebar démarre sous le topbar, dont la hauteur varie (retour à la ligne sur mobile).
  const topbar = document.querySelector('.topbar');
  if (topbar && 'ResizeObserver' in window) {
    new ResizeObserver(() => document.documentElement.style.setProperty('--admin-topbar-h', `${topbar.offsetHeight}px`)).observe(topbar);
  }
  const targetOf = event => event.target.closest?.('.admin-sidebar-link, .admin-sidebar-toggle');
  sidebar.addEventListener('mouseover', event => { const t = targetOf(event); if (t) adminSidebarShowTooltip(t); });
  sidebar.addEventListener('focusin', event => { const t = targetOf(event); if (t && t.matches(':focus-visible')) adminSidebarShowTooltip(t); });
  sidebar.addEventListener('mouseleave', adminSidebarHideTooltip);
  sidebar.addEventListener('focusout', adminSidebarHideTooltip);
  sidebar.addEventListener('scroll', adminSidebarHideTooltip, { passive: true });
  sidebar.addEventListener('click', event => {
    adminSidebarHideTooltip();
    // Sur petit écran, la sidebar dépliée recouvre le contenu : on la replie après navigation.
    if (event.target.closest('.admin-sidebar-link') && adminSidebarIsNarrow() && !document.body.classList.contains('admin-sidebar-collapsed')) toggleAdminSidebar(true, { persist: false });
  });
}

const roleTabItems = {
  supervisor: [['supervision','Supervision'],['team','Équipe'],['leaderboard','Performance']],
  formateur: [['training','Formation'],['documentation','Documentation']],
};
// Icônes des onglets métier : même style SVG que l'espace Agent (plus d'emojis).
const ROLE_TAB_SVG = {
  supervision: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  overview: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
  escalations: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  reviews: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  coaching: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  reporting: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  sessions: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  missed: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/><path d="m16 2 6 6M22 2l-6 6"/>',
  pilotage: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  results: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  leaderboard: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  documentation: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  training: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
};
function roleTabLabel(view, label) {
  return `<svg class="role-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ROLE_TAB_SVG[view] || ''}</svg><span>${label}</span>`;
}
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
    const subViews=[['overview','Vue d’ensemble'],['escalations','Cas complexes'],['reviews','Grille d’écoute'],['coaching','Coaching 1:1'],['reporting','Reporting'],['sessions','Connexions']];
    const workspaceViews=[['pilotage','Pilotage 360°'],['results','Résultats'],['missed','Appels manqués'],['team','Équipe'],['leaderboard','Classement'],['documentation','Documentation']];
    const items=[...subViews,...workspaceViews];
    rail.innerHTML=items.map(([view,label])=>{
      const isSubView=subViews.some(([id])=>id===view);
      return isSubView
        ? `<button type="button" class="role-tab sv-tab-btn" id="sv-tab-${view}" data-role-tab="${view}">${roleTabLabel(view, label)}</button>`
        : `<button type="button" class="role-tab" data-role-tab="${view}">${roleTabLabel(view, label)}</button>`;
    }).join('');
  } else {
    rail.innerHTML=(roleTabItems[role]||[]).map(([view,label])=>`<button type="button" class="role-tab" data-role-tab="${view}">${roleTabLabel(view, label)}</button>`).join('');
  }
  rail.querySelectorAll('[data-role-tab]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const view = button.dataset.roleTab;
      if (supervisor && ['overview','escalations','reviews','coaching','reporting','sessions'].includes(view)) {
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

// Pages de détail ouvertes depuis l’espace Admin : elles gardent leur rubrique
// parente allumée dans la sidebar pour que l’admin sache toujours où il se trouve.
const ADMIN_NAV_PARENT = { results: 'stat', missed: 'stat', pilotage: 'stat', training: 'admin-training', documentation: 'admin-training', supervision: 'quality', leaderboard: 'team', today: 'team' };
function setAdminSidebarActive(view) {
  const activeView = ADMIN_NAV_PARENT[view] || view;
  document.querySelectorAll('[data-admin-nav]').forEach(link => {
    const active = link.dataset.adminNav === activeView;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}

// Chaque changement de page repart du haut : sans cela, la page suivante s’ouvrait
// à la hauteur de défilement de la précédente et paraissait coupée.
function resetViewScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

function taskinViewKey(role = currentUser?.role) { return `taskin_view_${role || 'guest'}`; }
function getPersistedTaskinView(role = currentUser?.role) {
  try {
    const value = sessionStorage.getItem(taskinViewKey(role));
    const allowed = role === 'admin'
      ? ['admin','workflow-kpi','stat','results','missed','pilotage','quality','admin-training','admin-settings','agent-sessions','team']
      : ['home','team','today','documentation','supervision','training','leaderboard','results','missed','pilotage'];
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
const adminSubPanelIds = ['admin-overview-panel','admin-workflow-panel','admin-stat-panel','daily-results-panel','missed-calls-panel','pilotage-panel','admin-quality-panel','admin-training-panel','admin-settings-panel','admin-agent-sessions-panel','admin-exports-panel'];

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

// Vues partagées entre rôles : panneau, module chargé à la demande, fonction de rendu, rôles autorisés.
// L'admin les ouvre comme sous-vues de Stat ; superviseur et agent via leurs onglets.
const TASKIN_SHARED_VIEWS = {
  results: { panel: 'daily-results-panel', module: '22-daily-results.js', render: () => renderDailyResults(), roles: ['admin', 'supervisor', 'agent'] },
  missed: { panel: 'missed-calls-panel', module: '25-missed-calls.js', render: () => renderMissedCalls(), roles: ['admin', 'supervisor', 'agent'] },
  pilotage: { panel: 'pilotage-panel', module: '28-pilotage.js', render: () => renderPilotage(), roles: ['admin', 'supervisor'] },
};

// Point 5 : switchTab renforcé — guards stricts pour agent et non-admin
async function switchTab(view, btn, options = {}) {
  const sequence = ++navigationSequence;
  // L’Admin n’a pas d’accueil « home » : sa vue d’ensemble est « admin ».
  if (currentUser?.role === 'admin' && view === 'home') view = 'admin';
  // Remonte en haut à chaque navigation (y compris re-clic sur la page active),
  // sauf lors d’un simple rafraîchissement de la vue courante (history:false, même vue).
  const viewChanged = view !== currentView || options.history !== false;
  const adminSubViews = {
    'workflow-kpi': { panel: 'admin-workflow-panel', render: () => adminWorkflowRender() },
    'stat': { panel: 'admin-stat-panel', render: () => adminStatRender() },
    // Résultats OSC : rechargés à chaque ouverture (saisies faites par un autre admin/superviseur).
    ...Object.fromEntries(Object.entries(TASKIN_SHARED_VIEWS).map(([key, v]) => [key, { panel: v.panel, always: true, render: async () => { await loadModule(v.module); return v.render(); } }])),
    // Charge les données Supervision SANS basculer sur l’écran Supervision.
    'quality': { panel: 'admin-quality-panel', render: async () => { await loadModule('10-supervision.js'); if (typeof svLoadSupervisionData === 'function') await svLoadSupervisionData(); return adminQualityRender(); } },
    'admin-training': { panel: 'admin-training-panel', render: () => adminTrainingRender() },
    'admin-settings': { panel: 'admin-settings-panel', render: () => adminSettingsRender() },
    'agent-sessions': { panel: 'admin-agent-sessions-panel', render: () => agentSessionsAdminRender() },
  };
  // « Résultats » et « Appels manqués » existent aussi pour le superviseur et l'agent (branche commune plus bas).
  if (adminSubViews[view] && !(TASKIN_SHARED_VIEWS[view] && currentUser?.role !== 'admin')) {
    if (!currentUser || currentUser.role !== 'admin') return;
    setAdminSidebarActive(view);
    currentView = view;
    if (viewChanged) resetViewScroll();
    if (options.history !== false) rememberTaskinView(view);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    hideAdminSubPanels();
    ['admin-panel','team-live-panel','leaderboard-panel','documentation-panel','supervision-panel','training-panel','channel-matrix-panel'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.querySelector('.toolbar')?.classList.add('hidden');
    document.querySelector('.entries-table-wrap')?.classList.add('hidden');
    document.getElementById('date-filter-bar')?.classList.add('hidden');
    const panel = document.getElementById(adminSubViews[view].panel);
    panel?.classList.remove('hidden');
    if (panel?.dataset.adminReady !== '1' || adminSubViews[view].always) {
      await adminSubViews[view].render();
      panel?.setAttribute('data-admin-ready', '1');
    }
    // Exports pour le management : panneau à part, tout en bas de Supervision (non effacé par le rafraîchissement en direct).
    if (view === 'workflow-kpi') {
      const exportsPanel = document.getElementById('admin-exports-panel');
      exportsPanel?.classList.remove('hidden');
      if (exportsPanel && exportsPanel.dataset.adminReady !== '1') { await loadModule('29-exports.js'); await window.taskinExportsMount?.(exportsPanel); exportsPanel.setAttribute('data-admin-ready', '1'); }
    }
    return;
  }
  if (currentUser.role === 'agent' && (view === 'admin' || view === 'supervision' || view === 'team' || view === 'leaderboard')) return;
  if (currentUser.role !== 'admin' && view === 'admin') return;
  if (currentUser.role === 'formateur' && (view === 'supervision' || view === 'admin')) return;
  if (TASKIN_SHARED_VIEWS[view] && !TASKIN_SHARED_VIEWS[view].roles.includes(currentUser.role)) return;

  currentView = view;
  if (viewChanged) resetViewScroll();
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
  const sharedView = TASKIN_SHARED_VIEWS[view] || null;
  // La matrice analytique appartient à Statistiques, pas à Équipe ni au Hub.
  const isChannelView = false;
  const showTable = !isAdminView && !isHomeView && !isLeaderboard && !isDocView && !isSupervisionView && !isTrainingView && !sharedView;

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
  document.getElementById('date-filter-bar').classList.toggle('hidden', isDocView || isSupervisionView || isTrainingView || !!sharedView);
  if (sharedView) {
    document.getElementById(sharedView.panel)?.classList.remove('hidden');
    await loadModule(sharedView.module);
    if (sequence !== navigationSequence || currentView !== view) return;
    await sharedView.render();
    return;
  }

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
  const avatarsHtml = activeAgents.slice(0,3).map(a => `<div class="role-banner-avatar" style="background:${a.color};margin-right:-8px">${escHtml(a.initials)}</div>`).join('') + (agents.length > 3 ? `<div class="role-banner-avatar role-banner-avatar-more">+${agents.length-3}</div>` : '');
  document.getElementById('sup-banner-avatars').innerHTML = avatarsHtml || '<div class="role-banner-avatar role-banner-avatar-more">0</div>';
  document.getElementById('sup-banner-title').textContent = `${activeAgents.length} sur ${agents.length} agents actifs`;
  const idleAgent = findLongestIdleAgent(agents, activeIds);
  document.getElementById('sup-banner-sub').textContent = idleAgent || 'Tout le monde est à jour';
  document.getElementById('sup-banner-dot').style.background = activeAgents.length > 0 ? '#3B8C6E' : '#A0AAB8';
}

function findLongestIdleAgent(agents, activeIds) {
  const idle = agents.filter(a => !activeIds.has(a.id));
  if (!idle.length) return null;
  const waiting = idle.filter(a => typeof taskinIdleLabel !== 'function' || taskinIdleLabel(a) === 'Attente flux');
  if (!waiting.length) return 'Les autres agents sont hors shift ou pas connectés';
  return waiting.length === 1 ? `${waiting[0].name} en attente de flux` : `${waiting.length} agents en attente de flux`;
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
        <div class="mini-avatar" style="background:${a.color}20;color:${a.color}">${escHtml(a.initials)}</div>
        <div class="team-row-info"><div class="team-row-name">${escHtml(a.name)}</div><div class="team-row-role">${escHtml(t.desc)}</div></div>
        <span class="team-row-timer">${timeStr}</span></div>`;
    }
    return `<div class="team-row" onclick="viewAgentDetail('${a.id}')" style="cursor:pointer">
      <div class="mini-avatar" style="background:var(--border2);color:var(--text2)">${escHtml(a.initials)}</div>
      <div class="team-row-info"><div class="team-row-name">${escHtml(a.name)}</div><div class="team-row-role" style="color:var(--text3)">${typeof taskinIdleLabel === 'function' ? taskinIdleLabel(a) : 'Inactif'}</div></div>
      <span class="team-row-timer" style="color:var(--text3)">—</span></div>`;
  }).join('');
}

// Passe par switchTab pour masquer proprement la page d’origine (Admin, Supervision…)
// au lieu d’afficher le tableau des entrées par-dessus.
async function viewAgentDetail(agentId) {
  const agentTab = document.querySelector('.tab.agent-only');
  agentTab?.classList.remove('hidden');
  await switchTab('today', agentTab);
  const filter = document.getElementById('filter-agent');
  if (filter) filter.value = agentId;
  renderAll();
}
