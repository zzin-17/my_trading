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

/** 삼성전기우, 현대차2우B, 미래에셋증권우(전환) 같은 우선주 종목명 */
export function isPreferredStockName(name) {
  return PREFERRED_STOCK_NAME_RE.test(String(name ?? '').trim());
}

/**
 * 네이버 시가총액 JSON에서 우선주만 고른다.
 * PC 시세 HTML(`class="tltle"`)은 더 이상 종목 링크를 주지 않아 우선주가 빠졌다.
 */
export function preferredRowsFromMarketValueStocks(stocks, board) {
  const rows = [];
  const seen = new Set();
  for (const row of Array.isArray(stocks) ? stocks : []) {
    const ticker = String(row?.itemCode ?? '')
      .replace(/\s/g, '')
      .toUpperCase();
    const name = String(row?.stockName ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/^[A-Z0-9]{6}$/.test(ticker) || !name || !isPreferredStockName(name) || seen.has(ticker)) {
      continue;
    }
    seen.add(ticker);
    rows.push({ ticker, name, sector: '기타', board });
  }
  return rows;
}

async function fetchNaverMarketValuePage(category, page) {
  const url = new URL(`https://m.stock.naver.com/api/stocks/marketValue/${category}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', '100');
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(NAVER_FETCH_TIMEOUT_MS)
      : undefined;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal,
  });
  if (!r.ok) {
    throw new Error(`Naver market value error: ${r.status}`);
  }
  return r.json();
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
    { category: 'KOSPI', board: '코스피' },
    { category: 'KOSDAQ', board: '코스닥' },
  ];
  const out = [];
  for (const market of markets) {
    try {
      const first = await fetchNaverMarketValuePage(market.category, 1);
      out.push(...preferredRowsFromMarketValueStocks(first?.stocks, market.board));
      const total = Number(first?.totalCount) || 0;
      const pageSize = Number(first?.pageSize) || 100;
      const pageCount = Math.ceil(total / pageSize);
      const pages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 2);
      for (let i = 0; i < pages.length; i += 8) {
        const chunk = pages.slice(i, i + 8);
        const payloads = await Promise.all(
          chunk.map((page) =>
            fetchNaverMarketValuePage(market.category, page).catch(() => null),
          ),
        );
        for (const payload of payloads) {
          if (!payload) continue;
          out.push(
            ...preferredRowsFromMarketValueStocks(payload.stocks, market.board),
          );
        }
      }
    } catch {
      /* 한 시장 실패 시 다른 시장만 사용 */
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
    const prev = by.get(item.ticker);
    if (!prev) {
      by.set(item.ticker, item);
      continue;
    }
    if (!prev.board && item.board) prev.board = item.board;
  }
  return [...by.values()];
}
