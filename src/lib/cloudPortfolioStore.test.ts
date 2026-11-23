import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import {
  reconcileTradesFromSources,
  shouldHydrateFromLegacy,
  shouldKeepLocalOnlyRecord,
} from './cloudPortfolioStore';

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
});
