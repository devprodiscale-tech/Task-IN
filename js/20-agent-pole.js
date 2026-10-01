// ======================= ESPACE AGENT PAR PÔLE (FO / BO / RECONF) =======================
// Chaque pôle a sa propre interface : bandeau de mission, canaux prioritaires en tête,
// indicateurs adaptés et historique 7 jours sur sa mesure principale.
// Les données restent les mêmes (entrées de temps) ; seule la lecture change selon le pôle.

const AGENT_SVG = {
  inbound: '<path d="M16 2v6h6"/><path d="m22 2-6 6"/><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  outbound: '<path d="M22 8V2h-6"/><path d="m16 8 6-6"/><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  email: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  sync: '<path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M16 16h5v5"/>',
  fo: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  bo: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="m9 13 2 2 4-4"/>',
  reconf: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  agent: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  week: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  training: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  documentation: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  results: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  missed: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/><path d="m16 2 6 6M22 2l-6 6"/>',
  dispatch: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="15" r="3"/><path d="m20.1 17.1 1.9 1.9"/>',
};
const agentIcon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AGENT_SVG[name] || ''}</svg>`;

// Palette unique des canaux : mêmes couleurs dans les raccourcis, la fenêtre de démarrage et le tableau.
const AGENT_SOURCES = {
  inbound: { label: 'Appel entrant', color: '#E5484D' },
  outbound: { label: 'Appel sortant', color: '#D97706' },
  chat: { label: 'Crisp Chat', color: '#0EA5E9' },
  email: { label: 'Crisp Email', color: '#6366F1' },
  ticket: { label: 'Ticket / Manuel', color: '#16A34A' },
};

const AGENT_POLES = {
  fo: {
    label: 'Front Office', short: 'FO', color: '#2563EB', icon: 'fo',
    mission: 'Premier contact client : appels entrants, chat et e-mails. La réactivité prime.',
    primary: ['inbound', 'chat', 'email'], secondary: ['outbound', 'ticket'], sync: true,
    cards: { count: 'Demandes traitées', dmt: 'DMT moyenne', third: 'first-reply', total: 'Durée totale (jour)' },
    unit: 'demande', history: 'Demandes traitées',
  },
  bo: {
    label: 'Back Office', short: 'BO', color: '#7C3AED', icon: 'bo',
    mission: 'Traitement des dossiers : tickets, e-mails et suivis de réservation, jusqu’à leur clôture.',
    primary: ['ticket', 'email'], secondary: ['inbound', 'outbound', 'chat'], sync: false,
    cards: { count: 'Dossiers traités', dmt: 'Temps moyen par dossier', third: 'longest', total: 'Durée totale (jour)' },
    unit: 'dossier', history: 'Dossiers traités',
  },
  reconf: {
    label: 'Reconfirmation', short: 'Reconf', color: '#16A34A', icon: 'reconf',
    mission: 'Reconfirmation des réservations par appels sortants, avant chaque départ.',
    primary: ['outbound'], secondary: ['email', 'ticket', 'inbound', 'chat'], sync: true,
    cards: { count: 'Appels de reconfirmation', dmt: 'Durée moyenne d’appel', third: 'others', total: 'Durée totale (jour)' },
    unit: 'appel', history: 'Appels de reconfirmation', metricSource: 'outbound',
  },
  none: {
    label: 'Agent', short: 'Agent', color: '#2563EB', icon: 'agent',
    mission: 'Suis ton temps de traitement sur chaque canal et tes objectifs du jour.',
    primary: ['inbound', 'outbound', 'chat', 'email', 'ticket'], secondary: [], sync: true,
    cards: { count: 'Tâches traitées', dmt: 'DMT moyenne', third: 'first-reply', total: 'Durée totale (jour)' },
    unit: 'tâche', history: 'Tâches traitées',
  },
};

function agentPole() {
  if (currentUser?.role !== 'agent') return null;
  const key = String(currentUser.pole || (typeof TEAM !== 'undefined' ? TEAM.find(t => t.id === currentUser.id)?.pole : '') || '').toLowerCase();
  return { key: AGENT_POLES[key] ? key : 'none', ...(AGENT_POLES[key] || AGENT_POLES.none) };
}
const agentPlural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const agentMin = sec => Math.round(sec / 60);

// ---------- Bandeau du pôle et raccourcis ----------
function agentRenderPoleShell() {
  const pole = agentPole();
  const app = document.getElementById('app');
  const banner = document.getElementById('agent-pole-banner');
  const quick = document.querySelector('.quickstart');
  app?.classList.remove('pole-fo', 'pole-bo', 'pole-reconf', 'pole-none');
  if (!pole) { banner?.classList.add('hidden'); return; }
  app?.classList.add('pole-' + pole.key);
  document.documentElement.style.setProperty('--pole', pole.color);

  if (banner) {
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <span class="agent-pole-icon">${agentIcon(pole.icon)}</span>
      <div class="agent-pole-text">
        <span class="agent-pole-eyebrow">Mon espace · ${pole.key === 'none' ? 'pôle non défini' : 'pôle ' + pole.short}</span>
        <strong>${pole.key === 'none' ? 'Espace agent' : pole.label}</strong>
        <p>${pole.mission}</p>
      </div>
      <div class="agent-pole-channels" aria-label="Canaux prioritaires">
        <span>Canaux prioritaires</span>
        <div>${pole.primary.map(s => `<em style="--c:${AGENT_SOURCES[s].color}">${agentIcon(s)}${AGENT_SOURCES[s].label}</em>`).join('')}</div>
      </div>`;
  }

  if (quick) {
    const btn = (s, primary) => `<button type="button" class="qs-btn ${primary ? 'qs-primary' : 'qs-secondary'}" style="--c:${AGENT_SOURCES[s].color}" onclick="quickStart('${s}')" title="Démarrer : ${AGENT_SOURCES[s].label}">${agentIcon(s, 'qs-icon')}<span>${AGENT_SOURCES[s].label}</span></button>`;
    quick.innerHTML = `<div class="qs-group qs-group-primary">${pole.primary.map(s => btn(s, true)).join('')}</div>`
      + (pole.secondary.length || pole.sync ? `<div class="qs-group qs-group-secondary"><span class="qs-group-label">Autres</span>${pole.secondary.map(s => btn(s, false)).join('')}${pole.sync ? `<button type="button" class="qs-btn qs-secondary qs-sync" onclick="syncRingover()" title="Importer les appels RingOver">${agentIcon('sync', 'qs-icon')}<span>Sync RingOver</span></button>` : ''}</div>` : '');
  }

  // Fenêtre « Démarrer un timer » : canaux du pôle en premier, avec la même palette.
  const picker = document.querySelector('#modal-overlay .source-picker');
  if (picker) {
    const order = [...pole.primary, ...pole.secondary, ...Object.keys(AGENT_SOURCES).filter(s => !pole.primary.includes(s) && !pole.secondary.includes(s))];
    order.forEach(s => {
      const opt = document.getElementById('src-' + s);
      if (!opt) return;
      opt.style.setProperty('--c', AGENT_SOURCES[s].color);
      opt.innerHTML = `${agentIcon(s, 'src-icon')}<span>${AGENT_SOURCES[s].label}</span>${pole.primary.includes(s) && pole.key !== 'none' ? '<i>prioritaire</i>' : ''}`;
      opt.style.gridColumn = '';
      picker.appendChild(opt);
    });
    const count = order.filter(s => document.getElementById('src-' + s)).length;
    if (count % 2) document.getElementById('src-' + order[order.length - 1]).style.gridColumn = 'span 2';
  }

  // Onglets : icônes cohérentes, et pas de « Vue d'ensemble » d'équipe pour un agent.
  const tabIcons = [['.tabs .tab.agent-only', 'today'], ['#tab-week-role', 'week'], ['#tab-results', 'results'], ['#tab-missed', 'missed'], ['#tab-training', 'training'], ['#tab-documentation', 'documentation']];
  tabIcons.forEach(([sel, icon]) => {
    const tab = document.querySelector(sel);
    if (!tab || tab.dataset.iconReady) return;
    const label = tab.textContent.replace(/[🎓📄🏆🎯]/gu, '').trim();
    tab.innerHTML = `${agentIcon(icon, 'tab-icon')}<span>${label}</span>`;
    tab.dataset.iconReady = '1';
  });
  document.getElementById('tab-home')?.classList.add('hidden');
  const agentFilter = document.getElementById('filter-agent');
  if (agentFilter) agentFilter.classList.add('hidden');
}

// ---------- Indicateurs du jour selon le pôle ----------
function agentRenderPoleStats() {
  const pole = agentPole();
  if (!pole) return;
  const mine = entries.filter(e => e.agent === currentUser.id && isToday(e.startTimeStr));
  const card = id => document.getElementById(id)?.closest('.stat-card');
  const setLabel = (id, text) => { const label = card(id)?.querySelector('.stat-label'); if (label) label.textContent = text; };
  // la mesure principale du pôle passe en premier
  [['s-count', 'kpi-main'], ['s-dmt', 'kpi-dmt'], ['s-frt', 'kpi-third'], ['s-total', 'kpi-total']].forEach(([id, cls]) => card(id)?.classList.add(cls));
  setLabel('s-count', pole.cards.count);
  setLabel('s-dmt', pole.cards.dmt);
  setLabel('s-total', pole.cards.total);
  const frtValue = document.getElementById('s-frt');
  const thirdCard = card('s-frt');
  thirdCard?.classList.remove('stat-muted');

  if (pole.metricSource) {
    // Reconf : la mesure principale porte sur les appels sortants.
    const calls = mine.filter(e => e.source === pole.metricSource);
    const callSec = calls.reduce((s, e) => s + e.durationSec, 0);
    document.getElementById('s-count').textContent = calls.length;
    document.getElementById('s-dmt').textContent = calls.length ? `${Math.floor(callSec / calls.length / 60)}min` : '0min';
    const goal = (typeof currentAgentGoals === 'function' ? currentAgentGoals() : agentGoals)?.count || 0;
    const bar = document.getElementById('pb-count'), label = document.getElementById('gl-count');
    if (bar && goal) { const ratio = calls.length / goal; bar.style.width = Math.min(ratio * 100, 100) + '%'; bar.className = 'kpi-progress-fill ' + (ratio >= 1 ? 'good' : ratio >= .6 ? 'warn' : 'bad'); }
    if (label && goal) label.textContent = `${calls.length} / objectif ${goal}`;
    const dmtLabel = document.getElementById('gl-dmt'), dmtBar = document.getElementById('pb-dmt');
    if (dmtLabel) dmtLabel.textContent = calls.length ? `sur ${agentPlural(calls.length, 'appel')}` : 'aucun appel aujourd’hui';
    if (!calls.length) document.getElementById('s-dmt').textContent = '—';
    if (dmtBar) {
      const avgMin = calls.length ? callSec / calls.length / 60 : 0, goalDmt = (typeof currentAgentGoals === 'function' ? currentAgentGoals() : agentGoals)?.dmt || 0;
      const ratio = goalDmt && calls.length ? avgMin / goalDmt : 0;
      dmtBar.style.width = calls.length ? Math.min(ratio * 100, 100) + '%' : '0%';
      dmtBar.className = 'kpi-progress-fill ' + (ratio <= 1 ? 'good' : ratio <= 1.3 ? 'warn' : 'bad');
    }
  }

  if (pole.cards.third === 'longest') {
    const longest = mine.reduce((m, e) => Math.max(m, e.durationSec), 0);
    setLabel('s-frt', 'Dossier le plus long');
    frtValue.textContent = longest ? `${agentMin(longest)}min` : '—';
    const top = mine.find(e => e.durationSec === longest);
    document.getElementById('gl-frt').textContent = top ? (top.desc || 'Dossier').slice(0, 42) : 'aucun dossier aujourd’hui';
    document.getElementById('pb-frt').style.width = '0%';
    thirdCard?.classList.add('stat-muted');
  } else if (pole.cards.third === 'others') {
    const others = mine.filter(e => e.source !== pole.metricSource);
    setLabel('s-frt', 'Autres traitements');
    frtValue.textContent = others.length;
    document.getElementById('gl-frt').textContent = others.length ? `${agentMin(others.reduce((s, e) => s + e.durationSec, 0))}min hors appels` : 'e-mails, tickets…';
    document.getElementById('pb-frt').style.width = '0%';
    thirdCard?.classList.add('stat-muted');
  } else {
    setLabel('s-frt', 'First Reply Time');
    if (frtValue.textContent.trim() === '--') {
      frtValue.textContent = '—';
      document.getElementById('gl-frt').textContent = 'renseigne l’heure d’arrivée au démarrage';
    }
  }
}

// ---------- Historique 7 jours (mesure principale du pôle) ----------
function agentRenderPoleHistory() {
  const pole = agentPole();
  const container = document.getElementById('agent-history-bars');
  if (!pole || !container) return;
  const title = document.querySelector('#agent-history-bar .agent-history-title');
  if (title) title.textContent = `Mes 7 derniers jours · ${pole.history.toLowerCase()}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - (6 - i)); return { date: d, count: 0, sec: 0 }; });
  entries.filter(e => e.agent === currentUser.id && (!pole.metricSource || e.source === pole.metricSource)).forEach(e => {
    const d = getEntryDate(e.startTimeStr); if (!d) return;
    const day = days.find(x => x.date.toDateString() === d.toDateString());
    if (day) { day.count++; day.sec += e.durationSec; (day.list = day.list || []).push(e); }
  });
  const max = Math.max(...days.map(d => d.count), 1);
  container.innerHTML = days.map((d, i) => {
    const isToday = i === 6;
    const label = isToday ? 'Auj.' : d.date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    const pct = d.count ? Math.max(d.count / max * 100, 10) : 3;
    const tip = `${d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${agentPlural(d.count, pole.unit)}${d.count ? ` · ${agentMin(d.sec)} min` : ''}`;
    const sla = typeof taskinSlaSplit === 'function' ? taskinSlaSplit(d.list || []) : null;
    return `<div class="agent-hbar-col" ${sla ? taskinSlaAttrs(tip, sla) : `title="${tip}"`}>
      <span class="agent-hbar-val">${d.count || ''}</span>
      <div class="agent-hbar ${isToday ? 'today' : ''} ${d.count ? 'has-data' : ''} ${sla && d.count ? 'sla-stack' : ''}" style="height:${pct}%">${sla && d.count ? taskinSlaSegments(sla) : ''}</div>
      <span class="agent-hbar-label"><b>${label}</b><small>${d.date.getDate()}</small></span>
    </div>`;
  }).join('');
}

// ---------- Tableau : étiquettes de canal avec la même palette ----------
if (typeof sourceTag === 'function') {
  sourceTag = function (s) {
    const key = s === 'ringover' ? 'inbound' : s === 'crisp' ? 'chat' : AGENT_SOURCES[s] ? s : 'ticket';
    const meta = AGENT_SOURCES[key];
    return `<span class="source-tag src-${key}" style="--c:${meta.color}">${agentIcon(key, 'src-tag-icon')}${meta.label}</span>`;
  };
}

// ---------- Branchements ----------
if (typeof applyRoleUI === 'function') {
  const baseApplyRoleUI = applyRoleUI;
  applyRoleUI = function () {
    baseApplyRoleUI.apply(this, arguments);
    agentRenderPoleShell();
  };
}
if (typeof renderStats === 'function') {
  const baseRenderStats = renderStats;
  renderStats = function () {
    baseRenderStats.apply(this, arguments);
    if (currentUser?.role === 'agent') agentRenderPoleStats();
  };
}
if (typeof renderAgentHistory === 'function') {
  const baseRenderAgentHistory = renderAgentHistory;
  renderAgentHistory = function () { if (agentPole()) agentRenderPoleHistory(); else baseRenderAgentHistory.apply(this, arguments); };
}
if (typeof openModal === 'function') {
  const baseOpenModal = openModal;
  openModal = function () {
    baseOpenModal.apply(this, arguments);
    const pole = agentPole();
    if (pole && typeof selectSource === 'function') selectSource(pole.primary[0]);
  };
}
