(() => {
  'use strict';

  const KEY = 'wingo_live_history_v1';
  const AUDIT_EVERY_MS = 5000;
  let lastFingerprint = '';

  const num = v => Number(v);
  const safe = v => Number.isFinite(Number(v));

  function readHistory() {
    try {
      const x = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }

  function normalizedRows(history) {
    return history
      .filter(x => safe(x.number) && safe(x.premium) && (x.issueNumber != null || x.period != null))
      .map(x => ({
        period: String(x.issueNumber ?? x.period),
        number: num(x.number),
        premium: num(x.premium)
      }))
      .filter(x => Number.isInteger(x.number) && x.number >= 0 && x.number <= 9)
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  function corr(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return 0;
    let sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
    const ma = sa / n, mb = sb / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      cov += da * db; va += da * da; vb += db * db;
    }
    return va && vb ? cov / Math.sqrt(va * vb) : 0;
  }

  function chiUniform(freq) {
    const n = freq.reduce((a, b) => a + b, 0);
    if (!n) return 0;
    const e = n / freq.length;
    return freq.reduce((s, o) => s + ((o - e) ** 2) / e, 0);
  }

  function twoByKChi(a, b) {
    const k = Math.min(a.length, b.length);
    const r1 = a.slice(0, k).reduce((x, y) => x + y, 0);
    const r2 = b.slice(0, k).reduce((x, y) => x + y, 0);
    const total = r1 + r2;
    if (!r1 || !r2 || !total) return 0;
    let chi = 0;
    for (let i = 0; i < k; i++) {
      const col = a[i] + b[i];
      if (!col) continue;
      const e1 = r1 * col / total;
      const e2 = r2 * col / total;
      if (e1) chi += ((a[i] - e1) ** 2) / e1;
      if (e2) chi += ((b[i] - e2) ** 2) / e2;
    }
    return chi;
  }

  function collisionPairs(values) {
    const m = new Map();
    for (const v of values) m.set(v, (m.get(v) || 0) + 1);
    let pairs = 0;
    for (const c of m.values()) pairs += c * (c - 1) / 2;
    return { pairs, distinct: m.size, repeatedValues: [...m.values()].filter(c => c > 1).length };
  }

  function runsTest(binary) {
    if (binary.length < 2) return { runs: binary.length, z: 0 };
    let n0 = 0, n1 = 0, runs = 1;
    for (const x of binary) x ? n1++ : n0++;
    for (let i = 1; i < binary.length; i++) if (binary[i] !== binary[i - 1]) runs++;
    const n = n0 + n1;
    if (!n0 || !n1 || n < 3) return { runs, z: 0 };
    const mean = 1 + (2 * n0 * n1) / n;
    const variance = (2 * n0 * n1 * (2 * n0 * n1 - n)) / (n * n * (n - 1));
    const z = variance > 0 ? (runs - mean) / Math.sqrt(variance) : 0;
    return { runs, z, n0, n1 };
  }

  function maxSameStreak(numbers) {
    if (!numbers.length) return 0;
    let max = 1, cur = 1;
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] === numbers[i - 1]) { cur++; max = Math.max(max, cur); }
      else cur = 1;
    }
    return max;
  }

  function findGaps(rowsAsc) {
    const gaps = [];
    let prev = null;
    for (const r of rowsAsc) {
      const p = String(r.period || '');
      if (p.length < 8) continue;
      const day = p.slice(0, 8);
      const suffix = Number(p.slice(-5));
      if (prev && prev.day === day && Number.isFinite(suffix) && Number.isFinite(prev.suffix)) {
        const d = suffix - prev.suffix;
        if (d > 1) gaps.push({ after: prev.period, before: p, missing: d - 1 });
      }
      prev = { day, suffix, period: p };
    }
    return gaps;
  }

  function nextPeriod(period) {
    try {
      const p = String(period || '');
      if (p.length < 13) return '-';
      const suffix = Number(p.slice(-5));
      if (!Number.isFinite(suffix)) return '-';
      if (suffix < 52880) return p.slice(0, -5) + String(suffix + 1).padStart(5, '0');
      const y = Number(p.slice(0, 4)), m = Number(p.slice(4, 6)), d = Number(p.slice(6, 8));
      const dt = new Date(Date.UTC(y, m - 1, d + 1));
      const day = `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
      return day + p.slice(8, -5) + '50001';
    } catch {
      return '-';
    }
  }

  function audit(history) {
    const rows = normalizedRows(history);
    const n = rows.length;
    const numbers = rows.map(x => x.number);
    const premiums = rows.map(x => x.premium);
    const prefixes = premiums.map(p => Math.floor(p / 10));
    const freq = Array(10).fill(0);
    for (const x of numbers) freq[x]++;

    const mismatch = rows.filter(x => ((x.premium % 10) + 10) % 10 !== x.number).length;
    const chi = chiUniform(freq);
    const bigCount = numbers.filter(x => x >= 5).length;
    const bigZ = n ? (bigCount - n / 2) / Math.sqrt(n / 4) : 0;
    const lag1 = n > 2 ? corr(numbers.slice(1), numbers.slice(0, -1)) : 0;
    const bsRuns = runsTest(numbers.map(x => x >= 5 ? 1 : 0));
    const streak = maxSameStreak(numbers);
    const premiumCol = collisionPairs(premiums);
    const prefixCol = collisionPairs(prefixes);
    const premiumLambda = n > 1 ? n * (n - 1) / (2 * 90000) : 0;
    const prefixLambda = n > 1 ? n * (n - 1) / (2 * 9000) : 0;
    const premiumColZ = premiumLambda > 0 ? (premiumCol.pairs - premiumLambda) / Math.sqrt(premiumLambda) : 0;
    const prefixColZ = prefixLambda > 0 ? (prefixCol.pairs - prefixLambda) / Math.sqrt(prefixLambda) : 0;
    const gaps = findGaps(rows);

    let driftChi = 0;
    if (n >= 300) {
      const recent = rows.slice(-100);
      const baseline = rows.slice(0, -100);
      const rf = Array(10).fill(0), bf = Array(10).fill(0);
      recent.forEach(x => rf[x.number]++);
      baseline.forEach(x => bf[x.number]++);
      driftChi = twoByKChi(rf, bf);
    }

    const anomalies = [];
    const warnings = [];
    const critical = [];

    if (mismatch > 0) critical.push(`${mismatch} baris melanggar number = premium % 10`);
    if (chi > 21.67) anomalies.push(`Distribusi angka menyimpang kuat (χ²=${chi.toFixed(2)})`);
    else if (chi > 16.92) warnings.push(`Distribusi angka agak menyimpang (χ²=${chi.toFixed(2)})`);
    if (Math.abs(bigZ) > 3) anomalies.push(`Rasio Big/Small menyimpang >3σ (z=${bigZ.toFixed(2)})`);
    if (Math.abs(lag1) > Math.max(0.10, 3 / Math.sqrt(Math.max(n, 1)))) anomalies.push(`Autokorelasi lag-1 tinggi (r=${lag1.toFixed(3)})`);
    if (Math.abs(bsRuns.z) > 3) anomalies.push(`Pola run Big/Small menyimpang (z=${bsRuns.z.toFixed(2)})`);
    if (Math.abs(premiumColZ) > 3.5) anomalies.push(`Collision premium tidak wajar (z=${premiumColZ.toFixed(2)})`);
    if (Math.abs(prefixColZ) > 3.5) anomalies.push(`Collision prefix tidak wajar (z=${prefixColZ.toFixed(2)})`);
    if (driftChi > 21.67) anomalies.push(`100 ronde terbaru berbeda kuat dari baseline (χ²=${driftChi.toFixed(2)})`);
    if (gaps.length) warnings.push(`History lokal tidak lengkap: ${gaps.reduce((s, g) => s + g.missing, 0)} ronde hilang`);
    if (n < 200) warnings.push('Sampel masih <200 ronde; audit statistik belum kuat');

    let status = 'NORMAL';
    let cls = 'ok';
    if (n < 200) { status = 'BELUM CUKUP DATA'; cls = 'watch'; }
    if (warnings.length && !anomalies.length && n >= 200) { status = 'PERLU DIPANTAU'; cls = 'watch'; }
    if (anomalies.length >= 1) { status = 'MENCURIGAKAN'; cls = 'warn'; }
    if (anomalies.length >= 2) { status = 'MENCURIGAKAN KUAT'; cls = 'bad'; }
    if (critical.length) { status = 'STOP / DATA TIDAK VALID'; cls = 'bad'; }

    return {
      rows, n, status, cls, mismatch, chi, freq, bigCount, bigZ, lag1,
      bsRuns, streak, premiumCol, prefixCol, premiumLambda, prefixLambda,
      premiumColZ, prefixColZ, driftChi, gaps, anomalies, warnings, critical
    };
  }

  function distributionFromRows(rows) {
    const n = rows.length;
    const score = Array(10).fill(0.10);
    if (!n) return score;

    const windows = [
      { size: 20, weight: 0.30 },
      { size: 50, weight: 0.25 },
      { size: 100, weight: 0.20 }
    ];

    for (const w of windows) {
      const s = rows.slice(-Math.min(w.size, n));
      if (!s.length) continue;
      const f = Array(10).fill(1); // smoothing
      s.forEach(r => f[r.number]++);
      const total = f.reduce((a, b) => a + b, 0);
      for (let d = 0; d < 10; d++) score[d] += w.weight * (f[d] / total);
    }

    if (n >= 40) {
      const last = rows[n - 1].number;
      const trans = Array(10).fill(1);
      let cnt = 10;
      const start = Math.max(1, n - 500);
      for (let i = start; i < n; i++) {
        if (rows[i - 1].number === last) { trans[rows[i].number]++; cnt++; }
      }
      for (let d = 0; d < 10; d++) score[d] += 0.15 * (trans[d] / cnt);
    }

    // mild long-run prior to avoid recent-window overreaction
    const global = Array(10).fill(1);
    rows.forEach(r => global[r.number]++);
    const gt = global.reduce((a, b) => a + b, 0);
    for (let d = 0; d < 10; d++) score[d] += 0.10 * (global[d] / gt);

    const total = score.reduce((a, b) => a + b, 0);
    return score.map(x => x / total);
  }

  function backtest(rows) {
    const minTrain = 80;
    if (rows.length <= minTrain + 20) return { n: 0, top1: 0, top3: 0, baseline: 0.10 };
    const start = Math.max(minTrain, rows.length - 250);
    let n = 0, hit1 = 0, hit3 = 0;
    for (let i = start; i < rows.length; i++) {
      const train = rows.slice(0, i);
      const probs = distributionFromRows(train);
      const ranked = probs.map((p, d) => ({ d, p })).sort((a, b) => b.p - a.p);
      const actual = rows[i].number;
      if (ranked[0].d === actual) hit1++;
      if (ranked.slice(0, 3).some(x => x.d === actual)) hit3++;
      n++;
    }
    return { n, top1: hit1 / n, top3: hit3 / n, baseline: 0.10 };
  }

  function forecast(a) {
    const rows = a.rows;
    const probs = distributionFromRows(rows);
    const ranked = probs.map((p, d) => ({ d, p })).sort((x, y) => y.p - x.p);
    const bt = backtest(rows);
    const latest = rows[rows.length - 1];
    const target = latest ? nextPeriod(latest.period) : '-';
    const top = ranked.slice(0, 3);
    const bigMass = ranked.filter(x => x.d >= 5).reduce((s, x) => s + x.p, 0);
    const smallMass = 1 - bigMass;
    const spread = ranked[0].p - ranked[9].p;

    let status = 'SKIP — BELUM ADA EDGE';
    let cls = 'watch';
    let confidence = 'Rendah';
    const reasons = [];

    if (a.critical.length) {
      status = 'STOP — DATA TIDAK VALID'; cls = 'bad';
      reasons.push('Integritas data gagal, jadi estimasi tidak boleh dipercaya.');
    } else if (a.anomalies.length >= 2) {
      status = 'STOP — DATA MENCURIGAKAN'; cls = 'bad';
      reasons.push('Beberapa tes fairness/anomali aktif bersamaan.');
    } else {
      if (bt.n >= 150 && bt.top1 >= 0.14 && spread >= 0.025) {
        status = 'SINYAL STATISTIK LEMAH'; cls = 'warn'; confidence = 'Rendah';
        reasons.push(`Backtest top-1 ${(bt.top1 * 100).toFixed(1)}% pada ${bt.n} ronde, masih belum cukup untuk dianggap edge stabil.`);
      } else {
        reasons.push(bt.n ? `Backtest top-1 ${(bt.top1 * 100).toFixed(1)}% vs baseline acak 10%.` : 'Backtest belum cukup panjang.');
      }
      if (a.gaps.length) reasons.push(`Ada ${a.gaps.reduce((s, g) => s + g.missing, 0)} ronde hilang; confidence diturunkan.`);
      if (Math.abs(a.lag1) < 0.08) reasons.push(`Dependensi ronde-ke-ronde lemah (lag-1 ${a.lag1.toFixed(3)}).`);
      if (spread < 0.02) reasons.push('Probabilitas antar angka terlalu berdekatan; model tidak melihat pemisahan yang berarti.');
    }

    return { target, ranked, top, bt, bigMass, smallMass, spread, status, cls, confidence, reasons };
  }

  function ensureUI() {
    const main = document.querySelector('main');
    if (!main) return;

    if (!document.getElementById('wingoAuditStyle')) {
      const style = document.createElement('style');
      style.id = 'wingoAuditStyle';
      style.textContent = `
        #fairAuditCard .audit-head,#analysisCard .analysis-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
        .audit-badge{display:inline-flex;align-items:center;padding:7px 12px;border-radius:999px;font-weight:800;border:1px solid var(--line)}
        .audit-badge.ok{background:rgba(53,208,127,.14);color:#70e5a8;border-color:rgba(53,208,127,.5)}
        .audit-badge.watch{background:rgba(255,193,7,.12);color:#ffd66b;border-color:rgba(255,193,7,.45)}
        .audit-badge.warn{background:rgba(255,145,77,.14);color:#ffb27d;border-color:rgba(255,145,77,.5)}
        .audit-badge.bad{background:rgba(255,107,107,.14);color:#ff9494;border-color:rgba(255,107,107,.55)}
        .audit-grid,.analysis-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
        .audit-mini,.analysis-mini{border:1px solid var(--line);border-radius:11px;padding:11px}
        .audit-mini span,.analysis-mini span{display:block;color:var(--muted);font-size:12px}
        .audit-mini b,.analysis-mini b{display:block;margin-top:4px;font-size:16px}
        #fairAuditCard ul,#analysisCard ul{margin:12px 0 0 20px;padding:0}
        #fairAuditCard li,#analysisCard li{margin:6px 0}
        .audit-note,.analysis-note{color:var(--muted);font-size:13px;margin-top:12px}
        .forecast-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        .forecast-chip{border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:110px;background:#07111f}
        .forecast-chip strong{font-size:22px;display:block}.forecast-chip span{color:var(--muted);font-size:12px}
        .prob-list{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:12px}
        .prob-item{border:1px solid var(--line);border-radius:9px;padding:8px;text-align:center}.prob-item b{display:block}.prob-item span{font-size:11px;color:var(--muted)}
        @media(max-width:750px){.audit-grid,.analysis-grid{grid-template-columns:1fr 1fr}.prob-list{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:480px){.audit-grid,.analysis-grid{grid-template-columns:1fr}.prob-list{grid-template-columns:1fr 1fr}}
      `;
      document.head.appendChild(style);
    }

    if (!document.getElementById('analysisCard')) {
      const section = document.createElement('section');
      section.className = 'card';
      section.id = 'analysisCard';
      section.innerHTML = `
        <div class="analysis-head">
          <div><h2 style="margin:0">Analisis & Estimasi Statistik</h2><div class="sub">Model eksperimental berbasis history; bukan jaminan hasil.</div></div>
          <span id="analysisBadge" class="audit-badge watch">MENUNGGU DATA</span>
        </div>
        <div class="analysis-grid">
          <div class="analysis-mini"><span>Target periode</span><b id="predPeriod">-</b></div>
          <div class="analysis-mini"><span>Confidence</span><b id="predConfidence">-</b></div>
          <div class="analysis-mini"><span>Backtest top-1</span><b id="predBacktest">-</b></div>
          <div class="analysis-mini"><span>Top-3 coverage</span><b id="predTop3Bt">-</b></div>
        </div>
        <div style="margin-top:14px"><b>Estimasi kandidat tertinggi</b><div id="forecastTop" class="forecast-row"></div></div>
        <div style="margin-top:14px"><b>Distribusi estimasi 0–9</b><div id="forecastAll" class="prob-list"></div></div>
        <div class="analysis-grid">
          <div class="analysis-mini"><span>Total massa Small (0–4)</span><b id="predSmall">-</b></div>
          <div class="analysis-mini"><span>Total massa Big (5–9)</span><b id="predBig">-</b></div>
          <div class="analysis-mini"><span>Spread tertinggi→terendah</span><b id="predSpread">-</b></div>
          <div class="analysis-mini"><span>Baseline top-1 acak</span><b>10.0%</b></div>
        </div>
        <div id="analysisReasons"></div>
        <div class="analysis-note">Ini hanya estimasi statistik untuk audit/simulasi. Karena game menggunakan uang asli, panel tidak memberi instruksi taruhan. Jika backtest tidak mengalahkan baseline secara konsisten, status tetap SKIP.</div>
      `;
      const gameHistory = [...main.querySelectorAll('section.card')].find(s => s.querySelector('h2')?.textContent === 'Game History');
      if (gameHistory) main.insertBefore(section, gameHistory);
      else main.appendChild(section);
    }

    if (!document.getElementById('fairAuditCard')) {
      const section = document.createElement('section');
      section.className = 'card';
      section.id = 'fairAuditCard';
      section.innerHTML = `
        <div class="audit-head">
          <div><h2 style="margin:0">Fairness / Anomaly Auditor</h2><div class="sub">Audit statistik otomatis dari history lokal.</div></div>
          <span id="auditBadge" class="audit-badge watch">MENUNGGU DATA</span>
        </div>
        <div class="audit-grid">
          <div class="audit-mini"><span>Sampel diaudit</span><b id="auditN">0</b></div>
          <div class="audit-mini"><span>Integrity premium→number</span><b id="auditIntegrity">-</b></div>
          <div class="audit-mini"><span>χ² angka 0–9</span><b id="auditChi">-</b></div>
          <div class="audit-mini"><span>Lag-1 angka</span><b id="auditLag">-</b></div>
          <div class="audit-mini"><span>Big rate</span><b id="auditBig">-</b></div>
          <div class="audit-mini"><span>Runs Big/Small z</span><b id="auditRuns">-</b></div>
          <div class="audit-mini"><span>Premium collision</span><b id="auditPremCol">-</b></div>
          <div class="audit-mini"><span>Drift recent vs baseline</span><b id="auditDrift">-</b></div>
        </div>
        <div id="auditMessages"></div>
        <div class="audit-note">NORMAL berarti belum terdeteksi anomali pada tes ini, bukan bukti game adil. STOP berarti data/integritas audit bermasalah.</div>
      `;
      const analysis = document.getElementById('analysisCard');
      if (analysis?.nextSibling) main.insertBefore(section, analysis.nextSibling);
      else main.appendChild(section);
    }
  }

  function renderAudit(a) {
    const q = id => document.getElementById(id);
    q('auditBadge').className = `audit-badge ${a.cls}`;
    q('auditBadge').textContent = a.status;
    q('auditN').textContent = a.n;
    q('auditIntegrity').textContent = a.n ? `${a.n - a.mismatch}/${a.n} cocok` : '-';
    q('auditChi').textContent = a.n ? a.chi.toFixed(2) : '-';
    q('auditLag').textContent = a.n > 2 ? a.lag1.toFixed(3) : '-';
    q('auditBig').textContent = a.n ? `${(100 * a.bigCount / a.n).toFixed(1)}%` : '-';
    q('auditRuns').textContent = a.n > 2 ? a.bsRuns.z.toFixed(2) : '-';
    q('auditPremCol').textContent = a.n ? `${a.premiumCol.pairs} (exp ${a.premiumLambda.toFixed(1)})` : '-';
    q('auditDrift').textContent = a.n >= 300 ? a.driftChi.toFixed(2) : 'butuh ≥300';

    const items = [];
    a.critical.forEach(x => items.push(`<li><b style="color:#ff9494">KRITIS:</b> ${x}</li>`));
    a.anomalies.forEach(x => items.push(`<li><b style="color:#ffb27d">ANOMALI:</b> ${x}</li>`));
    a.warnings.forEach(x => items.push(`<li><b style="color:#ffd66b">CATATAN:</b> ${x}</li>`));
    if (!items.length && a.n >= 200) items.push('<li>Tidak ada anomali kuat yang terdeteksi pada tes aktif.</li>');
    q('auditMessages').innerHTML = `<ul>${items.join('')}</ul>`;
  }

  function renderForecast(f) {
    const q = id => document.getElementById(id);
    q('analysisBadge').className = `audit-badge ${f.cls}`;
    q('analysisBadge').textContent = f.status;
    q('predPeriod').textContent = f.target;
    q('predConfidence').textContent = f.confidence;
    q('predBacktest').textContent = f.bt.n ? `${(f.bt.top1 * 100).toFixed(1)}% / ${f.bt.n}` : '-';
    q('predTop3Bt').textContent = f.bt.n ? `${(f.bt.top3 * 100).toFixed(1)}%` : '-';
    q('predSmall').textContent = `${(f.smallMass * 100).toFixed(1)}%`;
    q('predBig').textContent = `${(f.bigMass * 100).toFixed(1)}%`;
    q('predSpread').textContent = `${(f.spread * 100).toFixed(2)} poin`;

    q('forecastTop').innerHTML = f.top.map((x, i) => `<div class="forecast-chip"><span>#${i + 1} kandidat statistik</span><strong>${x.d}</strong><span>${(x.p * 100).toFixed(1)}%</span></div>`).join('');
    q('forecastAll').innerHTML = f.ranked.map(x => `<div class="prob-item"><b>${x.d}</b><span>${(x.p * 100).toFixed(1)}%</span></div>`).join('');
    q('analysisReasons').innerHTML = `<ul>${f.reasons.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }

  function refresh() {
    ensureUI();
    const h = readHistory();
    const newest = h[0]?.issueNumber ?? h[0]?.period ?? '';
    const fp = `${h.length}|${newest}`;
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    const a = audit(h);
    renderForecast(forecast(a));
    renderAudit(a);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  setInterval(refresh, AUDIT_EVERY_MS);
})();