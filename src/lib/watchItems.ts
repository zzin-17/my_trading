import { normalizeKrTicker } from './krxLookup';
import type { WatchItem } from '../types/watchItem';

export const WATCH_ITEM_LIMIT = 50;
const MEMO_LIMIT = 80;

export function watchItemId(ticker: string): string {
  return `watch-KR-${ticker}`;
}

export function sanitizeWatchItems(input: unknown): WatchItem[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map<string, WatchItem>();
  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const raw = row as Partial<WatchItem>;
    if (raw.market !== 'KR') continue;
    const ticker = normalizeKrTicker(String(raw.ticker ?? ''));
    if (!ticker) continue;
    const name = String(raw.name ?? '').trim() || ticker;
    const memo = String(raw.memo ?? '').trim().slice(0, MEMO_LIMIT);
    const createdAt =
      typeof raw.createdAt === 'string' && raw.createdAt
        ? raw.createdAt
        : new Date(0).toISOString();
    const id = watchItemId(ticker);
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      market: 'KR',
      ticker,
      name,
      memo,
      createdAt,
    });
  }
  return [...byId.values()].slice(0, WATCH_ITEM_LIMIT);
}

export function addWatchItem(
  items: readonly WatchItem[],
  draft: { ticker: string; name: string },
): { items: WatchItem[]; error?: string } {
  const ticker = normalizeKrTicker(draft.ticker);
  if (!ticker) {
    return { items: [...items], error: '한국장 종목코드 6자리만 담을 수 있습니다.' };
  }
  const id = watchItemId(ticker);
  if (items.some((item) => item.id === id)) {
    return { items: [...items], error: '이미 관심종목에 있습니다.' };
  }
  if (items.length >= WATCH_ITEM_LIMIT) {
    return { items: [...items], error: `관심종목은 ${WATCH_ITEM_LIMIT}개까지입니다.` };
  }
  return {
    items: [
      ...items,
      {
        id,
        market: 'KR',
        ticker,
        name: draft.name.trim() || ticker,
        memo: '',
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
