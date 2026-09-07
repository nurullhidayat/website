// ==UserScript==
// @name         WinGo Live Sync
// @namespace    https://wingo-history-inspector-gh238640-1159s-projects.vercel.app
// @version      1.1.0
// @description  Capture public WinGo history from your browser session and sync it live to the dashboard tab. No cookies/tokens are sent.
// @match        https://55u3gpn.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__wingoLiveSyncInstalled) return;
  window.__wingoLiveSyncInstalled = true;

  const DASH_URL = 'https://wingo-history-inspector-gh238640-1159s-projects.vercel.app/';
  const DASH_ORIGIN = 'https://wingo-history-inspector-gh238640-1159s-projects.vercel.app';
  let dashboardWindow = null;
  let lastPayload = null;
  let dashboardReady = false;

  const pickList = (j) => {
    const candidates = [j?.data?.list, j?.data?.data?.list, j?.list, j?.data, j?.result?.list];
    const arr = candidates.find(Array.isArray);
    if (!arr) return [];
    return arr.filter(x => x && typeof x === 'object').map(x => ({
      issueNumber: x.issueNumber ?? x.issue ?? x.period ?? x.periodNo ?? x.gameIssue,
      period: x.period ?? x.issueNumber,
      number: x.number ?? x.result ?? x.openNumber,
      colour: x.colour ?? x.color,
      color: x.color ?? x.colour,
      premium: x.premium,
      size: x.size
    })).filter(x => (x.issueNumber != null || x.period != null) && x.number != null);
  };

  function postPayload(payload) {
    if (!payload || !dashboardWindow || dashboardWindow.closed) return false;
    try {
      dashboardWindow.postMessage({ type: 'WINGO_HISTORY_SYNC', payload }, DASH_ORIGIN);
      return true;
    } catch { return false; }
  }

  function sendToDashboard(payload) {
    lastPayload = payload;
    if (dashboardReady) postPayload(payload);
    renderBadge(payload.history.length);
  }

  window.addEventListener('message', (ev) => {
    if (ev.origin !== DASH_ORIGIN) return;
    const msg = ev.data;
    if (!msg || msg.type !== 'WINGO_DASHBOARD_READY') return;
    dashboardWindow = ev.source;
    dashboardReady = true;
    if (lastPayload) postPayload(lastPayload);
    renderBadge(lastPayload?.history?.length || 0);
  });

  function openDashboard() {
    dashboardReady = false;
    dashboardWindow = window.open(DASH_URL, 'wingoDashboard');
    let tries = 0;
    const retry = setInterval(() => {
      tries++;
      if (!dashboardWindow || dashboardWindow.closed || dashboardReady || tries >= 15) {
        clearInterval(retry);
        return;
      }
      try {
        dashboardWindow.postMessage({ type: 'WINGO_WIN_GO_HELLO' }, DASH_ORIGIN);
      } catch {}
    }, 500);
  }

  function renderBadge(count) {
    const mount = () => {
      let box = document.getElementById('__wingoLiveSyncBox');
      if (!box) {
        box = document.createElement('div');
        box.id = '__wingoLiveSyncBox';
        Object.assign(box.style, {
          position:'fixed', right:'12px', bottom:'12px', zIndex:2147483647,
          background:'#0d1b2d', color:'#fff', padding:'10px 12px', border:'1px solid #5aa9ff',
          borderRadius:'10px', font:'13px system-ui', boxShadow:'0 8px 24px rgba(0,0,0,.35)'
        });
        const label = document.createElement('span');
        label.id = '__wingoLiveSyncLabel';
        const btn = document.createElement('button');
        btn.textContent = 'Buka Dashboard';
        Object.assign(btn.style,{marginLeft:'8px',background:'#5aa9ff',border:'0',padding:'7px 10px',borderRadius:'7px',fontWeight:'700',cursor:'pointer'});
        btn.onclick = openDashboard;
        box.append(label, btn);
        document.body.appendChild(box);
      }
      const label = document.getElementById('__wingoLiveSyncLabel');
      if (label) {
        const state = dashboardReady ? 'tersambung' : 'aktif';
        label.textContent = `Live Sync ${state} • ${count} history`;
      }
    };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once:true });
  }

  function handleJson(j, url) {
    const rows = pickList(j);
    if (rows.length < 2) return;
    sendToDashboard({
      history: rows.slice(0, 100),
      source: url,
      capturedAt: new Date().toISOString()
    });
  }

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const r = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'fetch';
      const text = await r.clone().text();
      handleJson(JSON.parse(text), url);
    } catch {}
    return r;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__wingoSyncUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener('load', () => {
      try { handleJson(JSON.parse(this.responseText), this.__wingoSyncUrl || 'xhr'); } catch {}
    });
    return originalSend.call(this, body);
  };

  renderBadge(0);
})();