import { describe, expect, it } from 'vitest';
import { addWatchItem, sanitizeWatchItems, watchItemId } from './watchItems';

describe('watchItems', () => {
  it('같은 코드는 한 건만 남긴다', () => {
    const items = sanitizeWatchItems([
      { market: 'KR', ticker: '272450', name: '진에어', memo: ' 메모 ', createdAt: '2026-11-23T00:00:00.000Z' },
      { market: 'KR', ticker: '272450', name: '중복', memo: '', createdAt: '2026-11-23T01:00:00.000Z' },
      { market: 'US', ticker: 'AAPL', name: '애플', memo: '', createdAt: '2026-11-23T00:00:00.000Z' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(watchItemId('272450'));
    expect(items[0]?.memo).toBe('메모');
  });

  it('가격 알림은 방향과 1원 이상일 때만 남긴다', () => {
    const items = sanitizeWatchItems([
      {
        market: 'KR',
        ticker: '272450',
        name: '진에어',
        memo: '',
        createdAt: '2026-11-23T00:00:00.000Z',
        alert: { direction: 'below', price: 12000.4, enabled: true },
      },
      {
        market: 'KR',
        ticker: '005930',
        name: '삼성전자',
        memo: '',
        createdAt: '2026-11-23T00:00:00.000Z',
        alert: { direction: 'sideways', price: 0, enabled: true },
      },
    ]);
    expect(items[0]?.alert).toEqual({ direction: 'below', price: 12000, enabled: true });
    expect(items[1]?.alert).toBeUndefined();
  });

  it('이미 있는 종목은 다시 넣지 않는다', () => {
    const first = addWatchItem([], { ticker: '005930', name: '삼성전자' });
    const second = addWatchItem(first.items, { ticker: '005930', name: '삼성전자' });
    expect(second.error).toBe('이미 관심종목에 있습니다.');
    expect(second.items).toHaveLength(1);
  });
});
