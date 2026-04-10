import { describe, expect, it } from 'vitest';
import type { Position } from '../types/portfolio';
import { CONCENTRATION_WARNING_PCT } from '../types/portfolio';
import {
  buildPortfolioSummary,
  buildPositionMetrics,
  buildSectorWeights,
  buildTopStockWeights,
  estimateNetUnrealizedPnl,
  getUnifiedPortfolioCurrency,
  isConcentrationRisk,
  roundMoney,
  roundPercent,
} from './portfolioMath';
import { KR_SELL_TAX_RATE } from './krTradingAssumptions';

function pos(overrides: Partial<Position> & Pick<Position, 'id'>): Position {
  return {
    ticker: 'TICK',
    name: 'Name',
    sector: 'Sector',
    quantity: 1,
    avg_price: 100,
    current_price: 110,
    currency: 'USD',
    market: 'US',
    ...overrides,
  };
}

describe('roundMoney', () => {
  it('KRW는 정수로 반올림', () => {
    expect(roundMoney(1234.4, 'KRW')).toBe(1234);
    expect(roundMoney(1234.5, 'KRW')).toBe(1235);
  });

  it('USD는 소수 둘째 자리', () => {
    expect(roundMoney(10.004, 'USD')).toBe(10);
    expect(roundMoney(10.005, 'USD')).toBe(10.01);
    expect(roundMoney(10.104, 'USD')).toBe(10.1);
  });
});

describe('roundPercent', () => {
  it('소수 둘째 자리까지 반올림', () => {
    expect(roundPercent(12.345)).toBe(12.35);
    expect(roundPercent(12.344)).toBe(12.34);
  });
});

describe('buildPositionMetrics', () => {
  it('손익·평가액·비중이 스펙 공식과 맞고 비중 합이 100에 수렴', () => {
    const positions: Position[] = [
      pos({ id: 'a', quantity: 10, avg_price: 100, current_price: 110, currency: 'USD' }),
      pos({
        id: 'b',
        ticker: 'B',
        sector: 'Other',
        quantity: 5,
        avg_price: 200,
        current_price: 180,
        currency: 'USD',
      }),
    ];
    const m = buildPositionMetrics(positions);
    expect(m).toHaveLength(2);
    expect(m[0].cost_basis).toBe(1000);
    expect(m[0].market_value).toBe(1100);
    expect(m[0].pnl).toBe(100);
    expect(m[1].pnl).toBe(-100);

    const sumW = m.reduce((s, x) => s + x.weight_pct, 0);
    expect(sumW).toBeGreaterThanOrEqual(99.9);
    expect(sumW).toBeLessThanOrEqual(100.1);
  });

  it('포지션이 없으면 빈 배열', () => {
    expect(buildPositionMetrics([])).toEqual([]);
  });

  it('한국장: 매도 세금·수수료를 반영한 평가손익', () => {
    const commission = 0.00015;
    const positions: Position[] = [
      pos({
        id: 'kr',
        market: 'KR',
        currency: 'KRW',
        quantity: 10,
        avg_price: 10_000,
        current_price: 11_000,
      }),
    ];
    const m = buildPositionMetrics(positions, {
      krSellCommissionRate: commission,
    });
    const proceeds = 110_000;
    const exit = roundMoney(proceeds * (KR_SELL_TAX_RATE + commission), 'KRW');
    const expectPnl = roundMoney(proceeds - 100_000 - exit, 'KRW');
    expect(m[0].pnl).toBe(expectPnl);
    expect(m[0].pnl).toBe(
      estimateNetUnrealizedPnl('KR', 10_000, 11_000, 10, 'KRW', commission),
    );
  });
});

describe('estimateNetUnrealizedPnl', () => {
  it('미국장은 세후 비용 없음', () => {
    expect(
      estimateNetUnrealizedPnl('US', 100, 110, 5, 'USD', 0.00015),
    ).toBe(50);
  });
});

describe('buildPortfolioSummary', () => {
  it('요약 금액이 행 합계와 roundMoney 일치', () => {
    const positions: Position[] = [
      pos({ id: 'a', quantity: 10, avg_price: 175.5, current_price: 182.3, currency: 'USD' }),
    ];
    const metrics = buildPositionMetrics(positions);
    const s = buildPortfolioSummary(positions, metrics);

    expect(s.currency).toBe('USD');
    expect(s.total_cost_basis).toBe(metrics.reduce((x, m) => x + m.cost_basis, 0));
    expect(s.total_market_value).toBe(metrics.reduce((x, m) => x + m.market_value, 0));
    expect(s.total_pnl).toBe(metrics.reduce((x, m) => x + m.pnl, 0));
  });

  it('포지션 없을 때 USD·0', () => {
    const s = buildPortfolioSummary([], []);
    expect(s).toEqual({
      currency: 'USD',
      total_cost_basis: 0,
      total_market_value: 0,
      total_pnl: 0,
      total_return_pct: 0,
    });
  });
});

describe('buildSectorWeights', () => {
  it('같은 섹터는 합산되고 비중 합이 100 근처', () => {
    const positions: Position[] = [
      pos({ id: '1', sector: 'IT', quantity: 1, avg_price: 100, current_price: 100, currency: 'USD' }),
      pos({
        id: '2',
        ticker: 'B',
        sector: 'IT',
        quantity: 1,
        avg_price: 50,
        current_price: 200,
        currency: 'USD',
      }),
      pos({
        id: '3',
        ticker: 'C',
        sector: 'Fin',
        quantity: 1,
        avg_price: 50,
        current_price: 50,
        currency: 'USD',
      }),
    ];
    const metrics = buildPositionMetrics(positions);
    const sectors = buildSectorWeights(positions, metrics);
    const it = sectors.find((x) => x.sector === 'IT');
    const fin = sectors.find((x) => x.sector === 'Fin');
    expect(it?.market_value).toBe(300);
    expect(fin?.market_value).toBe(50);
    const sumW = sectors.reduce((s, x) => s + x.weight_pct, 0);
    expect(sumW).toBeGreaterThanOrEqual(99.9);
    expect(sumW).toBeLessThanOrEqual(100.1);
  });
});

describe('buildTopStockWeights', () => {
  it('Top N 나머지는 Others로 묶임', () => {
    const positions: Position[] = Array.from({ length: 12 }, (_, i) =>
      pos({
        id: `p${i}`,
        ticker: `S${i}`,
        name: `Stock ${i}`,
        quantity: 1,
        avg_price: 10,
        current_price: 100 - i,
        sector: 'S',
      }),
    );
    const metrics = buildPositionMetrics(positions);
    const top = buildTopStockWeights(positions, metrics, 10);
    expect(top.top).toHaveLength(10);
    expect(top.others).not.toBeNull();
    expect(top.others?.ticker).toBe('OTHERS');
    const topSum = top.top.reduce((s, x) => s + x.weight_pct, 0);
    const o = top.others?.weight_pct ?? 0;
    expect(topSum + o).toBeGreaterThanOrEqual(99.9);
    expect(topSum + o).toBeLessThanOrEqual(100.1);
  });

  it('종목 수 ≤ N 이면 others는 null', () => {
    const positions = [pos({ id: 'only' })];
    const metrics = buildPositionMetrics(positions);
    const top = buildTopStockWeights(positions, metrics, 10);
    expect(top.top).toHaveLength(1);
    expect(top.others).toBeNull();
  });
});

describe('isConcentrationRisk', () => {
  it(`${CONCENTRATION_WARNING_PCT}% 미만은 false, 이상은 true`, () => {
    expect(isConcentrationRisk(39.99)).toBe(false);
    expect(isConcentrationRisk(40)).toBe(true);
    expect(isConcentrationRisk(50)).toBe(true);
  });
});

describe('getUnifiedPortfolioCurrency', () => {
  it('빈 배열이면 null', () => {
    expect(getUnifiedPortfolioCurrency([])).toBeNull();
  });

  it('동일 통화면 그 통화', () => {
    expect(getUnifiedPortfolioCurrency([pos({ id: 'a' }), pos({ id: 'b', ticker: 'B' })])).toBe(
      'USD',
    );
  });

  it('섞이면 null', () => {
    const mixed: Position[] = [
      pos({ id: 'a', currency: 'USD' }),
      pos({ id: 'b', ticker: 'B', currency: 'KRW' }),
    ];
    expect(getUnifiedPortfolioCurrency(mixed)).toBeNull();
  });
});
