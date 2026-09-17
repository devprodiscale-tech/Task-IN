// ===== DOCUMENTATION =====
let pdfJsLoadPromise = null;
async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('PDF.js indisponible'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Impossible de charger PDF.js'));
    document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

let docProcedures = [];
let docCurrentEditingId = null;
let docBlocks = [];

function docCanEdit() {
  return currentUser && ['admin', 'supervisor', 'formateur'].includes(currentUser.role);
}
function docIsAdmin() {
  return currentUser && currentUser.role === 'admin';
}

async function docLoadProcedures() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return;
  try {
    const rows = await supabase.listTable('procedures', 300);
    docProcedures = (rows || []).map(row => ({
      id: row.id, title: row.title, category: row.category, description: row.description,
      version: row.version, status: row.status, validationStatus: row.validation_status,
      ownerId: row.owner_id, trainingOwnerId: row.training_owner_id,
      sections: row.sections || [], sourceMetadata: row.source_metadata || {},
      createdAt: row.created_at, updatedAt: row.updated_at,
      ...(row.source_metadata?.taskin || {})
    }));
  } catch (e) { console.error('docLoadProcedures Supabase', e); docProcedures = []; }
}

async function docRenderList() {
  document.querySelectorAll('.doc-edit-only').forEach(el => el.classList.toggle('hidden', !docCanEdit()));
  document.querySelectorAll('.doc-admin-only').forEach(el => el.classList.toggle('hidden', !docIsAdmin()));
  await docLoadProcedures();
  const search = (document.getElementById('doc-search-input').value || '').toLowerCase();
  const fmt = document.getElementById('doc-format-filter').value;
  const filtered = docProcedures.filter(p => {
    if (fmt !== '__all' && p.format !== fmt) return false;
    if (search && !(p.title || '').toLowerCase().includes(search) && !(p.description || '').toLowerCase().includes(search)) return false;
    if (currentUser.role === 'agent' && p.visibleTo && !p.visibleTo.includes('agent')) return false;
    if (currentUser.role === 'formateur' && p.trainingOwnerId !== currentUser.id && !(p.ownerRole === 'formateur' && p.createdBy === currentUser.id)) return false;
    return true;
  });
  document.getElementById('doc-count-badge').textContent = `${filtered.length} procédure(s)`;
  const grid = document.getElementById('doc-card-grid');
  if (filtered.length === 0) { grid.innerHTML = `<div class="doc-empty">Aucune procédure trouvée.</div>`; return; }
  grid.innerHTML = filtered.map(p => `
    <div class="doc-card" onclick="docCardClick('${p.id}')">
      <div class="doc-card-title">${docEsc(p.title || 'Sans titre')}</div>
      <div class="doc-card-desc">${docEsc(p.description || '')}</div>
      <div>${(p.tags || []).map(t => `<span class="doc-tag">${docEsc(t)}</span>`).join('')}</div>
      <div class="doc-format-badge doc-fmt-${p.format || 'narrative'}">${docFormatLabel(p.format)}${p.version ? ` · v${docEsc(p.version)}` : ''}</div>
    </div>`).join('');
}
function docFormatLabel(f) {
  return { narrative: "Narrative", action_table: "Tableau d'action", supplier_guide: "Fiche fournisseur", role_guide: "Rôle / Organisation", hybrid: "Hybride" }[f] || f || "—";
}
function docCardClick(id) {
  const p = docProcedures.find(x => x.id === id);
  if (!p) return;
  if (docCanEdit()) docOpenEditor(p); else docOpenReadModal(p);
}

// -- Vue lecture seule (agents) --
function docOpenReadModal(p) {
  document.getElementById('doc-read-title').textContent = p.title || '';
  document.getElementById('doc-read-content').innerHTML = (p.sections || []).map(docRenderReadBlock).join('');
  document.getElementById('doc-read-overlay').classList.remove('hidden');
}
function docCloseReadModal() { document.getElementById('doc-read-overlay').classList.add('hidden'); }
function docCloseReadModalOutside(e) { if (e.target.id === 'doc-read-overlay') docCloseReadModal(); }
function docFormatInline(s) {
  return docEsc(s || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
function docIsUrgentRow(r) {
  const hay = ((r.type || '') + ' ' + (r.subject || '')).toLowerCase();
  const keywords = ['retard', 'manqu', 'urgence', 'urgent', 'sécurit', 'securit', 'annul', 'panne', 'accident', 'perdu', 'sinistre', 'grève', 'greve', 'force majeure'];
  return keywords.some(k => hay.includes(k));
}
function docRenderReadBlock(b) {
  if (b.type === 'text') return `<p class="doc-read-block">${docFormatInline(b.content).replace(/\n/g, '<br>')}</p>`;
  if (b.type === 'list') return `<ul class="doc-read-block">${(b.items || []).map(i => `<li>${docFormatInline(i)}</li>`).join('')}</ul>`;
  if (b.type === 'callout') {
    const style = b.style || 'info';
    return `<div class="doc-read-block doc-read-callout doc-read-callout-${style}">${docFormatInline(b.content).replace(/\n/g, '<br>')}</div>`;
  }
  if (b.type === 'contact') return `<div class="doc-read-block">${(b.entries || []).map(e => `<div><strong>${docEsc(e.label)}:</strong> ${docEsc(e.value)}</div>`).join('')}</div>`;
  if (b.type === 'table') return docRenderReadTable(b);
  return '';
}
function docRenderReadTable(b) {
  const rows = b.rows || [];
  const urgent = rows.filter(docIsUrgentRow);
  const other = rows.filter(r => !docIsUrgentRow(r));
  let html = '';
  if (urgent.length) {
    html += `<div class="doc-read-group-label doc-read-group-urgent">⚠ Situations urgentes</div>`;
    html += `<div class="doc-read-urgent-list">` + urgent.map(r => docRenderUrgentCard(r)).join('') + `</div>`;
  }
  if (other.length) {
    html += `<div class="doc-read-group-label">Autres situations</div>`;
    html += `<div class="doc-read-other-list">` + other.map((r, i) => docRenderCollapsedRow(r, b.id + '-' + i)).join('') + `</div>`;
  }
  return `<div class="doc-read-block">${html}</div>`;
}
function docRenderUrgentCard(r) {
  return `<div class="doc-urgent-card">
    <div class="doc-urgent-card-head">
      <div class="doc-urgent-card-title">${docEsc(r.type)}</div>
      <span class="doc-urgent-badge">urgent</span>
    </div>
    <div class="doc-urgent-card-subject">${docFormatInline(r.subject)}</div>
    <div class="doc-urgent-card-actions"><strong>Actions :</strong> ${docFormatInline(r.actionSteps).replace(/\n/g, '<br>')}</div>
    ${r.notes ? `<div class="doc-urgent-card-notes">${docFormatInline(r.notes).replace(/\n/g, '<br>')}</div>` : ''}
  </div>`;
}
function docRenderCollapsedRow(r, uid) {
  return `<div class="doc-collapsed-row" id="doc-row-${uid}">
    <div class="doc-collapsed-row-head" onclick="docToggleRow('${uid}')">
      <div class="doc-collapsed-row-title">${docEsc(r.type)} — ${docEsc(r.subject)}</div>
      <span class="doc-collapsed-chevron">▸</span>
    </div>
    <div class="doc-collapsed-row-detail hidden">
      <div><strong>Impact :</strong> ${docFormatInline(r.impact).replace(/\n/g, '<br>')}</div>
      <div style="margin-top:6px">${docFormatInline(r.actionSteps).replace(/\n/g, '<br>')}</div>
      ${r.notes ? `<div style="margin-top:6px" class="doc-collapsed-notes">${docFormatInline(r.notes).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
  </div>`;
}
function docToggleRow(uid) {
  const row = document.getElementById('doc-row-' + uid);
  if (!row) return;
  const detail = row.querySelector('.doc-collapsed-row-detail');
  const chevron = row.querySelector('.doc-collapsed-chevron');
  detail.classList.toggle('hidden');
  chevron.textContent = detail.classList.contains('hidden') ? '▸' : '▾';
}


// -- Éditeur --
function docOpenEditor(existing) {
  docCurrentEditingId = existing ? existing.id : null;
  document.getElementById('doc-editor-title').textContent = existing ? 'Modifier : ' + existing.title : 'Nouvelle procédure';
  document.getElementById('doc-delete-btn').style.display = existing ? 'inline-flex' : 'none';
  document.getElementById('doc-import-banner').classList.add('hidden');

  document.getElementById('doc-f-title').value = existing?.title || '';
  document.getElementById('doc-f-category').value = existing?.category || '';
  document.getElementById('doc-f-format').value = existing?.format || 'narrative';
  document.getElementById('doc-f-description').value = existing?.description || '';
  document.getElementById('doc-f-version').value = existing?.version || '1.0';
  document.getElementById('doc-f-change-summary').value = existing?.changeSummary || '';
  document.getElementById('doc-f-validation-status').value = existing ? (existing.validationStatus || existing.status || 'validated') : 'draft';
  document.getElementById('doc-f-tags').value = (existing?.tags || []).join(', ');

  const visibleTo = existing?.visibleTo || ['agent', 'supervisor', 'formateur', 'admin'];
  document.querySelectorAll('.doc-visibleTo').forEach(cb => cb.checked = visibleTo.includes(cb.value));

  docBlocks = existing?.sections ? JSON.parse(JSON.stringify(existing.sections)) : [];
  docRenderBlocks();
  document.getElementById('doc-editor-overlay').classList.remove('hidden');
}
function docCloseEditor() { document.getElementById('doc-editor-overlay').classList.add('hidden'); }
function docCloseModalOutside(e) { if (e.target.id === 'doc-editor-overlay') docCloseEditor(); }

function docNewId() { return 'b' + Date.now() + Math.random().toString(36).slice(2, 7); }
function docAddBlock(type) {
  const base = { type, id: docNewId() };
  if (type === 'text') base.content = '';
  if (type === 'list') base.items = [''];
  if (type === 'callout') { base.style = 'info'; base.content = ''; }
  if (type === 'contact') base.entries = [{ label: '', value: '' }];
  if (type === 'table') base.rows = [{ type: '', subject: '', impact: '', actionSteps: '', notes: '' }];
  docBlocks.push(base);
  docRenderBlocks();
}
function docRemoveBlock(id) { docBlocks = docBlocks.filter(b => b.id !== id); docRenderBlocks(); }
function docMoveBlock(id, dir) {
  const idx = docBlocks.findIndex(b => b.id === id); const n = idx + dir;
  if (n < 0 || n >= docBlocks.length) return;
  [docBlocks[idx], docBlocks[n]] = [docBlocks[n], docBlocks[idx]];
  docRenderBlocks();
}
function docRenderBlocks() {
  const c = document.getElementById('doc-blocks-container');
  if (docBlocks.length === 0) { c.innerHTML = `<div class="doc-empty" style="padding:16px">Aucun bloc — importe un fichier ou ajoute du contenu.</div>`; return; }
  c.innerHTML = docBlocks.map(b => docBlockHtml(b)).join('');
}
function docBlockHtml(b) {
  let inner = '';
  if (b.type === 'text') inner = `<textarea class="form-input" rows="4" oninput="docUpdateField('${b.id}','content',this.value)">${docEsc(b.content || '')}</textarea>`;
  if (b.type === 'list') inner = b.items.map((it, i) => `<div class="doc-list-row"><input class="form-input" value="${docEscAttr(it)}" oninput="docUpdateListItem('${b.id}',${i},this.value)"><button class="icon-btn" onclick="docRemoveListItem('${b.id}',${i})">✕</button></div>`).join('') + `<button class="btn btn-ghost" onclick="docAddListItem('${b.id}')">+ élément</button>`;
  if (b.type === 'callout') inner = `<select class="form-select" onchange="docUpdateField('${b.id}','style',this.value)"><option value="info" ${b.style === 'info' ? 'selected' : ''}>Info</option><option value="warning" ${b.style === 'warning' ? 'selected' : ''}>Attention</option><option value="important" ${b.style === 'important' ? 'selected' : ''}>Important</option></select><textarea class="form-input" rows="3" oninput="docUpdateField('${b.id}','content',this.value)">${docEsc(b.content || '')}</textarea>`;
  if (b.type === 'contact') inner = b.entries.map((e, i) => `<div class="doc-list-row"><input class="form-input" placeholder="Label" value="${docEscAttr(e.label)}" oninput="docUpdateContact('${b.id}',${i},'label',this.value)"><input class="form-input" placeholder="Valeur" value="${docEscAttr(e.value)}" oninput="docUpdateContact('${b.id}',${i},'value',this.value)"><button class="icon-btn" onclick="docRemoveContact('${b.id}',${i})">✕</button></div>`).join('') + `<button class="btn btn-ghost" onclick="docAddContact('${b.id}')">+ contact</button>`;
  if (b.type === 'table') inner = `<div class="doc-table-row" style="font-weight:600;font-size:11px;color:var(--text2)"><div>Type</div><div>Sujet</div><div>Impact</div><div>Actions</div><div>Notes</div><div></div></div>` + b.rows.map((r, i) => `<div class="doc-table-row"><input class="form-input" value="${docEscAttr(r.type)}" oninput="docUpdateTable('${b.id}',${i},'type',this.value)"><input class="form-input" value="${docEscAttr(r.subject)}" oninput="docUpdateTable('${b.id}',${i},'subject',this.value)"><input class="form-input" value="${docEscAttr(r.impact)}" oninput="docUpdateTable('${b.id}',${i},'impact',this.value)"><textarea class="form-input" rows="2" oninput="docUpdateTable('${b.id}',${i},'actionSteps',this.value)">${docEsc(r.actionSteps)}</textarea><textarea class="form-input" rows="2" oninput="docUpdateTable('${b.id}',${i},'notes',this.value)">${docEsc(r.notes)}</textarea><button class="icon-btn" onclick="docRemoveTableRow('${b.id}',${i})">✕</button></div>`).join('') + `<button class="btn btn-ghost" onclick="docAddTableRow('${b.id}')">+ ligne</button>`;
  return `<div class="doc-block"><div class="doc-block-head"><strong style="font-size:11px;color:var(--ocean)">${({ text: 'Texte', list: 'Liste', table: "Tableau d'action", callout: 'Callout', contact: 'Contact' })[b.type]}</strong><div class="doc-block-actions"><button class="icon-btn" onclick="docMoveBlock('${b.id}',-1)">↑</button><button class="icon-btn" onclick="docMoveBlock('${b.id}',1)">↓</button><button class="icon-btn" onclick="docRemoveBlock('${b.id}')" style="color:var(--red)">✕</button></div></div>${inner}</div>`;
}
function docUpdateField(id, f, v) { const b = docBlocks.find(x => x.id === id); if (b) b[f] = v; }
function docUpdateListItem(id, i, v) { docBlocks.find(b => b.id === id).items[i] = v; }
function docAddListItem(id) { docBlocks.find(b => b.id === id).items.push(''); docRenderBlocks(); }
function docRemoveListItem(id, i) { docBlocks.find(b => b.id === id).items.splice(i, 1); docRenderBlocks(); }
function docUpdateContact(id, i, f, v) { docBlocks.find(b => b.id === id).entries[i][f] = v; }
function docAddContact(id) { docBlocks.find(b => b.id === id).entries.push({ label: '', value: '' }); docRenderBlocks(); }
function docRemoveContact(id, i) { docBlocks.find(b => b.id === id).entries.splice(i, 1); docRenderBlocks(); }
function docUpdateTable(id, i, f, v) { docBlocks.find(b => b.id === id).rows[i][f] = v; }
function docAddTableRow(id) { docBlocks.find(b => b.id === id).rows.push({ type: '', subject: '', impact: '', actionSteps: '', notes: '' }); docRenderBlocks(); }
function docRemoveTableRow(id, i) { docBlocks.find(b => b.id === id).rows.splice(i, 1); docRenderBlocks(); }

async function docSaveProcedure() {
  if (!requireRoles('admin', 'formateur')) return;
  const title = document.getElementById('doc-f-title').value.trim();
  if (!title) { alert('Le titre est obligatoire.'); return; }
  const visibleTo = [...document.querySelectorAll('.doc-visibleTo:checked')].map(cb => cb.value);
  const validationStatus = document.getElementById('doc-f-validation-status').value;
  const data = {
    title,
    slug: docSlugify(title),
    category: document.getElementById('doc-f-category').value.trim(),
    format: document.getElementById('doc-f-format').value,
    description: document.getElementById('doc-f-description').value.trim(),
    version: document.getElementById('doc-f-version').value.trim() || '1.0',
    changeSummary: document.getElementById('doc-f-change-summary').value.trim(),
    tags: document.getElementById('doc-f-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    visibleTo,
    sections: docBlocks,
    updatedAt: new Date(),
    updatedBy: currentUser.id,
    validationStatus,
    validatedAt: validationStatus === 'validated' ? new Date() : null,
    validatedBy: validationStatus === 'validated' ? currentUser.id : null,
    ownerRole: currentUser.role,
    trainingOwnerId: currentUser.role === 'formateur' ? currentUser.id : undefined
  };
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
    const row = { title: data.title, category: data.category, description: data.description, version: data.version, status: data.validationStatus || 'draft', validation_status: data.validationStatus || 'draft', owner_id: currentUser.id, training_owner_id: data.trainingOwnerId || null, sections: data.sections || [], source_metadata: { taskin: { slug: data.slug, format: data.format, changeSummary: data.changeSummary, tags: data.tags, visibleTo: data.visibleTo, updatedBy: data.updatedBy, validatedAt: data.validatedAt, validatedBy: data.validatedBy, ownerRole: data.ownerRole, createdBy: data.createdBy } } };
    if (docCurrentEditingId) await supabase.updateRow('procedures', docCurrentEditingId, row);
    else await supabase.insertRow('procedures', row);
    docCloseEditor();
    docRenderList();
  } catch (e) { alert('Erreur : ' + e.message); }
}
async function docDeleteProcedure() {
  if (!requireRoles('admin', 'formateur')) return;
  if (!docCurrentEditingId) return;
  if (!confirm('Supprimer définitivement cette procédure ?')) return;
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
    await supabase.deleteRow('procedures', docCurrentEditingId);
    docCloseEditor();
    docRenderList();
  } catch (e) { alert('Erreur : ' + e.message); }
}

// -- Import PDF / texte (sans IA, découpage par règles) --
function docOpenImportModal() { document.getElementById('doc-import-overlay').classList.remove('hidden'); document.getElementById('doc-import-status').textContent = ''; }
function docCloseImportModal() { document.getElementById('doc-import-overlay').classList.add('hidden'); document.getElementById('doc-file-input').value = ''; }
function docCloseImportModalOutside(e) { if (e.target.id === 'doc-import-overlay') docCloseImportModal(); }

(function initDocDropzone() {
  const bind = () => {
    const dz = document.getElementById('doc-dropzone');
    if (!dz || dz.dataset.bound === 'true') return;
    dz.dataset.bound = 'true';
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files.length) docHandleImportFile(e.dataTransfer.files[0]); });
    document.getElementById('doc-file-input')?.addEventListener('change', e => { if (e.target.files.length) docHandleImportFile(e.target.files[0]); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();

async function docHandleImportFile(file) {
  const status = document.getElementById('doc-import-status');
  const useAI = document.getElementById('doc-import-ai-toggle')?.checked;
  const nameLower = file.name.toLowerCase();
  const isText = file.type === 'text/plain' || nameLower.endsWith('.txt') || nameLower.endsWith('.md');
  const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(nameLower);

  if (!isText && !isPdf && !isImage) {
    status.textContent = 'Format non supporté. Utilise un PDF, une image (JPEG/PNG/WEBP/GIF) ou un fichier .txt/.md.';
    return;
  }
  if (file.size > 4.3 * 1024 * 1024) {
    status.textContent = `Fichier trop volumineux (${(file.size/1024/1024).toFixed(1)} Mo). Limite ~4 Mo.`;
    return;
  }

  status.textContent = 'Lecture du fichier…';
  try {
    if (isText) {
      const rawText = await file.text();
      if (rawText.trim().length < 30) {
        status.textContent = 'Ce fichier texte est vide ou trop court.';
        return;
      }
      if (useAI) {
        status.textContent = "✨ L'IA structure le document…";
        try {
          const aiResult = await docAIStructure({ text: rawText }, file.name);
          docApplyImportedProcedure(aiResult, () => docParseTextToBlocks(rawText), docGuessTitle(rawText, file.name));
          return;
        } catch (aiErr) {
          console.error('AI structuring failed, falling back to rule-based parsing', aiErr);
          status.textContent = "L'IA n'a pas pu structurer le document (" + aiErr.message + "). Découpage automatique par règles à la place…";
          await new Promise(r => setTimeout(r, 1400));
        }
      }
      status.textContent = 'Découpage automatique en cours…';
      docApplyImportedProcedure(null, () => docParseTextToBlocks(rawText), docGuessTitle(rawText, file.name));
      return;
    }

    // PDF ou image : nécessite l'IA (lecture native, gère aussi les scans/photos)
    if (!useAI) {
      status.textContent = "Les PDF scannés et les images nécessitent l'option “Structurer avec l'IA” — active-la puis réessaie.";
      return;
    }
    status.textContent = "✨ L'IA lit le document…";
    const base64 = await docFileToBase64(file);
    const mediaType = isPdf ? 'application/pdf' : (file.type || docGuessImageMime(nameLower));
    try {
      const aiResult = await docAIStructure({ fileBase64: base64, mediaType }, file.name);
      docApplyImportedProcedure(aiResult, () => [{ id: docNewId(), type: 'text', content: '' }], file.name.replace(/\.[^/.]+$/, ''));
    } catch (aiErr) {
      status.textContent = "L'IA n'a pas pu lire ce fichier : " + aiErr.message;
    }
  } catch (e) { status.textContent = "Erreur d'import : " + e.message; }
}

function docApplyImportedProcedure(aiResult, fallbackBlocksFn, fallbackTitle) {
  docCloseImportModal();
  docOpenEditor(null);
  document.getElementById('doc-f-title').value = (aiResult && aiResult.title) || fallbackTitle;
  document.getElementById('doc-f-category').value = (aiResult && aiResult.category) || '';
  document.getElementById('doc-f-format').value = (aiResult && aiResult.format) || 'narrative';
  document.getElementById('doc-f-description').value = (aiResult && aiResult.description) || '';
  document.getElementById('doc-f-tags').value = (aiResult && aiResult.tags || []).join(', ');
  docBlocks = (aiResult && aiResult.sections && aiResult.sections.length)
    ? aiResult.sections.map(b => ({ ...b, id: docNewId() }))
    : fallbackBlocksFn();
  docRenderBlocks();
  document.getElementById('doc-import-banner').classList.remove('hidden');
}

function docFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function docGuessImageMime(nameLower) {
  if (nameLower.endsWith('.png')) return 'image/png';
  if (nameLower.endsWith('.webp')) return 'image/webp';
  if (nameLower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function docAIStructure(payload, filename) {
  const apiKey = await docGetStoredApiKey();
  const res = await apiFetch('/api/ai-structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, filename, apiKey: apiKey || undefined }),
  });
  if (res.status === 404) {
    throw new Error("le endpoint /api/ai-structure n'est pas déployé sur Vercel (vérifie que api/ai-structure.js et package.json sont bien poussés sur GitHub, et que le déploiement a réussi)");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.procedure) {
    throw new Error((data && data.error) || `Erreur serveur (${res.status})`);
  }
  return data.procedure;
}

// ---- Gestion de la clé API IA, réservée aux admins ----
let _docApiKeyCache = null;
async function docGetStoredApiKey() {
  if (_docApiKeyCache !== null) return _docApiKeyCache;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return '';
  try { _docApiKeyCache = (await supabase.getSetting('aiIntegration'))?.value?.geminiApiKey || ''; return _docApiKeyCache; }
  catch (e) { console.error('docGetStoredApiKey Supabase', e); return ''; }
}
function docOpenApiKeyModal() {
  document.getElementById('doc-apikey-overlay').classList.remove('hidden');
  document.getElementById('doc-apikey-status').textContent = 'Chargement…';
  document.getElementById('doc-apikey-input').value = '';
  docGetStoredApiKey().then(key => {
    document.getElementById('doc-apikey-status').textContent = key
      ? `Clé enregistrée : ${key.slice(0,4)}…${key.slice(-4)}`
      : 'Aucune clé enregistrée pour le moment.';
  });
}
function docCloseApiKeyModal() { document.getElementById('doc-apikey-overlay').classList.add('hidden'); }
function docCloseApiKeyModalOutside(e) { if (e.target.id === 'doc-apikey-overlay') docCloseApiKeyModal(); }
async function docSaveApiKey() {
  if (!requireRoles('admin')) return;
  const input = document.getElementById('doc-apikey-input');
  const status = document.getElementById('doc-apikey-status');
  const value = input.value.trim();
  if (!value) { status.textContent = 'Entre une clé avant d\u2019enregistrer.'; return; }
  if (!value.startsWith('AIza')) { status.textContent = 'Cette clé ne ressemble pas à une clé Gemini (AIza…). Vérifie avant d\u2019enregistrer.'; }
  status.textContent = 'Enregistrement…';
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
    await supabase.upsertSetting('aiIntegration', { geminiApiKey: value }, currentUser.id);
    _docApiKeyCache = value;
    status.textContent = 'Clé enregistrée ✓';
    setTimeout(docCloseApiKeyModal, 900);
  } catch (e) { status.textContent = "Erreur d'enregistrement : " + e.message; }
}
async function docClearApiKey() {
  if (!requireRoles('admin')) return;
  const status = document.getElementById('doc-apikey-status');
  status.textContent = 'Suppression…';
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
    await supabase.upsertSetting('aiIntegration', { geminiApiKey: '' }, currentUser.id);
    _docApiKeyCache = '';
    document.getElementById('doc-apikey-input').value = '';
    status.textContent = 'Clé supprimée.';
  } catch (e) { status.textContent = 'Erreur : ' + e.message; }
}
async function docExtractPdfText(file) {
  const pdfjsLib = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n\n';
  }
  return text;
}
function docGuessTitle(text, filename) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const firstShort = lines.find(l => l.length > 2 && l.length < 70);
  return firstShort || filename.replace(/\.[^/.]+$/, '');
}
function docParseTextToBlocks(text) {
  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n');
  const lines = text.split('\n').map(l => l.trim());
  const result = [];
  let list = null, para = [];
  const bulletRe = /^[•\-\*◦]\s+/;
  const numRe = /^\d+[\.\)]\s+/;
  const calloutRe = /^(important|attention|note|tip|astuce|conseil|warning)\s*[:\-]/i;
  const flushPara = () => { if (para.length) { result.push({ id: docNewId(), type: 'text', content: para.join(' ').trim() }); para = []; } };
  const flushList = () => { if (list && list.items.length) result.push(list); list = null; };
  for (const line of lines) {
    if (!line) { flushPara(); continue; }
    if (calloutRe.test(line)) { flushPara(); flushList(); result.push({ id: docNewId(), type: 'callout', style: 'info', content: line }); continue; }
    if (bulletRe.test(line) || numRe.test(line)) { flushPara(); const cleaned = line.replace(bulletRe, '').replace(numRe, ''); if (!list) list = { id: docNewId(), type: 'list', items: [] }; list.items.push(cleaned); continue; }
    flushList();
    if (line.length < 70 && !/[.,;:]$/.test(line)) { flushPara(); result.push({ id: docNewId(), type: 'text', content: '**' + line + '**' }); }
    else { para.push(line); }
  }
  flushPara(); flushList();
  if (result.length === 0) result.push({ id: docNewId(), type: 'text', content: text.slice(0, 2000) });
  return result;
}

function docSlugify(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function docEsc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function docEscAttr(s) { return docEsc(s).replace(/"/g, '&quot;'); }

// ===== SEED — 15 procédures OnSpot (contenu réel des PDFs fournis) =====
const SEED_PROCEDURES = [
{
  title:`Health`, category:`Santé & assistance`, format:`narrative`,
  description:`Prise en charge des voyageurs malades, recherche de médecins, scope de l'assurance voyage.`,
  tags:[`urgence`,`assurance`,`santé`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`When travellers get sick during their trip, they can contact OnSpot for assistance.`},
    {type:`callout`,style:`important`,content:`Nos actions sont limitées : les problèmes médicaux nécessitent en dernier lieu l'intervention de l'assurance voyage / assistance médicale du client.`},
    {type:`text`,content:`**Finding Doctors**`},
    {type:`text`,content:`OnSpot peut aider les voyageurs en fournissant :`},
    {type:`list`,items:[`Adresses et coordonnées de médecins`,`Idéalement francophones ou anglophones (selon disponibilité)`,`Situés près de leur hébergement`]},
    {type:`text`,content:`**FO (Front Office) — Responsabilités**`},
    {type:`list`,items:[`Évaluer l'urgence du problème médical (si très urgent, rediriger vers les urgences les plus proches)`,`Identifier la nature du problème (spécialiste si besoin, sinon généraliste)`,`Vérifier la langue du client (si besoin, proposer une traduction téléphonique — uniquement si Léa et Eric sont en poste — ou Google Translate)`]},
    {type:`text`,content:`**BO (Back Office) — Responsabilités**`},
    {type:`list`,items:[`Appeler d'abord l'hébergement du voyageur (médecin à domicile ? recommandations ?)`,`Localiser précisément le voyageur (ville + adresse complète)`,`Trouver un médecin selon : localisation, spécialité, urgence, langue`,`Vérifier disponibilité et prix`]},
    {type:`callout`,style:`info`,content:`Dans certains pays, l'Ambassade/Consulat de France fournit des listes de médecins francophones (ex: Japon — Medical Referral List).`},
    {type:`text`,content:`**Prise de rendez-vous médical**`},
    {type:`list`,items:[`Prévenir le voyageur qu'il faut d'abord vérifier si la clinique accepte les réservations faites par un tiers`,`Demander à la clinique si elle peut réserver le rendez-vous pour le voyageur`]},
    {type:`text`,content:`**Scope de l'assurance voyage**`},
    {type:`callout`,style:`important`,content:`Le client doit être redirigé vers son assurance voyage, seule habilitée à : ouvrir un dossier sinistre, confirmer la couverture, autoriser les remboursements, organiser un retour anticipé/rapatriement.`},
    {type:`text`,content:`**Types d'assurance voyage**`},
    {type:`list`,items:[`Assurance carte bancaire : numéro d'assistance médicale au dos de la carte (Visa, Mastercard, Amex...)`,`Assurance agence : voir le dossier OS / Travelbook`]},
    {type:`callout`,style:`info`,content:`Cercle des Voyages : Note Client mentionne si une assurance a été souscrite via l'agence — Procédure : Travelbook → Information → Practical Information → Insurance & Claims. Terres Lointaines : PDF séparé dans le dossier OS.`},
    {type:`text`,content:`**Couverture : Frais médicaux / Retour anticipé / Rapatriement**`},
    {type:`list`,items:[`Frais médicaux : ce qui est couvert, ce qui doit être payé sur place, ce qui sera remboursé plus tard, ce que couvre la sécurité sociale / assurance santé privée`,`Retour anticipé : changement de vol retour, remboursement des prestations non utilisées, qui est éligible`,`Rapatriement : conditions, modifications de vol, remboursements, bénéficiaires éligibles`]},
    {type:`callout`,style:`info`,content:`L'assurance voyage couvre généralement ce qui n'est pas pris en charge par la sécurité sociale ou l'assurance santé privée du client.`}
  ]
},
{
  title:`E-SIM / Pocket Wifi`, category:`Connectivité`, format:`hybrid`,
  description:`Services additionnels connectivité, process KOLET et Travel Wifi, contacts et FAQ.`,
  tags:[`PREM`,`ELITE`,`connectivité`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Le Pocket WiFi est toujours un service additionnel. La carte e-SIM est incluse par défaut pour les forfaits PREM et ELITE, sauf cas particuliers. Toujours se référer à la grille tarifaire officielle (pricing.onspot.travel).`},
    {type:`table`,rows:[
      {type:`Pocket wifi`,subject:`Service optionnel`,impact:`Toujours optionnel (PLUS/PREM/ELITE)`,actionSteps:`Vérifier la grille tarifaire officielle`,notes:`pricing.onspot.travel`},
      {type:`E-SIM card`,subject:`Optionnel (PLUS) / Inclus 100Mo (PREM, ELITE)`,impact:`Varie selon le forfait souscrit`,actionSteps:`Vérifier la Trip Card`,notes:`Apparaît en gras sur la Trip Card si sélectionné par l'agence`}
    ]},
    {type:`text`,content:`**Pocket WiFi — Fournisseur : Travel Wifi**`},
    {type:`text`,content:`**Processus de commande**`},
    {type:`list`,items:[`L'agence ajoute l'option jusqu'à 4 jours avant le départ`,`Mode de livraison à préciser : adresse spécifique (voyageur ou agence) ou retrait à l'aéroport CDG`,`Le tarif varie selon le mode de livraison`,`Minimum 12 jours avant le départ pour la livraison (expédition 3–4 jours)`,`Si commande la même semaine que le départ, prévenir OnSpot pour vérifier auprès du fournisseur en urgence`,`Aucune commande possible dans les 4 jours avant le départ ou pendant le voyage`]},
    {type:`callout`,style:`info`,content:`Un guide utilisateur est fourni avec chaque Pocket Wifi — appareil prêt à l'emploi et connexion immédiate.`},
    {type:`contact`,entries:[
      {label:`Téléphone UK`,value:`+44 203 318 2523`},
      {label:`Téléphone US`,value:`+1 877 888 3741`},
      {label:`Téléphone FR (général)`,value:`+33 1 76 44 00 30 (puis 2)`},
      {label:`Téléphone FR (Boutique Opéra)`,value:`+33 1 89 16 40 94 (2 pour Christophe, Account Manager)`},
      {label:`Email support`,value:`support@travelwifi.com`},
      {label:`Email opérations FR`,value:`operations-fr@travelwifi.com`},
      {label:`Site web`,value:`travelwifi.com`},
      {label:`Contact urgence`,value:`Christophe RAUMEL — christophe.raumel@travelwifi.com`}
    ]},
    {type:`text`,content:`**Retrait à Roissy CDG** (voyageur muni du n° de commande, se rendre au Tourism Office du terminal de départ) :`},
    {type:`list`,items:[`Terminal 1 — niveau arrivées, près de la porte 4 — 7h15–20h45`,`Terminal 2 B/D — niveau arrivées, après douane — 7h15–20h45`,`Terminal 2E — niveau arrivées, près de la porte 7 — 7h15–20h45`,`Terminal 2F — niveau arrivées, près de la porte 11 — 7h15–20h45`]},
    {type:`text`,content:`**E-SIM — Fournisseur : KOLET**`},
    {type:`list`,items:[`1 voyageur = 1 e-SIM`,`Data : 1 Go par voyageur`,`Validité : 30 jours à partir de la première utilisation à destination`]},
    {type:`text`,content:`**Livraison & activation**`},
    {type:`list`,items:[`Email d'invitation KOLET envoyé dès que l'email du voyageur est saisi dans la TripCard`,`Le lien/QR code devient actif à J-1 du départ`,`Un seul lien pour tous les voyageurs de la même TripCard`,`Lien valide jusqu'à 30 jours après le début du voyage`,`Le voyageur doit : ouvrir l'email KOLET, télécharger l'app KOLET, installer et activer l'e-SIM`]},
    {type:`callout`,style:`warning`,content:`Le téléphone doit être compatible e-SIM (voir KOLET eSIM Compatibility) et une connexion internet/Wi-Fi est nécessaire à l'installation. Génération automatique dès la création de la TripCard.`},
    {type:`text`,content:`Si le lien est perdu, il peut être renvoyé depuis la TripCard (Services du trip → eSIM → Page d'invitation). FAQ complète disponible en pièce jointe.`}
  ]
},
{
  title:`Floating Deposit`, category:`Finance`, format:`narrative`,
  description:`Dépôts d'agences, quand les utiliser, procédure de validation ZM.`,
  tags:[`urgence`,`finance`,`paiement`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`C'est un dépôt que les agences constituent sur le compte OnSpot, nous permettant de régler en leur nom en cas de situation d'urgence.`},
    {type:`text`,content:`**Agences avec dépôt**`},
    {type:`list`,items:[`Alibert Trekking — 1 000 USD`,`Amerigo — 2 000 USD`,`Heaven Travel — 500 USD (carte virtuelle)`,`Héliades (TE) — 2 500 USD`,`Le Cercle des Voyages — 3 000 USD`,`Les Maisons du Voyage USA — 2 000 USD`,`Marco Vasco USA — 2 000 USD`,`Regards d'Ailleurs — 1 000 USD`,`Terres Lointaines — 600 USD (carte virtuelle)`,`Visiteurs — 3 000 USD`]},
    {type:`text`,content:`**Quand l'utiliser**`},
    {type:`list`,items:[`Sur demande de l'agence`,`Quand l'agence en France est fermée et que le voyageur est en situation critique (ex: hôtel fermé sans alternative fournie, erreur de réservation avérée sur dates/nb de passagers)`]},
    {type:`text`,content:`**Procédure**`},
    {type:`list`,items:[`Si la demande ne vient pas directement de l'agence dans le ticket, toujours valider l'action avec un ZM avant de payer avec la carte OS`,`Joindre le reçu de paiement dans le fil de discussion du ticket`,`Une fois le paiement fait, demander une intervention ZM pour que le superviseur mette à jour le tableau comptable`]}
  ]
},
{
  title:`Cancellation Process — Training Scenarios`, category:`Annulations`, format:`narrative`,
  description:`Scénarios d'annulation avant/pendant voyage, règle de handover Onspot/agence.`,
  tags:[`FO`,`BO`,`annulation`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Ce processus couvre les différents scénarios d'annulation gérés par OnSpot, selon que le voyageur est avant départ ou déjà à destination.`},
    {type:`text`,content:`**1) Avant le voyage — Annulation d'une réservation faite par l'agence**`},
    {type:`list`,items:[`Créer une intervention ZM si la demande vient d'un ticket, ou laisser une mention ZM dans la conversation Crisp pour que le management prenne le relais`]},
    {type:`callout`,style:`info`,content:`Le superviseur évalue et définit les pénalités ou frais d'annulation applicables.`},
    {type:`text`,content:`**2) Pendant le voyage — Annulation partielle après retour anticipé**`},
    {type:`text`,content:`Si le voyageur doit rentrer plus tôt que prévu, OnSpot gère les services immédiatement impactés jusqu'à ce que l'agence rouvre et prenne le relais (continuité opérationnelle soirs/week-ends/urgences).`},
    {type:`text`,content:`**Scénario A — retour anticipé un vendredi soir**`},
    {type:`list`,items:[`OnSpot annule : services du vendredi soir, samedi, dimanche, lundi`,`L'agence reprend tous les services à partir du mardi`]},
    {type:`text`,content:`**Scénario B — retour anticipé un mardi**`},
    {type:`list`,items:[`OnSpot annule : services du mardi soir et du mercredi`,`L'agence reprend les services à partir du jeudi`]},
    {type:`text`,content:`**3) À destination — Changement d'itinéraire dû à une perturbation externe**`},
    {type:`list`,items:[`OnSpot gère l'annulation des services impactés`,`OnSpot gère aussi le remplacement/re-réservation directement avec les fournisseurs`,`Le lien avec l'agence doit être fait immédiatement (certaines agences préfèrent gérer elles-mêmes les changements)`]},
    {type:`callout`,style:`important`,content:`Cas météo : si un fournisseur annule une activité pour cause météo, le remboursement est géré par l'agence de voyage — seul cas où l'on peut informer le voyageur qu'un remboursement sera émis. Toujours vérifier d'abord avec le fournisseur si une activité alternative est possible. Si aucun remplacement n'est disponible chez le fournisseur initial, le voyageur paie la nouvelle activité et sera remboursé par l'agence à son retour.`},
    {type:`text`,content:`**4) À destination — Le voyageur demande l'annulation d'un service**`},
    {type:`list`,items:[`Envoyer le raccourci CRISP « cancellation » pour qu'il le complète`,`Une fois reçu, annuler le service demandé`,`Le voyageur verra les possibilités de remboursement avec son agence à son retour`]},
    {type:`callout`,style:`warning`,content:`Ne jamais promettre de remboursement à notre niveau — cela dépend des conditions générales de vente signées avec l'agence.`},
    {type:`text`,content:`**5) À destination — Le fournisseur annule le service**`},
    {type:`list`,items:[`Essayer de trouver un autre créneau/date qui convient au voyageur`,`Revoir l'itinéraire pour identifier une autre opportunité`,`Si aucune alternative n'est possible, inviter le voyageur à se rapprocher de son agence pour le remboursement`]},
    {type:`callout`,style:`info`,content:`Le fournisseur rembourse généralement l'agence directement après annulation.`},
    {type:`text`,content:`**Règle d'or (Handover Principle)**`},
    {type:`list`,items:[`OnSpot couvre les services impactés à court terme immédiat`,`L'agence reprend le reste des changements d'itinéraire dès que possible`]}
  ]
},
{
  title:`Flight`, category:`Transport`, format:`action_table`,
  description:`Boarding pass, modification, retard/annulation, bagages perdus, compensations.`,
  tags:[`vol`,`aéroport`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`OnSpot assiste souvent les voyageurs sur des problématiques de vol. Le scope d'action dépend du forfait souscrit — toujours consulter la grille tarifaire avant d'accepter une prise en charge.`},
    {type:`table`,rows:[
      {type:`Boarding Passes`,subject:`Émission d'une carte d'embarquement`,impact:`Le voyageur ne peut pas embarquer sans carte valide`,actionSteps:`Faire l'enregistrement en ligne sur le site de la compagnie (généralement 24h à 3h avant le départ)`,notes:`Si impossible en ligne, enregistrement à l'aéroport. Recommander d'arriver 3h-3h30 avant le départ.`},
      {type:`Siège & Repas`,subject:`Sélection de siège / préférence repas`,impact:`Voyageur avec préférences ou restrictions alimentaires`,actionSteps:`Pendant la fenêtre d'enregistrement : sélectionner selon préférences si gratuit. Hors fenêtre : sélectionner si gratuit, sinon demander si le voyageur veut payer.`,notes:`Prévenir des frais éventuels. Sièges souvent assignés automatiquement à l'enregistrement, sans frais.`},
      {type:`Modification`,subject:`Le voyageur veut/doit changer de vol`,impact:`Changement de réservation, arrivée avancée ou retardée`,actionSteps:`Si réservé par l'agence : demander son intervention pour la re-réservation et les coûts. Si réservé par le voyageur : vérifier faisabilité et prix. Toujours vérifier les services impactés.`,notes:`Frais additionnels à la charge du voyageur. Impossible de modifier une réservation faite par l'agence.`},
      {type:`Retard & Annulation`,subject:`Le voyageur informe d'un changement de vol`,impact:`Arrivée retardée (même jour ou J+1), impact sur le programme`,actionSteps:`Contacter les fournisseurs des services affectés : Transfert (informer chauffeur, report sans frais), Location voiture (garder plus longtemps), Hébergement (late check-in, annulation 1ère nuit si arrivée l'après-midi de J+1), Activité (report sans frais)`,notes:`Seul le personnel de la compagnie peut re-réserver ou proposer des solutions immédiates. En cas de force majeure, la compagnie ne propose qu'un nouveau vol.`},
      {type:`Vol manqué`,subject:`Le voyageur rate son vol ou sa correspondance`,impact:`Arrivée retardée, impact sur le programme du jour`,actionSteps:`Faute du voyageur : demander les options de re-réservation à l'agence, coûts à sa charge. Correspondance retardée : le voyageur va au comptoir de la compagnie pour être re-réservé, coûts possibles couverts. Toujours vérifier les autres vols du dossier.`,notes:`Important : le voyageur DOIT passer au comptoir, sinon considéré no-show et tous les vols restants du PNR sont perdus (Ref Ticket #86857).`},
      {type:`Sécurité`,subject:`Grève à l'aéroport / atterrissage d'urgence`,impact:`Arrivée retardée, impact sur le programme`,actionSteps:`Inviter le voyageur à rester informé via l'aéroport/compagnie ; l'équipe sécurité/EP notifie si nécessaire ; transmettre les mises à jour aux fournisseurs`,notes:``}
    ]},
    {type:`text`,content:`**Bagages perdus/retardés à l'arrivée**`},
    {type:`text`,content:`Si le dossier ne comprend pas la protection bagages BRB, traiter comme un forfait PLUS.`},
    {type:`list`,items:[`Le voyageur signale la perte directement à l'aéroport à l'arrivée`,`Suivre le statut via l'outil de la compagnie (« Baggage Tracing » / « World Tracer »)`]},
    {type:`callout`,style:`warning`,content:`Être transparent dès le départ : on ne peut pas faire la démarche à la place du voyageur, et ne jamais appeler la compagnie directement pour des bagages manquants.`},
    {type:`text`,content:`**Compensations — 3 options à proposer**`},
    {type:`list`,items:[`Site officiel de la compagnie : demande directe`,`Assurance personnelle : vérifier conditions (carte bancaire ou contrat voyage)`,`Service de médiation OnSpot (RIT AIR) : cabinet spécialisé droits des passagers aériens (Règlement CE 261/2004), commission de 25% sur le montant remboursé, uniquement en cas de succès`]},
    {type:`text`,content:`Astuce : outil Easy PNR (easypnr.com) pour convertir un PNR brut en format lisible pour le client.`}
  ]
},
{
  title:`Transfers`, category:`Transport`, format:`action_table`,
  description:`Information, modification, réservation, transfert introuvable ou manqué.`,
  tags:[`transfert`,`DMC`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`table`,rows:[
      {type:`Information`,subject:`Point de rendez-vous, heure PU, train/ferry à prendre`,impact:`Organisation du trajet du voyageur`,actionSteps:`Vérifier vouchers/travelbook ; contacter le fournisseur si info manquante (ne pas appeler le DMC si non urgent)`,notes:`Si service opéré par un DMC, se référer au SOP avec DMC`},
      {type:`Modification`,subject:`Changer l'heure PU ou le point de rendez-vous`,impact:`Organisation du trajet`,actionSteps:`Contacter le fournisseur pour vérifier faisabilité sans frais ; si gratuit confirmer ; si payant, demander si le voyageur peut payer sur place, sinon voir avec l'agence`,notes:`Transfert vers l'aéroport : vérifier heure de départ et limite d'enregistrement ; arriver 3h en avance recommandé`},
      {type:`Réservation`,subject:`Le voyageur veut réserver/ajouter un transfert`,impact:`Organisation du trajet`,actionSteps:`Si DMC à destination : SOP DMC et demander de contacter le voyageur. Sinon vérifier avec l'hôtel s'il peut réserver un taxi, ou chercher sur Google.`,notes:`Important : ne pas appeler le DMC si la demande n'est pas urgente`},
      {type:`Transfert introuvable`,subject:`Chauffeur/guide absent au point de rendez-vous`,impact:`Service manquant ou retardé`,actionSteps:`Vérifier voucher (n° vol, point RDV, temps d'attente) ; si PU aéroport, comparer avec e-ticket ; appeler le fournisseur ; tenir le voyageur informé ; si aucune nouvelle après 30 min, taxi + reçu pour réclamation`,notes:`Toujours vérifier le prochain service pour éviter un autre problème`},
      {type:`Transfert manqué`,subject:`Voyageur arrivé trop tard / chauffeur absent / taxi pris sans prévenir`,impact:`Service manquant`,actionSteps:`Vérifier voucher ; appeler le fournisseur pour comprendre ; taxi + reçu pour réclamation`,notes:`Double-vérifier le service suivant`},
      {type:`Sécurité`,subject:`Grève des transports en commun/train`,impact:`Organisation, services potentiellement manquants/retardés`,actionSteps:`Inviter le voyageur à rester informé ; chercher des alternatives ; vérifier services impactés et informer fournisseurs`,notes:``}
    ]},
    {type:`text`,content:`**Astuce — Voyamar TE : reconfirmations MyTransfers**`},
    {type:`text`,content:`Reconfirmation sur mytransfers.com/en/detail/ avec l'email du voyageur + référence MT. Si l'email ne fonctionne pas, essayer travelexplorer@voyamar.fr, suividossier@voyamar.fr ou resa@voyamar.fr.`}
  ]
},
{
  title:`Accommodation`, category:`Hébergement`, format:`action_table`,
  description:`Réservation introuvable, paiement, surclassement, relocalisation, réclamations.`,
  tags:[`hôtel`,`DMC`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`table`,rows:[
      {type:`Information`,subject:`Horaires check-in, inclusions, parking, early/late check-in`,impact:`Planification et attentes du voyageur`,actionSteps:`Vérifier vouchers, site de l'hébergement ; contacter l'hébergement si besoin`,notes:`B&B/Lodges n'ont pas de réception 24h — ne pas appeler hors horaires (9h–18h généralement)`},
      {type:`Arrivée tardive`,subject:`Le voyageur arrivera probablement après l'heure limite`,impact:`Risque de no-show`,actionSteps:`Vérifier vouchers/procédure check-in ; contacter l'hébergement ; prévoir un plan B si injoignable`,notes:`Si l'hébergement ne répond pas : email de preuve et/ou contact DMC/fournisseur`},
      {type:`Modification`,subject:`Le voyageur veut changer/annuler un hébergement`,impact:`Impact sur durée du séjour, itinéraire, autres services`,actionSteps:`Vérifier l'itinéraire ; dissuader (aucun remboursement des nuits non utilisées) ; si DMC, SOP DMC (informer de tout changement) ; sinon vérifier dispo/coûts avec la réception`,notes:`Coûts additionnels à la charge du voyageur ; modifications sur place déconseillées`},
      {type:`Hébergement introuvable`,subject:`Adresse différente de celle attendue`,impact:`Expérience à l'arrivée`,actionSteps:`Vérifier voucher/travelbook (nom, adresse, voyageurs, n° confirmation) ; comparer avec site/Google ; contacter DMC/fournisseur si besoin`,notes:``},
      {type:`Réservation introuvable`,subject:`Chambre(s) manquante(s) ou aucune réservation trouvée`,impact:`Expérience à l'arrivée`,actionSteps:`Vérifier voucher/travelbook ; si DMC, SOP DMC ; sinon vérifier avec la réception ; si toujours introuvable, appeler le fournisseur ; si le voyageur ne veut plus attendre, avancer les frais et envoyer la facture (vérifier avec ZM si Floating Deposit utilisable)`,notes:`Donner les noms de tous les voyageurs ; certains hébergements n'enregistrent que le nom du DMC`},
      {type:`Problème de réservation`,subject:`Mauvais hôtel/plan repas/catégorie/literie/vue différente`,impact:`Expérience à l'arrivée, services manquants`,actionSteps:`Vérifier vouchers/travelbook ; si DMC, SOP DMC ; sinon si pas de solution sans frais avec la réception, appeler le fournisseur ; si aucune solution, avancer les frais et envoyer la facture`,notes:`Demandes spéciales honorées seulement si confirmées dans les vouchers ; attention « Seaview »/« Oceanview » (vue partielle) vs « Seafront »/« Oceanfront »`},
      {type:`Problème de paiement`,subject:`L'hébergement a la réservation mais pas le paiement`,impact:`Risque d'annulation / voyageur devant payer`,actionSteps:`Si DMC, SOP DMC + appeler le DMC ; sinon si pas de solution avec la réception, appeler le fournisseur ou demander l'intervention de l'agence ; si trop tard, le voyageur avance les frais`,notes:`Si retard de réponse, négocier un check-in avec carte en garantie ; sinon demander au voyageur d'avancer au moins 1 nuit`},
      {type:`Frais imprévus`,subject:`Frais de resort, parking, frais inconnus sur la carte`,impact:`Frais imprévus`,actionSteps:`Vérifier voucher/travelbook ; si DMC, SOP DMC (facturation injustifiée gérée uniquement par le DMC) ; si pas clair, appeler l'hébergement ; en cas d'écart, contacter le Provider/demander l'intervention de l'agence (PREM & ELITE uniquement)`,notes:`Suivi des écarts uniquement pour PREM & ELITE ; aucun remboursement si mentionné dans le voucher ; parking généralement non pré-réservable`},
      {type:`Autres réclamations`,subject:`Propreté, taille de chambre/lit, chambres non adjacentes`,impact:`Confort pendant le séjour`,actionSteps:`Si DMC, SOP + intervention DMC ; sinon appeler la réception pour changement/surclassement/lit d'appoint/nettoyage sans frais ; si payant, demander au Provider/agence, sinon le voyageur peut avancer ; si indisponible, chercher une alternative`,notes:`Le voyageur peut avancer les frais et réclamer auprès de son agence`},
      {type:`Relocalisation / Force majeure`,subject:`L'hôtel ne peut pas accueillir le voyageur`,impact:`Expérience et itinéraire`,actionSteps:`Si DMC, SOP + chercher des alternatives ; si Provider, demander une option de relogement ; si agence, aider à trouver une alternative`,notes:`Généralement pas de coût si le voyageur accepte le relogement ; si refus, remboursement non garanti`}
    ]},
    {type:`callout`,style:`warning`,content:`Toujours obtenir une confirmation ÉCRITE avant toute annulation (raccourci Crisp disponible). Le BO doit vérifier qu'il existe bien une confirmation écrite avant de traiter une demande d'annulation du FO.`}
  ]
},
{
  title:`Rentals (car, campervan, motocycle, etc.)`, category:`Transport`, format:`action_table`,
  description:`Location véhicule complète : pick-up, panne, accident, assurances, amendes.`,
  tags:[`location`,`véhicule`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`table`,rows:[
      {type:`Modification (demande voyageur)`,subject:`Changer heure/date PU`,impact:`Organisation, itinéraire`,actionSteps:`Vérifier horaires d'ouverture ; si PU anticipé, vérifier dispo (sauf USA, impossible par téléphone) et frais possibles ; si PU tardif, vérifier avec l'agence de location`,notes:`Frais à la charge du voyageur, prélevés sur la carte de garantie ; USA : impossible de vérifier dispo par téléphone`},
      {type:`Modification`,subject:`Changer le lieu PU`,impact:`Itinéraire`,actionSteps:`Vérifier horaires/dates disponibles et comparer avec le nouvel itinéraire ; si faisable, vérifier avec l'agence (frais possibles)`,notes:`Recommander de garder le lieu PU initial si non faisable`},
      {type:`Modification`,subject:`Changer le nom sur la réservation`,impact:`Risque de ne pas pouvoir prendre le véhicule (permis oublié)`,actionSteps:`Aux heures d'ouverture, demander à l'agence ; hors horaires si non critique, ajouter un conducteur additionnel plutôt que changer de nom`,notes:`Impossible de modifier nous-mêmes ; attention : un changement de nom peut être une annulation + nouvelle réservation (double facturation sans remboursement)`},
      {type:`Modification`,subject:`Ajouter un conducteur`,impact:`Confort du voyageur`,actionSteps:`Inviter le voyageur à le faire directement à l'agence de location`,notes:`Le conducteur principal doit être présent ; le conducteur additionnel doit avoir son permis (+ international/traduit si besoin)`},
      {type:`Annulation`,subject:`Le voyageur veut annuler la location`,impact:`Organisation, itinéraire`,actionSteps:`Envoyer le modèle d'annulation ; demander au Provider/agence d'annuler ; inviter le voyageur à suivre le remboursement avec l'agence`,notes:`On ne peut pas annuler nous-mêmes (plateforme B2B sans accès)`},
      {type:`Permis oublié/perdu`,subject:`Le voyageur a perdu/oublié son permis`,impact:`Risque de ne pas pouvoir louer`,actionSteps:`Vérifier si un autre voyageur a permis+carte au même nom ; selon horaires, changer le conducteur principal ou annuler/re-réserver ; sinon envoyer le permis depuis la France ou décaler la date`,notes:`Vérifier les conditions par pays (USA : permis FR seul ; NZ : permis FR + international). IDP : internationaldrivingpermit.org`},
      {type:`Carte bancaire refusée`,subject:`La carte du voyageur est refusée`,impact:`Risque de ne pas pouvoir louer`,actionSteps:`Vérifier conditions du voucher ; demander à repasser la carte/saisie manuelle ; si toujours refusé, voir si un autre voyageur a permis+carte au même nom ; sinon annuler/re-réserver ou taxi`,notes:`Certaines agences acceptent les cartes de débit (garantie plus élevée) ; frais de taxi à réclamer via l'assurance voyage`},
      {type:`Catégorie incorrecte`,subject:`Véhicule différent/trop petit`,impact:`Confort, déclassement`,actionSteps:`Vérifier si l'agence a un autre véhicule de la même catégorie ; sinon vérifier les agences suivantes de l'itinéraire`,notes:`USA : impossible de vérifier/bloquer une catégorie par téléphone`},
      {type:`Véhicule indisponible`,subject:`Indisponible au comptoir / attente longue`,impact:`Retard, services potentiellement manqués`,actionSteps:`Si encore au comptoir, demander surclassement gratuit ou dispo ailleurs ; sinon taxi + retour le lendemain ; contacter le Provider pour réclamation`,notes:``},
      {type:`Options manquantes`,subject:`Conducteur additionnel/GPS/siège bébé non fourni`,impact:`Services manquants`,actionSteps:`Vérifier inclusions/exclusions du voucher ; appeler le Provider si censé être inclus ; sinon le voyageur avance et fournit le reçu`,notes:`Pas de suivi pour PLUS ; documents nécessaires : contrat de location + preuve de paiement`},
      {type:`Vente forcée / surfacturation`,subject:`Assurances, forfait péage, carburant, dépôt...`,impact:`Dépenses imprévues`,actionSteps:`Vérifier inclusions/exclusions ; si encore à l'agence, laisser le voyageur décider ; si parti, comparer contrat/voucher, tenter d'annuler l'option, sinon réclamer au retour`,notes:`Pas de suivi pour PLUS ; une fois signé, généralement impossible d'annuler (surtout assurances)`},
      {type:`État des lieux`,subject:`Pas de vérification du véhicule avant départ`,impact:`Risque d'être facturé pour dommages non responsables`,actionSteps:`Vérifier s'il existe un état des lieux ; sinon inviter le voyageur à vérifier et prendre des photos`,notes:`USA : souvent pas de vérification avant remise (scan technologique) — toujours recommander des photos`},
      {type:`Panne`,subject:`Panne du véhicule`,impact:`Sécurité, retard, services manqués`,actionSteps:`Toujours appeler l'assistance routière (appel à 3 si le voyageur préfère) ; anticiper un changement d'itinéraire`,notes:`Avant d'appeler : contrat de location, n° MVA (sur les clés), date de naissance conducteur, marque/modèle/couleur`},
      {type:`Pneu crevé`,subject:`Crevaison`,impact:`Sécurité, retard`,actionSteps:`Appeler l'assistance routière ; si injoignable et roue de secours dispo, aider à la changer ; sinon garage ou pneu mèche temporaire (garder le reçu)`,notes:`Attention : souvent NON couverte par l'assistance routière standard (mécanique uniquement). Éviter le mèche (endommage le pneu définitivement)`},
      {type:`Accident`,subject:`Accident pendant la location`,impact:`Sécurité, retard, services manqués`,actionSteps:`S'assurer que les voyageurs sont en sécurité ; appeler l'assistance routière ; localiser voyageur et véhicule ; organiser transfert selon temps de résolution`,notes:`Quasi aucune agence ne livre une nouvelle voiture sur place ; disponible seulement aux horaires d'ouverture`},
      {type:`Carburant`,subject:`Type de carburant / erreur de carburant`,impact:`Dépenses imprévues, retard`,actionSteps:`Vérifier le bouchon du réservoir/documentation ; si doute, appeler l'assistance routière`,notes:`USA/Canada : généralement sans plomb 85/87 ; assurances ne couvrent généralement pas les erreurs du conducteur`},
      {type:`Péage`,subject:`Information/paiement de péage`,impact:`Dépenses imprévues`,actionSteps:`Vérifier si inclus au voucher (rare) ; sinon expliquer l'option e-Toll de l'agence`,notes:`USA : refus e-Toll + péage sans payer → facture 4-6 semaines après sur la carte via l'agence`},
      {type:`Amendes`,subject:`Paiement d'amende`,impact:`Dépenses imprévues`,actionSteps:`Aider le voyageur à payer avant l'échéance`,notes:`On ne négocie jamais le montant — se fait avec la police/le tribunal`},
      {type:`Fin de location`,subject:`Heure/lieu de restitution, hors horaires`,impact:`Organisation, frais imprévus`,actionSteps:`Retour anticipé : pas de remboursement. Retour tardif : demander estimation à l'agence, sinon simuler sur le site. Hors horaires : vérifier dropbox, sinon revenir le lendemain`,notes:`Sans dropbox, laisser la clé dans le véhicule (sous un tapis) — voyageur responsable du véhicule`},
      {type:`Clés / objets oubliés`,subject:`Clés non restituées / objets oubliés`,impact:`Frais imprévus`,actionSteps:`Vérifier avec l'agence comment/où renvoyer ; contacter Lost & Found pour le paiement`,notes:`Frais d'envoi à la charge du voyageur ; pas de suivi de la livraison`}
    ]}
  ]
},
{
  title:`Onsite Sales & Refund — Tours, Activities & Events`, category:`Activités & billetterie`, format:`hybrid`,
  description:`Vente d'excursions/billets sur place, calcul de commission, remboursements.`,
  tags:[`calcul`,`Stripe`,`vente`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Ce guide encadre les équipes BO et FO pour la vente sur place de tours/activités/billets d'événements, de la cotation au paiement et à l'émission du voucher, y compris les remboursements.`},
    {type:`text`,content:`**Fournisseurs prioritaires**`},
    {type:`table`,rows:[
      {type:`Tours & Activités (USA)`,subject:`Califun`,impact:`Toujours vérifier en premier pour les USA`,actionSteps:`Client paie via lien Stripe ; OnSpot réserve directement sur Califun avec la carte entreprise`,notes:`+5% frais Stripe, pas de commission additionnelle`},
      {type:`Tours & Activités (Canada)`,subject:`Toundra`,impact:`Toujours vérifier en premier pour le Canada`,actionSteps:`Client paie via lien Stripe ; OnSpot réserve sur Toundra avec la carte entreprise`,notes:`+18% commission, +5% frais Stripe`},
      {type:`Autres destinations`,subject:`Ceetiz`,impact:`À utiliser si non dispo sur Califun/Toundra`,actionSteps:`Client paie via lien Stripe ; OnSpot réserve sur Ceetiz avec code promo`,notes:`+5% frais Stripe`},
      {type:`Shows & Concerts`,subject:`Las Vegas Tickets (LVT)`,impact:`Toujours le premier choix pour spectacles/billets`,actionSteps:`Paiement direct sur le site du fournisseur avec la carte du voyageur`,notes:`Pas de commission ni frais Stripe ; commissions rétroactives automatiques`},
      {type:`Autres plateformes (dernier recours)`,subject:`Google, Viator, TripAdvisor, GetYourGuide...`,impact:`Uniquement si aucun fournisseur préféré ne propose le service`,actionSteps:`Client paie via lien Stripe ; OnSpot utilise la carte OnSpot sur le site du fournisseur`,notes:`+18% commission, +5% frais Stripe`}
    ]},
    {type:`callout`,style:`important`,content:`Si aucun fournisseur préféré ne propose l'activité, documenter la recherche dans le fil de discussion pour éviter que les collègues ne dupliquent l'effort.`},
    {type:`text`,content:`**Calcul de la cotation** — Quand on applique 18% de commission ET 5% de frais carte, appliquer séparément — jamais 23% combinés (perte de marge). Méthode correcte : appliquer d'abord 18%, puis 5% sur le nouveau sous-total.`},
    {type:`list`,items:[`Exemple : 380 USD net → +18% = 448,40 → +5% = 470,82 USD (vs 467,40 si combiné à tort — écart de 3,42 USD)`,`Exemple : 950 USD net → +18% = 1121 → +5% = 1174,55 USD (vs 1168,50 si combiné à tort — écart de 6,05 USD)`]},
    {type:`callout`,style:`warning`,content:`L'écart augmente avec le prix du produit — toujours calculer en 2 étapes.`},
    {type:`text`,content:`**Encaissement** : via lien Stripe (recommandé — envoyer le lien avec la majoration correcte, réserver avec la carte entreprise une fois payé) ou paiement direct carte voyageur (uniquement Las Vegas Tickets).`},
    {type:`text`,content:`**Émission du voucher** : créer et envoyer le voucher officiel (modèle « VOUCHER OS »), incluant date, heure, n° de confirmation, contact fournisseur, politique d'annulation.`},
    {type:`callout`,style:`important`,content:`Ticket OSC : une fois tout terminé, ouvrir une intervention ZM pour informer les superviseurs de l'usage de la carte OnSpot, en incluant prix d'achat/vente, marge, mode de paiement, nom du fournisseur, nom du service réservé.`},
    {type:`text`,content:`**Détails par fournisseur** : Califun — prix affichés incluent déjà la marge, ajouter +5% frais carte, envoyer lien Stripe, confirmer via le portail Califun (pas de paiement direct, contrats en place). Réservations instantanées (icône éclair) à prioriser. Las Vegas Tickets — annoncer le prix affiché sans majoration, paiement direct carte voyageur. Autres fournisseurs — rechercher en ligne, comparer les avis, cotation = prix affiché +18% puis +5%. Ne jamais envoyer de lien direct montrant les prix publics — toujours un lien de cotation Stripe.`},
    {type:`text`,content:`**Processus de remboursement** : deux cas — annulation à l'initiative du fournisseur (météo, problème technique — reprogrammation ou remboursement ; si remboursé sur la carte OnSpot, taguer un ZM pour la comptabilité) et annulation à l'initiative du voyageur.`}
  ]
},
{
  title:`Tickets on Ticketmaster or Other Platforms`, category:`Activités & billetterie`, format:`hybrid`,
  description:`Transfert de billets digitaux, comptes Onspot, cas particuliers AXS.`,
  tags:[`USA`,`events`,`billetterie`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`callout`,style:`important`,content:`Billets 100% digitaux — le voyageur doit avoir un smartphone avec connexion internet le jour de l'événement et l'app officielle (Ticketmaster, AXS...) installée. Le client doit créer son propre compte avant tout transfert. Toujours documenter les étapes dans le fil pour la traçabilité.`},
    {type:`text`,content:`**Étape 1 — Avant le voyage**`},
    {type:`list`,items:[`Le client crée un compte sur ticketmaster.com (Mon compte → Se connecter → S'inscrire) avec son email habituel`,`Il doit vérifier son adresse email`,`Il informe OnSpot et communique l'email utilisé`,`OnSpot transfère les billets vers ce compte via Ticketmaster`,`Le client reçoit un email de confirmation — il doit cliquer « ACCEPT the tickets »`]},
    {type:`text`,content:`**Étape 2 — À l'arrivée aux États-Unis**`},
    {type:`list`,items:[`Installer l'app Ticketmaster (ou accéder via navigateur mobile)`,`Se connecter avec les identifiants du compte`,`Aller dans « My Events » pour voir les billets`,`Les QR codes apparaissent le jour de l'événement`]},
    {type:`text`,content:`**Étape 3 — Si les billets ne sont pas encore transférés**`},
    {type:`text`,content:`Cas 1 — Billets dans le compte Ticketmaster OnSpot :`},
    {type:`contact`,entries:[{label:`Login Ticketmaster`,value:`support@onspot.travel`},{label:`Mot de passe`,value:`(voir la note interne la plus récente si celui enregistré ne fonctionne pas)`}]},
    {type:`list`,items:[`Aller dans « Upcoming Events », sélectionner l'événement, cliquer « Transfer Tickets »`,`Un code OTP est envoyé au téléphone de Rodrigo (Brésil) — si indisponible (décalage horaire), programmer un rappel le lendemain dès 8h heure Brésil et informer un collègue brésilien ou un ZM`,`Saisir nom et email du client, finaliser le transfert`]},
    {type:`text`,content:`Cas 2 — Billets via la plateforme AXS (ex: Houston Rockets NBA) :`},
    {type:`contact`,entries:[{label:`Login AXS`,value:`support@onspot.travel`},{label:`Mot de passe`,value:`Temp123!`}]},
    {type:`list`,items:[`Localiser l'événement acheté`,`Sélectionner « Transfer Tickets », saisir les infos du voyageur (nom+email)`,`Le client reçoit un email pour accepter le transfert`]},
    {type:`text`,content:`**Étape 4 — Le jour de l'événement**`},
    {type:`list`,items:[`Ouvrir l'app Ticketmaster ou AXS`,`Aller dans « My Events »`,`Présenter le QR code à l'entrée du stade/salle`,`Connexion internet stable obligatoire`]},
    {type:`callout`,style:`info`,content:`Ressource complémentaire : guide client PDF « Comment récupérer mes billets sur Ticketmaster/AXS » + présentation PowerPoint de Virginie (Las Vegas Tickets, Ticketmaster, AXS).`}
  ]
},
{
  title:`Restaurants booking`, category:`Restauration`, format:`hybrid`,
  description:`Recherche Excel interne, Resy/OpenTable/Tock/TableCheck, résumé FO.`,
  tags:[`restaurant`,`outils`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Objectif : traiter efficacement les demandes de recommandation ou réservation de restaurant, avec fiabilité, cohérence et qualité de service.`},
    {type:`text`,content:`**Étapes de recherche**`},
    {type:`list`,items:[`Toujours commencer par le fichier Excel interne « Restaurants » (liste testée et approuvée par l'équipe ou les voyageurs, à mettre à jour régulièrement)`]},
    {type:`text`,content:`**Plateformes de réservation (si rien trouvé dans l'Excel)**`},
    {type:`contact`,entries:[
      {label:`Resy`,value:`resy.com — support@onspot.travel / @OnSpot2026`},
      {label:`OpenTable`,value:`opentable.com — support@onspot.travel / TableSpot@!`},
      {label:`Tock`,value:`exploretock.com — support@onspot.travel / onspot.2026`},
      {label:`TableCheck (Japon)`,value:`tablecheck.com/en/account — support@onspot.travel / BookingRequest$012345`}
    ]},
    {type:`list`,items:[`Disponibilité en temps réel, réservation directe en ligne, filtres par quartier/date/couverts/cuisine`,`Resy : très utilisé aux USA (NY, LA, Chicago) pour restaurants premium/forte demande`,`OpenTable : populaire USA, Canada, grandes villes européennes`,`Tock : populaire USA et Canada`]},
    {type:`text`,content:`**Recherche via ChatGPT et/ou Google (dernier recours)** — être précis : quartier, nombre de convives, jour et heure du repas. Exemple : « Italian restaurant near Chelsea London for 4 people dinner Friday night ».`},
    {type:`callout`,style:`important`,content:`Toujours vérifier : que le restaurant est ouvert au jour/heure demandés, sa localisation exacte, le type de cuisine/ambiance, les avis récents (Google Maps, TripAdvisor), la possibilité de réserver (en ligne/téléphone/email).`},
    {type:`text`,content:`**Résumé pour le FO** : une fois la recherche terminée, le BO résume les résultats et envoie un maximum de 3 options au FO, avec pour chaque proposition : nom du restaurant, distance, description courte, lien site web si disponible, date/heure de la demande.`},
    {type:`text`,content:`**Validation et réservation**`},
    {type:`list`,items:[`Le FO présente les options au voyageur et recueille son choix`,`Une fois confirmé, procéder à la réservation (site du restaurant, OpenTable, téléphone, email)`,`Confirmer la réservation (demander une confirmation écrite ou un numéro de réservation si possible)`]},
    {type:`text`,content:`**Mise à jour et suivi** : enregistrer dans le fichier Excel — nom et localisation du restaurant, source de la recherche, retour du voyageur (positif/négatif).`}
  ]
},
{
  title:`CaliFun`, category:`Fournisseurs`, format:`supplier_guide`,
  description:`DMC francophone USA. Accès B2B, marge incluse, process incoming calls.`,
  tags:[`USA`,`DMC`,`🔒 accès restreint`], visibleTo:[`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Califun est notre DMC francophone aux États-Unis. Catalogue d'expériences dans tout le pays, réservable via une plateforme B2B pour agences francophones.`},
    {type:`list`,items:[`Fondée en 2006 par Benoit`,`Équipe actuelle : Virginie & Valentine`,`Contact : Google Chat (canal Califun) pour toute question sur réservations en cours/à venir`]},
    {type:`contact`,entries:[
      {label:`Urgence WhatsApp (Virginie)`,value:`+33 6 37 89 66 55`},
      {label:`Site B2B`,value:`CALIFUN`},
      {label:`Login`,value:`support@onspot.travel`},
      {label:`Mot de passe`,value:`Support@2026`}
    ]},
    {type:`callout`,style:`important`,content:`Les prix affichés sur la plateforme incluent déjà la marge — ajouter uniquement 5% de frais bancaires avant de donner le prix final au client.`},
    {type:`text`,content:`**Liste des fournisseurs** : PDF disponible « All Experiences.pdf ». Si un fournisseur manque à la liste, demander à l'équipe Califun.`},
    {type:`text`,content:`**Process des appels entrants**`},
    {type:`list`,items:[`Agence appelant pour un problème sur une activité (report/annulation/modification) : même process qu'un client OnSpot — contacter le fournisseur, informer l'équipe Califun sur Google Chat`,`Client appelant pour reconfirmer une activité : même process qu'un client OnSpot — vérifier avec le fournisseur si besoin et rassurer le client`,`Fournisseur/agence appelant pour un renouvellement de contrat ou demande non urgente : demander d'envoyer un email à hello@cali-fun.com`]}
  ]
},
{
  title:`Toundra DMC`, category:`Fournisseurs`, format:`supplier_guide`,
  description:`DMC Canada/USA. Marge 15% + 5% Stripe, invoicing mensuel.`,
  tags:[`CAN`,`DMC`,`🔒 accès restreint`], visibleTo:[`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Toundra est un DMC canadien basé en Amérique du Nord depuis 20 ans (hébergements, activités, transferts, forfaits). Partenariat établi pour vendre leurs excursions directement à nos clients sans passer par l'agence française pour la facturation.`},
    {type:`contact`,entries:[
      {label:`Site B2B`,value:`Toundra B2B`},
      {label:`Login`,value:`support@onspot.travel`},
      {label:`Mot de passe`,value:`Toundra2024`},
      {label:`Email`,value:`reservations@toundravoyages.com`},
      {label:`Téléphone`,value:`+1 514-523-8731`},
      {label:`Horaires`,value:`Lundi-Vendredi, 8h30-16h30 (heure Montréal)`}
    ]},
    {type:`text`,content:`**Recherche de produits**`},
    {type:`list`,items:[`Si on connaît le lieu/nom de l'activité : utiliser la barre de recherche`,`Si on connaît juste la ville/région : utiliser la recherche cartographique`,`Astuce : la recherche cartographique aide même sans être expert de la destination (ex: « une autre excursion motoneige dans la région de la Mauricie »)`]},
    {type:`text`,content:`**Tarification**`},
    {type:`list`,items:[`Convertir le prix en USD si le service est en CAD (sinon déjà en USD)`,`Ajouter 15% de marge`,`Ajouter 5% de frais bancaires (Stripe)`,`Envoyer une cotation via Stripe pour paiement/validation`,`Une fois le paiement reçu, réserver sur le site B2B et fournir le voucher au client`]},
    {type:`text`,content:`**Facturation** : les factures sont payées mensuellement par l'équipe comptable. Demander l'intervention d'un ZM via le ticket pour mettre à jour le tableau de suivi.`},
    {type:`text`,content:`**À retenir**`},
    {type:`list`,items:[`Hébergements : privilégier les offres connectées Reservit pour les réservations de dernière minute (confirmation instantanée)`,`Hébergements Toundra : envoyer les demandes au moins 48h à l'avance`,`Activités : réserver les services disponibles et envoyer les demandes « sur demande » au moins 48h à l'avance`,`Transferts (aéroport, ville, ferries) : respecter le délai de 48h pour confirmation fournisseur`,`Toujours utiliser la recherche cartographique pour vérifier la cohérence de l'itinéraire`,`Les demandes envoyées le week-end ne sont traitées que le lundi matin — à anticiper pour les demandes de dernière minute`]},
    {type:`text`,content:`Tutoriel complémentaire disponible (WeTransfer) : BigBro Toundra Tutorial.`}
  ]
},
{
  title:`Ceetiz Training Guide`, category:`Fournisseurs`, format:`supplier_guide`,
  description:`Fournisseur de dernier recours, marge 10%, non annulable.`,
  tags:[`Europe`,`DMC`,`🔒 accès restreint`], visibleTo:[`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Ceetiz (fondé en 2012) est une agence de voyage en ligne française, leader de la réservation d'activités touristiques. À utiliser uniquement si l'activité n'a pas été trouvée sur Califun, Sesame ou Toundra.`},
    {type:`list`,items:[`Forte présence en Europe`,`Accès à des tarifs préférentiels non disponibles en ligne pour les clients`,`Contact direct avec leur équipe commerciale`]},
    {type:`text`,content:`**Utilisation** : lien « Book Activities Worldwide ». Recherche par ville, pays ou nom de produit ; filtres à gauche pour affiner ; confirmation instantanée disponible (« Instant Confirmation ») ; autres tours confirmés sur demande (double confirmation).`},
    {type:`callout`,style:`important`,content:`Toujours vérifier la section « Price Includes / Price Does Not Include » avant de communiquer avec le client.`},
    {type:`text`,content:`**Étapes de réservation**`},
    {type:`list`,items:[`Trouver le tour souhaité`,`Vérifier tous les détails`,`Valider le prix et les inclusions avec le client`]},
    {type:`text`,content:`**Politique d'annulation**`},
    {type:`list`,items:[`Toutes les demandes sont non-annulables et non-modifiables (réservations de dernière minute)`,`Remboursements gérés au cas par cas par un ZM`]},
    {type:`text`,content:`**Tarification client**`},
    {type:`list`,items:[`Prendre le prix affiché sur Ceetiz`,`Ajouter 4,5% de frais`,`Valider la cotation avec le client (applique une remise de 10%, qui est notre marge)`,`Appliquer le code promo ONSPOT10 au paiement`,`Régler avec la carte OnSpot`,`Après réservation : notifier un ZM pour mise à jour du tableau comptable`]},
    {type:`text`,content:`**Vouchers** : Instant Confirmation — voucher reçu immédiatement, envoyable au client. On Request — voucher disponible une fois la réservation confirmée par Ceetiz, sous 48h.`},
    {type:`callout`,style:`warning`,content:`Ne pas proposer de tours « sur demande » si la date du voyage est à moins de 48h.`}
  ]
},
{
  title:`Elite Unit`, category:`Organisation équipe`, format:`role_guide`,
  description:`Organisation FO/BO, rôles, timeline avant/pendant/après voyage, KPIs.`,
  tags:[`organisation`,`Elite`], visibleTo:[`agent`,`supervisor`,`formateur`,`admin`],
  sections:[
    {type:`text`,content:`Les Agents Elite suivent un protocole proactif et sans couture avant, pendant et après le voyage.`},
    {type:`text`,content:`**FO et BO**`},
    {type:`list`,items:[`Par zone : 2 agents FO + 1 agent BO`,`Travail collaboratif pour assurer continuité et qualité de service`]},
    {type:`text`,content:`**Rôles principaux**`},
    {type:`list`,items:[`Agent BO : tâches à résolution plus longue — problèmes de location de voiture, réservations d'hôtel complexes, litiges fournisseurs en cours`,`Agent FO : tâches rapides, peut aussi jouer le rôle de BO pour réservations restaurant, recherche d'excursions, ajustements ponctuels rapides, reconfirmations simples d'activités`]},
    {type:`callout`,style:`info`,content:`Cette organisation permet de répartir la charge de travail tout en maintenant un service Elite rapide et personnalisé — chaque agent peut gérer entièrement ses voyageurs.`},
    {type:`text`,content:`**1/ Avant le départ — Préparation & Reconfirmation**`},
    {type:`list`,items:[`Vérification des vouchers : lire et analyser pour détecter erreurs ou incompréhensions`,`Notes agence : identifier infos personnelles et événements spéciaux (anniversaires, préférences client)`,`Contact agence : débriefing pour clarifier les infos essentielles`,`Pré-appel avec l'équipe commerciale : mieux comprendre l'agence et ses besoins spécifiques`]},
    {type:`text`,content:`**Reconfirmation des services**`},
    {type:`list`,items:[`Hôtels : confirmer les réservations et vérifier les demandes spéciales`,`Transferts : confirmer horaires, véhicules, services spéciaux`,`Activités/excursions : confirmer créneaux et demandes spécifiques`,`Restaurants/loisirs : rechercher, confirmer, ajuster selon les préférences du voyageur`]},
    {type:`callout`,style:`info`,content:`Objectif : anticiper tous les besoins et préférences des voyageurs pour que chaque service soit parfaitement préparé.`},
    {type:`text`,content:`**2/ Pendant le voyage — Proactivité & Personnalisation**`},
    {type:`list`,items:[`Gestion des cartes d'embarquement`,`Suivi des vols en temps réel`,`Appels de bienvenue aux voyageurs`,`Traitement immédiat des demandes, priorité sur les autres tâches`,`Mises à jour régulières aux voyageurs et agences`,`Recommandations proactives à destination (itinéraires, événements, marchés locaux, soirées, expositions...)`,`Ticketing de haute qualité : phrases complètes, informations factuelles, humeur du client, pas d'abréviations`]},
    {type:`callout`,style:`info`,content:`Chaque agent FO peut aussi jouer son propre BO pour les opérations rapides (réservations restaurant, excursions, petits ajustements).`},
    {type:`text`,content:`**Mesure de la qualité de service** : Objectif → temps de réponse. Subjectif → CSAT (satisfaction client).`},
    {type:`text`,content:`**3/ Fin & après le voyage — Bilan & Suivis**`},
    {type:`list`,items:[`Appel d'au revoir pour recueillir le feedback du voyageur (points forts, éléments clés)`,`Résumé d'expérience envoyé à l'agence avec statistiques`,`Email personnalisé et automatisé à l'agence : résumé du voyage, scores (tops, flops, highlights, suggestions)`,`Gestion des sujets en cours : paiements non retournés, objets perdus, etc.`]},
    {type:`text`,content:`**4/ Responsabilités additionnelles**`},
    {type:`text`,content:`**Gestion des dossiers VIP**`},
    {type:`list`,items:[`Gérer/superviser les dossiers signalés VIP (environ 50 à 100 dossiers par an)`,`S'assurer que toutes les exigences et attentes spéciales sont respectées`]},
    {type:`text`,content:`**Formation & documentation**`},
    {type:`list`,items:[`Documenter les cas complexes ou solutions innovantes pour enrichir la base de connaissance interne`,`Former les agents Premium moins expérimentés pour monter en compétence l'équipe`]},
    {type:`text`,content:`**Travail sur la base de connaissance concierge**`},
    {type:`list`,items:[`Mener des recherches stratégiques basées sur les données OnSpot (hubs clés, demandes fréquentes) pour enrichir la base de connaissance et alimenter la future IA OnSpot`,`Maintenir à jour les informations sur : transferts et tours, restaurants et options de restauration, transport (transports en commun, itinéraires, ferries...)`]}
  ]
}
];

async function docSeedInitialProcedures() {
  if (!confirm(`Importer les ${SEED_PROCEDURES.length} procédures OnSpot de départ dans la base ? Les titres déjà existants seront ignorés.`)) return;
  await docLoadProcedures();
  const existingTitles = new Set(docProcedures.map(p => p.title));
  let created = 0, skipped = 0;
  for (const proc of SEED_PROCEDURES) {
    if (existingTitles.has(proc.title)) { skipped++; continue; }
    const data = { ...proc, sections: proc.sections.map(s => ({ ...s, id: docNewId() })), createdAt: new Date(), updatedAt: new Date(), createdBy: currentUser.id, updatedBy: currentUser.id };
    try {
      const supabase = window.taskinDataProviders?.supabase;
      if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
      await supabase.insertRow('procedures', { title: data.title, category: data.category || '', description: data.description || '', version: data.version || '1.0', status: 'draft', validation_status: 'draft', owner_id: currentUser.id, sections: data.sections || [], source_metadata: { taskin: data } });
      created++;
    } catch (e) { console.error('Seed error', proc.title, e); }
  }
  alert(`${created} procédure(s) créée(s), ${skipped} déjà existante(s) ignorée(s).`);
  docRenderList();
}
