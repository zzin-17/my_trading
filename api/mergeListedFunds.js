/**
 * 네이버 금융 ETF/ETN API + 우선주 보조목록 + KRX 상장법인 목록 병합
 */

const decoder = new TextDecoder('euc-kr');

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
};
const NAVER_FETCH_TIMEOUT_MS = 8000;

const PREFERRED_STOCK_NAME_RE =
  /(?:\d+우(?:B|C)?(?:\(전환\))?|우(?:B|C)?(?:\(전환\))?|우선주|\(전환\))$/;

function stripPreferredSuffix(name) {
  return name.replace(PREFERRED_STOCK_NAME_RE, '').trim();
}

function extractLastPage(html) {
  const matches = [...html.matchAll(/page=(\d+)/g)];
  let max = 1;
  for (const match of matches) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

function parseNaverPreferredRows(html, board) {
  const rows = [];
  const seen = new Set();
  const re = /<a href="\/item\/main\.naver\?code=([A-Z0-9]{6})" class="tltle">([^<]+)<\/a>/g;
  for (const match of html.matchAll(re)) {
    const ticker = String(match[1] ?? '').trim().toUpperCase();
    const name = String(match[2] ?? '').replace(/\s+/g, ' ').trim();
    if (!ticker || !name || !PREFERRED_STOCK_NAME_RE.test(name) || seen.has(ticker)) {
      continue;
    }
    seen.add(ticker);
    rows.push({ ticker, name, sector: '기타', board });
  }
  return rows;
}

async function fetchNaverMarketPage(sosok, page) {
  const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`;
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(NAVER_FETCH_TIMEOUT_MS)
      : undefined;
  const r = await fetch(url, { headers: NAVER_HEADERS, signal });
  if (!r.ok) {
    throw new Error(`Naver market page error: ${r.status}`);
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  return decoder.decode(buf);
}

function enrichPreferredRows(preferredRows, stockItems) {
  const byName = new Map(stockItems.map((x) => [x.name, x]));
  return preferredRows.map((item) => {
    const base = stripPreferredSuffix(item.name);
    const common = byName.get(base);
    return {
      ticker: item.ticker,
      name: item.name,
      sector: common?.sector || item.sector,
      board: common?.board || item.board,
    };
  });
}

/**
 * @param {{ ticker: string, name: string, sector: string, board: string }[]} stockItems
 * @returns {Promise<{ ticker: string, name: string, sector: string, board: string }[]>}
 */
export async function fetchNaverPreferredStockRows(stockItems) {
  const markets = [
    { sosok: 0, board: '코스피' },
    { sosok: 1, board: '코스닥' },
  ];
  const out = [];
  for (const market of markets) {
    try {
      const firstHtml = await fetchNaverMarketPage(market.sosok, 1);
      out.push(...parseNaverPreferredRows(firstHtml, market.board));
      const lastPage = extractLastPage(firstHtml);
      const pages = Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) => i + 2);
      for (let i = 0; i < pages.length; i += 8) {
        const chunk = pages.slice(i, i + 8);
        const htmlList = await Promise.all(
          chunk.map((page) => fetchNaverMarketPage(market.sosok, page).catch(() => '')),
        );
        for (const html of htmlList) {
          if (!html) continue;
          out.push(...parseNaverPreferredRows(html, market.board));
        }
      }
    } catch {
      /* 한 소스 실패 시 기존 KRX 목록만 사용 */
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of out) {
    if (seen.has(item.ticker)) continue;
    seen.add(item.ticker);
    deduped.push(item);
  }
  return enrichPreferredRows(deduped, stockItems);
}

/**
 * @returns {Promise<{ ticker: string, name: string, sector: string, board: string }[]>}
 */
export async function fetchNaverEtfEtnRows() {
  const endpoints = [
    {
      url: 'https://finance.naver.com/api/sise/etfItemList.nhn',
      listKey: 'etfItemList',
      kind: 'ETF',
    },
    {
      url: 'https://finance.naver.com/api/sise/etnItemList.nhn',
      listKey: 'etnItemList',
      kind: 'ETN',
    },
  ];
  const out = [];
  for (const { url, listKey, kind } of endpoints) {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(NAVER_FETCH_TIMEOUT_MS)
          : undefined;
      const r = await fetch(url, { headers: NAVER_HEADERS, signal });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const text = decoder.decode(buf);
      const json = JSON.parse(text);
      const list = json?.result?.[listKey];
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        let digits = String(row.itemcode ?? '').replace(/\D/g, '');
        if (!digits) continue;
        if (digits.length > 6) digits = digits.slice(-6);
        const ticker = digits.padStart(6, '0').toUpperCase();
        if (!/^[0-9]{6}$/.test(ticker)) continue;
        const name = String(row.itemname ?? '').replace(/\s+/g, ' ').trim();
        if (!name) continue;
        out.push({
          ticker: ticker.toUpperCase(),
          name,
          sector: kind === 'ETN' ? 'ETN' : 'ETF',
          board: kind,
        });
      }
    } catch {
      /* 한 소스 실패 시 다른 소스만 사용 */
    }
  }
  return out;
}

/**
 * @param {{ ticker: string, name: string, sector: string, board: string }[]} stockItems
 * @param {{ ticker: string, name: string, sector: string, board: string }[]} fundItems
 * @param {{ ticker: string, name: string, sector: string, board: string }[]} preferredItems
 */
export function mergeStockAndFunds(stockItems, fundItems, preferredItems = []) {
  const by = new Map(stockItems.map((x) => [x.ticker, x]));
  for (const f of fundItems) {
    if (!by.has(f.ticker)) by.set(f.ticker, f);
  }
  for (const item of preferredItems) {
    if (!by.has(item.ticker)) by.set(item.ticker, item);
  }
  return [...by.values()];
}
