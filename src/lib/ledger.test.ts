import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import { computeLedger, ledgerToPositions, tradeAppliesToLedger } from './ledger';

const t = (partial: Partial<Trade> & Pick<Trade, 'id'>): Trade => ({
  date: '2025-01-01',
  ticker: 'AAA',
  name: 'N',
  sector: 'S',
  market: 'US',
  side: 'buy',
  quantity: 1,
  price: 100,
  currency: 'USD',
  ...partial,
});

describe('computeLedger', () => {
  it('매수 후 이동평균 단가', () => {
    const ledger = computeLedger([
      t({ id: 'a', date: '2025-01-01', quantity: 10, price: 100 }),
      t({ id: 'b', date: '2025-01-02', quantity: 10, price: 120 }),
    ]);
    const row = ledger.get('AAA');
    expect(row?.quantity).toBe(20);
    expect(row?.avgCost).toBe(110);
  });

  it('데모: 매수 12@175.5 후 매도 2@180 → 잔량 10, 실현 9', () => {
    const ledger = computeLedger([
      t({
        id: '1',
        ticker: 'AAPL',
        quantity: 12,
        price: 175.5,
      }),
      t({
        id: '2',
        date: '2025-02-01',
        ticker: 'AAPL',
        side: 'sell',
        quantity: 2,
        price: 180,
      }),
    ]);
    const row = ledger.get('AAPL');
    expect(row?.quantity).toBe(10);
    expect(row?.avgCost).toBe(175.5);
    expect(row?.realizedPnl).toBe(9);
  });

  it('미체결(pending) 거래는 장부에 반영되지 않음', () => {
    const ledger = computeLedger([
      t({ id: 'a', quantity: 10, price: 100 }),
      t({
        id: 'b',
        date: '2025-01-02',
        side: 'sell',
        quantity: 3,
        price: 110,
        executionStatus: 'pending',
      }),
    ]);
    const row = ledger.get('AAA');
    expect(row?.quantity).toBe(10);
  });
});

describe('tradeAppliesToLedger', () => {
  it('pending만 제외', () => {
    expect(tradeAppliesToLedger(t({ id: 'x', executionStatus: 'pending' }))).toBe(
      false,
    );
    expect(tradeAppliesToLedger(t({ id: 'y', executionStatus: 'filled' }))).toBe(
      true,
    );
    expect(tradeAppliesToLedger(t({ id: 'z' }))).toBe(true);
  });
});

describe('ledgerToPositions', () => {
  it('시세 반영', () => {
    const ledger = computeLedger([
      t({ id: 'a', ticker: 'ZZ', quantity: 5, price: 10, currency: 'USD' }),
    ]);
    const positions = ledgerToPositions(ledger, { ZZ: 12 }, { ZZ: 'z1' });
    expect(positions[0].quantity).toBe(5);
    expect(positions[0].avg_price).toBe(10);
    expect(positions[0].current_price).toBe(12);
  });
});
