// ===== INIT =====
initTimePickerUI();
initEmojiPicker();

async function initApp() {
  if (!(await tryRestoreSession())) {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

initApp();
