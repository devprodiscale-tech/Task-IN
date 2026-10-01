// ======================= SLIDES DE REPORTING AUTOMATIQUES =======================
// Génère un PowerPoint (.pptx, ouvrable aussi dans Google Slides : Fichier › Importer) à partir
// des statistiques affichées, avec les filtres en cours et l'analyse automatique.
// Graphiques natifs (modifiables dans PowerPoint / Slides). Bibliothèque PptxGenJS (MIT),
// chargée seulement au clic. Deux rapports : bilan hebdomadaire et appels manqués.

const RS = {
  navy: '13294B', blue: '2563EB', green: '16A34A', amber: 'D97706', red: 'DC2626', grey: '64748B',
  light: 'F1F5F9', border: 'E2E8F0', text: '0F172A', muted: '64748B', font: 'Calibri',
};

async function rsLoadLibrary() {
  if (window.PptxGenJS) return window.PptxGenJS;
  await loadModule('vendor/pptxgen.bundle.js');
  if (!window.PptxGenJS) throw new Error('Bibliothèque de slides indisponible.');
  return window.PptxGenJS;
}

function rsNewDeck(PptxGenJS, title) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13,33 × 7,5 pouces (16:9)
  pptx.author = currentUser?.name || 'Task’in';
  pptx.company = 'iScale Solutions × Onspot Travel';
  pptx.title = title;
  pptx.defineSlideMaster({
    title: 'TASKIN',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: RS.blue } } },
      { text: { text: 'Task’in · Équipe Madagascar', options: { x: 0.5, y: 7.05, w: 6, h: 0.3, fontFace: RS.font, fontSize: 9, color: RS.muted } } },
    ],
    slideNumber: { x: 12.4, y: 7.05, w: 0.5, h: 0.3, fontFace: RS.font, fontSize: 9, color: RS.muted },
  });
  return pptx;
}

function rsTitle(slide, title, subtitle) {
  slide.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.6, fontFace: RS.font, fontSize: 26, bold: true, color: RS.navy });
  if (subtitle) slide.addText(subtitle, { x: 0.5, y: 0.92, w: 12.3, h: 0.35, fontFace: RS.font, fontSize: 13, color: RS.muted });
}

function rsCover(pptx, title, period, filters) {
  const slide = pptx.addSlide();
  slide.background = { color: RS.navy };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 5.9, w: 13.33, h: 1.6, fill: { color: RS.blue } });
  slide.addText('TASK’IN · REPORTING', { x: 0.7, y: 1.4, w: 12, h: 0.4, fontFace: RS.font, fontSize: 14, bold: true, color: '93C5FD', charSpacing: 4 });
  slide.addText(title, { x: 0.7, y: 1.9, w: 12, h: 1.2, fontFace: RS.font, fontSize: 40, bold: true, color: 'FFFFFF' });
  slide.addText(period, { x: 0.7, y: 3.15, w: 12, h: 0.5, fontFace: RS.font, fontSize: 20, color: 'DBEAFE' });
  if (filters) slide.addText(filters, { x: 0.7, y: 3.75, w: 12, h: 0.4, fontFace: RS.font, fontSize: 14, color: '93C5FD' });
  slide.addText(`iScale Solutions × Onspot Travel · Équipe Madagascar\nPréparé le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${currentUser?.name ? ' par ' + currentUser.name : ''}`,
    { x: 0.7, y: 6.1, w: 12, h: 1.1, fontFace: RS.font, fontSize: 14, color: 'FFFFFF' });
}

// Tuiles d'indicateurs : [{ label, value, sub, color }]
function rsKpis(slide, tiles, y = 1.5) {
  const per = Math.min(4, tiles.length), w = (12.33 - (per - 1) * 0.25) / per, h = 1.45;
  tiles.forEach((t, i) => {
    const x = 0.5 + (i % per) * (w + 0.25), yy = y + Math.floor(i / per) * (h + 0.25);
    slide.addShape('rect', { x, y: yy, w, h, fill: { color: RS.light }, line: { color: RS.border, width: 1 } });
    slide.addShape('rect', { x, y: yy, w, h: 0.07, fill: { color: t.color || RS.blue }, line: { color: t.color || RS.blue, width: 0 } });
    slide.addText(String(t.label).toUpperCase(), { x: x + 0.2, y: yy + 0.17, w: w - 0.4, h: 0.3, fontFace: RS.font, fontSize: 11, bold: true, color: RS.muted });
    slide.addText(String(t.value), { x: x + 0.2, y: yy + 0.45, w: w - 0.4, h: 0.6, fontFace: RS.font, fontSize: 30, bold: true, color: t.valueColor || RS.text });
    if (t.sub) slide.addText(t.sub, { x: x + 0.2, y: yy + 1.03, w: w - 0.4, h: 0.3, fontFace: RS.font, fontSize: 11, color: RS.muted });
  });
}

function rsTable(slide, head, rows, opts = {}) {
  const cell = (text, extra = {}) => ({ text: String(text ?? '—'), options: { fontFace: RS.font, fontSize: opts.fontSize || 12, color: RS.text, valign: 'middle', ...extra } });
  const data = [head.map(h => cell(h, { bold: true, color: 'FFFFFF', fill: { color: RS.navy } })),
    ...rows.map((r, i) => r.map(c => (typeof c === 'object' && c !== null && 'text' in c) ? cell(c.text, { ...c.options, fill: { color: i % 2 ? 'FFFFFF' : RS.light } }) : cell(c, { fill: { color: i % 2 ? 'FFFFFF' : RS.light } })))];
  slide.addTable(data, { x: opts.x ?? 0.5, y: opts.y ?? 1.5, w: opts.w ?? 12.33, colW: opts.colW, border: { type: 'solid', color: RS.border, pt: 0.75 }, rowH: opts.rowH || 0.4, autoPage: true, autoPageRepeatHeader: true, autoPageSlideStartY: 1.4, newSlideStartY: 1.4 });
}

function rsBullets(slide, items, opts = {}) {
  if (!items.length) { slide.addText('Rien à signaler sur la période.', { x: opts.x ?? 0.5, y: opts.y ?? 1.5, w: opts.w ?? 12.33, h: 0.5, fontFace: RS.font, fontSize: 16, color: RS.muted }); return; }
  slide.addText(items.map(([text, color]) => ({ text, options: { bullet: { code: '25A0' }, color: color || RS.text, breakLine: true, paraSpaceAfter: 10 } })),
    { x: opts.x ?? 0.5, y: opts.y ?? 1.5, w: opts.w ?? 12.33, h: opts.h ?? 5.2, fontFace: RS.font, fontSize: opts.fontSize || 17, valign: 'top' });
}

function rsMessage(slide, text) {
  slide.addShape('rect', { x: 0.5, y: 1.45, w: 12.33, h: 5.35, fill: { color: RS.light }, line: { color: RS.border, width: 1 } });
  slide.addText(text, { x: 0.75, y: 1.6, w: 11.85, h: 5.1, fontFace: RS.font, fontSize: 14, color: RS.text, valign: 'top' });
}

const rsPct = v => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} %`);
const rsSlug = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Bilan hebdomadaire (Résultats › Semaine) ----------
async function rsWeeklyDeck() {
  const PptxGenJS = await rsLoadLibrary();
  const list = drAgents().map(drWeekStats);
  const period = drWeekLabel(drWeek.start);
  const poleName = { all: 'Tous les pôles', fo: 'Front Office', bo: 'Back Office', reconf: 'Reconfirmation' }[drState.pole] || 'Tous les pôles';
  const pptx = rsNewDeck(PptxGenJS, `Bilan hebdomadaire — ${period}`);
  rsCover(pptx, 'Bilan hebdomadaire', period, poleName);

  const sum = key => list.reduce((s, x) => s + (x.metrics.find(m => m.key === key).sum || 0), 0);
  const reached = list.reduce((s, x) => s + x.reached, 0), measured = list.reduce((s, x) => s + x.measured, 0);
  const cases = list.reduce((s, x) => s + x.openCases, 0);
  let slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Synthèse de l’équipe', `${period} · ${poleName} · évolution par jour saisi vs semaine précédente`);
  rsKpis(slide, [
    ...DR_GOAL_METRICS.map(m => {
      const v = drWeekTeamVar(list, m.key);
      const entered = list.some(x => x.metrics.find(y => y.key === m.key).sum !== null);
      return { label: m.label, value: entered ? sum(m.key) : '—', sub: !entered ? 'non saisi cette semaine' : v === null ? 'S-1 non comparable' : `${rsPct(v)} / jour vs S-1`, color: v === null ? RS.grey : v >= 0 ? RS.green : RS.red };
    }),
    { label: 'Objectif du jour atteint', value: measured ? `${reached} / ${measured}` : '—', sub: measured ? `${Math.round(reached / measured * 100)} % des journées mesurées` : 'pas encore de référence', color: RS.blue },
    { label: 'Cas complexes ouverts', value: cases, sub: 'tous types confondus', color: cases ? RS.amber : RS.green },
    { label: 'Agents saisis', value: `${list.filter(x => x.worked).length} / ${list.length}`, sub: `${list.reduce((s, x) => s + x.worked, 0)} journées saisies`, color: RS.grey },
  ]);

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Actions par jour et par agent', 'Moyenne par jour saisi · cette semaine vs semaine précédente');
  const withData = list.filter(x => x.worked || x.metrics[0].prevAvg);
  if (withData.length) {
    slide.addChart(pptx.ChartType.bar, [
      { name: 'Semaine précédente', labels: withData.map(x => x.agent.name), values: withData.map(x => Math.round((x.metrics[0].prevAvg || 0) * 10) / 10) },
      { name: 'Cette semaine', labels: withData.map(x => x.agent.name), values: withData.map(x => Math.round((x.metrics[0].avg || 0) * 10) / 10) },
    ], { x: 0.5, y: 1.4, w: 12.33, h: 5.4, barDir: 'col', barGrouping: 'clustered', chartColors: ['CBD5E1', RS.blue], showLegend: true, legendPos: 'b', legendFontFace: RS.font, showValue: true, dataLabelFontSize: 11, catAxisLabelFontFace: RS.font, catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, valGridLine: { color: RS.border, size: 0.5 } });
  } else rsBullets(slide, [['Aucun résultat OSC saisi sur ces deux semaines.', RS.muted]]);

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Détail par agent', period);
  rsTable(slide, ['Agent', 'Pôle', 'Jours', ...DR_GOAL_METRICS.map(m => m.label), 'Actions / jour', 'vs S-1', 'Objectif atteint', 'Cas ouverts'],
    list.map(x => {
      const a = x.metrics[0];
      return [x.agent.name, typeof poleLabel === 'function' ? poleLabel(x.agent.pole) || '—' : '—', `${x.worked}/7`, ...x.metrics.map(m => m.sum ?? '—'),
        a.avg === null ? '—' : String(Math.round(a.avg * 10) / 10).replace('.', ','),
        { text: rsPct(a.var), options: { color: a.var === null ? RS.muted : a.var >= 0 ? RS.green : RS.red, bold: true } },
        x.measured ? `${x.reached}/${x.measured} j` : '—', { text: x.openCases, options: { color: x.openCases ? RS.amber : RS.text, bold: !!x.openCases } }];
    }), { colW: [2.1, 0.8, 0.8, 1.05, 1.05, 1.05, 1.05, 1.15, 0.9, 1.33, 1.05], fontSize: 11 });

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Points d’attention', 'Détectés automatiquement · à traiter en point individuel');
  rsBullets(slide, drWeekAttention(list).map(([n, t, c]) => [`${n} : ${t}`, c === 'is-alert' ? RS.red : c === 'is-warn' ? RS.amber : RS.muted]));

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Message à l’équipe', 'Texte modifiable');
  rsMessage(slide, drEl('dr-week-message')?.value || drWeekMessage(list));

  await pptx.writeFile({ fileName: `Taskin-bilan-hebdo-${drWeek.start}${drState.pole !== 'all' ? '-' + drState.pole : ''}.pptx` });
}

// ---------- Appels manqués (Appels manqués › Statistiques) ----------
async function rsMissedDeck() {
  const PptxGenJS = await rsLoadLibrary();
  const list = mcFiltered();
  const s = mcStats(list);
  const [from, to] = mcPeriod();
  const period = from === to ? mcDayLabel(from) : `Du ${mcDayLabel(from)} au ${mcDayLabel(to)}`;
  const filters = [mcState.agent === '__all' ? 'Tous les agents' : mcAgentLabel(mcState.rows.find(r => mcAgentKey(r) === mcState.agent) || { agent_id: mcState.agent }), mcState.cause === '__all' ? 'toutes les causes' : `cause « ${mcState.cause} »`].join(' · ');
  const rate = s.rate === null ? null : parseFloat(String(s.rate).replace(',', '.'));
  const pptx = rsNewDeck(PptxGenJS, `Appels manqués — ${period}`);
  rsCover(pptx, 'Gestion des appels manqués', period, filters);

  let slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Synthèse', `${period} · objectifs client : ≥ 90 % rappelés, 0 appel perdu`);
  rsKpis(slide, [
    { label: 'Appels manqués', value: s.total, color: RS.blue },
    { label: 'Rappelés', value: s.done, color: RS.green },
    { label: 'Non rappelés', value: s.lost, color: s.lost ? RS.red : RS.green, valueColor: s.lost ? RS.red : RS.text },
    { label: 'Taux de rappel', value: s.rate === null ? '—' : `${s.rate} %`, sub: rate === null ? '' : rate >= 90 ? 'Objectif atteint (≥ 90 %)' : 'Sous l’objectif de 90 %', color: rate === null ? RS.grey : rate >= 90 ? RS.green : RS.red, valueColor: rate === null ? RS.text : rate >= 90 ? RS.green : RS.red },
    { label: 'Rappel en moins de 5 min', value: s.fastRate === null ? '—' : `${s.fastRate} %`, color: RS.blue },
    { label: 'Encore à rappeler', value: s.pending, color: s.pending ? RS.amber : RS.green },
    ...s.shifts.map(x => ({ label: x.label, value: x.count, sub: 'appels manqués', color: RS.grey })).slice(0, 2),
  ]);

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Quand les appels sont-ils manqués ?', `Répartition par heure (7h–23h) · ${s.shifts.map(x => `${x.label} : ${x.count}`).join(' · ')}`);
  slide.addChart(pptx.ChartType.bar, [{ name: 'Appels manqués', labels: s.hours.map(h => `${h.h}h`), values: s.hours.map(h => h.count) }],
    { x: 0.5, y: 1.4, w: 12.33, h: 5.4, barDir: 'col', chartColors: [RS.red], showValue: true, dataLabelFontSize: 11, catAxisLabelFontFace: RS.font, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, valGridLine: { color: RS.border, size: 0.5 } });

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Causes et actions correctives', 'Classées par fréquence');
  if (s.causes.length) {
    slide.addChart(pptx.ChartType.bar, [{ name: 'Occurrences', labels: s.causes.map(c => c.cause), values: s.causes.map(c => c.count) }],
      { x: 0.5, y: 1.4, w: 5.6, h: 5.4, barDir: 'bar', chartColors: [RS.amber], showValue: true, dataLabelFontSize: 11, catAxisLabelFontFace: RS.font, catAxisLabelFontSize: 11, catAxisOrientation: 'maxMin', valAxisHidden: true, valGridLine: { style: 'none' } });
    rsTable(slide, ['Cause', '%', 'Action corrective'], s.causes.map(c => [c.cause, `${Math.round(c.count / s.total * 100)} %`, MC_ACTIONS[c.cause]]), { x: 6.35, y: 1.4, w: 6.48, colW: [2.1, 0.6, 3.78], fontSize: 10.5, rowH: 0.36 });
  } else rsBullets(slide, [['Aucun appel manqué sur la période.', RS.muted]]);

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Détail par agent', period);
  rsTable(slide, ['Agent', 'Manqués', 'Rappelés', 'Non rappelés', 'Taux de rappel', 'A rappelé (collègues inclus)'],
    s.agents.map(x => [x.agent.name, x.missed, x.recalled, { text: x.lost, options: { color: x.lost ? RS.red : RS.text, bold: !!x.lost } },
      { text: x.rate === null ? '—' : `${x.rate} %`, options: { color: x.rate === null ? RS.muted : x.rate >= 90 ? RS.green : x.rate >= 70 ? RS.amber : RS.red, bold: true } }, x.callbacks]),
    { colW: [3.33, 1.6, 1.6, 1.8, 2, 2], fontSize: 12 });

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Analyse', 'Lecture automatique des chiffres de la période');
  rsBullets(slide, mcAnalysis(s).map(t => [t, /sous l’objectif|faire un point|à rappeler/.test(t) ? RS.red : RS.text]));

  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Message client', 'À copier dans l’e-mail du lundi · texte modifiable');
  rsMessage(slide, mcEl('mc-message')?.value || mcClientMessage(s));

  await pptx.writeFile({ fileName: `Taskin-appels-manques-${from}_${to}${mcState.agent !== '__all' ? '-' + rsSlug(mcState.agent.replace(/^name:/, '')) : ''}.pptx` });
}

async function taskinGenerateSlides(kind, button) {
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Génération…'; }
  try {
    if (kind === 'week') await rsWeeklyDeck();
    else if (kind === 'missed') await rsMissedDeck();
  } catch (e) {
    console.error('Slides :', e);
    alert(`Les slides n’ont pas pu être générées : ${e.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}
window.taskinGenerateSlides = taskinGenerateSlides;
