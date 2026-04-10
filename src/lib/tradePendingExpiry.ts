import type { Trade } from '../types/trade';

/** 브라우저 로컬 날짜 YYYY-MM-DD */
export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 미체결 주문이 trade.date(일지에 적은 날) 당일 자정을 넘겼는지.
 * 같은 날에는 유지, 다음 로컬 일자부터 목록·저장소에서 제거.
 */
export function isExpiredPendingJournalOrder(trade: Trade, today: string): boolean {
  return trade.executionStatus === 'pending' && trade.date < today;
}

export function withoutExpiredPendingOrders(trades: Trade[], today: string): Trade[] {
  return trades.filter((t) => !isExpiredPendingJournalOrder(t, today));
}
