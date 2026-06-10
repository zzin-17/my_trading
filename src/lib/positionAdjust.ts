import type { Trade } from '../types/trade';
import { computeLedger } from './ledger';
import { tradeAppliesToLedger } from './ledger';
import { roundMoney } from './portfolioMath';

/** 해당 티커의 「초기보유」(매매일지 제외) 거래만 뺀 목록 */
export function withoutOpeningBalanceForTicker(
  trades: readonly Trade[],
  ticker: string,
): Trade[] {
  return trades.filter((t) => !(t.ticker === ticker && t.excludeFromJournal));
}

export type OpeningAdjustResult =
  | { ok: true; trades: Trade[] }
  | { ok: false; message: string };

/**
 * 매매일지 거래는 유지하고, 초기보유 매수 1건으로 (수량·평단) 목표에 맞춘다.
 * 초기보유를 가장 이른 시점의 매수 1건으로 두고, 이후 일지 체결이 적용된 뒤의
 * 최종 수량·평단이 목표(Q, A)가 되도록 초기보유 qO·단가를 역산한다.
 */
export function adjustOpeningBalanceTrade(
  trades: readonly Trade[],
  ticker: string,
  targetQty: number,
  targetAvg: number,
  patch: Pick<Trade, 'name' | 'sector' | 'market' | 'currency'>,
): OpeningAdjustResult {
  const currency = patch.currency;
  if (!Number.isInteger(targetQty) || targetQty <= 0) {
    return { ok: false, message: '보유수량은 1 이상의 정수여야 합니다.' };
  }
  if (!Number.isFinite(targetAvg) || targetAvg <= 0) {
    return { ok: false, message: '평단은 0보다 커야 합니다.' };
  }

  const tradesWithoutOpening = withoutOpeningBalanceForTicker(trades, ticker);
  const tickerTrades = tradesWithoutOpening
    .filter((t) => t.ticker === ticker && tradeAppliesToLedger(t))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
  const targetAvgR = roundMoney(targetAvg, currency);
  const journalNetQty = tickerTrades.reduce(
    (sum, t) => sum + (t.side === 'buy' ? t.quantity : -t.quantity),
    0,
  );
  const qO = targetQty - journalNetQty;

  if (qO < 0) {
    return {
      ok: false,
      message:
        '현재 매매일지 체결만으로 이미 목표 수량을 초과합니다. 일지를 먼저 조정한 뒤 다시 시도하세요.',
    };
  }

  let qty = qO;
  let coeff = qO > 0 ? 1 : 0;
  let offset = 0;

  for (const t of tickerTrades) {
    if (t.side === 'buy') {
      const nextQty = qty + t.quantity;
      coeff = nextQty > 0 ? (qty * coeff) / nextQty : 0;
      offset = nextQty > 0 ? (qty * offset + t.quantity * t.price) / nextQty : 0;
      qty = nextQty;
      continue;
    }
    if (t.quantity > qty + 0.0001) {
      return {
        ok: false,
        message:
          '현재 매매일지 순서 기준으로는 해당 보유수량을 만들 수 없습니다. 먼저 매도/매수 체결 내역을 확인해 주세요.',
      };
    }
    qty -= t.quantity;
  }

  if (Math.abs(qty - targetQty) > 0.0001) {
    return { ok: false, message: '보유수량 계산이 맞지 않습니다. 잠시 후 다시 시도해 주세요.' };
  }

  if (qO === 0 || Math.abs(coeff) <= 1e-9) {
    const journalAvg = roundMoney(offset, currency);
    if (Math.abs(journalAvg - targetAvgR) > 0.0001) {
      return {
        ok: false,
        message:
          '현재 체결 내역만으로 결정되는 평단과 다릅니다. 평단을 바꾸려면 보유수량을 늘리거나 일지를 조정하세요.',
      };
    }
    return { ok: true, trades: [...tradesWithoutOpening] };
  }

  const pO = (targetAvgR - offset) / coeff;
  if (!Number.isFinite(pO) || pO <= 0) {
    return { ok: false, message: '계산된 초기보유 단가가 0 이하입니다. 평단·수량을 다시 확인하세요.' };
  }

  const opening: Trade = {
    id: `tr-ob-${Date.now()}`,
    date: '1900-01-01',
    ticker,
    name: patch.name,
    sector: patch.sector,
    market: patch.market,
    currency,
    side: 'buy',
    quantity: qO,
    price: roundMoney(pO, currency),
    excludeFromJournal: true,
    note: '초기보유(일지 제외)',
  };

  const nextTrades = [...tradesWithoutOpening, opening];
  const nextLedger = computeLedger(nextTrades);
  const nextRow = nextLedger.get(ticker);
  if (
    !nextRow ||
    nextRow.quantity !== targetQty ||
    Math.abs(roundMoney(nextRow.avgCost, currency) - targetAvgR) > 0.0001
  ) {
    return {
      ok: false,
      message:
        '현재 체결 내역 기준으로는 입력한 수량·평단을 정확히 만들 수 없습니다. 값을 다시 확인해 주세요.',
    };
  }

  return {
    ok: true,
    trades: nextTrades,
  };
}
