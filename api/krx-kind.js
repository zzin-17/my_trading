import {
  fetchNaverEtfEtnRows,
  fetchNaverPreferredStockRows,
  mergeStockAndFunds,
} from './mergeListedFunds.js';
import { enforceRateLimit } from './_rateLimit.js';

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json,text/plain,*/*',
};
const NAVER_MARKETS = [
  { category: 'KOSPI', board: '코스피' },
  { category: 'KOSDAQ', board: '코스닥' },
];

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
    let stockItems;
    let useNaverFallback = false;
    try {
      const r = await fetch(upstream, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!r.ok) throw new Error(`KRX listing error: ${r.status}`);

      const body = Buffer.from(await r.arrayBuffer());
      const html = new TextDecoder('euc-kr').decode(body);
      stockItems = parseKrxCorpList(html);
      if (stockItems.length === 0) throw new Error('Failed to parse KRX listing');
    } catch {
      // KRX는 해외 서버리스 실행 IP를 차단할 수 있으므로 네이버 전체 종목 목록으로 대체한다.
      stockItems = await fetchNaverStockRows();
      useNaverFallback = true;
    }

    const [fundItems, preferredItems] = await Promise.all([
      fetchNaverEtfEtnRows(),
      useNaverFallback ? Promise.resolve([]) : fetchNaverPreferredStockRows(stockItems),
    ]);
    const items = mergeStockAndFunds(stockItems, fundItems, preferredItems);
    if (items.length === 0) {
      return res.status(502).json({ message: 'Failed to fetch listing' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ items });
  } catch {
    return res.status(502).send('Failed to fetch KRX listing');
  }
}

async function fetchNaverStockRows() {
  const firstPages = await Promise.all(
    NAVER_MARKETS.map(async (market) => ({
      market,
      payload: await fetchNaverMarketValuePage(market.category, 1),
    })),
  );
  const pageRequests = firstPages.flatMap(({ market, payload }) => {
    const totalCount = Number(payload.totalCount) || 0;
    const pageSize = Number(payload.pageSize) || 100;
    const pageCount = Math.ceil(totalCount / pageSize);
    return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => ({
      market,
      page: index + 2,
    }));
  });
  const remainingPages = await Promise.all(
    pageRequests.map(async ({ market, page }) => ({
      market,
      payload: await fetchNaverMarketValuePage(market.category, page),
    })),
  );
  const items = [];
  const seen = new Set();
  for (const { market, payload } of [...firstPages, ...remainingPages]) {
    for (const row of Array.isArray(payload.stocks) ? payload.stocks : []) {
      const ticker = String(row?.itemCode ?? '').replace(/\s/g, '').toUpperCase();
      const name = String(row?.stockName ?? '').replace(/\s+/g, ' ').trim();
      if (!/^[A-Z0-9]{6}$/.test(ticker) || !name || seen.has(ticker)) continue;
      seen.add(ticker);
      items.push({ ticker, name, sector: '기타', board: market.board });
    }
  }
  return items;
}

async function fetchNaverMarketValuePage(category, page) {
  const url = new URL(`https://m.stock.naver.com/api/stocks/marketValue/${category}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', '100');
  const r = await fetch(url, { headers: NAVER_HEADERS });
  if (!r.ok) throw new Error(`Naver listing error: ${r.status}`);
  return r.json();
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

