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
  /**
   * 한국장 매도 시 위탁 수수료율(소수). 예: 0.00015 = 0.015%
   * 세금(0.18%)과 별도로 평가손익 계산에 사용.
   */
  krSellCommissionRate?: number;
  /** true면 시세 갱신 시 모바일 API로 장외(Over/NXT) 호가 우선 */
  krPreferExtendedQuote?: boolean;
  /** 한국장 시세 갱신으로 수집한 당일 시가(티커→원) — 새로고침 후에도 유지 */
  krDayOpenByTicker?: Record<string, number>;
}

/** 로컬·가져오기·클라우드 공통: 양의 유한 숫자만 유지 */
export function sanitizeKrDayOpenByTicker(
  input: unknown,
): Record<string, number> {
  if (typeof input !== 'object' || input === null) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[key] = v;
    }
  }
  return out;
}

/** JSON·가져오기·클라우드용 동일 검증 */
export function coercePersistedPortfolio(
  input: unknown,
): PersistedPortfolioV1 | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as PersistedPortfolioV1;
  if (!Array.isArray(data.trades)) return null;
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
  if (
    typeof data.krSellCommissionRate === 'number' &&
    Number.isFinite(data.krSellCommissionRate)
  ) {
    /* 유지 */
  } else {
    delete data.krSellCommissionRate;
  }
  if (typeof data.krPreferExtendedQuote !== 'boolean') {
    delete data.krPreferExtendedQuote;
  }
  data.krDayOpenByTicker = sanitizeKrDayOpenByTicker(data.krDayOpenByTicker);
  return data;
}

export function loadPersisted(): PersistedPortfolioV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return coercePersistedPortfolio(parsed);
  } catch {
    return null;
  }
}

export function hasPersistedPortfolio(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** 저장 성공 여부(용량 초과·비공개 모드 등 시 false) */
export function savePersisted(data: PersistedPortfolioV1): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
