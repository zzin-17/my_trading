import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import { computeLedger } from './ledger';
import {
  aggregateRealizedByTickerForPeriod,
  buildDailyRealizedBarRows,
  computeRealizedSellEvents,
  lastNWeekdayDates,
  periodKeyForGranularity,
  summarizeRealizedByPeriod,
} from './realizedPnl';

const tr = (partial: Partial<Trade> & Pick<Trade, 'id' | 'date' | 'side'>): Trade => ({
  ticker: 'AAA',
  name: 'N',
  sector: 'S',
  market: 'US',
  quantity: 1,
  price: 100,
  currency: 'USD',
  ...partial,
});

describe('computeRealizedSellEvents', () => {
  it('매도 건별 gross 합이 장부 realizedPnl과 일치', () => {
    const trades: Trade[] = [
      tr({ id: 'b1', date: '2025-01-01', side: 'buy', quantity: 10, price: 100 }),
      tr({
        id: 's1',
        date: '2025-01-02',
        side: 'sell',
        quantity: 3,
        price: 110,
      }),
      tr({
        id: 's2',
        date: '2025-01-03',
        side: 'sell',
        quantity: 2,
        price: 90,
      }),
    ];
    const ledger = computeLedger(trades);
    const row = ledger.get('AAA');
    const events = computeRealizedSellEvents(trades, 0.00015);
    const sumGross = events.reduce((s, e) => s + e.grossPnl, 0);
    expect(row?.realizedPnl).toBe(sumGross);
    expect(events).toHaveLength(2);
  });

  it('KR 매도 net은 gross에서 매도비용 차감', () => {
    const trades: Trade[] = [
      tr({
        id: 'b1',
        date: '2025-01-01',
        side: 'buy',
        market: 'KR',
        currency: 'KRW',
        quantity: 10,
        price: 10_000,
      }),
      tr({
        id: 's1',
        date: '2025-01-02',
        side: 'sell',
        market: 'KR',
        currency: 'KRW',
        quantity: 10,
        price: 11_000,
      }),
    ];
    const events = computeRealizedSellEvents(trades, 0);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.grossPnl).toBe(10_000);
    const friction = Math.round(110_000 * 0.0018);
    expect(e.netPnl).toBe(10_000 - friction);
  });
});

describe('summarizeRealizedByPeriod', () => {
  it('월별 키 집계', () => {
    const events = computeRealizedSellEvents(
      [
        tr({ id: 'b', date: '2025-01-01', side: 'buy', quantity: 10, price: 100 }),
        tr({
          id: 's1',
          date: '2025-01-10',
          side: 'sell',
          quantity: 2,
          price: 120,
        }),
        tr({
          id: 's2',
          date: '2025-01-20',
          side: 'sell',
          quantity: 1,
          price: 110,
        }),
      ],
      0,
    );
    const rows = summarizeRealizedByPeriod(events, 'month');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.period).toBe('2025-01');
    expect(rows[0]!.netTotal).toBe(events.reduce((s, x) => s + x.netPnl, 0));
  });
});

describe('aggregateRealizedByTickerForPeriod', () => {
  it('같은 종목 여러 매도 합산', () => {
    const trades: Trade[] = [
      tr({ id: 'b', date: '2025-01-01', side: 'buy', quantity: 10, price: 100 }),
      tr({ id: 's1', date: '2025-01-05', side: 'sell', quantity: 2, price: 120 }),
      tr({ id: 's2', date: '2025-01-06', side: 'sell', quantity: 2, price: 110 }),
    ];
    const events = computeRealizedSellEvents(trades, 0);
    const rows = aggregateRealizedByTickerForPeriod(
      events,
      '2025-01',
      'USD',
      'month',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantitySold).toBe(4);
    expect(rows[0]!.costBasisSold).toBe(400);
  });
});

describe('periodKeyForGranularity', () => {
  it('년 키', () => {
    expect(periodKeyForGranularity('2025-03-15', 'year')).toBe('2025');
  });
});

describe('lastNWeekdayDates', () => {
  it('종료일이 금요일이면 5거래일이 월~금 연속', () => {
    const days = lastNWeekdayDates('2025-01-10', 5);
    expect(days).toEqual([
      '2025-01-06',
      '2025-01-07',
      '2025-01-08',
      '2025-01-09',
      '2025-01-10',
    ]);
  });
});

describe('buildDailyRealizedBarRows', () => {
  it('해당 거래일에 매도 net만 합산', () => {
    const events = computeRealizedSellEvents(
      [
        tr({ id: 'b', date: '2025-01-01', side: 'buy', quantity: 10, price: 100 }),
        tr({
          id: 's',
          date: '2025-01-10',
          side: 'sell',
          quantity: 2,
          price: 120,
        }),
      ],
      0,
    );
    const rows = buildDailyRealizedBarRows(events, '2025-01-10', 5);
    const fri = rows.find((r) => r.date === '2025-01-10');
    expect(fri?.usd).toBe(40);
    const mon = rows.find((r) => r.date === '2025-01-06');
    expect(mon?.usd).toBe(0);
  });
});
