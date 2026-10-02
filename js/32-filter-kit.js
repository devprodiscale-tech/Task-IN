// ======================= FILTRES HARMONISÉS (Lot V) =======================
// Deux règles communes à tous les écrans :
// 1. Un filtre « agent » est toujours précédé d'un filtre « pôle » (FO / BO / Reconf) : le pôle restreint
//    la liste des agents et, quand « tous les agents » est choisi, filtre les données sur le pôle.
// 2. Un filtre de période propose toujours « Période… » (dates libres De / À).

const TASKIN_POLE_CHOICES = [['', 'Tous les pôles'], ['fo', 'FO · Front Office'], ['bo', 'BO · Back Office'], ['reconf', 'Reconf']];
// Filtres agent existants (sélecteurs statiques ou régénérés) qui reçoivent le filtre pôle.
const TASKIN_AGENT_FILTER_IDS = ['filter-agent', 'chart-scope', 'donut-agent', 'sv-ov-agent-picker', 'sv-esc-agent-filter', 'sv-review-agent-filter', 'sv-coaching-agent-filter'];
const TASKIN_ALL_VALUES = new Set(['', '__all', 'all', 'team']);

function taskinPoleOfAgent(id) {
  const list = (typeof TEAM !== 'undefined' && Array.isArray(TEAM)) ? TEAM : [];
  return list.find(u => u.id === id)?.pole || '';
}

function taskinPoleSelectFor(select) {
  const el = typeof select === 'string' ? document.getElementById(select) : select;
  return el ? document.querySelector(`select[data-pole-for="${el.id}"]`) : null;
}

// Valeur du pôle associé à un filtre agent ('' = tous).
function taskinPoleFilterValue(select) { return taskinPoleSelectFor(select)?.value || ''; }

// Vrai si l'agent passe le filtre agent + pôle (remplace la comparaison « agent === filtre »).
function taskinAgentPass(select, agentId) {
  const el = typeof select === 'string' ? document.getElementById(select) : select;
  const value = el?.value ?? '';
  if (!TASKIN_ALL_VALUES.has(value)) return agentId === value;
  const pole = taskinPoleFilterValue(el);
  return !pole || taskinPoleOfAgent(agentId) === pole;
}

// Masque les agents hors du pôle choisi ; si l'agent sélectionné sort du pôle, revient sur « tous ».
function taskinApplyPoleToOptions(select) {
  const pole = taskinPoleFilterValue(select);
  let reset = false;
  [...select.options].forEach(o => {
    if (TASKIN_ALL_VALUES.has(o.value)) return;
    const hide = !!pole && taskinPoleOfAgent(o.value) !== pole;
    o.hidden = hide; o.disabled = hide;
    if (hide && o.selected) reset = true;
  });
  const allOpt = [...select.options].find(o => TASKIN_ALL_VALUES.has(o.value));
  if (reset) {
    if (allOpt) select.value = allOpt.value;
    else { const first = [...select.options].find(o => !o.hidden); if (first) select.value = first.value; }
  }
  return reset;
}

function taskinAttachPoleFilter(select) {
  if (!select?.id || taskinPoleSelectFor(select)) return taskinPoleSelectFor(select);
  const pole = document.createElement('select');
  pole.className = `${select.className || 'filter-select'} taskin-pole-filter`;
  pole.dataset.poleFor = select.id;
  pole.setAttribute('aria-label', 'Filtrer par pôle');
  pole.innerHTML = TASKIN_POLE_CHOICES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  try { pole.value = sessionStorage.getItem(`taskin_pole_${select.id}`) || ''; } catch (_) {}
  select.parentNode.insertBefore(pole, select);
  pole.addEventListener('change', () => {
    try { sessionStorage.setItem(`taskin_pole_${select.id}`, pole.value); } catch (_) {}
    taskinApplyPoleToOptions(select);
    // Le rendu existant du filtre agent prend le relais (il appelle taskinAgentPass).
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  taskinSyncPoleFilter(select);
  return pole;
}

// Le filtre pôle suit la visibilité / l'état du filtre agent (ex. masqué pour le rôle agent).
function taskinSyncPoleFilter(select) {
  const pole = taskinPoleSelectFor(select);
  if (!pole) return;
  const hidden = select.classList.contains('hidden') || select.hidden || select.style.display === 'none';
  pole.classList.toggle('hidden', hidden);
  pole.disabled = !!select.disabled || currentUserRole() === 'agent';
  if (currentUserRole() === 'agent') pole.classList.add('hidden');
  taskinApplyPoleToOptions(select);
}
function currentUserRole() { return (typeof currentUser !== 'undefined' && currentUser?.role) || ''; }

function taskinUpgradeFilters() {
  if (!currentUserRole() || currentUserRole() === 'agent') return;
  TASKIN_AGENT_FILTER_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!taskinPoleSelectFor(el)) taskinAttachPoleFilter(el); else taskinSyncPoleFilter(el);
  });
}

// Les listes d'agents sont régénérées par les écrans : on resynchronise après chaque mutation (regroupé par image).
(function taskinWatchFilters() {
  let queued = false;
  const run = () => { queued = false; try { taskinUpgradeFilters(); } catch (e) { console.warn('Filtres pôle', e); } };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
  const start = () => {
    new MutationObserver(muts => {
      if (muts.some(m => m.target.nodeName === 'SELECT' || [...m.addedNodes].some(n => n.nodeType === 1 && (n.nodeName === 'SELECT' || n.querySelector?.('select'))))) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// ---------- Périodes ----------
const TASKIN_DAY = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Bornes d'une période nommée : { start: Date (00:00), end: Date (23:59:59.999), from, to } (from/to = AAAA-MM-JJ).
function taskinPeriodBounds(period, from, to) {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  let end = new Date(now); end.setHours(23, 59, 59, 999);
  switch (period) {
    case 'yesterday': start.setDate(start.getDate() - 1); end = new Date(start); end.setHours(23, 59, 59, 999); break;
    case 'week': start.setDate(start.getDate() - (start.getDay() + 6) % 7); break;
    case '7d': start.setDate(start.getDate() - 6); break;
    case '28d': start.setDate(start.getDate() - 27); break;
    case '30d': start.setDate(start.getDate() - 29); break;
    case 'month': start.setDate(1); break;
    case 'prev-month': start.setDate(1); start.setMonth(start.getMonth() - 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999); break;
    case 'all': start.setDate(start.getDate() - 61); break;
    case 'custom': {
      const f = from ? new Date(`${from}T00:00:00`) : null, t = to ? new Date(`${to}T23:59:59.999`) : null;
      if (f && !isNaN(f)) start.setTime(f.getTime());
      if (t && !isNaN(t)) end = t;
      if (start > end) { const s = new Date(end); s.setHours(0, 0, 0, 0); start.setTime(s.getTime()); }
      break;
    }
    default: break; // today / day
  }
  return { start, end, from: TASKIN_DAY(start), to: TASKIN_DAY(end) };
}

function taskinInPeriod(date, bounds) {
  const d = date instanceof Date ? date : new Date(date);
  return d >= bounds.start && d <= bounds.end;
}

function taskinPeriodLabel(period, from, to) {
  const labels = { today: 'Aujourd’hui', day: 'Aujourd’hui', yesterday: 'Hier', week: 'Cette semaine', '7d': '7 jours', '28d': '4 semaines', '30d': '30 jours', month: 'Ce mois', 'prev-month': 'Mois précédent', all: '2 mois' };
  if (period !== 'custom') return labels[period] || period;
  const fmt = v => v ? new Date(`${v}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '…';
  return `${fmt(from)} → ${fmt(to)}`;
}

// Champs De / À d'une « Période… » ; l'écran fournit l'attribut de ses champs et lit les valeurs au changement.
function taskinCustomRangeHtml(attr, from, to) {
  const today = TASKIN_DAY(new Date());
  return `<span class="mc-custom taskin-range"><input type="date" class="form-input" ${attr}="from" value="${from || ''}" max="${today}" aria-label="Du"><span>→</span><input type="date" class="form-input" ${attr}="to" value="${to || ''}" max="${today}" aria-label="Au"></span>`;
}
// Valeurs par défaut d'une période libre : les 7 derniers jours.
function taskinDefaultCustom() { const b = taskinPeriodBounds('7d'); return { from: b.from, to: b.to }; }

// Sélecteurs de période (<select data-period-select>) : l'option « Période… » (custom) affiche De / À juste après.
function taskinSelectBounds(select) {
  const el = typeof select === 'string' ? document.getElementById(select) : select;
  if (!el) return taskinPeriodBounds('week');
  return taskinPeriodBounds(el.value, el.dataset.from, el.dataset.to);
}
function taskinAttachSelectRange(el) {
  if (!el || el.dataset.rangeReady) return;
  el.dataset.rangeReady = '1';
  const paint = () => {
    let box = el.nextElementSibling?.classList.contains('taskin-range') ? el.nextElementSibling : null;
    if (el.value !== 'custom') { box?.remove(); return; }
    if (!el.dataset.from) { const d = taskinDefaultCustom(); el.dataset.from = d.from; el.dataset.to = d.to; }
    if (!box) {
      el.insertAdjacentHTML('afterend', taskinCustomRangeHtml('data-range-of', el.dataset.from, el.dataset.to));
      box = el.nextElementSibling;
      box.querySelectorAll('input').forEach(i => i.addEventListener('change', () => {
        el.dataset[i.getAttribute('data-range-of')] = i.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }));
    }
  };
  el.addEventListener('change', paint);
  paint();
}
function taskinUpgradePeriodSelects() { document.querySelectorAll('select[data-period-select]').forEach(taskinAttachSelectRange); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', taskinUpgradePeriodSelects); else taskinUpgradePeriodSelects();
