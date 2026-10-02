// ===== INIT =====
initTimePickerUI();
initEmojiPicker();

async function initApp() {
  // Lien « mot de passe oublié » reçu par e-mail : #access_token=…&type=recovery (ou erreur de lien expiré).
  let recovery = null;
  try { recovery = window.taskinDataProviders?.supabase?.consumeRecoveryHash?.() || null; } catch (_) { recovery = null; }
  if (recovery) {
    history.replaceState(null, '', location.pathname + location.search);
    document.getElementById('login-screen').style.display = 'flex';
    if (recovery.type === 'recovery') window.taskinLanding?.showRecovery();
    else window.taskinLanding?.showLinkError(recovery.error);
    return;
  }
  if (!(await tryRestoreSession())) {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

initApp();
