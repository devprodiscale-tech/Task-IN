(function () {
  const CONTENT_VERSION = '1.9.3';
  if (window.__onspotFloatInjected && window.__onspotFloatVersion === CONTENT_VERSION) return;

  document.getElementById('onspot-float-panel')?.remove();
  document.getElementById('onspot-float-btn')?.remove();
  window.__onspotFloatInjected = true;
  window.__onspotFloatVersion = CONTENT_VERSION;

  const BUTTON_POSITION_KEY = 'onspotFloatPosition';
  const PANEL_POSITION_KEY = 'onspotPanelPosition';
  const FLOAT_ENABLED_KEY = 'onspotFloatEnabled';
  const DRAG_THRESHOLD = 6;

  const btn = document.createElement('button');
  btn.id = 'onspot-float-btn';
  btn.type = 'button';
  btn.title = 'Ouvrir le suivi de tâche Task’in';
  btn.setAttribute('aria-label', 'Ouvrir le suivi de tâche Task’in');
  btn.innerHTML = `<span class="taskin-mark"><img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Task’in"></span>`;
  document.documentElement.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'onspot-float-panel';
  panel.innerHTML = `
    <div id="onspot-float-panel-header">
      <span class="panel-brand"><span class="panel-brand-mark"><img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Task’in"></span><span>Task’in · Suivi de tâche</span></span>
      <button id="onspot-float-panel-close" type="button" aria-label="Fermer" title="Fermer">&times;</button>
    </div>
    <iframe id="onspot-float-panel-iframe" title="Suivi de tâche Task’in" src=""></iframe>
  `;
  document.documentElement.appendChild(panel);

  const header = panel.querySelector('#onspot-float-panel-header');
  const iframe = panel.querySelector('#onspot-float-panel-iframe');
  let iframeLoaded = false;

  function clampPosition(left, top, width, height) {
    return {
      left: Math.max(8, Math.min(window.innerWidth - width - 8, left)),
      top: Math.max(8, Math.min(window.innerHeight - height - 8, top)),
    };
  }

  function positionPanelNearButton() {
    const buttonRect = btn.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 360;
    const panelHeight = panel.offsetHeight || 560;
    let left = buttonRect.left - panelWidth - 12;
    if (left < 8) left = buttonRect.right + 12;
    const position = clampPosition(left, buttonRect.top, panelWidth, panelHeight);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = 'auto';
  }

  function openPanel() {
    if (!iframeLoaded) {
      iframe.src = chrome.runtime.getURL('popup.html');
      iframeLoaded = true;
    }
    panel.classList.add('onspot-open');
    btn.classList.add('onspot-panel-open');
    const storedPosition = panel.dataset.position ? JSON.parse(panel.dataset.position) : null;
    if (storedPosition && Number.isFinite(storedPosition.left) && Number.isFinite(storedPosition.top)) {
      const position = clampPosition(storedPosition.left, storedPosition.top, panel.offsetWidth || 360, panel.offsetHeight || 560);
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      panel.style.right = 'auto';
    } else {
      positionPanelNearButton();
    }
  }

  function closePanel() {
    panel.classList.remove('onspot-open');
    btn.classList.remove('onspot-panel-open');
  }

  function togglePanel() {
    if (panel.classList.contains('onspot-open')) closePanel();
    else openPanel();
  }

  function makeDraggable(element, { dragHandle = element, onClick, onDragEnd } = {}) {
    let startX = 0;
    let startY = 0;
    let originalLeft = 0;
    let originalTop = 0;
    let width = 0;
    let height = 0;
    let dragging = false;
    let moved = false;

    dragHandle.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = element.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      originalLeft = rect.left;
      originalTop = rect.top;
      width = rect.width;
      height = rect.height;
      dragging = true;
      moved = false;
      dragHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    dragHandle.addEventListener('pointermove', event => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) moved = true;
      if (!moved) return;
      const position = clampPosition(originalLeft + dx, originalTop + dy, width, height);
      element.style.left = `${position.left}px`;
      element.style.top = `${position.top}px`;
      element.style.right = 'auto';
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      try { dragHandle.releasePointerCapture(event.pointerId); } catch (_) {}
      if (moved) onDragEnd?.(element);
      else onClick?.();
    }

    dragHandle.addEventListener('pointerup', endDrag);
    dragHandle.addEventListener('pointercancel', endDrag);
  }

  makeDraggable(btn, {
    onClick: togglePanel,
    onDragEnd: element => {
      const rect = element.getBoundingClientRect();
      chrome.storage.local.set({ [BUTTON_POSITION_KEY]: { left: rect.left, top: rect.top } });
      if (panel.classList.contains('onspot-open')) positionPanelNearButton();
    },
  });

  makeDraggable(panel, {
    dragHandle: header,
    onDragEnd: element => {
      const rect = element.getBoundingClientRect();
      const position = { left: rect.left, top: rect.top };
      panel.dataset.position = JSON.stringify(position);
      chrome.storage.local.set({ [PANEL_POSITION_KEY]: position });
    },
  });

  btn.addEventListener('click', event => event.stopPropagation());
  panel.addEventListener('click', event => event.stopPropagation());
  panel.querySelector('#onspot-float-panel-close').addEventListener('click', closePanel);
  document.addEventListener('click', event => {
    if (panel.classList.contains('onspot-open') && !panel.contains(event.target) && event.target !== btn) closePanel();
  }, true);
  window.addEventListener('resize', () => {
    if (panel.classList.contains('onspot-open')) positionPanelNearButton();
  });

  chrome.storage.local.get([BUTTON_POSITION_KEY, PANEL_POSITION_KEY, FLOAT_ENABLED_KEY], result => {
    const buttonPosition = result[BUTTON_POSITION_KEY];
    const panelPosition = result[PANEL_POSITION_KEY];
    if (buttonPosition && Number.isFinite(buttonPosition.left) && Number.isFinite(buttonPosition.top)) {
      const position = clampPosition(buttonPosition.left, buttonPosition.top, 48, 48);
      btn.style.left = `${position.left}px`;
      btn.style.top = `${position.top}px`;
      btn.style.right = 'auto';
    }
    if (panelPosition && Number.isFinite(panelPosition.left) && Number.isFinite(panelPosition.top)) {
      panel.dataset.position = JSON.stringify(panelPosition);
    }
    btn.style.display = result[FLOAT_ENABLED_KEY] === false ? 'none' : 'flex';
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === 'onspot:ping') {
      sendResponse({ ok: true, version: CONTENT_VERSION });
      return true;
    }
    if (message.type === 'onspot:toggleFloat') {
      btn.style.display = message.enabled === false ? 'none' : 'flex';
      if (message.enabled === false) closePanel();
    }
    if (message.type === 'onspot:openPanel') openPanel();
  });
})();
