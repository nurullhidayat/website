const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const TARGET = 'https://55u3gpn.com/#/home/AllLotteryGames/WinGo?id=1';

function normalizeList(j) {
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
  })).filter(x => x.issueNumber != null || x.number != null);
}

function looksLikeHistory(list) {
  if (!Array.isArray(list) || list.length < 2) return false;
  const good = list.filter(x => x && (x.issueNumber != null || x.period != null) && x.number != null);
  return good.length >= Math.min(2, list.length);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const attempts = [];
  const network = [];
  let browser;
  let history = [];
  let source = null;
  let detectedHosts = [];
  let detectedEndpoints = [];
  const notes = [];

  try {
    chromium.setGraphicsMode = false;
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
      defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 }
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', request => {
      const rt = request.resourceType();
      if (['image', 'font', 'media'].includes(rt)) request.abort().catch(() => {});
      else request.continue().catch(() => {});
    });

    page.on('response', async response => {
      const url = response.url();
      const reqType = response.request().resourceType();
      if (!['xhr', 'fetch'].includes(reqType) && !/api|webapi|wingo|lottery|emerd|gameissue/i.test(url)) return;
      try {
        const status = response.status();
        const headers = response.headers();
        const ct = (headers['content-type'] || '').toLowerCase();
        if (!ct.includes('json') && !/api|webapi/i.test(url)) return;
        const text = await response.text();
        let json = null;
        try { json = JSON.parse(text); } catch {}
        const rows = json ? normalizeList(json) : [];
        network.push({ url, status, type: reqType, rows: rows.length, preview: text.slice(0, 220) });

        try {
          const u = new URL(url);
          detectedHosts.push(u.origin);
          const m = u.pathname.match(/\/api\/webapi\/([^/?]+)/i);
          if (m) detectedEndpoints.push(m[1]);
        } catch {}

        if (!history.length && looksLikeHistory(rows)) {
          history = rows;
          source = url;
        }
      } catch (e) {
        network.push({ url, error: e.message || String(e) });
      }
    });

    const nav = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 25000 });
    attempts.push({ kind: 'browser', url: TARGET, status: nav ? nav.status() : null, ok: !!nav });

    await new Promise(resolve => setTimeout(resolve, 10000));

    if (!history.length) {
      const labels = ['Game History', 'History', 'My History'];
      for (const label of labels) {
        try {
          const clicked = await page.evaluate((txt) => {
            const els = [...document.querySelectorAll('button,div,span,a')];
            const el = els.find(x => (x.textContent || '').trim().toLowerCase().includes(txt.toLowerCase()));
            if (!el) return false;
            el.click();
            return true;
          }, label);
          if (clicked) {
            attempts.push({ kind: 'click', label, ok: true });
            await new Promise(resolve => setTimeout(resolve, 2500));
            if (history.length) break;
          }
        } catch (e) {
          attempts.push({ kind: 'click', label, ok: false, error: e.message });
        }
      }
    }

    if (!history.length) {
      try {
        const domRows = await page.evaluate(() => {
          const out = [];
          const els = [...document.querySelectorAll('tr, [class*=history] [class*=row], [class*=record]')];
          for (const el of els.slice(0, 100)) {
            const txt = (el.innerText || '').trim().replace(/\s+/g, ' ');
            if (/\d{6,}/.test(txt) && /\b[0-9]\b/.test(txt)) out.push(txt);
          }
          return out.slice(0, 30);
        });
        attempts.push({ kind: 'dom', rows: domRows.length, preview: domRows.slice(0, 8) });
      } catch (e) {
        attempts.push({ kind: 'dom', error: e.message });
      }
    }

    detectedHosts = [...new Set(detectedHosts)];
    detectedEndpoints = [...new Set(detectedEndpoints)];
    if (!history.length) notes.push('Browser berhasil berjalan tetapi history belum teridentifikasi. Gunakan network diagnostics untuk melihat host/endpoint yang dipanggil halaman.');
  } catch (e) {
    notes.push('Headless browser gagal dijalankan: ' + (e.message || String(e)));
    attempts.push({ kind: 'browser-error', error: e.stack || e.message || String(e) });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }

  res.status(200).json({
    ok: history.length > 0,
    message: history.length ? 'History berhasil ditemukan melalui browser/network.' : 'History belum ditemukan secara otomatis.',
    source,
    history,
    detectedHosts,
    detectedEndpoints,
    attempts,
    network: network.slice(-100),
    notes
  });
};
