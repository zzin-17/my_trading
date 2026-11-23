import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import {
  planCloudRecordSync,
  portfolioGuardFingerprint,
  reconcileTradesFromSources,
  shouldHydrateFromLegacy,
  shouldKeepLocalOnlyRecord,
} from './cloudPortfolioStore';
import type { PersistedPortfolioV1 } from './persistence';

function trade(partial: Pick<Trade, 'id' | 'date' | 'quantity' | 'price'> & Partial<Trade>): Trade {
  return {
    ticker: '272450',
    name: '진에어',
    sector: '운송',
    market: 'KR',
    side: 'buy',
    currency: 'KRW',
    ...partial,
  };
}

describe('portfolioGuardFingerprint', () => {
  const base = {
    trades: [],
    quotes: { '272450': 10000 },
    positionIds: {},
    todos: [],
    notes: {},
    quoteUpdatedAt: {},
    lastKrQuoteBulkAt: null,
  } satisfies PersistedPortfolioV1;

  it('시세만 바뀌면 자동 백업 지문이 같다', () => {
    const next = { ...base, quotes: { '272450': 12005 }, lastKrQuoteBulkAt: '2026-11-23T01:00:00.000Z' };
    expect(portfolioGuardFingerprint(next)).toBe(portfolioGuardFingerprint(base));
  });

  it('거래가 바뀌면 자동 백업 지문이 달라진다', () => {
    const next = {
      ...base,
      trades: [trade({ id: 'tr-user-1', date: '2026-11-23', quantity: 1, price: 100 })],
    };
    expect(portfolioGuardFingerprint(next)).not.toBe(portfolioGuardFingerprint(base));
  });
});

describe('shouldHydrateFromLegacy', () => {
  it('라이브 거래가 있으면 레거시를 쓰지 않는다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 3,
        liveTodoCount: 0,
        hasDeleteHistory: false,
        legacyHasItems: true,
      }),
    ).toBe(false);
  });

  it('삭제 이력이 있으면 빈 라이브를 레거시로 채우지 않는다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 0,
        liveTodoCount: 0,
        hasDeleteHistory: true,
        legacyHasItems: true,
      }),
    ).toBe(false);
  });

  it('라이브가 비고 메타만 있어도 레거시 항목이 있으면 복구한다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 0,
        liveTodoCount: 0,
        hasDeleteHistory: false,
        legacyHasItems: true,
      }),
    ).toBe(true);
  });

  it('레거시도 비어 있으면 복구하지 않는다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 0,
        liveTodoCount: 0,
        hasDeleteHistory: false,
        legacyHasItems: false,
      }),
    ).toBe(false);
  });
});

describe('shouldKeepLocalOnlyRecord', () => {
  it('클라우드가 비어 있으면 로컬 거래를 올린다', () => {
    expect(
      shouldKeepLocalOnlyRecord({
        cloudHasRecords: false,
        acceptedCloudAtMs: null,
        createdAtMs: 1,
      }),
    ).toBe(true);
  });

  it('다른 기기에서 지운 거래는 이 기기가 본 적이 있으면 올리지 않는다', () => {
    expect(
      shouldKeepLocalOnlyRecord({
        cloudHasRecords: true,
        acceptedCloudAtMs: 1,
        createdAtMs: 2,
        previouslySeen: true,
      }),
    ).toBe(false);
  });

  it('클라우드 장부를 받은 시각이 없으면 예전 로컬 거래는 올리지 않는다', () => {
    expect(
      shouldKeepLocalOnlyRecord({
        cloudHasRecords: true,
        acceptedCloudAtMs: null,
        createdAtMs: 1_776_220_845_781,
      }),
    ).toBe(false);
  });
});

describe('reconcileTradesFromSources', () => {
  const opening = trade({
    id: 'tr-ob-1776226310752',
    date: '1900-01-01',
    quantity: 83,
    price: 12005,
    excludeFromJournal: true,
  });
  const staleAdd = trade({
    id: 'tr-user-holding-1776220845781',
    date: '2026-04-15',
    quantity: 83,
    price: 6620,
    excludeFromJournal: true,
  });

  it('클라우드에 있는 초기보유만 남기고 예전 보유종목 추가는 버린다', () => {
    const merged = reconcileTradesFromSources({
      liveTrades: [opening],
      fallbackTrades: [opening, staleAdd],
      acceptedCloudAtMs: null,
    });
    expect(merged.map((item) => item.id)).toEqual([opening.id]);
  });

  it('장부를 받은 뒤에 만든 로컬 거래는 올린다', () => {
    const offline = trade({
      id: 'tr-user-1779000000000',
      date: '2026-11-21',
      quantity: 1,
      price: 9000,
    });
    const merged = reconcileTradesFromSources({
      liveTrades: [opening],
      fallbackTrades: [staleAdd, offline],
      acceptedCloudAtMs: 1_778_000_000_000,
    });
    expect(merged.map((item) => item.id)).toEqual([opening.id, offline.id]);
  });

  it('클라우드에 이미 올라간 예전 보유종목 추가도 최신 초기보유만 남긴다', () => {
    const merged = reconcileTradesFromSources({
      liveTrades: [staleAdd, opening],
      fallbackTrades: [staleAdd, opening],
      acceptedCloudAtMs: 1_779_000_000_000,
    });
    expect(merged.map((item) => item.id)).toEqual([opening.id]);
  });

  it('다른 기기가 지운 거래를 로컬에 남아 있어도 되살리지 않는다', () => {
    const merged = reconcileTradesFromSources({
      liveTrades: [opening],
      fallbackTrades: [opening, staleAdd],
      acceptedCloudAtMs: 1,
      seenTradeIds: new Set([staleAdd.id]),
    });
    expect(merged.map((item) => item.id)).toEqual([opening.id]);
  });
});

describe('planCloudRecordSync', () => {
  const row = (id: string) => trade({ id, date: '2026-11-23', quantity: 1, price: 100 });

  it('클라우드에만 있는 다른 기기 거래는 지우지 않는다', () => {
    const local = row('local');
    const remoteOnly = row('remote');
    const plan = planCloudRecordSync({
      localRecords: [local],
      remoteFingerprints: { remote: 'remote', local: 'local' },
      remoteRecords: { remote: remoteOnly, local },
      seenIds: new Set(['local']),
      previousLocalIds: new Set(['local']),
      fingerprintOf: (item) => item.id,
    });
    expect(plan.deletes).toEqual([]);
    expect(plan.upserts).toEqual([]);
  });

  it('이 기기에서 뺀 거래만 삭제로 올린다', () => {
    const kept = row('kept');
    const removed = row('removed');
    const plan = planCloudRecordSync({
      localRecords: [kept],
      remoteFingerprints: { kept: 'kept', removed: 'removed' },
      remoteRecords: { kept, removed },
      seenIds: new Set(['kept', 'removed']),
      previousLocalIds: new Set(['kept', 'removed']),
      fingerprintOf: (item) => item.id,
    });
    expect(plan.deletes.map((item) => item.id)).toEqual(['removed']);
  });

  it('다른 기기가 지운 거래를 로컬에서 뺀다', () => {
    const kept = row('kept');
    const gone = row('gone');
    const plan = planCloudRecordSync({
      localRecords: [kept, gone],
      remoteFingerprints: { kept: 'kept' },
      remoteRecords: { kept },
      seenIds: new Set(['kept', 'gone']),
      previousLocalIds: new Set(['kept', 'gone']),
      fingerprintOf: (item) => item.id,
    });
    expect(plan.replaceLocal?.map((item) => item.id)).toEqual(['kept']);
    expect(plan.upserts).toEqual([]);
  });
});
