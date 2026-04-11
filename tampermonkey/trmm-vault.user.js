// ==UserScript==
// @name         TacticalRMM — Vault
// @namespace    https://github.com/Broshiro/trmm-vault
// @version      1.1.0
// @description  Adds a Vault panel to TacticalRMM that shows Vaultwarden credentials for the current client
// @author       Broshiro
// @match        https://YOUR-TRMM-DOMAIN/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      YOUR-TRMM-DOMAIN
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION — update these to match your environment
  // ============================================================
  // The vault-proxy API endpoint. If you added the /vault-api/ location
  // block to your TRMM nginx conf, use:  https://your-trmm-domain/vault-api
  // If you exposed vault-proxy separately, use that URL instead.
  const API = 'https://YOUR-TRMM-DOMAIN/vault-api';
  // ============================================================

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

    #vault-items {
      overflow-y: auto;
      padding: 8px;
      flex: 1;
    }

    .vault-card {
      background: #313244;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .vault-card-name {
      color: #cdd6f4;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .vault-card-username {
      color: #6c7086;
      font-size: 11px;
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vault-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .vault-copy-btn {
      background: #45475a;
      color: #cdd6f4;
      border: none;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .vault-copy-btn:hover { background: #585b70; }
    .vault-copy-btn.copied { background: #a6e3a1; color: #1e1e2e; }

    #vault-status {
      padding: 8px 16px;
      color: #6c7086;
      font-size: 12px;
      text-align: center;
    }
  `);

  // --- UI scaffold ---
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

  // --- Draggable button + persistent position ---
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
    const panelH = 520;
    const margin = 8;
    // Place panel above the button
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceAbove >= panelH + margin || spaceAbove > spaceBelow) {
      panel.style.top    = '';
      panel.style.bottom = (window.innerHeight - r.top + margin) + 'px';
    } else {
      panel.style.bottom = '';
      panel.style.top    = (r.bottom + margin) + 'px';
    }
    // Align panel's right edge with button's right edge
    const rightEdge = window.innerWidth - r.right;
    panel.style.right = Math.max(4, rightEdge) + 'px';
    panel.style.left  = '';
  }

  try {
    applyPos(JSON.parse(localStorage.getItem(POS_KEY)) || DEFAULT_POS);
  } catch(e) {
    applyPos(DEFAULT_POS);
  }

  let dragging = false, dragMoved = false, ox = 0, oy = 0;

  btn.addEventListener('mousedown', e => {
    dragging = true;
    dragMoved = false;
    ox = e.clientX - btn.getBoundingClientRect().left;
    oy = e.clientY - btn.getBoundingClientRect().top;
    btn.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    dragMoved = true;
    const x = e.clientX - ox;
    const y = e.clientY - oy;
    // Convert to right/bottom so it stays put on resize
    const right  = window.innerWidth  - x - btn.offsetWidth;
    const bottom = window.innerHeight - y - btn.offsetHeight;
    const pos = {
      right:  Math.max(0, Math.min(right,  window.innerWidth  - btn.offsetWidth)),
      bottom: Math.max(0, Math.min(bottom, window.innerHeight - btn.offsetHeight)),
    };
    applyPos(pos);
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      btn.classList.remove('dragging');
    }
  });

  btn.addEventListener('click', e => {
    if (dragMoved) return; // suppress click after drag
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

  // --- API helpers ---
  function apiGet(path, cb) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: API + path,
      onload: r => { try { cb(null, JSON.parse(r.responseText)); } catch(e) { cb(e); } },
      onerror: e => cb(e)
    });
  }

  function apiPost(path, cb) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: API + path,
      onload: r => { try { cb(null, JSON.parse(r.responseText)); } catch(e) { cb(e); } },
      onerror: e => cb(e)
    });
  }

  // --- Org detection ---
  function getCurrentClientName() {
    const selectors = [
      '.q-breadcrumbs__el',
      '.text-subtitle1',
      '.text-h6',
      '[data-cy="client-name"]'
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = el.textContent.trim();
        if (text && text.length > 1) return text;
      }
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

  // --- Load orgs ---
  let orgsCache = null;
  function loadOrgs() {
    if (orgsCache) { populateOrgSelect(orgsCache); return; }
    setStatus('Loading orgs…');
    apiGet('/orgs', (err, orgs) => {
      if (err || !Array.isArray(orgs)) { setStatus('Failed to load orgs'); return; }
      orgsCache = orgs;
      populateOrgSelect(orgs);
    });
  }

  function populateOrgSelect(orgs) {
    const sel = document.getElementById('vault-org-select');
    sel.innerHTML = '<option value="">— select org —</option>';
    orgs.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });

    const clientName = getCurrentClientName();
    const match = bestOrgMatch(clientName, orgs);
    if (match) {
      sel.value = match.id;
      loadItems(match.id);
    } else {
      setStatus(clientName ? `No org match for "${clientName}"` : 'Select an org above');
    }
  }

  // --- Load items ---
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

  // --- Helpers ---
  function copyAndFlash(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
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
