// ===== TIME PICKER =====
let pickerHour = "00", pickerMin = "00";
let isScrolling = false;

function initTimePickerUI() {
  const hCol = document.getElementById('col-hours');
  const mCol = document.getElementById('col-mins');
  if (!hCol || !mCol) return;
  let hHtml = '<div class="time-spacer"></div>';
  let mHtml = '<div class="time-spacer"></div>';
  for(let i=0; i<24; i++) hHtml += `<div class="time-opt" data-val="${String(i).padStart(2,'0')}" onclick="clickTimeOpt('col-hours',${i})">${String(i).padStart(2,'0')}</div>`;
  for(let i=0; i<60; i++) mHtml += `<div class="time-opt" data-val="${String(i).padStart(2,'0')}" onclick="clickTimeOpt('col-mins',${i})">${String(i).padStart(2,'0')}</div>`;
  hHtml += '<div class="time-spacer"></div>';
  mHtml += '<div class="time-spacer"></div>';
  hCol.innerHTML = hHtml;
  mCol.innerHTML = mHtml;
}

function toggleTimePicker(e) {
  e?.stopPropagation();
  const drop = document.getElementById('time-dropdown');
  drop.classList.toggle('hidden');
  if (!drop.classList.contains('hidden')) syncPickerScroll();
}

function handleTimeScroll(col, type) {
  if (isScrolling) return;
  const opts = col.querySelectorAll('.time-opt');
  const center = col.scrollTop + col.clientHeight / 2;
  let closest = null, minDiff = Infinity;
  opts.forEach(opt => {
    const optCenter = opt.offsetTop + opt.offsetHeight / 2;
    const diff = Math.abs(center - optCenter);
    if (diff < minDiff) { minDiff = diff; closest = opt; }
  });
  if (closest) {
    opts.forEach(o => o.classList.remove('active'));
    closest.classList.add('active');
    if (type === 'h') pickerHour = closest.dataset.val;
    else pickerMin = closest.dataset.val;
    document.getElementById('inbound-time-input').value = `${pickerHour}:${pickerMin}`;
  }
}

function syncPickerScroll() {
  isScrolling = true;
  const hCol = document.getElementById('col-hours');
  const mCol = document.getElementById('col-mins');
  const hTarget = hCol.querySelector(`[data-val="${pickerHour}"]`);
  const mTarget = mCol.querySelector(`[data-val="${pickerMin}"]`);
  if (hTarget) hCol.scrollTop = hTarget.offsetTop - hCol.clientHeight/2 + hTarget.offsetHeight/2;
  if (mTarget) mCol.scrollTop = mTarget.offsetTop - mCol.clientHeight/2 + mTarget.offsetHeight/2;
  setTimeout(() => isScrolling = false, 50);
}

function clickTimeOpt(colId, index) {
  const col = document.getElementById(colId);
  const target = col.querySelectorAll('.time-opt')[index];
  if (target) col.scrollTo({ top: target.offsetTop - col.clientHeight/2 + target.offsetHeight/2, behavior: 'smooth' });
}

// ===== EMOJI PICKER =====
const QUICK_EMOJIS = ['✈️','🏨','🚗','🚆','🎫','📞','💬','📧','✅','❌','⚠️','📝','💼','🩺','🔍','💳','💡','🎉','🔄','🗺️','🚌','🧳','👋','➕'];

function initEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (!picker) return;
  picker.innerHTML = QUICK_EMOJIS.map(e => `<button class="emoji-btn" type="button" onclick="insertEmoji('${e}')">${e}</button>`).join('');
}

// Point 4 : toggleEmojiPicker — stopPropagation sur le bouton pour éviter le conflit de fermeture immédiate
function toggleEmojiPicker(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const picker = document.getElementById('emoji-picker');
  picker.classList.toggle('hidden');
}

function insertEmoji(emoji) {
  const input = document.getElementById('new-treatment-input');
  input.value += emoji;
  input.focus();
  document.getElementById('emoji-picker').classList.add('hidden');
}

// Fermer les popups au clic extérieur
document.addEventListener('click', (e) => {
  const timeDrop = document.getElementById('time-dropdown');
  if (timeDrop && !timeDrop.classList.contains('hidden') && !e.target.closest('#time-picker-container')) {
    timeDrop.classList.add('hidden');
  }
  const emojiDrop = document.getElementById('emoji-picker');
  if (emojiDrop && !emojiDrop.classList.contains('hidden') && !e.target.closest('.treatment-add-row')) {
    emojiDrop.classList.add('hidden');
  }
});

// ===== MODALES COMPTES & PROFIL =====
let editingAccountId = null;
let editingAccountPhotoData = null;

function openAccountEditModal(uid) {
  if (currentUser.role !== 'admin') return;
  editingAccountId = uid;
  editingAccountPhotoData = null;
  const u = TEAM.find(t => t.id === uid);
  if (!u) return;
  document.getElementById('account-modal-title').textContent = `Modifier — ${u.name}`;
  document.getElementById('account-name-input').value = u.name;
  document.getElementById('account-role-input').value = u.role;
  document.getElementById('account-password-input').value = '';
  document.getElementById('account-password-status').textContent = '';
  const prev = document.getElementById('account-photo-preview');
  if (u.photo) { prev.style.backgroundImage = `url(${u.photo})`; prev.textContent = ''; }
  else { prev.style.backgroundImage = ''; prev.textContent = u.initials; }
  document.getElementById('account-error').textContent = '';
  document.getElementById('account-modal-overlay').classList.remove('hidden');
}

function generateAccountPassword() {
  const pwd = 'Taskin' + Math.floor(1000 + Math.random() * 9000);
  document.getElementById('account-password-input').value = pwd;
}

function closeAccountEditModal() { document.getElementById('account-modal-overlay').classList.add('hidden'); }
function closeAccountModalOutside(e) { if (e.target === document.getElementById('account-modal-overlay')) closeAccountEditModal(); }

function onAccountPhotoSelected(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    editingAccountPhotoData = e.target.result;
    const prev = document.getElementById('account-photo-preview');
    prev.style.backgroundImage = `url(${editingAccountPhotoData})`; prev.textContent = '';
  };
  reader.readAsDataURL(file);
}

function removeAccountPhoto() {
  editingAccountPhotoData = '';
  const prev = document.getElementById('account-photo-preview');
  prev.style.backgroundImage = '';
  const u = TEAM.find(t => t.id === editingAccountId);
  prev.textContent = u ? u.initials : '';
}

async function saveAccountEdit() {
  if (!requireRoles('admin')) return;
  const name = document.getElementById('account-name-input').value.trim();
  const role = document.getElementById('account-role-input').value;
  const newPassword = document.getElementById('account-password-input').value.trim();
  const errEl = document.getElementById('account-error');
  const pwdStatus = document.getElementById('account-password-status');
  if (!name) { errEl.textContent = 'Le nom est requis.'; return; }
  const u = TEAM.find(t => t.id === editingAccountId);
  if (!u) return;
  errEl.textContent = '';
  const updatedUser = {...u, name, role, initials: name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)};
  if (editingAccountPhotoData !== null) updatedUser.photo = editingAccountPhotoData;
  const saved = await saveAccount(updatedUser);
  if (!saved) {
    errEl.textContent = 'Modification indisponible : le service Supabase Admin n’est pas configuré côté serveur.';
    return;
  }
  Object.assign(u, updatedUser);
  if (u.id === currentUser.id) { currentUser = {...currentUser, name: u.name, role: u.role, initials: u.initials, photo: u.photo}; renderTopbarIdentity(); }

  if (newPassword) {
    pwdStatus.textContent = 'Mise à jour du mot de passe…';
    try {
      const result = await adminSetPassword(u.id, newPassword);
      if (result.ok) { pwdStatus.textContent = 'Mot de passe mis à jour ✓'; document.getElementById('account-password-input').value = ''; }
      else { pwdStatus.textContent = 'Erreur mot de passe : ' + result.error; return; }
    } catch (e) { pwdStatus.textContent = 'Erreur réseau lors du changement de mot de passe.'; return; }
  }

  closeAccountEditModal();
  renderTeamList();
  populateFilters();
}

async function adminSetPassword(uid, newPassword) {
  if (!requireRoles('admin')) return { ok: false, error: 'Permission refusée' };
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return { ok: false, error: 'Supabase n’est pas configuré.' };
  try {
    const session = supabase.getSession();
    const res = await fetch('/api/admin-manage-supabase-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ action: 'setPassword', uid, password: newPassword }) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error || `Erreur (${res.status})` };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function deleteAccountFromModal() {
  if (!requireRoles('admin')) return;
  const u = TEAM.find(t => t.id === editingAccountId);
  if (!u) return;
  if (u.id === currentUser.id) { document.getElementById('account-error').textContent = 'Tu ne peux pas supprimer ton propre compte.'; return; }
  if (!confirm(`Supprimer définitivement le compte de ${u.name} ? Cette action est irréversible.`)) return;
  const errEl = document.getElementById('account-error');
  errEl.textContent = 'Suppression…';
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) { errEl.textContent = 'Supabase n’est pas configuré.'; return; }
    const session = supabase.getSession();
    const res = await fetch('/api/admin-manage-supabase-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ action: 'delete', uid: u.id }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errEl.textContent = 'Erreur : ' + (data.error || res.status); return; }
    TEAM = TEAM.filter(t => t.id !== u.id);
    closeAccountEditModal();
    renderTeamList();
    populateFilters();
  } catch (e) { errEl.textContent = 'Erreur réseau lors de la suppression.'; }
}

let createdEmail = '', createdPassword = '';

function openCreateAccountModal() {
  document.getElementById('create-account-overlay').classList.remove('hidden');
  document.getElementById('create-account-form').classList.remove('hidden');
  document.getElementById('create-account-result').classList.add('hidden');
  document.getElementById('create-account-footer').classList.remove('hidden');
  document.getElementById('new-account-name').value = '';
  document.getElementById('new-account-email').value = '';
  document.getElementById('new-account-role').value = 'agent';
  document.getElementById('create-account-error').textContent = '';
}

function closeCreateAccountModal() { document.getElementById('create-account-overlay').classList.add('hidden'); }
function closeCreateAccountModalOutside(e) { if (e.target === document.getElementById('create-account-overlay')) closeCreateAccountModal(); }

async function submitCreateAccount() {
  const name = document.getElementById('new-account-name').value.trim();
  const email = document.getElementById('new-account-email').value.trim();
  const role = document.getElementById('new-account-role').value;
  const errEl = document.getElementById('create-account-error');
  if (!name || !email) { errEl.textContent = 'Nom et email requis.'; return; }
  const btn = document.getElementById('create-account-submit');
  btn.disabled = true; btn.textContent = 'Création...';
  const tempPassword = 'Taskin' + Math.floor(1000+Math.random()*9000);
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
    const session = supabase.getSession();
    const colors = ['#2B4C7E','#E98A7D','#3B8C6E','#DCAE1D','#7B68EE','#FF7F50'];
    const initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const res = await fetch('/api/admin-manage-supabase-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ action: 'create', email, password: tempPassword, name, role, color: colors[TEAM.length % colors.length], initials }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errEl.textContent = data.error || 'Erreur création.'; btn.disabled = false; btn.textContent = 'Créer le compte'; return; }
    const newUser = { id: data.user.id, name, email, color: colors[TEAM.length % colors.length], initials, role, photo: '' };
    TEAM.push(newUser); createdEmail = email; createdPassword = tempPassword;
    document.getElementById('result-email').textContent = email; document.getElementById('result-password').textContent = tempPassword;
    document.getElementById('create-account-form').classList.add('hidden'); document.getElementById('create-account-result').classList.remove('hidden'); document.getElementById('create-account-footer').classList.add('hidden');
    renderTeamList(); populateFilters(); document.getElementById('team-count').textContent = TEAM.length + ' comptes';
  } catch(e) { errEl.textContent = 'Erreur réseau.'; console.error(e); btn.disabled=false; btn.textContent='Créer le compte'; }
}

function copyCreatedCredentials() {
  navigator.clipboard.writeText(`Email: ${createdEmail}\nMot de passe: ${createdPassword}`).then(()=>alert('Copié !')).catch(()=>{});
}

// Profil perso
let profilePhotoData = null;

function openProfileModal() {
  profilePhotoData = null;
  document.getElementById('profile-name-input').value = currentUser.name;
  document.getElementById('profile-password-input').value = '';
  document.getElementById('profile-error').textContent = '';
  const prev = document.getElementById('profile-photo-preview');
  if (currentUser.photo) { prev.style.backgroundImage = `url(${currentUser.photo})`; prev.textContent = ''; }
  else { prev.style.backgroundImage = ''; prev.textContent = currentUser.initials; }
  document.getElementById('profile-modal-overlay').classList.remove('hidden');
}

function closeProfileModal() { document.getElementById('profile-modal-overlay').classList.add('hidden'); }
function closeProfileModalOutside(e) { if (e.target === document.getElementById('profile-modal-overlay')) closeProfileModal(); }

function onProfilePhotoSelected(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    profilePhotoData = e.target.result;
    const prev = document.getElementById('profile-photo-preview');
    prev.style.backgroundImage = `url(${profilePhotoData})`; prev.textContent = '';
  };
  reader.readAsDataURL(file);
}

function removeProfilePhoto() {
  profilePhotoData = '';
  const prev = document.getElementById('profile-photo-preview');
  prev.style.backgroundImage = ''; prev.textContent = currentUser.initials;
}

async function saveProfile() {
  const name = document.getElementById('profile-name-input').value.trim();
  const password = document.getElementById('profile-password-input').value;
  const errEl = document.getElementById('profile-error');
  if (!name) { errEl.textContent = 'Le nom est requis.'; return; }
  currentUser.name = name;
  currentUser.initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  if (profilePhotoData !== null) currentUser.photo = profilePhotoData;
  const u = TEAM.find(t => t.id === currentUser.id);
  if (u) { u.name = currentUser.name; u.initials = currentUser.initials; u.photo = currentUser.photo; }
  await saveAccount(currentUser);
  if (password) {
    try {
      const supabase = window.taskinDataProviders?.supabase;
      if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
      await supabase.updatePassword(password);
    } catch(e) { console.error(e); }
  }
  renderTopbarIdentity();
  closeProfileModal();
}
