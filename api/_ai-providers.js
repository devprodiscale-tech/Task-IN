// Task’in — API IA multiples (côté serveur uniquement ; fichier préfixé « _ » : pas exposé comme endpoint).
// Les API sont configurées dans Paramètres › API IA (table taskin_ai_providers, lisible par la seule clé
// service). Chaque appel est journalisé dans taskin_ai_usage (succès, durée) pour le donut d’état.
// Ordre d’essai : les API actives dont le comportement couvre la tâche, le module et l’horaire, par rang ;
// en dernier recours, Gemini configuré par la variable GEMINI_API_KEY (comportement historique).

const { Anthropic } = require('@anthropic-ai/sdk');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_GEMINI_MODEL = 'gemini-3.6-flash';
const DEFAULT_MODELS = { gemini: 'gemini-3.6-flash', anthropic: 'claude-opus-5-5', openai: 'gpt-5' };
const TASKS = ['structure_procedure'];
const MODULES = ['documentation', 'formation'];
const WHEN = ['always', 'business_hours', 'off_hours'];

async function db(path, init = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Configuration Supabase serveur incomplète.');
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || `Supabase ${response.status}`);
  return body;
}

// Heure de Madagascar (UTC+3) : « heures de bureau » = 8 h – 18 h, du lundi au samedi.
function businessHours(date = new Date()) {
  const local = new Date(date.getTime() + 3 * 3600e3);
  const h = local.getUTCHours(), day = local.getUTCDay();
  return day !== 0 && h >= 8 && h < 18;
}
function matches(p, task, module, now) {
  const b = p.behavior || {};
  const tasks = Array.isArray(b.tasks) && b.tasks.length ? b.tasks : TASKS;
  const modules = Array.isArray(b.modules) && b.modules.length ? b.modules : MODULES;
  const when = WHEN.includes(b.when) ? b.when : 'always';
  if (!tasks.includes(task) || (module && !modules.includes(module))) return false;
  if (when === 'business_hours' && !businessHours(now)) return false;
  if (when === 'off_hours' && businessHours(now)) return false;
  return true;
}

async function usageToday(ids) {
  if (!ids.length) return {};
  const start = new Date(Date.now() + 3 * 3600e3); start.setUTCHours(0, 0, 0, 0);
  const from = new Date(start.getTime() - 3 * 3600e3).toISOString();
  const rows = await db(`/rest/v1/taskin_ai_usage?select=provider_id&created_at=gte.${encodeURIComponent(from)}&provider_id=in.(${ids.join(',')})&limit=100000`).catch(() => []);
  return (rows || []).reduce((acc, r) => { acc[r.provider_id] = (acc[r.provider_id] || 0) + 1; return acc; }, {});
}

// Liste ordonnée des API à essayer pour une tâche (clé incluse : usage serveur uniquement).
async function candidates(task, module) {
  let rows = [];
  try { rows = await db('/rest/v1/taskin_ai_providers?select=*&enabled=eq.true&order=rank.asc,created_at.asc') || []; } catch (_) { rows = []; }
  const now = new Date();
  const eligible = rows.filter(p => p.api_key && matches(p, task, module, now));
  const used = await usageToday(eligible.filter(p => p.daily_quota).map(p => p.id));
  const list = eligible.filter(p => !p.daily_quota || (used[p.id] || 0) < p.daily_quota);
  if (process.env.GEMINI_API_KEY) list.push({ id: null, name: 'Gemini (variable serveur)', provider: 'gemini', model: ENV_GEMINI_MODEL, api_key: process.env.GEMINI_API_KEY });
  return list;
}

async function logUsage(p, { task, module, ok, latency, error, userId }) {
  try {
    await db('/rest/v1/taskin_ai_usage', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ provider_id: p.id || null, provider: p.provider, model: p.model, task, module: module || null, ok, latency_ms: latency, error: error ? String(error).slice(0, 500) : null, user_id: userId || null }) });
  } catch (e) { console.error('Journal IA impossible', e.message); }
}

// Un appel « système + contenu utilisateur → texte JSON ». input = { text } ou { fileBase64, mediaType }.
async function callProvider(p, { system, intro, input, maxTokens = 8000 }) {
  const model = p.model || DEFAULT_MODELS[p.provider];
  if (p.provider === 'gemini') {
    const parts = input.fileBase64 ? [{ inline_data: { mime_type: input.mediaType, data: input.fileBase64 } }, { text: intro }] : [{ text: `${intro}\n\n${input.text}` }];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(p.api_key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { response_mime_type: 'application/json', max_output_tokens: maxTokens } }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`Gemini ${r.status} : ${String(data?.error?.message || '').slice(0, 200)}`);
    const candidate = (data?.candidates || [])[0];
    const text = candidate?.content?.parts?.find(x => typeof x.text === 'string')?.text;
    if (!text) throw new Error(candidate?.finishReason === 'SAFETY' ? 'Refus du filtre de sécurité Gemini.' : 'Réponse Gemini vide.');
    return text;
  }
  if (p.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: p.api_key, timeout: 120000, maxRetries: 1 });
    const content = [];
    if (input.fileBase64 && input.mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.fileBase64 } });
    else if (input.fileBase64) content.push({ type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.fileBase64 } });
    content.push({ type: 'text', text: input.fileBase64 ? intro : `${intro}\n\n${input.text}` });
    // Repli serveur automatique (refus de sécurité) vers un autre modèle Claude ; effort moyen suffit ici.
    const response = await client.beta.messages.create({
      model, max_tokens: Math.max(maxTokens, 16000), system,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') throw new Error(`Refus du modèle Claude${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`);
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) throw new Error('Réponse Claude vide.');
    return text;
  }
  if (p.provider === 'openai') {
    if (input.fileBase64 && input.mediaType === 'application/pdf') throw new Error('PDF non pris en charge par cette API (utiliser Gemini ou Claude).');
    const userContent = input.fileBase64
      ? [{ type: 'text', text: intro }, { type: 'image_url', image_url: { url: `data:${input.mediaType};base64,${input.fileBase64}` } }]
      : `${intro}\n\n${input.text}`;
    const base = String(p.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }] }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`API ${r.status} : ${String(data?.error?.message || '').slice(0, 200)}`);
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Réponse vide.');
    return text;
  }
  throw new Error('Fournisseur inconnu.');
}

// Essaie chaque API candidate dans l'ordre ; journalise chaque tentative. Renvoie { text, provider }.
async function runTask({ task, module, userId, system, intro, input, maxTokens }) {
  const list = await candidates(task, module);
  if (!list.length) throw Object.assign(new Error('Aucune API IA configurée (Paramètres › API IA) et GEMINI_API_KEY absente.'), { status: 500 });
  const errors = [];
  for (const p of list) {
    const t0 = Date.now();
    try {
      const text = await callProvider(p, { system, intro, input, maxTokens });
      await logUsage(p, { task, module, ok: true, latency: Date.now() - t0, userId });
      return { text, provider: { id: p.id, name: p.name, provider: p.provider, model: p.model } };
    } catch (e) {
      await logUsage(p, { task, module, ok: false, latency: Date.now() - t0, error: e.message, userId });
      errors.push(`${p.name} : ${e.message}`);
    }
  }
  throw Object.assign(new Error(`Toutes les API IA ont échoué. ${errors.join(' · ')}`.slice(0, 600)), { status: 502 });
}

module.exports = { db, runTask, callProvider, logUsage, businessHours, TASKS, MODULES, WHEN, DEFAULT_MODELS };
