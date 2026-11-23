import type { Trade } from '../types/trade';
import type { TradePlanTodo } from '../types/todo';
import type { WatchItem } from '../types/watchItem';
import { sanitizeWatchItems } from './watchItems';

const STORAGE_KEY = 'traderos-portfolio-v2';
const STORAGE_UPDATED_AT_KEY = 'traderos-portfolio-v2-updated-at';
const DEVICE_ID_KEY = 'traderos-device-id-v1';
/** 이 브라우저가 클라우드 장부를 마지막으로 받아들인 시각 */
const CLOUD_BOOK_ACCEPTED_AT_KEY = 'traderos-cloud-book-accepted-at-v1';
const SEEN_TRADE_IDS_KEY = 'traderos-cloud-seen-trade-ids-v1';
const SEEN_TODO_IDS_KEY = 'traderos-cloud-seen-todo-ids-v1';
const SEEN_WATCH_IDS_KEY = 'traderos-cloud-seen-watch-ids-v1';

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
  /** 한국장 시세 갱신으로 수집한 전일 종가(티커→원) — 현재가 등락 표시 */
  krPrevCloseByTicker?: Record<string, number>;
  /** 관심종목. 클라우드 메타가 아니라 watch_items 문서로 동기화한다. */
  watchItems?: WatchItem[];
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
  data.krPrevCloseByTicker = sanitizeKrDayOpenByTicker(data.krPrevCloseByTicker);
  if ('watchItems' in data) {
    data.watchItems = sanitizeWatchItems(data.watchItems);
  }
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

export function getPersistedUpdatedAtMs(): number {
  try {
    const raw = localStorage.getItem(STORAGE_UPDATED_AT_KEY);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** 클라우드 장부를 받은 적이 없으면 null */
export function getCloudBookAcceptedAtMs(): number | null {
  try {
    const raw = localStorage.getItem(CLOUD_BOOK_ACCEPTED_AT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setCloudBookAcceptedAtMs(value: number): void {
  try {
    if (!Number.isFinite(value) || value <= 0) return;
    localStorage.setItem(CLOUD_BOOK_ACCEPTED_AT_KEY, String(Math.floor(value)));
  } catch {
    /* ignore */
  }
}

function readIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function rememberIdSet(key: string, ids: Iterable<string>): void {
  try {
    const current = readIdSet(key);
    let changed = false;
    for (const id of ids) {
      if (!id || current.has(id)) continue;
      current.add(id);
      changed = true;
    }
    if (!changed) return;
    localStorage.setItem(key, JSON.stringify([...current]));
  } catch {
    /* ignore */
  }
}

/** 이 브라우저가 클라우드에서 실제로 본 거래 id. 다른 기기 삭제를 되살리지 않기 위해 남긴다. */
export function getSeenTradeIds(): Set<string> {
  return readIdSet(SEEN_TRADE_IDS_KEY);
}

export function rememberSeenTradeIds(ids: Iterable<string>): void {
  rememberIdSet(SEEN_TRADE_IDS_KEY, ids);
}

export function getSeenTodoIds(): Set<string> {
  return readIdSet(SEEN_TODO_IDS_KEY);
}

export function rememberSeenTodoIds(ids: Iterable<string>): void {
  rememberIdSet(SEEN_TODO_IDS_KEY, ids);
}

export function getSeenWatchIds(): Set<string> {
  return readIdSet(SEEN_WATCH_IDS_KEY);
}

export function rememberSeenWatchIds(ids: Iterable<string>): void {
  rememberIdSet(SEEN_WATCH_IDS_KEY, ids);
}

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim()) return existing;
    const created = createDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return createDeviceId();
  }
}

/** 저장 성공 여부(용량 초과·비공개 모드 등 시 false) */
export function savePersisted(data: PersistedPortfolioV1): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_UPDATED_AT_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_UPDATED_AT_KEY);
  } catch {
    /* ignore */
  }
}
