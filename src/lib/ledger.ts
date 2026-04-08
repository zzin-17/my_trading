import type { Position } from '../types/portfolio';
import type { Trade } from '../types/trade';
import { roundMoney } from './portfolioMath';

/** 티커별 장부 상태 (이동평균 단가·잔여수량·누적실현손익) */
export interface LedgerRow {
  ticker: string;
  quantity: number;
  avgCost: number;
  realizedPnl: number;
  currency: Position['currency'];
  market: Position['market'];
  name: string;
  sector: string;
}

/**
 * 매수·매도를 날짜·id 순으로 적용한다.
 * 매도: 단가는 매도 체결가, 잔여 평단은 매도 전과 동일(이동평균법).
 */
export function computeLedger(trades: Trade[]): Map<string, LedgerRow> {
  const sorted = [...trades].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  const map = new Map<string, LedgerRow>();

  for (const t of sorted) {
    let row = map.get(t.ticker);
    if (!row) {
      row = {
        ticker: t.ticker,
        quantity: 0,
        avgCost: 0,
        realizedPnl: 0,
        currency: t.currency,
        market: t.market,
        name: t.name,
        sector: t.sector,
      };
      map.set(t.ticker, row);
    }

    row.name = t.name;
    row.sector = t.sector;
    row.currency = t.currency;
    row.market = t.market;

    if (t.side === 'buy') {
      const q = row.quantity + t.quantity;
      row.avgCost =
        q > 0
          ? (row.quantity * row.avgCost + t.quantity * t.price) / q
          : 0;
      row.quantity = q;
    } else {
      const sq = Math.min(t.quantity, row.quantity);
      row.realizedPnl += (t.price - row.avgCost) * sq;
      row.quantity -= sq;
    }
  }

  return map;
}

export function ledgerToPositions(
  ledger: Map<string, LedgerRow>,
  quotes: Record<string, number>,
  positionIds: Record<string, string>,
): Position[] {
  const out: Position[] = [];
  for (const row of ledger.values()) {
    if (row.quantity <= 0) continue;
    const raw = quotes[row.ticker];
    const current_price =
      raw !== undefined && Number.isFinite(raw)
        ? roundMoney(raw, row.currency)
        : roundMoney(row.avgCost, row.currency);
    out.push({
      id: positionIds[row.ticker] ?? row.ticker,
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      quantity: row.quantity,
      avg_price: roundMoney(row.avgCost, row.currency),
      current_price,
      currency: row.currency,
      market: row.market,
    });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
