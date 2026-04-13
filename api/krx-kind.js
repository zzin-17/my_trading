import { fetchNaverEtfEtnRows, mergeStockAndFunds } from './mergeListedFunds.js';
import { enforceRateLimit } from './_rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }
  if (
    !enforceRateLimit(req, res, {
      bucket: 'krx-kind',
      windowMs: 10 * 60 * 1000,
      max: 20,
    })
  ) {
    return;
  }

  const qs = new URLSearchParams({
    method: 'download',
    searchType: '13',
  });
  const upstream = `https://kind.krx.co.kr/corpgeneral/corpList.do?${qs.toString()}`;

  try {
    const r = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) {
      return res.status(502).send(`Upstream error: ${r.status}`);
    }

    const body = Buffer.from(await r.arrayBuffer());
    const html = new TextDecoder('euc-kr').decode(body);
    const stockItems = parseKrxCorpList(html);
    if (stockItems.length === 0) {
      return res.status(502).json({ message: 'Failed to parse KRX listing' });
    }
    const fundItems = await fetchNaverEtfEtnRows();
    const items = mergeStockAndFunds(stockItems, fundItems);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ items });
  } catch {
    return res.status(502).send('Failed to fetch KRX listing');
  }
}

/** KRX KIND 상장목록: 1열 회사명, 2열 시장, 3열 종목코드, 4열 업종 */
function parseKrxCorpList(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const items = [];
  for (const row of rows) {
    const tds = row.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 4) continue;
    const name = stripTags(tds[0]).replace(/\s+/g, ' ').trim();
    const marketRaw = stripTags(tds[1]).replace(/\s+/g, ' ').trim();
    const ticker = stripTags(tds[2]).replace(/\s/g, '').toUpperCase();
    const sectorRaw = stripTags(tds[3]).replace(/\s+/g, ' ').trim();
    const sector = sectorRaw || '기타';
    const board = normalizeKrxBoard(marketRaw);
    if (!name || !/^[A-Z0-9]{6}$/.test(ticker)) continue;
    items.push({ ticker, name, sector, board });
  }
  return items;
}

/** 표시용: 코스피 / 코스닥 / 코넥스 등 */
function normalizeKrxBoard(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/코스닥|KOSDAQ/i.test(s)) return '코스닥';
  // KIND 열이 '유가증권시장'·'유가' 등으로 올 때 (짧게 잘리면 '유가'만 남기도 함)
  if (/^유가|유가증권|코스피|KOSPI/i.test(s)) return '코스피';
  if (/코넥스|KONEX/i.test(s)) return '코넥스';
  return s;
}

function stripTags(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

