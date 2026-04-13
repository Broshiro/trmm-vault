// ==UserScript==
// @name         TacticalRMM — Vault + Clipboard Sync
// @namespace    https://github.com/Broshiro/trmm-vault
// @version      1.2.0
// @description  Vault panel for TRMM + seamless clipboard sync in MeshCentral remote sessions
// @updateURL    https://raw.githubusercontent.com/Broshiro/trmm-vault/main/tampermonkey/trmm-vault.user.js
// @downloadURL  https://raw.githubusercontent.com/Broshiro/trmm-vault/main/tampermonkey/trmm-vault.user.js
// @author       Broshiro
// @match        https://trmm.ambrose.rocks/*
// @match        https://mesh.ambrose.rocks/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      trmm.ambrose.rocks
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CLIPBOARD SYNC — runs on mesh.ambrose.rocks remote desktop pages
  // ============================================================
  if (window.location.hostname === 'mesh.ambrose.rocks') {
    initClipboardSync();
    return;
  }

  // ============================================================
  // VAULT — runs on trmm.ambrose.rocks
  // ============================================================
  const API = 'https://trmm.ambrose.rocks/vault-api';

  // ---- Clipboard Sync module ----
  function initClipboardSync() {
    let syncEnabled   = false;
    let lastRemoteClip = '';
    let syncInterval   = null;

    GM_addStyle(`
      #clip-sync-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        background: #1565C0;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        transition: background 0.2s;
        user-select: none;
      }
      #clip-sync-btn:hover  { background: #0d47a1; }
      #clip-sync-btn.active { background: #2e7d32; }
      #clip-sync-btn.flash  { background: #f57f17; }
      #clip-sync-toast {
        position: fixed;
        bottom: 80px;
        right: 24px;
        z-index: 99999;
        background: rgba(0,0,0,0.75);
        color: #fff;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-family: sans-serif;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
      }
      #clip-sync-toast.show { opacity: 1; }
    `);

    const btn   = document.createElement('button');
    btn.id      = 'clip-sync-btn';
    btn.title   = 'Click to toggle auto clipboard sync\nCtrl+Shift+V — push local clipboard to remote\nCtrl+Shift+C — pull remote clipboard to local';
    btn.textContent = '📋 Clipboard Sync';
    document.body.appendChild(btn);

    const toast = document.createElement('div');
    toast.id = 'clip-sync-toast';
    document.body.appendChild(toast);

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // --- Find MeshCentral clipboard elements ---
    function openClipboardPanel() {
      // MeshCentral toolbar clipboard button — try multiple selector strategies
      const candidates = [
        ...document.querySelectorAll('[title*="Clipboard" i]'),
        ...document.querySelectorAll('[aria-label*="Clipboard" i]'),
        ...Array.from(document.querySelectorAll('button,div,span')).filter(el =>
          /clipboard/i.test(el.getAttribute('title') || el.getAttribute('aria-label') || '')
        )
      ];
      if (candidates.length) { candidates[0].click(); return true; }
      return false;
    }

    function getClipboardPanel() {
      // Look for visible textarea that likely belongs to clipboard panel
      const textareas = Array.from(document.querySelectorAll('textarea')).filter(t => {
        const rect = t.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const ta = textareas.find(t =>
        /clip/i.test(t.id + t.className + (t.getAttribute('placeholder') || ''))
      ) || textareas[0];

      if (!ta) return null;

      // Find Send/Receive buttons near the textarea
      const allBtns = Array.from(document.querySelectorAll('button, input[type="button"]'));
      const sendBtn = allBtns.find(b =>
        /send|set/i.test(b.textContent + b.value) && !/receiv/i.test(b.textContent + b.value)
      );
      const recvBtn = allBtns.find(b =>
        /receiv|get/i.test(b.textContent + b.value)
      );

      return { ta, sendBtn, recvBtn };
    }

    // --- Core clipboard operations ---
    async function pushToRemote() {
      let text;
      try { text = await navigator.clipboard.readText(); }
      catch(e) { showToast('⚠ Clipboard read blocked — grant permission'); return; }
      if (!text) return;

      let els = getClipboardPanel();
      if (!els) {
        openClipboardPanel();
        await new Promise(r => setTimeout(r, 400));
        els = getClipboardPanel();
      }
      if (!els || !els.ta) { showToast('⚠ Could not find clipboard panel'); return; }

      els.ta.value = text;
      els.ta.dispatchEvent(new Event('input', { bubbles: true }));
      if (els.sendBtn) {
        els.sendBtn.click();
        showToast('📤 Sent to remote');
      }
    }

    async function pullFromRemote(silent) {
      let els = getClipboardPanel();
      if (!els) {
        openClipboardPanel();
        await new Promise(r => setTimeout(r, 400));
        els = getClipboardPanel();
      }
      if (!els || !els.ta) {
        if (!silent) showToast('⚠ Could not find clipboard panel');
        return;
      }

      if (els.recvBtn) els.recvBtn.click();
      await new Promise(r => setTimeout(r, 150));

      const text = els.ta.value;
      if (!text || text === lastRemoteClip) return;
      lastRemoteClip = text;
      try {
        await navigator.clipboard.writeText(text);
        if (!silent) showToast('📥 Received from remote');
        else showToast('📥 Clipboard updated from remote');
      } catch(e) { /* writeText usually works without gesture */ }
    }

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', async e => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        await pushToRemote();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        await pullFromRemote(false);
      }
    }, true);

    // --- Toggle auto-sync ---
    btn.addEventListener('click', () => {
      syncEnabled = !syncEnabled;
      btn.classList.toggle('active', syncEnabled);
      btn.textContent = syncEnabled ? '📋 Syncing (on)' : '📋 Clipboard Sync';

      if (syncEnabled) {
        // open panel once so it stays in DOM, then poll
        openClipboardPanel();
        syncInterval = setInterval(() => pullFromRemote(true), 2000);
        showToast('Auto-sync ON — remote clipboard mirrors to local every 2s');
      } else {
        clearInterval(syncInterval);
        syncInterval = null;
        showToast('Auto-sync OFF');
      }
    });
  }

  // ---- Everything below is the original Vault panel (unchanged) ----

  GM_addStyle(`
    #vault-btn {
      position: fixed;
      z-index: 9999;
      background: #1976D2;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: grab;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
    }
    #vault-btn:hover { background: #1565C0; }
    #vault-btn.dragging { cursor: grabbing; opacity: 0.85; }

    #vault-panel {
      position: fixed;
      z-index: 9998;
      width: 360px;
      max-height: 520px;
      background: #1e1e2e;
      border: 1px solid #333;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      overflow: hidden;
      display: none;
      flex-direction: column;
      font-family: sans-serif;
    }
    #vault-panel.open { display: flex; }
    #vault-header {
      padding: 12px 16px;
      background: #181825;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #vault-header span { color: #cdd6f4; font-weight: 600; font-size: 14px; }
    #vault-org-select {
      background: #313244;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      max-width: 160px;
    }
    #vault-sync-btn {
      background: none;
      border: none;
      color: #6c7086;
      cursor: pointer;
      font-size: 16px;
      padding: 0 4px;
    }
    #vault-sync-btn:hover { color: #cdd6f4; }
    #vault-items { overflow-y: auto; padding: 8px; flex: 1; }
    .vault-card {
      background: #313244;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .vault-card-name { color: #cdd6f4; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .vault-card-username {
      color: #6c7086; font-size: 11px; margin-bottom: 8px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .vault-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .vault-copy-btn {
      background: #45475a; color: #cdd6f4; border: none; border-radius: 4px;
      padding: 5px 10px; font-size: 11px; cursor: pointer; transition: background 0.15s;
    }
    .vault-copy-btn:hover { background: #585b70; }
    .vault-copy-btn.copied { background: #a6e3a1; color: #1e1e2e; }
    #vault-status { padding: 8px 16px; color: #6c7086; font-size: 12px; text-align: center; }
  `);

  const btn = document.createElement('button');
  btn.id = 'vault-btn';
  btn.innerHTML = '🔑 Vault';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'vault-panel';
  panel.innerHTML = `
    <div id="vault-header">
      <span>🔑 Vault</span>
      <select id="vault-org-select"><option value="">Loading orgs…</option></select>
      <button id="vault-sync-btn" title="Sync vault">↻</button>
    </div>
    <div id="vault-items"><div id="vault-status">Select an org above</div></div>
  `;
  document.body.appendChild(panel);

  const POS_KEY = 'vault-btn-pos';
  const DEFAULT_POS = { right: 24, bottom: 24 };

  function applyPos(pos) {
    btn.style.right  = pos.right  != null ? pos.right  + 'px' : '';
    btn.style.bottom = pos.bottom != null ? pos.bottom + 'px' : '';
    btn.style.left   = pos.left   != null ? pos.left   + 'px' : '';
    btn.style.top    = pos.top    != null ? pos.top    + 'px' : '';
    positionPanel();
  }

  function positionPanel() {
    const r = btn.getBoundingClientRect();
    const panelH = 520, margin = 8;
    const spaceAbove = r.top, spaceBelow = window.innerHeight - r.bottom;
    if (spaceAbove >= panelH + margin || spaceAbove > spaceBelow) {
      panel.style.top = ''; panel.style.bottom = (window.innerHeight - r.top + margin) + 'px';
    } else {
      panel.style.bottom = ''; panel.style.top = (r.bottom + margin) + 'px';
    }
    const rightEdge = window.innerWidth - r.right;
    panel.style.right = Math.max(4, rightEdge) + 'px'; panel.style.left = '';
  }

  try { applyPos(JSON.parse(localStorage.getItem(POS_KEY)) || DEFAULT_POS); }
  catch(e) { applyPos(DEFAULT_POS); }

  let dragging = false, dragMoved = false, ox = 0, oy = 0;
  btn.addEventListener('mousedown', e => {
    dragging = true; dragMoved = false;
    ox = e.clientX - btn.getBoundingClientRect().left;
    oy = e.clientY - btn.getBoundingClientRect().top;
    btn.classList.add('dragging'); e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return; dragMoved = true;
    const x = e.clientX - ox, y = e.clientY - oy;
    const right  = window.innerWidth  - x - btn.offsetWidth;
    const bottom = window.innerHeight - y - btn.offsetHeight;
    const pos = {
      right:  Math.max(0, Math.min(right,  window.innerWidth  - btn.offsetWidth)),
      bottom: Math.max(0, Math.min(bottom, window.innerHeight - btn.offsetHeight)),
    };
    applyPos(pos); localStorage.setItem(POS_KEY, JSON.stringify(pos));
  });
  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; btn.classList.remove('dragging'); }
  });
  btn.addEventListener('click', e => {
    if (dragMoved) return;
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) { positionPanel(); loadOrgs(); }
  });

  document.getElementById('vault-sync-btn').addEventListener('click', () => {
    apiPost('/sync', () => {
      const orgId = document.getElementById('vault-org-select').value;
      if (orgId) loadItems(orgId);
    });
  });
  document.getElementById('vault-org-select').addEventListener('change', e => {
    if (e.target.value) loadItems(e.target.value);
  });

  function apiGet(path, cb) {
    GM_xmlhttpRequest({
      method: 'GET', url: API + path,
      onload: r => { try { cb(null, JSON.parse(r.responseText)); } catch(e) { cb(e); } },
      onerror: e => cb(e)
    });
  }
  function apiPost(path, cb) {
    GM_xmlhttpRequest({
      method: 'POST', url: API + path,
      onload: r => { try { cb(null, JSON.parse(r.responseText)); } catch(e) { cb(e); } },
      onerror: e => cb(e)
    });
  }

  function getCurrentClientName() {
    const selectors = ['.q-breadcrumbs__el','.text-subtitle1','.text-h6','[data-cy="client-name"]'];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) { const text = el.textContent.trim(); if (text && text.length > 1) return text; }
    }
    return null;
  }
  function bestOrgMatch(clientName, orgs) {
    if (!clientName) return null;
    const needle = clientName.toLowerCase();
    let match = orgs.find(o => o.name.toLowerCase() === needle);
    if (match) return match;
    match = orgs.find(o => needle.includes(o.name.toLowerCase()) || o.name.toLowerCase().includes(needle));
    return match || null;
  }

  let orgsCache = null;
  function loadOrgs() {
    if (orgsCache) { populateOrgSelect(orgsCache); return; }
    setStatus('Loading orgs…');
    apiGet('/orgs', (err, orgs) => {
      if (err || !Array.isArray(orgs)) { setStatus('Failed to load orgs'); return; }
      orgsCache = orgs; populateOrgSelect(orgs);
    });
  }
  function populateOrgSelect(orgs) {
    const sel = document.getElementById('vault-org-select');
    sel.innerHTML = '<option value="">— select org —</option>';
    orgs.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name; sel.appendChild(opt);
    });
    const clientName = getCurrentClientName();
    const match = bestOrgMatch(clientName, orgs);
    if (match) { sel.value = match.id; loadItems(match.id); }
    else { setStatus(clientName ? `No org match for "${clientName}"` : 'Select an org above'); }
  }
  function loadItems(orgId) {
    setStatus('Loading credentials…');
    apiGet(`/orgs/${orgId}/items`, (err, items) => {
      if (err || !Array.isArray(items)) { setStatus('Failed to load credentials'); return; }
      if (items.length === 0) { setStatus('No credentials in this org'); return; }
      renderItems(items);
    });
  }
  function renderItems(items) {
    const container = document.getElementById('vault-items');
    container.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-card';
      card.innerHTML = `
        <div class="vault-card-name">${esc(item.name)}</div>
        ${item.username ? `<div class="vault-card-username">${esc(item.username)}</div>` : ''}
        <div class="vault-actions">
          <button class="vault-copy-btn" data-copy="${esc(item.username)}" data-label="Username">Copy Username</button>
          <button class="vault-copy-btn" data-copy="${esc(item.password)}" data-label="Password">Copy Password</button>
          ${item.has_totp ? `<button class="vault-copy-btn vault-totp-btn" data-id="${item.id}" data-label="OTP">Copy OTP</button>` : ''}
        </div>
      `;
      container.appendChild(card);
    });
    container.querySelectorAll('.vault-copy-btn:not(.vault-totp-btn)').forEach(b => {
      b.addEventListener('click', () => copyAndFlash(b, b.dataset.copy));
    });
    container.querySelectorAll('.vault-totp-btn').forEach(b => {
      b.addEventListener('click', () => {
        b.textContent = '…';
        apiGet(`/totp/${b.dataset.id}`, (err, data) => {
          if (err || !data.totp) { b.textContent = 'Copy OTP'; return; }
          copyAndFlash(b, data.totp);
        });
      });
    });
  }
  function copyAndFlash(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    });
  }
  function setStatus(msg) {
    document.getElementById('vault-items').innerHTML = `<div id="vault-status">${msg}</div>`;
  }
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();