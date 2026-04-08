import type { CurrencyCode, Market } from './portfolio';

export type TradeSide = 'buy' | 'sell';

/** 매매일지 1건 (평단·실현손익은 장부 로직으로 집계) */
export interface Trade {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  ticker: string;
  name: string;
  sector: string;
  market: Market;
  side: TradeSide;
  quantity: number;
  price: number;
  currency: CurrencyCode;
  note?: string;
}

export interface TradeSeedFile {
  positionIds: Record<string, string>;
  quotes: Record<string, number>;
  trades: Trade[];
}
