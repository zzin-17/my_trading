import { describe, expect, it } from 'vitest';
import {
  alertItemTitle,
  crossingAlert,
  markAlertEventsRead,
  pushAlertEvent,
  watchAlertLevel,
} from './priceAlerts';
import type { WatchItem } from '../types/watchItem';

function watch(alert?: WatchItem['alert']): WatchItem {
  return {
    id: 'watch-KR-272450',
    market: 'KR',
    ticker: '272450',
    name: '진에어',
    memo: '',
    createdAt: '2026-11-23T00:00:00.000Z',
    ...(alert ? { alert } : {}),
  };
}

describe('priceAlerts', () => {
  it('이하 알림은 현재가가 목표 이하일 때 도달이다', () => {
    const item = watch({ direction: 'below', price: 12000, enabled: true });
    expect(watchAlertLevel(item, 12000)).toBe('reached');
    expect(watchAlertLevel(item, 12001)).toBe('waiting');
    expect(watchAlertLevel(watch({ direction: 'above', price: 13000, enabled: true }), 13000)).toBe(
      'reached',
    );
  });

  it('꺼진 알림과 처음 관찰은 울리지 않고, 대기에서 도달로 바뀌면 울린다', () => {
    expect(watchAlertLevel(watch({ direction: 'below', price: 1, enabled: false }), 1)).toBe('off');
    expect(crossingAlert(undefined, 'reached', false)).toBeNull();
    expect(crossingAlert('waiting', 'reached', false)).toBe('reached');
    expect(crossingAlert('reached', 'reached', false)).toBeNull();
    expect(crossingAlert('waiting', 'near', false)).toBeNull();
    expect(crossingAlert('waiting', 'near', true)).toBe('near');
  });

  it('종목명 앞에 보유와 관심을 한 번만 붙인다', () => {
    expect(alertItemTitle('watch', '레인보우로보틱스')).toBe('[관심] 레인보우로보틱스');
    expect(alertItemTitle('todo', 'LG씨엔에스')).toBe('[보유] LG씨엔에스');
    expect(alertItemTitle('watch', '[관심] 레인보우로보틱스')).toBe('[관심] 레인보우로보틱스');
    expect(alertItemTitle('todo', 'To-do 도달: LG씨엔에스')).toBe('[보유] LG씨엔에스');
  });

  it('같은 시각의 알림은 한 건만 남기고, 열면 읽음이 된다', () => {
    const once = pushAlertEvent([], {
      source: 'todo',
      sourceId: 'todo-1',
      title: '진에어',
      body: '매수',
      status: 'reached',
      at: '2026-11-23T01:00:00.000Z',
    });
    const twice = pushAlertEvent(once, once[0]);
    expect(twice).toHaveLength(1);
    expect(markAlertEventsRead(twice)[0]?.read).toBe(true);
  });
});