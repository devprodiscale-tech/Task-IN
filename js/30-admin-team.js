// Task’in — Admin · Équipe : classement par pôle (donut par pôle et par personne) et fiche de chaque compte.
// Pôle : répartition des traitements de la période entre ses agents. Agent : répartition par canal.
// Annuaire : toutes les personnes enregistrées (tous rôles), avec une fiche détaillée au clic.

const tpState = { period: 'today', from: '', to: '', sessions: null, sessionsAt: 0, loading: false, dirRole: 'all', dirOpen: false };
const TP_POLES = [['fo', 'Front Office', '#2563EB'], ['bo', 'Back Office', '#7C3AED'], ['reconf', 'Reconfirmation', '#16A34A']];
const TP_ROLES = { admin: 'Admin', supervisor: 'Superviseur', formateur: 'Formateur', agent: 'Agent' };
const TP_SOURCES = { inbound: 'Appel entrant', outbound: 'Appel sortant', chat: 'Chat', email: 'E-mail', ticket: 'Ticket', manual: 'Manuel' };

function tpEsc(v) { return typeof escHtml === 'function' ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function tpRange() { return taskinPeriodBounds(tpState.period, tpState.from, tpState.to); }
function tpEntries() {
  const b = tpRange();
  return (typeof entries !== 'undefined' ? entries : []).filter(e => { const d = getEntryDate(e.startTimeStr); return d >= b.start && d <= b.end; });
}
function tpHm(min) { return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`; }

// Donut SVG : segments [{ value, color, label }], texte central.
function tpDonut(segments, center, sub, size = 132, stroke = 16) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total ? segments.filter(x => x.value > 0).map(x => {
    const len = x.value / total * c, gap = segments.filter(y => y.value > 0).length > 1 ? Math.min(2, len / 3) : 0;
    const arc = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${x.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}" stroke-dashoffset="${-offset}"><title>${tpEsc(x.label)} : ${x.value} (${Math.round(x.value / total * 100)} %)</title></circle>`;
    offset += len;
    return arc;
  }).join('') : '';
  return `<svg class="tp-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${tpEsc(center)} ${tpEsc(sub || '')}">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--surface2)" stroke-width="${stroke}"/>
    <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
    <text x="50%" y="${sub ? '47%' : '50%'}" text-anchor="middle" dominant-baseline="middle" class="tp-donut-val">${tpEsc(center)}</text>
    ${sub ? `<text x="50%" y="64%" text-anchor="middle" dominant-baseline="middle" class="tp-donut-sub">${tpEsc(sub)}</text>` : ''}
  </svg>`;
}

async function tpLoadSessions() {
  if (tpState.loading || (tpState.sessions && Date.now() - tpState.sessionsAt < 120000) || typeof dispatchRest !== 'function') return;
  tpState.loading = true;
  try { tpState.sessions = await dispatchRest('agent_sessions?select=agent_id,event,created_at&order=created_at.desc&limit=3000') || []; }
  catch (_) { tpState.sessions = []; }
  tpState.sessionsAt = Date.now(); tpState.loading = false;
  window.taskinTeamPolesRender?.(tpState.timers);
}
function tpLastSeen(id) {
  const list = (tpState.sessions || []).filter(s => s.agent_id === id);
  const login = list.find(s => s.event === 'login'), logout = list.find(s => s.event === 'logout');
  return { login: login ? new Date(login.created_at) : null, logout: logout ? new Date(logout.created_at) : null };
}
function tpAgentStats(a, list) {
  const mine = list.filter(e => e.agent === a.id);
  const secs = mine.reduce((s, e) => s + Number(e.durationSec || 0), 0);
  const bySource = {};
  mine.forEach(e => { const k = TP_SOURCES[e.source] ? e.source : 'manual'; bySource[k] = (bySource[k] || 0) + 1; });
  const sla = mine.length && typeof taskinSlaSplit === 'function' ? taskinSlaSplit(mine) : null;
  return { mine, count: mine.length, minutes: Math.round(secs / 60), dmt: mine.length ? Math.round(secs / mine.length / 60) : null, bySource, slaPct: sla && mine.length ? Math.round(sla.in / mine.length * 100) : null };
}

function taskinTeamPolesRender(activeTimers) {
  const el = document.getElementById('team-poles-panel');
  if (!el) return;
  tpState.timers = activeTimers || tpState.timers || [];
  tpLoadSessions();
  const live = new Set((tpState.timers || []).map(t => t.agentId));
  const list = tpEntries();
  const agents = (TEAM || []).filter(u => u.role === 'agent');
  const periodLabel = { today: "aujourd’hui", '7d': '7 derniers jours', month: 'ce mois' }[tpState.period] || taskinPeriodLabel('custom', tpState.from, tpState.to);
  const poles = [...TP_POLES, ...(agents.some(a => !a.pole) ? [['', 'Sans pôle', '#64748B']] : [])];
  const cards = poles.map(([key, label, color]) => {
    const inPole = agents.filter(a => (a.pole || '') === key);
    const stats = inPole.map(a => ({ a, ...tpAgentStats(a, list) }));
    const total = stats.reduce((s, x) => s + x.count, 0), minutes = stats.reduce((s, x) => s + x.minutes, 0);
    const donut = tpDonut(stats.map(x => ({ value: x.count, color: safeColor(x.a.color), label: x.a.name })), String(total), 'traitements');
    const people = stats.sort((x, y) => y.count - x.count).map(x => {
      const segs = Object.entries(x.bySource).map(([k, v]) => ({ value: v, color: taskinSourceColor(k), label: TP_SOURCES[k] }));
      const status = live.has(x.a.id) ? ['En activité', 'live'] : [typeof taskinIdleLabel === 'function' ? taskinIdleLabel(x.a) : '—', 'idle'];
      return `<button type="button" class="tp-person" data-tp-person="${tpEsc(x.a.id)}">
        ${tpDonut(segs, String(x.count), '', 64, 9)}
        <span class="tp-person-copy"><strong>${tpEsc(x.a.name)}</strong>
          <small><i class="tp-dot ${status[1]}"></i>${tpEsc(status[0])}</small>
          <small>${x.count ? `${tpHm(x.minutes)} · DMT ${x.dmt} min${x.slaPct !== null ? ` · ${x.slaPct} % in SLA` : ''}` : 'Aucun traitement'}</small>
          <span class="tp-share">${total ? `${Math.round(x.count / total * 100)} % du pôle` : ''}</span></span>
      </button>`;
    }).join('') || '<p class="tp-empty">Aucun agent dans ce pôle.</p>';
    return `<section class="tp-pole" style="--c:${color}">
      <header class="tp-pole-head"><div><span class="tp-tag">${tpEsc(key ? key.toUpperCase() : '—')}</span><h3>${tpEsc(label)}</h3></div><span class="tp-pole-count">${inPole.length} agent${inPole.length > 1 ? 's' : ''} · ${inPole.filter(a => live.has(a.id)).length} en activité</span></header>
      <div class="tp-pole-body">${donut}
        <ul class="tp-legend">${stats.filter(x => x.count).map(x => `<li><i style="background:${safeColor(x.a.color)}"></i>${tpEsc(x.a.name)}<b>${x.count}</b></li>`).join('') || '<li class="tp-empty">Aucun traitement sur la période.</li>'}
          <li class="tp-legend-total">Temps traité <b>${tpHm(minutes)}</b></li></ul></div>
      <div class="tp-people">${people}</div>
    </section>`;
  }).join('');
  const roleCounts = Object.fromEntries(Object.keys(TP_ROLES).map(r => [r, (TEAM || []).filter(u => u.role === r).length]));
  const dirList = (TEAM || []).filter(u => tpState.dirRole === 'all' || u.role === tpState.dirRole).slice().sort((x, y) => (Object.keys(TP_ROLES).indexOf(x.role) - Object.keys(TP_ROLES).indexOf(y.role)) || String(x.name).localeCompare(String(y.name), 'fr'));
  const directory = `<details class="sv-acc tp-dir"${tpState.dirOpen ? ' open' : ''} ontoggle="tpState.dirOpen=this.open">
    <summary class="sv-acc-head"><span class="sv-card-title" style="margin:0">Toutes les personnes enregistrées</span><span class="sv-acc-meta"><b>${(TEAM || []).length}</b> comptes · ${Object.entries(roleCounts).filter(([, n]) => n).map(([r, n]) => `${n} ${TP_ROLES[r].toLowerCase()}${n > 1 ? 's' : ''}`).join(' · ')}</span><i class="sv-acc-chevron" aria-hidden="true"></i></summary>
    <div class="sv-acc-body">
      <div class="aq-poles">${[['all', 'Tous'], ...Object.entries(TP_ROLES)].map(([k, l]) => `<button type="button" class="${tpState.dirRole === k ? 'active' : ''}" data-tp-role="${k}">${l}</button>`).join('')}</div>
      <div class="dr-table-wrap"><table class="dr-table tp-dir-table"><thead><tr><th>Personne</th><th>Rôle</th><th>Pôle</th><th>Shift</th><th>Dernière connexion</th><th></th></tr></thead><tbody>
      ${dirList.map(u => { const seen = tpLastSeen(u.id); return `<tr><td><div class="agent-cell"><div class="mini-avatar" style="background:${safeColor(u.color)}20;color:${safeColor(u.color)}">${tpEsc(u.initials || '??')}</div><span><b>${tpEsc(u.name)}</b><small class="dr-muted tp-mail">${tpEsc(u.email || '')}</small></span></div></td>
        <td>${tpEsc(TP_ROLES[u.role] || u.role)}</td><td>${u.pole ? `<em class="dr-pole dr-pole-${tpEsc(u.pole)}">${tpEsc(poleLabel(u.pole))}</em>` : '<span class="dr-muted">—</span>'}</td>
        <td>${u.shift ? tpEsc(u.shift) : '<span class="dr-muted">—</span>'}</td><td>${seen.login ? seen.login.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '<span class="dr-muted">' + (tpState.sessions ? 'jamais' : '…') + '</span>'}</td>
        <td class="dr-row-action"><button type="button" class="dr-edit-btn" data-tp-person="${tpEsc(u.id)}">Fiche</button></td></tr>`; }).join('')}
      </tbody></table></div></div></details>`;
  el.innerHTML = `<div class="tp-head"><div><span class="admin-overview-section-label">Équipe · par pôle</span><h2>Répartition du travail</h2><p>Donut du pôle : part de chaque agent dans les traitements. Donut de l’agent : ses canaux.</p></div>
      <div class="aq-poles tp-periods">${[['today', "Aujourd’hui"], ['7d', '7 jours'], ['month', 'Ce mois'], ['custom', 'Période…']].map(([k, l]) => `<button type="button" class="${tpState.period === k ? 'active' : ''}" data-tp-period="${k}">${l}</button>`).join('')}${tpState.period === 'custom' ? taskinCustomRangeHtml('data-tp-range', tpState.from, tpState.to) : ''}</div></div>
    <div class="tp-poles">${cards}</div>
    <div class="tp-src-legend">${Object.entries(TP_SOURCES).map(([k, l]) => `<span><i style="background:${taskinSourceColor(k)}"></i>${l}</span>`).join('')}<em>Période : ${periodLabel}</em></div>
    ${directory}`;
  el.querySelectorAll('[data-tp-period]').forEach(b => b.onclick = () => { tpState.period = b.dataset.tpPeriod; if (tpState.period === 'custom' && !tpState.from) Object.assign(tpState, taskinDefaultCustom()); taskinTeamPolesRender(); });
  el.querySelectorAll('[data-tp-range]').forEach(i => i.onchange = () => { tpState[i.dataset.tpRange] = i.value; if (typeof taskinEnsureEntriesFrom === 'function' && tpState.from) taskinEnsureEntriesFrom(tpState.from).then(added => { if (added) taskinTeamPolesRender(); }).catch(() => {}); taskinTeamPolesRender(); });
  el.querySelectorAll('[data-tp-role]').forEach(b => b.onclick = () => { tpState.dirRole = b.dataset.tpRole; taskinTeamPolesRender(); });
  el.querySelectorAll('[data-tp-person]').forEach(b => b.onclick = () => tpOpenPerson(b.dataset.tpPerson));
}
window.taskinTeamPolesRender = taskinTeamPolesRender;

// Fiche détaillée d'un compte (tous rôles) ; pour un agent, ses chiffres de la période et ses derniers traitements.
function tpOpenPerson(id) {
  const u = (TEAM || []).find(x => x.id === id);
  if (!u) return;
  document.getElementById('tp-person-overlay')?.remove();
  const seen = tpLastSeen(u.id);
  const isAgent = u.role === 'agent';
  const s = isAgent ? tpAgentStats(u, tpEntries()) : null;
  const all = isAgent ? (typeof entries !== 'undefined' ? entries : []).filter(e => e.agent === u.id) : [];
  const recent = all.slice(0, 6);
  const fmt = d => d ? d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const field = (label, value) => `<div class="tp-field"><span>${label}</span><b>${value}</b></div>`;
  const overlay = document.createElement('div');
  overlay.id = 'tp-person-overlay'; overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal tp-person-modal" role="dialog" aria-modal="true" aria-labelledby="tp-person-title">
    <div class="modal-header"><div class="tp-person-id"><div class="mosaic-avatar" style="background:${safeColor(u.color)}22;color:${safeColor(u.color)};width:46px;height:46px;font-size:16px">${tpEsc(u.initials || '??')}</div>
      <div><div class="modal-title" id="tp-person-title">${tpEsc(u.name)}</div><div class="tp-person-sub">${tpEsc(TP_ROLES[u.role] || u.role)}${u.pole ? ` · ${tpEsc(poleLabel(u.pole))}` : ''}</div></div></div>
      <button type="button" class="modal-close" aria-label="Fermer" data-tp-close>✕</button></div>
    <div class="tp-fields">
      ${field('E-mail', tpEsc(u.email || '—'))}${field('Rôle', tpEsc(TP_ROLES[u.role] || u.role))}${field('Pôle', u.pole ? tpEsc(poleLabel(u.pole)) : '—')}
      ${field('Shift', tpEsc(u.shift || 'non renseigné'))}${field('Compte créé le', u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—')}
      ${field('Dernière connexion', fmt(seen.login))}${field('Dernière déconnexion', fmt(seen.logout))}
    </div>
    ${isAgent ? `<h4 class="tp-sec">Activité · ${{ today: "aujourd’hui", '7d': '7 derniers jours', month: 'ce mois' }[tpState.period]}</h4>
      <div class="tp-kpis"><div><b>${s.count}</b><span>traitements</span></div><div><b>${tpHm(s.minutes)}</b><span>temps traité</span></div><div><b>${s.dmt ?? '—'}${s.dmt !== null ? ' min' : ''}</b><span>DMT</span></div><div><b>${s.slaPct ?? '—'}${s.slaPct !== null ? ' %' : ''}</b><span>in SLA</span></div></div>
      <h4 class="tp-sec">Derniers traitements</h4>
      <div class="tp-recent">${recent.map(e => `<div style="--src:${taskinSourceColor(e.source)}"><span>${getEntryDate(e.startTimeStr).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><b>${tpEsc(TP_SOURCES[e.source] || e.source)}</b><em>${tpEsc(e.desc || e.treatment || '')}</em><i>${Math.round(Number(e.durationSec || 0) / 60)} min</i></div>`).join('') || '<p class="tp-empty">Aucun traitement chargé.</p>'}</div>
      <div class="tp-actions"><button type="button" class="btn btn-ghost" data-tp-entries>Voir tous ses traitements →</button></div>` : ''}
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', ev => { if (ev.target === overlay || ev.target.closest('[data-tp-close]')) close(); });
  overlay.querySelector('[data-tp-entries]')?.addEventListener('click', () => { close(); viewAgentDetail(u.id); });
  document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
}
window.tpOpenPerson = tpOpenPerson;
