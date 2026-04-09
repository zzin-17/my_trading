import type { Trade } from '../types/trade';
import type { TradePlanTodo } from '../types/todo';

const STORAGE_KEY = 'traderos-portfolio-v2';

export interface PersistedPortfolioV1 {
  trades: Trade[];
  quotes: Record<string, number>;
  positionIds: Record<string, string>;
  todos: TradePlanTodo[];
  notes: Record<string, string>;
  /** 티커별 시세(또는 수동 입력) 기준 시각 ISO */
  quoteUpdatedAt: Record<string, string>;
  /** 마지막 「시세 갱신」 일괄 호출 완료 시각 */
  lastKrQuoteBulkAt: string | null;
}

export function loadPersisted(): PersistedPortfolioV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPortfolioV1;
    if (!data || !Array.isArray(data.trades)) return null;
    if (typeof data.quotes !== 'object' || data.quotes === null) return null;
    if (typeof data.positionIds !== 'object' || data.positionIds === null) {
      data.positionIds = {};
    }
    if (!Array.isArray(data.todos)) {
      data.todos = [];
    }
    if (typeof data.notes !== 'object' || data.notes === null) {
      data.notes = {};
    }
    if (
      typeof data.quoteUpdatedAt !== 'object' ||
      data.quoteUpdatedAt === null
    ) {
      data.quoteUpdatedAt = {};
    }
    data.lastKrQuoteBulkAt =
      typeof data.lastKrQuoteBulkAt === 'string' ? data.lastKrQuoteBulkAt : null;
    return data;
  } catch {
    return null;
  }
}

export function savePersisted(data: PersistedPortfolioV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
