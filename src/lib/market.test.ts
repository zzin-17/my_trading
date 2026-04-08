import { describe, expect, it } from 'vitest';
import {
  filterByMarket,
  inferMarketFromTicker,
  normalizePosition,
} from './market';

describe('inferMarketFromTicker', () => {
  it('6자리 숫자면 한국', () => {
    expect(inferMarketFromTicker('005930')).toBe('KR');
    expect(inferMarketFromTicker('000660')).toBe('KR');
  });

  it('그 외는 미국', () => {
    expect(inferMarketFromTicker('AAPL')).toBe('US');
    expect(inferMarketFromTicker('BRK.B')).toBe('US');
  });
});

describe('normalizePosition', () => {
  it('market 생략 시 티커로 보정', () => {
    const p = normalizePosition({
      id: 'x',
      ticker: '035420',
      name: 'N',
      sector: 'S',
      quantity: 1,
      avg_price: 1,
      current_price: 2,
      currency: 'KRW',
    });
    expect(p.market).toBe('KR');
  });

  it('명시 market 우선', () => {
    const p = normalizePosition({
      id: 'x',
      ticker: '005930',
      name: 'N',
      sector: 'S',
      quantity: 1,
      avg_price: 1,
      current_price: 2,
      currency: 'KRW',
      market: 'KR',
    });
    expect(p.market).toBe('KR');
  });
});

describe('filterByMarket', () => {
  it('탭별 필터', () => {
    const list = [
      normalizePosition({
        id: 'a',
        ticker: 'AAPL',
        name: '',
        sector: '',
        quantity: 1,
        avg_price: 1,
        current_price: 1,
        currency: 'USD',
        market: 'US',
      }),
      normalizePosition({
        id: 'b',
        ticker: '005930',
        name: '',
        sector: '',
        quantity: 1,
        avg_price: 1,
        current_price: 1,
        currency: 'KRW',
        market: 'KR',
      }),
    ];
    expect(filterByMarket(list, 'all')).toHaveLength(2);
    expect(filterByMarket(list, 'US')).toHaveLength(1);
    expect(filterByMarket(list, 'KR')).toHaveLength(1);
  });
});
