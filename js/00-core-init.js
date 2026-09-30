let TEAM = [];
let teamById = new Map();
let liveRefreshInterval = null;
const entryDateCache = new Map();
const SOURCE_DMT_DEFAULT = { ringover: 300, crisp: 480, manual: 600 };
let sourceDMT = {...SOURCE_DMT_DEFAULT};

// Point 4 : TREATMENT_TYPES_DEFAULT avec emojis
const TREATMENT_TYPES_DEFAULT = [
  '✅ Confirmation','🎫 Reservations','💡 Conseils/suggestions','🔄 Follow-up',
  '🔍 Lost and found','🚗 Car rental','➕ Additionnels services','🚆 Train',
  '🩺 Health','🎉 Activities','🚌 Transferts','🗺️ DMC','📋 Itinerary',
  '🏨 Accommodation','🧳 Luggage','✈️ Flights','📞 Welcome call','👋 Goodbye call'
];

// ===== Sécurité d'affichage =====
// Tout texte saisi par un utilisateur (nom, description, note…) passe par escHtml avant
// d'être inséré dans du HTML : il s'affiche tel quel au lieu d'être interprété comme du code.
function escHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}
// Couleur de profil utilisée dans des attributs style : uniquement un code hexadécimal.
function safeColor(value, fallback = '#2563EB') {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
}
// Photo de profil utilisée dans url(...) : https ou image base64, sans caractère qui casserait le style.
function safePhoto(value) {
  const v = String(value || '');
  if (/^https:\/\/[^\s"'()<>\\]+$/.test(v)) return v;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  return '';
}

let currentUser = null;
let entries = [];
let activeTimer = null;
let timerInterval = null;
let selectedSource = 'inbound';
let currentView = 'today';
let searchTimeout = null;

// Charge les modules lourds uniquement lors de leur première utilisation.
const moduleCache = new Map();
// Version des modules chargés à la demande : à incrémenter quand l’un d’eux change,
// sinon le navigateur peut garder l’ancienne copie en cache.
const TASKIN_MODULE_VERSION = '20260930sec';
async function loadModule(name) {
  if (moduleCache.has(name)) return moduleCache.get(name);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `js/${name}?v=${TASKIN_MODULE_VERSION}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Module ${name} introuvable`));
    document.head.appendChild(script);
  });
  moduleCache.set(name, promise);
  return promise;
}

function preloadRoleModules(role = currentUser?.role) {
  const modules = role === 'admin'
    ? ['05-training.js', '09-documentation.js', '10-supervision.js', '12-admin-workflow.js']
    : role === 'supervisor'
      ? ['09-documentation.js', '10-supervision.js', '12-admin-workflow.js']
      : role === 'formateur'
        ? ['05-training.js', '09-documentation.js']
        : ['09-documentation.js'];

  modules.forEach(name => {
    const href = `js/${name}`;
    if (document.querySelector(`link[data-taskin-preload="${name}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = href;
    link.dataset.taskinPreload = name;
    document.head.appendChild(link);
  });
}
