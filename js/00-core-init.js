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

let currentUser = null;
let entries = [];
let activeTimer = null;
let timerInterval = null;
let selectedSource = 'inbound';
let currentView = 'today';
let searchTimeout = null;

// Charge les modules lourds uniquement lors de leur première utilisation.
const moduleCache = new Map();
async function loadModule(name) {
  if (moduleCache.has(name)) return moduleCache.get(name);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `js/${name}`;
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
