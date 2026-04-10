import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import {
  isExpiredPendingJournalOrder,
  withoutExpiredPendingOrders,
} from './tradePendingExpiry';

const tr = (partial: Partial<Trade> & Pick<Trade, 'id' | 'date'>): Trade => ({
  ticker: 'AAA',
  name: 'N',
  sector: 'S',
  market: 'KR',
  side: 'buy',
  quantity: 1,
  price: 1,
  currency: 'KRW',
  ...partial,
});

describe('tradePendingExpiry', () => {
  it('같은 날 미체결은 유지', () => {
    expect(
      isExpiredPendingJournalOrder(
        tr({ id: '1', date: '2026-04-09', executionStatus: 'pending' }),
        '2026-04-09',
      ),
    ).toBe(false);
  });

  it('다음 날 미체결은 만료', () => {
    expect(
      isExpiredPendingJournalOrder(
        tr({ id: '1', date: '2026-04-09', executionStatus: 'pending' }),
        '2026-04-10',
      ),
    ).toBe(true);
  });

  it('체결 건은 날짜와 관계없이 만료 아님', () => {
    expect(
      isExpiredPendingJournalOrder(
        tr({ id: '1', date: '2020-01-01', executionStatus: 'filled' }),
        '2026-04-10',
      ),
    ).toBe(false);
  });

  it('withoutExpiredPendingOrders 필터', () => {
    const out = withoutExpiredPendingOrders(
      [
        tr({ id: 'a', date: '2026-04-08', executionStatus: 'pending' }),
        tr({ id: 'b', date: '2026-04-09', executionStatus: 'pending' }),
      ],
      '2026-04-09',
    );
    expect(out.map((x) => x.id)).toEqual(['b']);
  });
});
