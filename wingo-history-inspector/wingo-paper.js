(() => {
  'use strict';

  const HISTORY_KEY = 'wingo_live_history_v1';
  const PAPER_KEY = 'wingo_paper_predictions_v1';
  const REFRESH_MS = 5000;
  const MODEL_NAMES = ['Global', 'Recent20', 'Recent50', 'Recent100', 'Markov1', 'Markov2'];
  let lastFingerprint = '';

  const safeNum = v => Number.isFinite(Number(v));

  function readHistory() {
    try {
      const x = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(x) ? x : [];
    } catch { return []; }
  }

  function rowsFromHistory(history) {
    return history
      .filter(x => safeNum(x.number) && (x.issueNumber != null || x.period != null))
      .map(x => ({ period: String(x.issueNumber ?? x.period), number: Number(x.number) }))
      .filter(x => Number.isInteger(x.number) && x.number >= 0 && x.number <= 9)
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  function readPaper() {
    try {
      const x = JSON.parse(localStorage.getItem(PAPER_KEY) || '[]');
      return Array.isArray(x) ? x : [];
    } catch { return []; }
  }

  function savePaper(items) {
    localStorage.setItem(PAPER_KEY, JSON.stringify(items.slice(-2000)));
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
    } catch { return '-'; }
  }

  function normalize(v) {
    const s = v.reduce((a, b) => a + b, 0);
    return s > 0 ? v.map(x => x / s) : Array(10).fill(0.1);
  }

  function freqDist(rows, windowSize) {
    const s = windowSize ? rows.slice(-Math.min(windowSize, rows.length)) : rows;
    const f = Array(10).fill(1);
    for (const r of s) f[r.number]++;
    return normalize(f);
  }

  function markov1Dist(rows, lookback = 800) {
    if (rows.length < 30) return Array(10).fill(0.1);
    const last = rows[rows.length - 1].number;
    const f = Array(10).fill(1);
    const start = Math.max(1, rows.length - lookback);
    for (let i = start; i < rows.length; i++) {
      if (rows[i - 1].number === last) f[rows[i].number]++;
    }
    return normalize(f);
  }

  function markov2Dist(rows, lookback = 1200) {
    if (rows.length < 80) return Array(10).fill(0.1);
    const a = rows[rows.length - 2].number;
    const b = rows[rows.length - 1].number;
    const f = Array(10).fill(1);
    const start = Math.max(2, rows.length - lookback);
    let matches = 0;
    for (let i = start; i < rows.length; i++) {
      if (rows[i - 2].number === a && rows[i - 1].number === b) {
        f[rows[i].number]++;
        matches++;
      }
    }
    return matches >= 5 ? normalize(f) : markov1Dist(rows, lookback);
  }

  function tvDistance(a, b) {
    let s = 0;
    for (let i = 0; i < 10; i++) s += Math.abs(a[i] - b[i]);
    return s / 2;
  }

  function regime(rows) {
    if (rows.length < 300) return { code: 'UNKNOWN', label: 'Belum cukup data', tv: 0, bigDiff: 0 };
    const recent = rows.slice(-100);
    const prior = rows.slice(Math.max(0, rows.length - 500), rows.length - 100);
    const rp = freqDist(recent, 0);
    const bp = freqDist(prior, 0);
    const tv = tvDistance(rp, bp);
    const recentBig = recent.filter(x => x.number >= 5).length / recent.length;
    const priorBig = prior.filter(x => x.number >= 5).length / prior.length;
    const bigDiff = Math.abs(recentBig - priorBig);
    if (tv >= 0.18 || bigDiff >= 0.12) return { code: 'SHIFT', label: 'Perubahan terdeteksi', tv, bigDiff };
    if (tv >= 0.12 || bigDiff >= 0.08) return { code: 'WATCH', label: 'Perlu dipantau', tv, bigDiff };
    return { code: 'STABLE', label: 'Relatif stabil', tv, bigDiff };
  }

  function rank(probs) {
    return probs.map((p, d) => ({ d, p })).sort((a, b) => b.p - a.p || a.d - b.d);
  }

  function buildModels(rows) {
    return [
      { name: 'Global', p: freqDist(rows, 0) },
      { name: 'Recent20', p: freqDist(rows, 20) },
      { name: 'Recent50', p: freqDist(rows, 50) },
      { name: 'Recent100', p: freqDist(rows, 100) },
      { name: 'Markov1', p: markov1Dist(rows) },
      { name: 'Markov2', p: markov2Dist(rows) }
    ];
  }

  function baseWeights(reg) {
    if (reg.code === 'SHIFT') return [0.05, 0.30, 0.25, 0.15, 0.20, 0.05];
    if (reg.code === 'WATCH') return [0.10, 0.25, 0.25, 0.15, 0.20, 0.05];
    if (reg.code === 'STABLE') return [0.15, 0.20, 0.20, 0.15, 0.20, 0.10];
    return [0.20, 0.20, 0.25, 0.15, 0.15, 0.05];
  }

  function brier(probs, actual) {
    if (!Array.isArray(probs) || probs.length !== 10) return null;
    let s = 0;
    for (let d = 0; d < 10; d++) {
      const y = d === actual ? 1 : 0;
      s += (Number(probs[d]) - y) ** 2;
    }
    return s;
  }

  function modelPerformance(paper, lookback = 200) {
    const settled = paper.filter(x => x.status === 'settled' && x.modelProbs && x.modelTops).slice(-lookback);
    const out = {};
    for (const name of MODEL_NAMES) {
      let n = 0, hits = 0, sumBrier = 0, brierN = 0;
      for (const p of settled) {
        const probs = p.modelProbs?.[name];
        const top = p.modelTops?.[name];
        if (!Array.isArray(probs) || probs.length !== 10 || p.actual == null || top == null) continue;
        n++;
        if (Number(top) === Number(p.actual)) hits++;
        const br = brier(probs, Number(p.actual));
        if (br != null && Number.isFinite(br)) { sumBrier += br; brierN++; }
      }
      const rawAcc = n ? hits / n : 0.10;
      const shrunkAcc = (hits + 2) / (n + 20); // prior mean 10%
      const rawBrier = brierN ? sumBrier / brierN : 0.90;
      const shrunkBrier = (rawBrier * brierN + 0.90 * 20) / (brierN + 20);
      out[name] = { n, hits, rawAcc, shrunkAcc, rawBrier, shrunkBrier };
    }
    return { settled: settled.length, models: out };
  }

  function adaptiveWeights(base, perf) {
    const sampleN = perf.settled;
    const strength = sampleN < 20 ? 0 : Math.min(0.55, ((sampleN - 20) / 180) * 0.55);
    const learned = [];

    for (let i = 0; i < MODEL_NAMES.length; i++) {
      const name = MODEL_NAMES[i];
      const p = perf.models[name];
      const accEdge = p.shrunkAcc - 0.10;
      const brierEdge = 0.90 - p.shrunkBrier;
      let multiplier = Math.exp(7 * accEdge + 1.8 * brierEdge);
      multiplier = Math.max(0.60, Math.min(1.65, multiplier));
      learned.push(base[i] * multiplier);
    }

    const learnedNorm = normalize(learned);
    const blended = base.map((x, i) => (1 - strength) * x + strength * learnedNorm[i]);
    const floor = 0.04;
    const capped = blended.map(x => Math.max(floor, Math.min(0.45, x)));
    const final = normalize(capped);
    return { weights: final, strength };
  }

  function ensemble(rows, paper) {
    const reg = regime(rows);
    const models = buildModels(rows);
    const base = baseWeights(reg);
    const perf = modelPerformance(paper);
    const adapted = adaptiveWeights(base, perf);
    const w = adapted.weights;

    const out = Array(10).fill(0);
    for (let m = 0; m < models.length; m++) {
      for (let d = 0; d < 10; d++) out[d] += w[m] * models[m].p[d];
    }

    const probs = normalize(out);
    const ranked = rank(probs);
    const top1 = ranked[0].d;
    const modelTops = {};
    const modelProbs = {};
    const weightMap = {};
    let agreement = 0;

    for (let m = 0; m < models.length; m++) {
      const name = models[m].name;
      const mt = rank(models[m].p)[0].d;
      modelTops[name] = mt;
      modelProbs[name] = models[m].p.map(x => Number(x.toFixed(6)));
      weightMap[name] = Number(w[m].toFixed(6));
      if (mt === top1) agreement++;
    }

    const margin = ranked[0].p - ranked[1].p;
    const spread = ranked[0].p - ranked[9].p;
    let confidence = 'Sangat rendah';
    if (agreement >= 4 && margin >= 0.010 && spread >= 0.025) confidence = 'Rendah';
    if (agreement >= 5 && margin >= 0.018 && spread >= 0.040 && perf.settled >= 50) confidence = 'Sedang (paper only)';

    return {
      probs, ranked, models, weights: w, weightMap, modelTops, modelProbs,
      agreement, margin, spread, confidence, regime: reg,
      learningRounds: perf.settled, adaptStrength: adapted.strength, performance: perf
    };
  }

  function settlePredictions(paper, rows) {
    const actual = new Map(rows.map(r => [r.period, r.number]));
    let changed = false;
    for (const p of paper) {
      if (p.status !== 'pending' || !actual.has(p.period)) continue;
      const n = actual.get(p.period);
      p.actual = n;
      p.hit1 = Number(p.top1) === n;
      p.hit3 = Array.isArray(p.top3) && p.top3.includes(n);
      p.status = 'settled';
      p.settledAt = new Date().toISOString();

      if (p.modelTops && p.modelProbs) {
        p.modelHits = {};
        p.modelBrier = {};
        for (const name of MODEL_NAMES) {
          if (p.modelTops[name] != null) p.modelHits[name] = Number(p.modelTops[name]) === n;
          const br = brier(p.modelProbs[name], n);
          if (br != null) p.modelBrier[name] = Number(br.toFixed(6));
        }
      }
      changed = true;
    }
    return changed;
  }

  function ensureNextPrediction(paper, rows) {
    if (rows.length < 80) return false;
    const latest = rows[rows.length - 1];
    const target = nextPeriod(latest.period);
    if (!target || target === '-' || paper.some(p => p.period === target)) return false;

    const e = ensemble(rows, paper);
    const top3 = e.ranked.slice(0, 3).map(x => x.d);
    paper.push({
      period: target,
      createdAfterPeriod: latest.period,
      createdAt: new Date().toISOString(),
      status: 'pending',
      mode: 'adaptive-online-v2',
      top1: e.ranked[0].d,
      top3,
      probs: e.probs.map(x => Number(x.toFixed(6))),
      agreement: e.agreement,
      confidence: e.confidence,
      regime: e.regime.code,
      regimeTv: Number(e.regime.tv.toFixed(6)),
      spread: Number(e.spread.toFixed(6)),
      learningRounds: e.learningRounds,
      adaptStrength: Number(e.adaptStrength.toFixed(6)),
      weights: e.weightMap,
      modelTops: e.modelTops,
      modelProbs: e.modelProbs
    });
    return true;
  }

  function rate(items, key) {
    if (!items.length) return null;
    return items.filter(x => x[key]).length / items.length;
  }

  function rollingStats(settled, n) {
    const s = settled.slice(-n);
    return { n: s.length, top1: rate(s, 'hit1'), top3: rate(s, 'hit3') };
  }

  function stats(paper) {
    const settled = paper.filter(x => x.status === 'settled');
    return {
      total: settled.length,
      all: rollingStats(settled, settled.length || 1),
      r50: rollingStats(settled, 50),
      r100: rollingStats(settled, 100),
      r300: rollingStats(settled, 300),
      pending: paper.filter(x => x.status === 'pending').length
    };
  }

  function pct(v) { return v == null ? '-' : `${(v * 100).toFixed(1)}%`; }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function ensureUI() {
    if (document.getElementById('paperPredictionCard')) return;
    const main = document.querySelector('main');
    if (!main) return;

    if (!document.getElementById('wingoPaperStyle')) {
      const style = document.createElement('style');
      style.id = 'wingoPaperStyle';
      style.textContent = `
        #paperPredictionCard .paper-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
        #paperPredictionCard .paper-badge{display:inline-flex;align-items:center;padding:7px 12px;border-radius:999px;font-weight:800;border:1px solid var(--line);background:rgba(90,169,255,.12);color:#bdd7ff}
        #paperPredictionCard .paper-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
        #paperPredictionCard .paper-mini{border:1px solid var(--line);border-radius:11px;padding:11px}
        #paperPredictionCard .paper-mini span{display:block;color:var(--muted);font-size:12px}
        #paperPredictionCard .paper-mini b{display:block;margin-top:4px;font-size:16px}
        #paperPredictionCard .paper-top{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
        #paperPredictionCard .paper-chip{border:1px solid var(--line);background:#07111f;border-radius:12px;padding:10px 14px;min-width:120px}
        #paperPredictionCard .paper-chip strong{display:block;font-size:22px}
        #paperPredictionCard .paper-chip span{color:var(--muted);font-size:12px}
        #paperPredictionCard .paper-note{margin-top:12px;color:var(--muted);font-size:13px}
        #paperPredictionCard .weight-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
        #paperPredictionCard .weight-item{border:1px solid var(--line);border-radius:9px;padding:9px;background:#07111f}
        #paperPredictionCard .weight-item span{display:block;color:var(--muted);font-size:11px}
        #paperPredictionCard .weight-item b{display:block;margin-top:3px}
        #paperPredictionCard table{min-width:820px}
        .hit{color:#70e5a8;font-weight:800}.miss{color:#ff9494;font-weight:800}.pending{color:#ffd66b;font-weight:800}
        @media(max-width:750px){#paperPredictionCard .paper-grid{grid-template-columns:1fr 1fr}#paperPredictionCard .weight-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:480px){#paperPredictionCard .paper-grid,#paperPredictionCard .weight-grid{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }

    const section = document.createElement('section');
    section.className = 'card';
    section.id = 'paperPredictionCard';
    section.innerHTML = `
      <div class="paper-head">
        <div>
          <h2 style="margin:0">Adaptive AI Paper Prediction Lab</h2>
          <div class="sub">Online ensemble: setiap hasil baru dipakai untuk menilai model dan menyesuaikan bobot ronde berikutnya.</div>
        </div>
        <span class="paper-badge">SELALU PREDIKSI • PAPER ONLY</span>
      </div>

      <div class="paper-grid">
        <div class="paper-mini"><span>Target periode</span><b id="paperTarget">-</b></div>
        <div class="paper-mini"><span>Kandidat top-1</span><b id="paperTop1">-</b></div>
        <div class="paper-mini"><span>Agreement model</span><b id="paperAgreement">-</b></div>
        <div class="paper-mini"><span>Regime</span><b id="paperRegime">-</b></div>
        <div class="paper-mini"><span>Mode AI</span><b id="paperMode">Adaptive v2</b></div>
        <div class="paper-mini"><span>Ronde belajar model</span><b id="paperLearning">0</b></div>
        <div class="paper-mini"><span>Kekuatan adaptasi</span><b id="paperAdapt">0%</b></div>
        <div class="paper-mini"><span>Status paper</span><b id="paperStatus">Aktif</b></div>
      </div>

      <div style="margin-top:14px"><b>Top-3 paper kandidat</b><div id="paperTop3" class="paper-top"></div></div>

      <div style="margin-top:14px"><b>Bobot AI saat ini</b><div id="paperWeights" class="weight-grid"></div></div>

      <div class="paper-grid">
        <div class="paper-mini"><span>Paper settled</span><b id="paperSettled">0</b></div>
        <div class="paper-mini"><span>Top-1 rolling 50</span><b id="paper50">-</b></div>
        <div class="paper-mini"><span>Top-1 rolling 100</span><b id="paper100">-</b></div>
        <div class="paper-mini"><span>Top-1 rolling 300</span><b id="paper300">-</b></div>
        <div class="paper-mini"><span>Top-3 rolling 50</span><b id="paperTop350">-</b></div>
        <div class="paper-mini"><span>Top-3 rolling 100</span><b id="paperTop3100">-</b></div>
        <div class="paper-mini"><span>Top-3 rolling 300</span><b id="paperTop3300">-</b></div>
        <div class="paper-mini"><span>Baseline random top-1</span><b>10.0%</b></div>
      </div>

      <div class="paper-note" id="paperSummary">Menunggu cukup data untuk membuat paper prediction.</div>

      <div class="tablewrap" style="margin-top:14px">
        <table>
          <thead><tr><th>Period</th><th>Pred Top-1</th><th>Top-3</th><th>Actual</th><th>Hasil</th><th>Agreement</th><th>Learning</th><th>Regime</th></tr></thead>
          <tbody id="paperRows"><tr><td colspan="8" class="sub">Belum ada paper prediction.</td></tr></tbody>
        </table>
      </div>
      <div class="paper-note">AI paper ini sengaja membuat prediksi setiap ronde agar proses belajar tidak terlalu banyak SKIP. Ini tetap eksperimen statistik, bukan jaminan dan bukan instruksi taruhan uang asli.</div>
    `;

    const analysis = document.getElementById('analysisCard');
    if (analysis) main.insertBefore(section, analysis);
    else {
      const gameHistory = [...main.querySelectorAll('section.card')].find(s => s.querySelector('h2')?.textContent === 'Game History');
      if (gameHistory) main.insertBefore(section, gameHistory);
      else main.appendChild(section);
    }
  }

  function render(rows, paper) {
    ensureUI();
    const q = id => document.getElementById(id);
    if (!q('paperTarget')) return;

    const latest = rows[rows.length - 1];
    const target = nextPeriod(latest?.period);
    const current = paper.find(p => p.status === 'pending' && p.period === target);
    const st = stats(paper);
    const liveEnsemble = rows.length >= 80 ? ensemble(rows, paper) : null;

    q('paperTarget').textContent = current?.period || '-';
    q('paperTop1').textContent = current ? `${current.top1} • ${current.confidence}` : '-';
    q('paperAgreement').textContent = current ? `${current.agreement}/6` : '-';

    const reg = rows.length ? regime(rows) : { label: '-', tv: 0 };
    q('paperRegime').textContent = current ? `${reg.label} • TV ${reg.tv.toFixed(3)}` : reg.label;
    q('paperLearning').textContent = liveEnsemble ? liveEnsemble.learningRounds : 0;
    q('paperAdapt').textContent = liveEnsemble ? pct(liveEnsemble.adaptStrength) : '0%';
    q('paperStatus').textContent = rows.length >= 80 ? 'Prediksi setiap ronde' : 'Butuh ≥80 history';

    q('paperSettled').textContent = st.total;
    q('paper50').textContent = st.r50.n ? `${pct(st.r50.top1)} / ${st.r50.n}` : '-';
    q('paper100').textContent = st.r100.n ? `${pct(st.r100.top1)} / ${st.r100.n}` : '-';
    q('paper300').textContent = st.r300.n ? `${pct(st.r300.top1)} / ${st.r300.n}` : '-';
    q('paperTop350').textContent = st.r50.n ? pct(st.r50.top3) : '-';
    q('paperTop3100').textContent = st.r100.n ? pct(st.r100.top3) : '-';
    q('paperTop3300').textContent = st.r300.n ? pct(st.r300.top3) : '-';

    q('paperTop3').innerHTML = current ? current.top3.map((d, i) => {
      const p = Array.isArray(current.probs) ? current.probs[d] : null;
      return `<div class="paper-chip"><span>#${i + 1}</span><strong>${d}</strong><span>${p == null ? '-' : pct(p)}</span></div>`;
    }).join('') : '<span class="sub">Belum ada prediksi aktif.</span>';

    const weights = current?.weights || liveEnsemble?.weightMap || {};
    const perf = liveEnsemble?.performance?.models || {};
    q('paperWeights').innerHTML = MODEL_NAMES.map(name => {
      const w = weights[name];
      const p = perf[name];
      const acc = p?.n ? `${pct(p.rawAcc)} / ${p.n}` : 'belum cukup';
      return `<div class="weight-item"><span>${esc(name)} • akurasi ${acc}</span><b>${w == null ? '-' : pct(w)}</b></div>`;
    }).join('');

    let summary = 'AI membuat paper prediction setiap ronde. Bobot masih dekat prior sampai cukup banyak hasil adaptif terkumpul.';
    if (liveEnsemble && liveEnsemble.learningRounds >= 20) {
      summary = `Adaptive learning aktif dari ${liveEnsemble.learningRounds} ronde yang punya jejak tiap model. Bobot digeser berdasarkan akurasi dan Brier score, tetapi dibatasi agar satu model tidak mendominasi karena kebetulan.`;
    }
    if (st.r100.n >= 100) {
      const delta = st.r100.top1 - 0.10;
      if (delta >= 0.04) summary += ` Rolling-100 top-1 ${pct(st.r100.top1)}, ${pct(delta)} poin di atas baseline.`;
      else if (delta >= 0.015) summary += ` Rolling-100 sedikit di atas baseline (${pct(st.r100.top1)}), belum cukup kuat untuk disebut edge stabil.`;
      else summary += ` Rolling-100 belum mengalahkan baseline secara bermakna (${pct(st.r100.top1)}).`;
    }
    if (reg.code === 'SHIFT') summary += ' Regime terbaru berubah; AI otomatis lebih berat ke window pendek dan Markov1.';
    q('paperSummary').textContent = summary;

    const recent = paper.slice(-20).reverse();
    q('paperRows').innerHTML = recent.length ? recent.map(p => {
      const result = p.status === 'pending' ? '<span class="pending">PENDING</span>' : p.hit1 ? '<span class="hit">TOP-1 HIT</span>' : p.hit3 ? '<span class="hit">TOP-3 HIT</span>' : '<span class="miss">MISS</span>';
      return `<tr><td><code>${esc(p.period)}</code></td><td>${esc(p.top1)}</td><td>${esc((p.top3 || []).join(', '))}</td><td>${p.actual == null ? '-' : esc(p.actual)}</td><td>${result}</td><td>${esc(p.agreement ?? '-')}/6</td><td>${esc(p.learningRounds ?? 0)}</td><td>${esc(p.regime || '-')}</td></tr>`;
    }).join('') : '<tr><td colspan="8" class="sub">Belum ada paper prediction.</td></tr>';
  }

  function refresh() {
    ensureUI();
    const rows = rowsFromHistory(readHistory());
    const newest = rows[rows.length - 1]?.period || '';
    const fp = `${rows.length}|${newest}`;
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;

    const paper = readPaper();
    const settledChanged = settlePredictions(paper, rows);
    const created = ensureNextPrediction(paper, rows);
    if (settledChanged || created) savePaper(paper);
    render(rows, paper);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  setInterval(refresh, REFRESH_MS);
})();