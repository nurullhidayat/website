// ==UserScript==
// @name         WinGo Live Sync
// @namespace    https://wingo-history-inspector.vercel.app
// @version      1.3.0
// @description  Live WinGo history sync with Tampermonkey background polling plus private cloud history backup in Supabase. No login cookies or auth tokens are read.
// @match        https://55u3gpn.com/*
// @match        https://wingo-history-inspector.vercel.app/*
// @match        https://wingo-history-inspector-gh238640-1159s-projects.vercel.app/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @connect      api.55fiveapi.com
// @connect      kqybkatzigncurofxuuv.supabase.co
// @require      https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js
// ==/UserScript==

(() => {
  'use strict';

  const API_URL = 'https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList';
  const DASH_URL = 'https://wingo-history-inspector.vercel.app/';
  const STORE_KEY = 'wingo_latest_payload_v2';
  const CLOUD_PERIOD_KEY = 'wingo_cloud_last_period_v1';
  const CLOUD_URL = 'https://kqybkatzigncurofxuuv.supabase.co/functions/v1/ingest-wingo-history';
  const CLOUD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeWJrYXR6aWduY3Vyb2Z4dXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDA1NjYsImV4cCI6MjEwNDM3NjU2Nn0.fmEu3OMshxuSJLwveVKLu2X1bGyLGG6Zqq6mEKSMVO8';
  const isWinGo = location.hostname === '55u3gpn.com';
  const isDashboard = location.hostname.includes('wingo-history-inspector');
  let stopped = false;
  let pollTimer = null;
  let latestCount = 0;
  let cloudBusy = false;

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

  function randomId() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 3) | 8;
      return v.toString(16);
    });
  }

  function signPayload(payload) {
    const sorted = {};
    Object.keys(payload).sort().forEach(k => {
      const v = payload[k];
      if (v !== null && v !== '') sorted[k] = v;
    });
    return CryptoJS.MD5(JSON.stringify(sorted)).toString().toUpperCase();
  }

  function makeBody() {
    const body = { pageSize: 50, pageNo: 1, typeId: 30, language: 1, random: randomId() };
    body.signature = signPayload(body);
    body.timestamp = Math.floor(Date.now() / 1000);
    return body;
  }

  function publishToPage(payload) {
    try {
      window.postMessage({ type: 'WINGO_TM_SYNC', payload }, location.origin);
    } catch {}
  }

  async function cloudSync(payload) {
    if (!isDashboard || cloudBusy || !payload?.history?.length) return;
    const newest = String(payload.history[0]?.issueNumber ?? payload.history[0]?.period ?? '');
    if (!newest) return;
    const last = await GM_getValue(CLOUD_PERIOD_KEY, '');
    if (String(last) === newest) return;

    cloudBusy = true;
    GM_xmlhttpRequest({
      method: 'POST',
      url: CLOUD_URL,
      timeout: 12000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLOUD_ANON_KEY}`,
        'apikey': CLOUD_ANON_KEY
      },
      data: JSON.stringify(payload),
      onload: async (r) => {
        cloudBusy = false;
        if (r.status >= 200 && r.status < 300) {
          await GM_setValue(CLOUD_PERIOD_KEY, newest);
          try {
            const data = JSON.parse(r.responseText || '{}');
            publishToPage({ ...payload, cloudSync: { ok:true, inserted:data.inserted ?? payload.history.length } });
          } catch {
            publishToPage({ ...payload, cloudSync: { ok:true } });
          }
        } else {
          publishToPage({ ...payload, cloudSync: { ok:false, status:r.status, preview:(r.responseText || '').slice(0,180) } });
        }
      },
      onerror: () => { cloudBusy = false; publishToPage({ ...payload, cloudSync: { ok:false, error:'network' } }); },
      ontimeout: () => { cloudBusy = false; publishToPage({ ...payload, cloudSync: { ok:false, error:'timeout' } }); }
    });
  }

  function savePayload(rows, source, mode) {
    if (!rows?.length) return;
    latestCount = rows.length;
    const payload = {
      history: rows.slice(0, 100),
      source,
      mode,
      capturedAt: new Date().toISOString()
    };
    GM_setValue(STORE_KEY, payload);
    if (isDashboard) {
      publishToPage(payload);
      cloudSync(payload);
    }
    if (isWinGo) renderBadge();
  }

  function pollApi() {
    if (stopped || !isDashboard) return;
    const body = makeBody();
    GM_xmlhttpRequest({
      method: 'POST',
      url: API_URL,
      anonymous: true,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*'
      },
      data: JSON.stringify(body),
      onload: (r) => {
        try {
          if (r.status >= 200 && r.status < 300) {
            const j = JSON.parse(r.responseText);
            const rows = pickList(j);
            if (rows.length >= 2) savePayload(rows, API_URL, 'tampermonkey-poll');
            else publishToPage({ history: [], source: API_URL, mode: 'poll-empty', capturedAt: new Date().toISOString(), diagnostic: { status: r.status, preview: r.responseText.slice(0, 300) } });
          } else {
            publishToPage({ history: [], source: API_URL, mode: 'poll-error', capturedAt: new Date().toISOString(), diagnostic: { status: r.status, preview: r.responseText.slice(0, 300) } });
          }
        } catch (e) {
          publishToPage({ history: [], source: API_URL, mode: 'poll-parse-error', capturedAt: new Date().toISOString(), diagnostic: { error: e.message } });
        }
        schedulePoll();
      },
      onerror: () => { publishToPage({ history: [], source: API_URL, mode: 'poll-network-error', capturedAt: new Date().toISOString() }); schedulePoll(); },
      ontimeout: () => { publishToPage({ history: [], source: API_URL, mode: 'poll-timeout', capturedAt: new Date().toISOString() }); schedulePoll(); }
    });
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (!stopped && isDashboard) pollTimer = setTimeout(pollApi, 5000);
  }

  function renderBadge() {
    const mount = () => {
      let box = document.getElementById('__wingoLiveSyncBox');
      if (!box) {
        box = document.createElement('div');
        box.id = '__wingoLiveSyncBox';
        Object.assign(box.style, {position:'fixed',right:'12px',bottom:'12px',zIndex:2147483647,background:'#0d1b2d',color:'#fff',padding:'10px 12px',border:'1px solid #5aa9ff',borderRadius:'10px',font:'13px system-ui',boxShadow:'0 8px 24px rgba(0,0,0,.35)'});
        const label = document.createElement('span'); label.id='__wingoLiveSyncLabel';
        const btn = document.createElement('button'); btn.textContent='Buka Dashboard';
        Object.assign(btn.style,{marginLeft:'8px',background:'#5aa9ff',border:'0',padding:'7px 10px',borderRadius:'7px',fontWeight:'700',cursor:'pointer'});
        btn.onclick=()=>window.open(DASH_URL,'wingoDashboard');
        box.append(label,btn); document.body.appendChild(box);
      }
      const label=document.getElementById('__wingoLiveSyncLabel');
      if(label) label.textContent=`Live Sync aktif • ${latestCount} history`;
    };
    if(document.body) mount(); else document.addEventListener('DOMContentLoaded',mount,{once:true});
  }

  if (isWinGo) {
    const handleJson = (j,url) => { const rows=pickList(j); if(rows.length>=2) savePayload(rows,url,'wingo-capture'); };
    const of=window.fetch;
    window.fetch=async function(...args){const r=await of.apply(this,args);try{const url=typeof args[0]==='string'?args[0]:args[0]?.url||'fetch';handleJson(JSON.parse(await r.clone().text()),url)}catch{}return r;};
    const XO=XMLHttpRequest.prototype.open, XS=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(m,u,...rest){this.__wingoSyncUrl=u;return XO.call(this,m,u,...rest)};
    XMLHttpRequest.prototype.send=function(body){this.addEventListener('load',()=>{try{handleJson(JSON.parse(this.responseText),this.__wingoSyncUrl||'xhr')}catch{}});return XS.call(this,body)};
    renderBadge();
  }

  if (isDashboard) {
    GM_addValueChangeListener(STORE_KEY, (_k,_old,val) => { if (val?.history) { publishToPage(val); cloudSync(val); } });
    Promise.resolve(GM_getValue(STORE_KEY, null)).then(v => { if(v?.history) { publishToPage(v); cloudSync(v); } });
    window.addEventListener('load', () => { stopped=false; pollApi(); });
    document.addEventListener('visibilitychange', () => { if(!document.hidden){ stopped=false; pollApi(); } });
    window.addEventListener('beforeunload', () => { stopped=true; if(pollTimer) clearTimeout(pollTimer); });
  }
})();