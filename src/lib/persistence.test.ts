import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '../types/trade';
import {
  clearPersisted,
  loadPersisted,
  savePersisted,
} from './persistence';

const minimalTrade: Trade = {
  id: 't1',
  date: '2025-01-01',
  ticker: '000000',
  name: 'T',
  sector: 'S',
  market: 'KR',
  side: 'buy',
  quantity: 1,
  price: 1,
  currency: 'KRW',
};

const minimalPayload = {
  trades: [minimalTrade],
  quotes: {} as Record<string, number>,
  positionIds: {} as Record<string, string>,
  todos: [],
  notes: {} as Record<string, string>,
  quoteUpdatedAt: {} as Record<string, string>,
  lastKrQuoteBulkAt: null as string | null,
};

describe('persistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장 후 다시 읽으면 동일한 매매 데이터가 복원된다', () => {
    expect(savePersisted(minimalPayload)).toBe(true);
    const loaded = loadPersisted();
    expect(loaded).not.toBeNull();
    expect(loaded!.trades).toHaveLength(1);
    expect(loaded!.trades[0]!.id).toBe('t1');
    expect(loaded!.trades[0]!.ticker).toBe('000000');
  });

  it('krDayOpenByTicker가 저장·복원된다', () => {
    expect(
      savePersisted({
        ...minimalPayload,
        krDayOpenByTicker: { '005930': 70000, bad: NaN as unknown as number },
      }),
    ).toBe(true);
    const loaded = loadPersisted();
    expect(loaded?.krDayOpenByTicker).toEqual({ '005930': 70000 });
  });

  it('setItem 실패 시 false를 반환한다', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('QuotaExceededError');
      }),
      removeItem: vi.fn(),
    });
    expect(savePersisted(minimalPayload)).toBe(false);
  });

  it('clearPersisted 후 loadPersisted는 null', () => {
    savePersisted(minimalPayload);
    clearPersisted();
    expect(loadPersisted()).toBeNull();
  });
});
