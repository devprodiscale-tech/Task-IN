/*
 * Task’in — Vue générale Admin analytique
 * Direction : dashboard compact inspiré des cockpits financiers, traduit en Ocean / Clay / Green.
 * Source de vérité : TEAM, entries et active_timers déjà chargés ; aucun chiffre fictif n’est injecté.
 */

let adminOverviewPeriod = 'today';

function adminOverviewEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function adminOverviewSourceLabel(source) {
  const labels = { inbound:'Appel entrant', outbound:'Appel sortant', ringover:'Ringover', chat:'Chat', crisp:'Crisp', email:'E-mail', ticket:'Ticket', manual:'Manuel' };
  return labels[source] || source || 'Non précisé';
}
function adminOverviewFormatElapsed(startTime) {
  const elapsed = Math.max(0, Math.floor((Date.now() - Number(startTime || 0)) / 1000));
  const hours = Math.floor(elapsed / 3600), minutes = Math.floor((elapsed % 3600) / 60), seconds = elapsed % 60;
  return hours > 0 ? `${hours}h${String(minutes).padStart(2,'0')}` : `${minutes}:${String(seconds).padStart(2,'0')}`;
}
function adminOverviewPeriodEntries(period) {
  const start = new Date(); start.setHours(0,0,0,0);
  if (period === 'week') start.setDate(start.getDate() - 6);
  return (entries || []).filter(entry => new Date(entry.startTimeStr) >= start);
}
function adminOverviewMetricData(period) {
  const periodEntries = adminOverviewPeriodEntries(period);
  const todayAgents = new Set((entries || []).filter(entry => isToday(entry.startTimeStr)).map(entry => entry.agent));
  const totalSeconds = periodEntries.reduce((sum, entry) => sum + Number(entry.durationSec || 0), 0);
  const sourceCounts = periodEntries.reduce((acc, entry) => { const key = entry.source || 'manual'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const sourceRows = Object.entries(sourceCounts).sort((a,b) => b[1] - a[1]);
  const daily = Array.from({length: 7}, (_, index) => {
    const date = new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate() - (6 - index));
    const key = date.toDateString();
    return { label: date.toLocaleDateString('fr-FR',{weekday:'short'}).replace('.',''), count: periodEntries.filter(e => new Date(e.startTimeStr).toDateString() === key).length };
  });
  return { periodEntries, todayAgents, totalSeconds, avgMinutes: periodEntries.length ? Math.round(totalSeconds / periodEntries.length / 60) : 0, sourceRows, daily };
}
function adminOverviewAvatar(user, active) {
  const rawColor = typeof user?.color === 'string' ? user.color : '';
  const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : '#2B4C7E';
  const initials = adminOverviewEscape(user?.initials || '??');
  const photo = typeof user?.photo === 'string' && /^https:\/\//i.test(user.photo) ? user.photo : '';
  return `<span class="admin-overview-avatar${active ? ' is-active' : ''}" style="background:${color}20;color:${color};">${photo ? `<img src="${adminOverviewEscape(photo)}" alt="" loading="lazy">` : initials}</span>`;
}
function adminOverviewTeamRows(activeTimers) {
  const timerByAgent = new Map((activeTimers || []).map(timer => [timer.agentId, timer]));
  const agentEntries = (entries || []).reduce((map, entry) => { const list = map.get(entry.agent) || []; list.push(entry); map.set(entry.agent, list); return map; }, new Map());
  const agents = typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(user => user.role === 'agent');
  if (!agents.length) return '<div class="admin-overview-empty">Aucun agent n’est encore rattaché à l’équipe.</div>';
  return agents.map(agent => {
    const timer = timerByAgent.get(agent.id), history = agentEntries.get(agent.id) || [], todayHistory = history.filter(entry => isToday(entry.startTimeStr));
    const totalMinutes = Math.round(todayHistory.reduce((sum, entry) => sum + Number(entry.durationSec || 0), 0) / 60);
    const status = timer ? 'En activité' : todayHistory.length ? 'Présent aujourd’hui' : 'En attente';
    const statusClass = timer ? 'live' : todayHistory.length ? 'seen' : 'idle';
    const detail = timer ? `${adminOverviewSourceLabel(timer.source)} · ${adminOverviewFormatElapsed(timer.startTime)}` : todayHistory.length ? `${todayHistory.length} traitement${todayHistory.length > 1 ? 's' : ''} · ${totalMinutes} min` : 'Aucune activité enregistrée';
    return `<button class="admin-overview-team-row" type="button" data-admin-agent-id="${adminOverviewEscape(agent.id)}">${adminOverviewAvatar(agent, Boolean(timer))}<span class="admin-overview-team-copy"><strong>${adminOverviewEscape(agent.name || 'Sans nom')}</strong><small>${adminOverviewEscape(detail)}</small></span><span class="admin-overview-status ${statusClass}"><i></i>${status}</span><span class="admin-overview-chevron">→</span></button>`;
  }).join('');
}
function adminOverviewActivityRows(periodEntries) {
  const recent = periodEntries.slice().sort((a,b) => new Date(b.startTimeStr) - new Date(a.startTimeStr)).slice(0, 5);
  if (!recent.length) return '<div class="admin-overview-empty">Aucune activité sur cette période.</div>';
  return recent.map(entry => { const agent = (TEAM || []).find(user => user.id === entry.agent); const when = new Date(entry.startTimeStr).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); return `<div class="admin-overview-activity-row">${adminOverviewAvatar(agent || {initials:'?',color:'#A0AAB8'},false)}<div class="admin-overview-activity-copy"><strong>${adminOverviewEscape(agent?.name || entry.agent || 'Agent inconnu')}</strong><span>${adminOverviewEscape(adminOverviewSourceLabel(entry.source))} · ${when}</span></div><span class="admin-overview-activity-duration">${Math.max(0, Math.round(Number(entry.durationSec || 0) / 60))} min</span></div>`; }).join('');
}
function adminOverviewBarChart(daily) {
  const max = Math.max(1, ...daily.map(item => item.count));
  return daily.map(item => `<div class="admin-overview-bar-col"><span class="admin-overview-bar-value">${item.count || ''}</span><i style="height:${Math.max(5, Math.round(item.count / max * 100))}%"></i><small>${adminOverviewEscape(item.label)}</small></div>`).join('');
}
function adminOverviewDonut(sourceRows) {
  const total = sourceRows.reduce((sum, [, count]) => sum + count, 0);
  const first = total ? Math.round(sourceRows[0][1] / total * 100) : 0;
  const second = total ? Math.round((sourceRows[1]?.[1] || 0) / total * 100) : 0;
  return `<div class="admin-overview-donut" style="--donut-a:${first}%;--donut-b:${second}%"><strong>${total}</strong><small>entrées</small></div>`;
}
function adminOverviewSourceLegend(sourceRows) {
  if (!sourceRows.length) return '<span class="admin-overview-muted">Aucun canal enregistré</span>';
  const palette = ['ocean','green','clay','amber'];
  return sourceRows.slice(0,4).map(([source,count], index) => `<div><i class="${palette[index]}"></i><span>${adminOverviewEscape(adminOverviewSourceLabel(source))}</span><b>${count}</b></div>`).join('');
}
function adminOverviewProgress(activeTimerCount, agentCount) {
  const percent = agentCount ? Math.round(activeTimerCount / agentCount * 100) : 0;
  return `<div class="admin-overview-progress-ring" style="--progress:${percent * 3.6}deg"><span>${percent}%</span></div>`;
}
function adminOverviewHeatmap(periodEntries) {
  const hours = [8, 10, 12, 14, 16, 18];
  const counts = hours.map(hour => periodEntries.filter(entry => { const date = new Date(entry.startTimeStr); return date.getHours() >= hour && date.getHours() < hour + 2; }).length);
  const max = Math.max(1, ...counts);
  return hours.map((hour, index) => `<div class="admin-overview-heat-cell level-${Math.min(4, Math.ceil(counts[index] / max * 4))}" title="${hour}h–${hour + 2}h · ${counts[index]} entrée${counts[index] !== 1 ? 's' : ''}"><span>${counts[index] || ''}</span><small>${String(hour).padStart(2,'0')}h</small></div>`).join('');
}
function adminOverviewSla(periodEntries) {
  const eligible = periodEntries.filter(entry => entry.inboundTime && entry.inboundTime !== '--:--');
  if (!eligible.length) return { label:'Non calculable', percent:null, detail:'Aucune mesure FRT disponible' };
  const target = Number(typeof sourceDMT !== 'undefined' ? (sourceDMT.inbound || sourceDMT.ringover || 180) : 180);
  const within = eligible.filter(entry => { const [hours, minutes] = String(entry.inboundTime).split(':').map(Number); const start = new Date(entry.startTimeStr); const inbound = new Date(start); inbound.setHours(hours, minutes, 0, 0); const seconds = Math.floor((start - inbound) / 1000); return seconds >= 0 && seconds <= target; }).length;
  const percent = Math.round(within / eligible.length * 100);
  return { label:`${percent}%`, percent, detail:`${within}/${eligible.length} réponses dans la cible` };
}
function adminOverviewPlanningRows(periodEntries) {
  const agents = typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(user => user.role === 'agent');
  return agents.map(agent => { const agentEntries = periodEntries.filter(entry => entry.agent === agent.id); const seconds = agentEntries.reduce((sum, entry) => sum + Number(entry.durationSec || 0), 0); const hours = (seconds / 3600).toFixed(1); const details = agentEntries.slice().sort((a,b) => new Date(b.startTimeStr) - new Date(a.startTimeStr)).slice(0,3).map(entry => `${adminOverviewSourceLabel(entry.source)} · ${Math.max(1, Math.round(Number(entry.durationSec || 0) / 60))} min`).join(' · ') || 'Aucune activité sur la période'; return `<details class="admin-overview-planning-row"><summary><span class="admin-overview-planning-avatar">${adminOverviewEscape(agent.initials || '??')}</span><span class="admin-overview-planning-agent"><strong>${adminOverviewEscape(agent.name || 'Sans nom')}</strong><small>${agentEntries.length} entrée${agentEntries.length !== 1 ? 's' : ''} · ${adminOverviewEscape(details)}</small></span><b>${hours} h</b><i>⌄</i></summary><div class="admin-overview-planning-detail">${agentEntries.length ? agentEntries.map(entry => `<span>${adminOverviewEscape(adminOverviewSourceLabel(entry.source))}<em>${Math.max(1, Math.round(Number(entry.durationSec || 0) / 60))} min</em></span>`).join('') : '<span>Aucun détail disponible</span>'}</div></details>`; }).join('');
}
function renderAdminOverview(activeTimers = []) {
  const panel = document.getElementById('admin-overview-panel');
  if (!panel || !currentUser || currentUser.role !== 'admin') return;
  const { periodEntries, todayAgents, totalSeconds, avgMinutes, sourceRows, daily } = adminOverviewMetricData(adminOverviewPeriod);
  const sla = adminOverviewSla(periodEntries);
  const agents = typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(user => user.role === 'agent');
  const activeTimerCount = new Set((activeTimers || []).map(timer => timer.agentId)).size;
  const periodLabel = adminOverviewPeriod === 'today' ? 'Aujourd’hui' : '7 derniers jours';
  panel.innerHTML = `<section class="admin-overview-shell" aria-labelledby="admin-overview-title">
    <div class="admin-overview-head"><div><div class="admin-overview-eyebrow">Admin · cockpit opérationnel</div><h2 id="admin-overview-title">Vue générale</h2><p>Comprendre l’activité de l’équipe en un coup d’œil.</p></div><div class="admin-overview-controls"><button type="button" class="admin-overview-theme-btn" data-admin-theme="dark" title="Changer l’ambiance visuelle">◐</button><button type="button" class="admin-overview-period${adminOverviewPeriod === 'today' ? ' active' : ''}" data-admin-overview-period="today">Aujourd’hui</button><button type="button" class="admin-overview-period${adminOverviewPeriod === 'week' ? ' active' : ''}" data-admin-overview-period="week">7 jours</button></div></div>
    <div class="admin-overview-kpis"><div class="admin-overview-kpi accent-ocean"><span class="admin-overview-kpi-label">Équipe active</span><strong>${activeTimerCount}</strong><small>agents actifs maintenant</small></div><div class="admin-overview-kpi accent-green"><span class="admin-overview-kpi-label">Présence du jour</span><strong>${todayAgents.size}<em>/${agents.length}</em></strong><small>agents avec une entrée</small></div><div class="admin-overview-kpi accent-clay"><span class="admin-overview-kpi-label">Temps suivi</span><strong>${adminOverviewEscape(fmtDuration(totalSeconds))}</strong><small>${periodLabel}</small></div><div class="admin-overview-kpi accent-muted"><span class="admin-overview-kpi-label">DMT moyenne</span><strong>${avgMinutes || 0}<em> min</em></strong><small>sur les traitements</small></div></div>
    <div class="admin-overview-analytics"><section class="admin-overview-chart-panel"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Rythme d’activité</span><h3>Entrées traitées</h3></div><span class="admin-overview-count">${periodEntries.length} total</span></div><div class="admin-overview-bar-chart">${adminOverviewBarChart(daily)}</div><div class="admin-overview-chart-caption"><span>Les 7 derniers jours</span><b>Sources réelles · Supabase</b></div></section><section class="admin-overview-chart-panel admin-overview-channel-panel"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Répartition</span><h3>Canaux utilisés</h3></div>${adminOverviewDonut(sourceRows)}</div><div class="admin-overview-legend">${adminOverviewSourceLegend(sourceRows)}</div></section><section class="admin-overview-chart-panel admin-overview-presence-panel"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Disponibilité</span><h3>Présence équipe</h3></div>${adminOverviewProgress(activeTimerCount, agents.length)}</div><div class="admin-overview-presence-copy"><strong>${activeTimerCount} en activité</strong><span>${Math.max(0, agents.length - activeTimerCount)} hors traitement maintenant</span></div></section></div>
    <div class="admin-overview-ops-grid"><section class="admin-overview-ops-card admin-overview-heatmap-card"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Intensité d’activité</span><h3>Heat map équipe</h3></div><span class="admin-overview-count">${periodLabel}</span></div><div class="admin-overview-heatmap-grid">${adminOverviewHeatmap(periodEntries)}</div><div class="admin-overview-heatmap-legend"><span>Faible</span><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>Forte</span></div></section><section class="admin-overview-ops-card admin-overview-sla-card"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Qualité de service</span><h3>État SLA</h3></div><span class="admin-overview-count">FRT</span></div><div class="admin-overview-sla-value ${sla.percent === null ? 'is-neutral' : sla.percent >= 80 ? 'is-good' : 'is-alert'}">${adminOverviewEscape(sla.label)}</div><div class="admin-overview-sla-track"><i style="width:${sla.percent === null ? 0 : sla.percent}%"></i></div><p>${adminOverviewEscape(sla.detail)}</p><button type="button" class="admin-overview-drill" onclick="switchTab('team', document.getElementById('tab-team'))">Voir les entrées →</button></section></div>
    <section class="admin-overview-planning"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Temps de travail</span><h3>Planning Odoo · cumul par agent</h3></div><div class="admin-overview-planning-meta"><span>${periodLabel}</span><b>${adminOverviewEscape(fmtDuration(totalSeconds))} cumulé</b></div></div><p class="admin-overview-planning-note">Synthèse des heures suivies dans Task’in. Le connecteur Odoo pourra remplacer cette source par les heures planifiées et réalisées.</p><div class="admin-overview-planning-list">${adminOverviewPlanningRows(periodEntries)}</div></section>
    <div class="admin-overview-grid"><section class="admin-overview-panel-block admin-overview-team-block"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Présence live</span><h3>Équipe en direct</h3></div><span class="admin-overview-count">${activeTimerCount} en cours</span></div><div class="admin-overview-team-list">${adminOverviewTeamRows(activeTimers)}</div></section><section class="admin-overview-panel-block admin-overview-activity-block"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Flux de travail</span><h3>Activité récente</h3></div><span class="admin-overview-source">Données synchronisées</span></div><div class="admin-overview-activity-list">${adminOverviewActivityRows(periodEntries)}</div></section></div>
    <section class="admin-overview-modules"><div class="admin-overview-block-head"><div><span class="admin-overview-section-label">Navigation opérationnelle</span><h3>Accès rapides</h3></div><span class="admin-overview-count">Modules actifs</span></div><div class="admin-overview-module-grid"><button type="button" class="admin-overview-module" onclick="switchTab('team', document.getElementById('tab-team'))"><span class="admin-overview-module-icon ocean">↗</span><span><strong>Activité &amp; KPI</strong><small>Entrées et canaux</small></span><b>→</b></button><button type="button" class="admin-overview-module" onclick="switchTab('supervision', document.getElementById('tab-supervision'))"><span class="admin-overview-module-icon clay">◎</span><span><strong>Supervision</strong><small>Qualité et coaching</small></span><b>→</b></button><button type="button" class="admin-overview-module" onclick="switchTab('training', document.getElementById('tab-training'))"><span class="admin-overview-module-icon amber">✦</span><span><strong>Formation</strong><small>Parcours et quiz</small></span><b>→</b></button><button type="button" class="admin-overview-module" onclick="switchTab('documentation', document.getElementById('tab-documentation'))"><span class="admin-overview-module-icon green">▱</span><span><strong>Documentation</strong><small>Procédures validées</small></span><b>→</b></button></div></section>
    <div class="admin-overview-footer"><div><span class="admin-overview-footer-dot"></span><strong>Données synchronisées</strong><span>Timers actifs et entrées chargées.</span></div><button type="button" class="admin-overview-text-action" onclick="switchTab('team', document.getElementById('tab-team'))">Voir l’activité détaillée →</button></div>
  </section>`;
  panel.querySelectorAll('[data-admin-agent-id]').forEach(row => row.addEventListener('click', () => viewAgentDetail(row.dataset.adminAgentId)));
  panel.querySelectorAll('[data-admin-overview-period]').forEach(button => button.addEventListener('click', () => { adminOverviewPeriod = button.dataset.adminOverviewPeriod; renderAdminOverview(activeTimers); }));
  const themeButton = panel.querySelector('[data-admin-theme]');
  if (themeButton) themeButton.addEventListener('click', () => { panel.classList.toggle('admin-overview-reference-dark'); themeButton.textContent = panel.classList.contains('admin-overview-reference-dark') ? '☀' : '◐'; });
}
