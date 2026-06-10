import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import { computeLedger } from './ledger';
import { adjustOpeningBalanceTrade, withoutOpeningBalanceForTicker } from './positionAdjust';

const baseTrade = (over: Partial<Trade> & Pick<Trade, 'id'>): Trade => ({
  date: '2025-06-01',
  ticker: 'AAA',
  name: 'N',
  sector: 'S',
  market: 'KR',
  side: 'buy',
  quantity: 1,
  price: 100,
  currency: 'KRW',
  ...over,
});

describe('adjustOpeningBalanceTrade', () => {
  it('일지 없이 초기보유만으로 목표 수량·평단', () => {
    const r = adjustOpeningBalanceTrade([], 'AAA', 10, 50000, {
      name: 'N',
      sector: 'S',
      market: 'KR',
      currency: 'KRW',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const led = computeLedger(r.trades);
    expect(led.get('AAA')?.quantity).toBe(10);
    expect(led.get('AAA')?.avgCost).toBe(50000);
    expect(r.trades[0].excludeFromJournal).toBe(true);
  });

  it('일지 매수 뒤 초기보유로 블렌딩', () => {
    const trades: Trade[] = [
      baseTrade({ id: 'j1', quantity: 10, price: 100 }),
    ];
    const r = adjustOpeningBalanceTrade(trades, 'AAA', 15, 110, {
      name: 'N',
      sector: 'S',
      market: 'KR',
      currency: 'KRW',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const led = computeLedger(r.trades);
    expect(led.get('AAA')?.quantity).toBe(15);
    expect(led.get('AAA')?.avgCost).toBe(110);
  });

  it('매수 없이 매도만 있어도 목표 보유수량으로 맞춘다', () => {
    const trades: Trade[] = [
      baseTrade({ id: 's1', side: 'sell', quantity: 16, price: 140000 }),
    ];
    const r = adjustOpeningBalanceTrade(trades, 'AAA', 24, 100446, {
      name: 'N',
      sector: 'S',
      market: 'KR',
      currency: 'KRW',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const led = computeLedger(r.trades);
    expect(led.get('AAA')?.quantity).toBe(24);
    expect(led.get('AAA')?.avgCost).toBe(100446);
  });

  it('withoutOpeningBalanceForTicker 제거', () => {
    const trades: Trade[] = [
      baseTrade({ id: 'ob', excludeFromJournal: true, quantity: 5, price: 90 }),
      baseTrade({ id: 'j1', quantity: 5, price: 110 }),
    ];
    const w = withoutOpeningBalanceForTicker(trades, 'AAA');
    expect(w.length).toBe(1);
    expect(w[0].id).toBe('j1');
  });
});
