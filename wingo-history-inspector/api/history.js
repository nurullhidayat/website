const crypto = require('node:crypto');

const API_URL = 'https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList';
const ORIGIN = 'https://55u3gpn.com';

function createRandomId() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 3) | 8;
    return v.toString(16);
  });
}

function signPayload(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    const value = payload[key];
    if (value === null || value === '') continue;
    sorted[key] = value;
  }
  return crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').toUpperCase();
}

function normalizeList(j) {
  const candidates = [
    j?.data?.list,
    j?.data?.data?.list,
    j?.data?.records,
    j?.data?.items,
    j?.list,
    j?.records,
    j?.items,
    j?.result?.list,
    j?.result?.records,
    j?.result?.items,
    Array.isArray(j?.data) ? j.data : null
  ];
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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize) || 20));
  const pageNo = Math.max(1, Number(req.query?.pageNo) || 1);
  const typeId = Number(req.query?.typeId) || 30;
  const language = req.query?.language === undefined ? 1 : Number(req.query.language);

  const body = { pageSize, pageNo, typeId, language, random: createRandomId() };
  body.signature = signPayload(body);
  body.timestamp = Math.floor(Date.now() / 1000);

  const headerVariants = [
    {
      name: 'problem-json-ar-origin',
      headers: {
        'content-type': 'application/problem+json; charset=utf-8',
        'accept': 'application/json, text/plain, */*',
        'ar-origin': ORIGIN,
        'origin': ORIGIN,
        'referer': ORIGIN + '/',
        'authorization': ''
      }
    },
    {
      name: 'json-ar-origin',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'accept': 'application/json, text/plain, */*',
        'ar-origin': ORIGIN,
        'origin': ORIGIN,
        'referer': ORIGIN + '/'
      }
    }
  ];

  const attempts = [];
  for (const variant of headerVariants) {
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: variant.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      const history = json ? normalizeList(json) : [];
      attempts.push({
        variant: variant.name,
        status: r.status,
        ok: r.ok,
        response: json ?? text.slice(0, 2000),
        rows: history.length
      });
      if (history.length) {
        return res.status(200).json({
          ok: true,
          status: r.status,
          message: 'History berhasil diambil langsung dari API.',
          source: API_URL,
          request: body,
          variant: variant.name,
          history,
          apiResponse: json,
          attempts
        });
      }
    } catch (e) {
      attempts.push({ variant: variant.name, error: e.message || String(e) });
    }
  }

  return res.status(200).json({
    ok: false,
    message: 'API merespons tetapi history belum terbaca.',
    source: API_URL,
    request: body,
    history: [],
    attempts,
    apiResponse: attempts.at(-1)?.response ?? null
  });
};
