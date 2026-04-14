import type { Market } from './portfolio';

export type PlanAction = 'buy' | 'sell';

/** 시장별 매매 계획 항목 */
export interface TradePlanTodo {
  id: string;
  market: Market;
  ticker: string;
  /** 추가 시점 종목명(없으면 장부·매매에서 보강 표시) */
  name?: string;
  action: PlanAction;
  targetPrice: number;
  quantity: number;
  note?: string;
  done: boolean;
  createdAt: string;
}

