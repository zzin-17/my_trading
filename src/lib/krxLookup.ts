import type { Trade } from '../types/trade';

export interface KrxLookupResult {
  ticker: string;
  name: string;
  /** KRX KIND 표준산업분류(업종) 문구 */
  sector: string;
}

export interface KrxListedStock {
  ticker: string;
  name: string;
  sector: string;
  /** KRX KIND 시장 열 기준: 코스피 / 코스닥 / 코넥스 등 */
  board?: string;
}

let krxListCache: KrxListedStock[] | null = null;

export function normalizeKrTicker(input: string): string {
  const code = input.trim().replace(/\s/g, '').toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : '';
}

/** 서버·캐시 값이 '유가' 등으로 올 때 코스피로 통일 (api/krx-kind.js와 동일 규칙) */
function normalizeKrxBoardLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/코스닥|KOSDAQ/i.test(s)) return '코스닥';
  if (/^유가|유가증권|코스피|KOSPI/i.test(s)) return '코스피';
  if (/코넥스|KONEX/i.test(s)) return '코넥스';
  return s;
}

/**
 * KRX 상장사 목록을 로드해 종목코드→종목명·업종을 반환한다.
 * 개발환경에서는 Vite 프록시(`/api/krx-kind`)를 통해 CORS를 우회한다.
 */
export async function lookupKrStockName(
  ticker: string,
): Promise<KrxLookupResult | null> {
  const code = normalizeKrTicker(ticker);
  if (!code) return null;

  const list = await getKrxList();
  const row = list.find((x) => x.ticker === code);
  if (!row) return null;
  return { ticker: code, name: row.name, sector: row.sector };
}

export async function searchKrStocksByName(
  keyword: string,
  limit = 10,
): Promise<KrxListedStock[]> {
  const q = keyword.trim();
  if (!q) return [];
  const list = await getKrxList();
  const lower = q.toLowerCase();
  const code = normalizeKrTicker(q);
  const seen = new Set<string>();
  const out: KrxListedStock[] = [];
  const push = (items: KrxListedStock[]) => {
    for (const item of items) {
      if (seen.has(item.ticker)) continue;
      seen.add(item.ticker);
      out.push(item);
      if (out.length >= limit) return;
    }
  };

  if (code) {
    push(list.filter((x) => x.ticker === code));
  }
  push(list.filter((x) => x.name.toLowerCase().startsWith(lower)));
  push(list.filter((x) => x.ticker.startsWith(code || q.toUpperCase())));
  push(
    list.filter(
      (x) =>
        !x.name.toLowerCase().startsWith(lower) &&
        x.name.toLowerCase().includes(lower),
    ),
  );
  push(
    list.filter((x) =>
      code
        ? x.ticker.includes(code)
        : x.ticker.toLowerCase().includes(lower),
    ),
  );
  return out.slice(0, limit);
}

/** 한국장 매매 건에 대해 KRX 목록으로 종목명·섹터(업종)를 덮어씀 (목록에 있을 때만) */
export async function applyKrxMetadataToKrTrades(
  trades: readonly Trade[],
): Promise<Trade[]> {
  const list = await getKrxList();
  const byTicker = new Map(list.map((x) => [x.ticker, x]));
  return trades.map((t) => {
    if (t.market !== 'KR') return t;
    const code = t.ticker.replace(/\s/g, '').toUpperCase();
    const row = byTicker.get(code);
    if (!row) return t;
    return {
      ...t,
      name: row.name || t.name,
      sector: row.sector || t.sector,
    };
  });
}

async function getKrxList(): Promise<KrxListedStock[]> {
  if (krxListCache) return krxListCache;
  const base =
    (import.meta.env.VITE_KRX_PROXY_BASE as string | undefined) ??
    '/api/krx-kind';

  const res = await fetch(base);
  if (!res.ok) {
    throw new Error(`KRX 목록 조회 실패 (${res.status})`);
  }
  const json = (await res.json()) as {
    items?: Partial<KrxListedStock>[];
  };
  const raw = Array.isArray(json.items) ? json.items : [];
  const list: KrxListedStock[] = [];
  for (const x of raw) {
    if (!x || typeof x.name !== 'string' || typeof x.ticker !== 'string') {
      continue;
    }
    const name = x.name.replace(/\s+/g, ' ').trim();
    const ticker = x.ticker.replace(/\s/g, '').toUpperCase();
    if (!name || !/^[A-Z0-9]{6}$/.test(ticker)) continue;
    const sector =
      typeof x.sector === 'string' && x.sector.trim()
        ? x.sector.replace(/\s+/g, ' ').trim()
        : '기타';
    const boardRaw =
      typeof (x as { board?: string }).board === 'string'
        ? (x as { board: string }).board.trim()
        : '';
    const boardNorm = boardRaw ? normalizeKrxBoardLabel(boardRaw) : '';
    const board = boardNorm || undefined;
    list.push({ ticker, name, sector, board });
  }

  if (list.length === 0) {
    throw new Error('KRX 목록 파싱 실패');
  }

  krxListCache = list;
  return list;
}

/** 티커 → 코스피/코스닥/코넥스 등 (KRX 목록 캐시 사용) */
export async function fetchKrBoardByTicker(): Promise<Map<string, string>> {
  const list = await getKrxList();
  const m = new Map<string, string>();
  for (const x of list) {
    const b = x.board ? normalizeKrxBoardLabel(x.board) : '';
    if (b) m.set(x.ticker, b);
  }
  return m;
}
