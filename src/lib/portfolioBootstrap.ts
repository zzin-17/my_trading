import type { Trade } from '../types/trade';
import { tradeSeed } from '../data/tradeSeed';
import {
  loadPersisted,
  sanitizeKrDayOpenByTicker,
  type PersistedPortfolioV1,
} from './persistence';
import { normalizeKrSellCommissionRate } from './krTradingAssumptions';

/** 티커별 positionId가 없으면 자동 발급 */
export function reconcilePositionIds(
  trades: Trade[],
  base: Record<string, string>,
): Record<string, string> {
  const next = { ...base };
  let n = 0;
  for (const t of trades) {
    if (!next[t.ticker]) {
      n += 1;
      next[t.ticker] = `p-${t.ticker}-${n}`;
    }
  }
  return next;
}

function withJournalFlags(trades: Trade[]) {
  return trades.map((t) => {
    if (t.excludeFromJournal) return t;
    if (/^tr-user-holding-/.test(t.id) || /^tr-csv-/.test(t.id)) {
      return { ...t, excludeFromJournal: true as const };
    }
    return t;
  });
}

/** 로컬·클라우드·가져오기 공통: 시드 병합·포지션 ID 정리 */
export function normalizeLoadedPortfolio(
  raw: PersistedPortfolioV1,
): PersistedPortfolioV1 {
  const positionIds = reconcilePositionIds(raw.trades, {
    ...tradeSeed.positionIds,
    ...raw.positionIds,
  });
  return {
    trades: withJournalFlags(raw.trades),
    quotes: { ...tradeSeed.quotes, ...raw.quotes },
    positionIds,
    todos: raw.todos ?? [],
    notes: raw.notes ?? {},
    quoteUpdatedAt: { ...(raw.quoteUpdatedAt ?? {}) },
    lastKrQuoteBulkAt:
      typeof raw.lastKrQuoteBulkAt === 'string' ? raw.lastKrQuoteBulkAt : null,
    krSellCommissionRate: normalizeKrSellCommissionRate(
      raw.krSellCommissionRate,
    ),
    krPreferExtendedQuote:
      typeof raw.krPreferExtendedQuote === 'boolean'
        ? raw.krPreferExtendedQuote
        : false,
    krDayOpenByTicker: sanitizeKrDayOpenByTicker(raw.krDayOpenByTicker),
  };
}

export function buildInitialAppState(): PersistedPortfolioV1 {
  const raw = loadPersisted();
  if (raw) {
    return normalizeLoadedPortfolio(raw);
  }
  return {
    trades: [...tradeSeed.trades],
    quotes: { ...tradeSeed.quotes },
    positionIds: { ...tradeSeed.positionIds },
    todos: [],
    notes: {},
    quoteUpdatedAt: {},
    lastKrQuoteBulkAt: null,
    krSellCommissionRate: normalizeKrSellCommissionRate(undefined),
    krPreferExtendedQuote: false,
    krDayOpenByTicker: {},
  };
}

let _initialCache: PersistedPortfolioV1 | undefined;

/** mounted 시 한 번만 localStorage / 시드 병합 (lazy initializer에서 재사용) */
export function getInitialAppState(): PersistedPortfolioV1 {
  if (!_initialCache) _initialCache = buildInitialAppState();
  return _initialCache;
}

export function clearInitialAppStateCache(): void {
  _initialCache = undefined;
}
