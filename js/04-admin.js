// ===== ADMIN PANEL =====
let customTreatmentTypes = [...TREATMENT_TYPES_DEFAULT];

function renderAdminPanel() {
  renderTeamList(); renderTreatmentList(); renderAdminStats(); populateChartScopeSelect(); populateDonutAgentSelect(); renderEvolutionChart(); renderChannelMatrix(); renderGoalInputs(); renderOpsVisuals();
}

function renderTeamList() {
  document.getElementById('team-count').textContent = TEAM.length + ' comptes';
  document.getElementById('team-list').innerHTML = TEAM.map(u => `
    <div class="team-row" onclick="openAccountEditModal('${u.id}')" style="cursor:pointer">
      <div class="mini-avatar" style="background:${u.color}20;color:${u.color}${u.photo?`;background-image:url(${u.photo});background-size:cover`:''}">${u.photo?'':u.initials}</div>
      <div class="team-row-info"><div class="team-row-name">${u.name}</div><div class="team-row-role">${roleLabel(u.role)}</div></div>
      <span style="font-size:11px;color:var(--ocean);font-weight:600;margin-left:auto;">Modifier →</span>
    </div>`).join('');
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'supervisor') return 'Superviseur';
  if (role === 'formateur') return 'Formateur';
  return 'Agent';
}

function renderTreatmentList() {
  document.getElementById('treatment-count').textContent = customTreatmentTypes.length + ' types';
  document.getElementById('treatment-list').innerHTML = customTreatmentTypes.map((t,i) => `
    <div class="treatment-row"><span>${t}</span><button class="icon-btn" onclick="removeTreatmentType(${i})">✕</button></div>`).join('');
}

async function addTreatmentType() {
  const input = document.getElementById('new-treatment-input');
  const val = input.value.trim();
  if (!val) return;
  customTreatmentTypes.push(val);
  input.value = '';
  renderTreatmentList();
  populateFilters();
  await saveTreatments();
}

async function removeTreatmentType(i) {
  if (!confirm('Supprimer ce type de traitement ?')) return;
  customTreatmentTypes.splice(i, 1);
  renderTreatmentList();
  populateFilters();
  await saveTreatments();
}

async function saveTreatments() {
  if (!requireRoles('admin')) return;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  try { await supabase.upsertSetting('treatments', { list: customTreatmentTypes }, currentUser.id); }
  catch (e) { console.error('saveTreatments Supabase:', e); }
}

async function loadTreatments() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return;
  try {
    const setting = await supabase.getSetting('treatments');
    const values = setting?.value?.list;
    if (Array.isArray(values) && values.length) customTreatmentTypes = values.map(String);
  } catch (e) { console.error('loadTreatments Supabase:', e); }
}

function renderAdminStats() {
  const now = new Date(); const weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay()+1); weekStart.setHours(0,0,0,0);
  const weekEntries = entries.filter(e => new Date(e.startTimeStr) >= weekStart);
  const total = weekEntries.reduce((s,e)=>s+e.durationSec,0);
  const activeAgents = new Set(entries.filter(e=>isToday(e.startTimeStr)).map(e=>e.agent));
  document.getElementById('admin-s-total').textContent = fmtDuration(total);
  document.getElementById('admin-s-count').textContent = entries.length;
  document.getElementById('admin-s-active').textContent = activeAgents.size;
}

let opsVizPeriod = 'week';

function opsEscape(value) {
  return String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
}

function opsDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function opsPeriodConfig(period = opsVizPeriod) {
  if (period === 'day') return { days: 1, label: "Aujourd'hui" };
  if (period === 'month') return { days: 30, label: '30 derniers jours' };
  return { days: 14, label: '14 derniers jours' };
}

function opsPeriodEntries(period = opsVizPeriod) {
  const { days } = opsPeriodConfig(period);
  const start = new Date();
  start.setHours(0,0,0,0);
  start.setDate(start.getDate() - (days - 1));
  return entries.filter(e => new Date(e.startTimeStr) >= start);
}

function opsEntryTargetSeconds(entry) {
  let sourceKey = 'manual';
  if (entry.source === 'ringover' || entry.source === 'inbound' || entry.source === 'outbound') sourceKey = 'ringover';
  else if (entry.source === 'crisp' || entry.source === 'chat' || entry.source === 'email') sourceKey = 'crisp';
  return sourceDMT[sourceKey] ?? sourceDMT.manual ?? 0;
}

function opsIsOnTime(entry) {
  const target = opsEntryTargetSeconds(entry);
  return target > 0 && entry.durationSec <= target;
}

function setOpsVizPeriod(period, btn) {
  opsVizPeriod = period;
  document.querySelectorAll('.ops-viz-period').forEach(b => b.classList.toggle('active', b.dataset.opsPeriod === period));
  renderOpsVisuals();
}

function opsVizTemplate(prefix, list) {
  const { days, label } = opsPeriodConfig();
  const now = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() - i);
    const key = opsDateKey(date);
    const dayEntries = list.filter(e => opsDateKey(e.startTimeStr) === key);
    const onTime = dayEntries.filter(opsIsOnTime).length;
    buckets.push({ date, total: dayEntries.length, onTime, late: Math.max(dayEntries.length - onTime, 0) });
  }
  const maxCount = Math.max(1, ...buckets.map(b => b.total));
  const total = list.length;
  const onTimeTotal = list.filter(opsIsOnTime).length;
  const lateTotal = Math.max(total - onTimeTotal, 0);
  const onTimeRate = total ? Math.round(onTimeTotal / total * 100) : 0;
  const totalSec = list.reduce((sum, e) => sum + (e.durationSec || 0), 0);
  const avgDmt = total ? Math.round(totalSec / total / 60) : 0;
  const agentList = agentsOnly();
  const agentCount = Math.max(agentList.length, 1);
  const throughput = Math.round(total / agentCount / days * 10) / 10;
  const target = Math.max(Number(agentGoals?.count) || 20, 1);
  const gaugePct = Math.max(0, Math.min(100, Math.round(throughput / target * 100)));
  const circumference = 195;
  const bars = buckets.map((bucket, index) => {
    const isToday = index === buckets.length - 1;
    const height = bucket.total ? Math.max(8, Math.round(bucket.total / maxCount * 100)) : 2;
    const onPct = bucket.total ? Math.round(bucket.onTime / bucket.total * 100) : 0;
    const latePct = bucket.total ? 100 - onPct : 0;
    const dateLabel = bucket.date.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'});
    return `<div class="ops-bar-col ${isToday ? 'today' : ''}" title="${dateLabel} — ${bucket.total} entrée(s)">
      <span class="ops-bar-total">${bucket.total || ''}</span>
      <div class="ops-bar-stack" style="height:${height}%">
        <div class="ops-bar-on" style="height:${onPct}%"></div>
        <div class="ops-bar-late" style="height:${latePct}%"></div>
      </div>
      <span class="ops-bar-label">${bucket.date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span>
    </div>`;
  }).join('');
  const teamRows = agentList.length ? agentList.map(agent => {
    const agentEntries = list.filter(e => e.agent === agent.id);
    const agentOnTime = agentEntries.filter(opsIsOnTime).length;
    const agentRate = agentEntries.length ? Math.round(agentOnTime / agentEntries.length * 100) : 0;
    const agentAvg = agentEntries.length ? Math.round(agentEntries.reduce((sum,e)=>sum+e.durationSec,0) / agentEntries.length / 60) : 0;
    return `<tr><td class="ops-team-name">${opsEscape(agent.name)}</td><td class="ops-team-value">${agentEntries.length}</td><td><div class="ops-mini-bar"><span style="width:${agentRate}%"></span></div></td><td class="ops-team-value ${agentRate >= 80 ? 'good' : agentEntries.length ? 'warn' : ''}">${agentEntries.length ? agentRate + '%' : '—'}</td><td class="ops-team-value">${agentEntries.length ? agentAvg + ' min' : '—'}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="ops-empty-cell">Aucun agent disponible</td></tr>';
  return `<div class="ops-viz-shell">
    <div class="ops-viz-header"><div><div class="ops-viz-title">Performance opérationnelle</div><div class="ops-viz-subtitle">Activité, conformité SLA et débit moyen par agent</div></div><div class="ops-viz-controls"><button class="ops-viz-period ${opsVizPeriod === 'day' ? 'active' : ''}" data-ops-period="day" onclick="setOpsVizPeriod('day',this)">Jour</button><button class="ops-viz-period ${opsVizPeriod === 'week' ? 'active' : ''}" data-ops-period="week" onclick="setOpsVizPeriod('week',this)">14 j</button><button class="ops-viz-period ${opsVizPeriod === 'month' ? 'active' : ''}" data-ops-period="month" onclick="setOpsVizPeriod('month',this)">30 j</button></div></div>
    <div class="ops-viz-kpis"><div class="ops-viz-kpi"><div class="ops-viz-kpi-label">Entrées traitées</div><div class="ops-viz-kpi-value blue">${total}</div></div><div class="ops-viz-kpi"><div class="ops-viz-kpi-label">Dans le SLA</div><div class="ops-viz-kpi-value green">${onTimeRate}%</div></div><div class="ops-viz-kpi"><div class="ops-viz-kpi-label">Hors SLA</div><div class="ops-viz-kpi-value pink">${lateTotal}</div></div><div class="ops-viz-kpi"><div class="ops-viz-kpi-label">DMT moyenne</div><div class="ops-viz-kpi-value muted">${total ? avgDmt + ' min' : '—'}</div></div></div>
    <div class="ops-viz-chart"><div class="ops-viz-chart-title">Traitements par jour · ${label}</div><div class="ops-bars">${bars}</div><div class="ops-viz-legend"><span class="ops-legend-item"><span class="ops-legend-dot"></span>Dans le SLA</span><span class="ops-legend-item"><span class="ops-legend-dot late"></span>Hors SLA</span></div></div>
    <div class="ops-viz-bottom"><div class="ops-throughput"><div class="ops-gauge"><svg viewBox="0 0 148 92" aria-label="Jauge de débit"><path class="ops-gauge-track" d="M 12 82 A 62 62 0 0 1 136 82"></path><path class="ops-gauge-fill" d="M 12 82 A 62 62 0 0 1 136 82" pathLength="195" stroke-dasharray="${Math.round(circumference * gaugePct / 100)} 195"></path></svg><div class="ops-gauge-value">${throughput}</div><div class="ops-gauge-label">entrées / agent / jour</div></div><div class="ops-throughput-copy"><strong>${gaugePct}% de l’objectif</strong>Objectif : ${target} entrées par agent et par jour<br>${agentList.length} agent(s) suivi(s)</div></div><div class="ops-team-table-wrap"><table class="ops-team-table"><thead><tr><th>Agent</th><th>Total</th><th>Progression</th><th>SLA</th><th>DMT</th></tr></thead><tbody>${teamRows}</tbody></table></div></div>
  </div>`;
}

function renderOpsVisuals() {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) return;
  const list = opsPeriodEntries();
  // Le rendu opérationnel appartient à Supervision. Les anciennes cibles admin/IDs
  // morts ne sont plus alimentés afin d'éviter les doublons.
  const supervisorOverview = document.getElementById('ops-viz-supervision-overview');
  if (supervisorOverview) supervisorOverview.innerHTML = opsVizTemplate('ops', list);
}

function exportCSV() {
  const rows = [['Date','Inbound Time','Start Time','Source','Description','Agent','Durée (min)']];
  entries.forEach(e => {
    const d = getEntryDate(e.startTimeStr);
    const startStr = d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
    rows.push([d.toLocaleDateString('fr-FR'), e.inboundTime||'--:--', startStr, e.source, e.desc, (TEAM.find(t=>t.id===e.agent)||{}).name || e.agent, Math.ceil(e.durationSec/60)]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'taskin-time-entries-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click(); URL.revokeObjectURL(url);
}
function exportExcel() { exportCSV(); }

// ===== DMT =====
async function loadDMT() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return renderDMTInputs();
  try {
    const setting = await supabase.getSetting('dmt');
    const value = setting?.value || {};
    sourceDMT = { ringover: Number(value.ringover ?? SOURCE_DMT_DEFAULT.ringover), crisp: Number(value.crisp ?? SOURCE_DMT_DEFAULT.crisp), manual: Number(value.manual ?? SOURCE_DMT_DEFAULT.manual) };
  } catch (e) { console.error('loadDMT Supabase:', e); }
  renderDMTInputs();
}

function renderDMTInputs() {
  const r = document.getElementById('dmt-ringover'); const c = document.getElementById('dmt-crisp'); const m = document.getElementById('dmt-manual');
  if (r) r.value = sourceDMT.ringover; if (c) c.value = sourceDMT.crisp; if (m) m.value = sourceDMT.manual;
}

async function saveDMT() {
  if (!requireRoles('admin')) return;
  sourceDMT = { ringover: parseInt(document.getElementById('dmt-ringover').value) || SOURCE_DMT_DEFAULT.ringover, crisp: parseInt(document.getElementById('dmt-crisp').value) || SOURCE_DMT_DEFAULT.crisp, manual: parseInt(document.getElementById('dmt-manual').value) || SOURCE_DMT_DEFAULT.manual };
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  try { await supabase.upsertSetting('dmt', sourceDMT, currentUser.id); renderAll(); }
  catch (e) { console.error('saveDMT Supabase:', e); }
}

// ===== ACCOUNTS =====
async function loadAccounts() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return;
  try {
    TEAM = (await supabase.listProfiles(200) || []).map(profile => ({
      id: profile.id, name: profile.name || 'Sans nom', email: profile.email || '',
      color: profile.color || '#2B4C7E', initials: profile.initials || '??',
      role: profile.role || 'agent', photo: profile.photo || ''
    }));
    teamById = new Map(TEAM.map(member => [member.id, member]));
  } catch (e) { console.error('loadAccounts Supabase:', e); }
}

async function saveAccount(user) {
  if (!requireRoles('admin')) return false;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return false;
  try {
    await supabase.updateProfile(user.id, { name: user.name, email: user.email || '', color: user.color, initials: user.initials, role: user.role, photo: user.photo || '' });
    return true;
  } catch(e) {
    console.error('saveAccount Supabase:', e);
    return false;
  }
}

// ===== EVOLUTION CHART =====
function populateChartScopeSelect() {
  const sel = document.getElementById('chart-scope'); if (!sel) return;
  sel.innerHTML = '<option value="team">Équipe entière</option>' + agentsOnly().map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

function populateDonutAgentSelect() {
  const sel = document.getElementById('donut-agent'); if (!sel) return;
  sel.innerHTML = '<option value="team">Équipe entière</option>' + agentsOnly().map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

function renderEvolutionChart() {
  const scope = document.getElementById('chart-scope').value; const period = document.getElementById('chart-period').value; const days = period === 'week' ? 7 : 30;
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0); buckets.push({ date: d, totalSec: 0 }); }
  const scoped = scope === 'team' ? entries : entries.filter(e => e.agent === scope);
  scoped.forEach(e => { const d = getEntryDate(e.startTimeStr); const bucket = buckets.find(b => b.date.toDateString() === d.toDateString()); if (bucket) bucket.totalSec += e.durationSec; });
  const maxSec = Math.max(...buckets.map(b=>b.totalSec), 60); const showEvery = days > 14 ? Math.ceil(days/12) : 1;
  const barsHtml = buckets.map((b,i) => {
    const heightPct = Math.max((b.totalSec / maxSec) * 100, b.totalSec>0?3:0);
    const showLabel = i % showEvery === 0 || i === buckets.length-1;
    const label = showLabel ? b.date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}) : '';
    return `<div class="evo-bar-col"><span class="evo-bar-value">${b.totalSec>0?fmtDuration(b.totalSec):''}</span><div class="evo-bar" style="height:${heightPct}%"></div><span class="evo-bar-label">${label}</span></div>`;
  }).join('');
  document.getElementById('evolution-chart').innerHTML = `<div class="evo-bars">${barsHtml}</div>`;
  // FEAT 8 : le donut a ses propres filtres (agent/période), on le re-render simplement ici
  renderDonutChart();
}


// ===== MIGRATION ACCOUNTS / SUPABASE ADMIN =====
let migrationAccounts = [];
let migrationSupabaseSession = null;

function migrationSupabaseConfig() {
  const config = window.TASKIN_SUPABASE_CONFIG || {};
  const url = String(config.url || '').replace(/\/+$/, '');
  if (!url || !config.anonKey) throw new Error('Configuration Supabase incomplète.');
  return { url, anonKey: config.anonKey };
}

async function migrationSupabaseRequest(path, options = {}) {
  const config = migrationSupabaseConfig();
  const headers = new Headers(options.headers || {});
  headers.set('apikey', config.anonKey);
  headers.set('Accept', 'application/json');
  if (migrationSupabaseSession?.access_token) headers.set('Authorization', `Bearer ${migrationSupabaseSession.access_token}`);
  const response = await fetch(`${config.url}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || `HTTP ${response.status}`);
  return payload;
}

function migrationStatus(message, kind = '') {
  const el = document.getElementById('migration-accounts-status');
  if (!el) return;
  el.textContent = message;
  el.className = `migration-accounts-status${kind ? ` ${kind}` : ''}`;
}

async function connectMigrationAdmin() {
  const email = document.getElementById('migration-admin-email')?.value.trim();
  const password = document.getElementById('migration-admin-password')?.value;
  if (!email || !password) return migrationStatus('Saisis un e-mail et un mot de passe Supabase.', 'error');
  migrationStatus('Connexion Admin Supabase en cours…');
  try {
    const config = migrationSupabaseConfig();
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error_description || payload?.msg || `HTTP ${response.status}`);
    migrationSupabaseSession = payload;
    document.getElementById('migration-admin-password').value = '';
    await loadMigrationAccounts();
  } catch (error) {
    migrationSupabaseSession = null;
    migrationStatus(`Connexion refusée : ${error.message}`, 'error');
  }
}

async function loadMigrationAccounts() {
  if (!migrationSupabaseSession) return migrationStatus('Connecte-toi avec un compte Supabase Admin avant d’actualiser.', 'error');
  migrationStatus('Chargement des comptes historiques…');
  try {
    migrationAccounts = await migrationSupabaseRequest('/rest/v1/migration_accounts?select=*&order=display_name.asc,legacy_account_id.asc');
    if (!Array.isArray(migrationAccounts)) migrationAccounts = [];
    renderMigrationAccounts();
    migrationStatus(`${migrationAccounts.length} compte(s) du registre chargé(s). Les actions sont manuelles et journalisées.`, 'success');
  } catch (error) {
    migrationAccounts = [];
    renderMigrationAccounts();
    migrationStatus(`Lecture impossible : ${error.message}`, 'error');
  }
}

function renderMigrationAccounts() {
  const list = document.getElementById('migration-accounts-list');
  const badge = document.getElementById('migration-accounts-count');
  if (!list || !badge) return;
  const onlyMissing = document.getElementById('migration-only-missing-email')?.checked !== false;
  const rows = migrationAccounts.filter(account => !onlyMissing || !String(account.email || '').trim());
  badge.textContent = `${rows.length} à vérifier`;
  if (!rows.length) {
    list.innerHTML = '<div class="migration-empty">Aucun compte ne correspond au filtre actuel.</div>';
    return;
  }
  list.innerHTML = rows.map(account => {
    const email = String(account.email || '').trim();
    const entries = Number(account.time_entries_count || 0);
    const status = String(account.status || 'pending_review');
    const safeId = String(account.id || '').replace(/[^a-zA-Z0-9-]/g, '');
    return `<div class="migration-account-row">
      <div><div class="migration-account-name">${opsEscape(account.display_name || 'Sans nom')}</div><div class="migration-account-meta">${opsEscape(account.legacy_account_id || '')}</div></div>
      <div class="migration-account-meta">${opsEscape(email || 'Aucune adresse')}</div>
      <div class="migration-account-meta">${opsEscape(roleLabel(account.role))}</div>
      <div><div class="migration-account-meta">${entries} entrée(s)</div><div class="migration-account-warning">${opsEscape(status)}</div></div>
      <div class="migration-account-actions">
        <button class="btn btn-ghost" onclick="archiveMigrationAccount('${safeId}')">Archiver</button>
        <button class="btn btn-danger" onclick="requestMigrationAccountDeletion('${safeId}')">Demander suppression</button>
      </div>
    </div>`;
  }).join('');
}

async function updateMigrationAccountStatus(id, status) {
  if (!migrationSupabaseSession) return migrationStatus('Session Admin absente.', 'error');
  const account = migrationAccounts.find(item => item.id === id);
  if (!account) return migrationStatus('Compte introuvable dans le registre.', 'error');
  const label = status === 'archived' ? 'archiver' : 'marquer pour suppression';
  if (!window.confirm(`Confirmer : ${label} « ${account.display_name || account.legacy_account_id} » ?`)) return;
  try {
    await migrationSupabaseRequest(`/rest/v1/migration_accounts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status, deletion_requested_at: status === 'deletion_requested' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    });
    await loadMigrationAccounts();
  } catch (error) {
    migrationStatus(`Action refusée : ${error.message}`, 'error');
  }
}

function archiveMigrationAccount(id) { return updateMigrationAccountStatus(id, 'archived'); }
function requestMigrationAccountDeletion(id) { return updateMigrationAccountStatus(id, 'deletion_requested'); }
