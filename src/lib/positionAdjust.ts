import type { Trade } from '../types/trade';
import { computeLedger } from './ledger';
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
 * 일지만으로 결정되는 잔여 수량·평단(qR, aR)과 목표(Q, A)의 차이를 초기보유 qO·단가로 메운다.
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

  const residual = computeLedger(withoutOpeningBalanceForTicker(trades, ticker));
  const row = residual.get(ticker);
  const qR = row && row.quantity > 0 ? row.quantity : 0;
  const aR = row && row.quantity > 0 ? row.avgCost : 0;

  const targetAvgR = roundMoney(targetAvg, currency);
  const qO = targetQty - qR;

  if (qO < 0) {
    return {
      ok: false,
      message: `매매일지상 잔여 ${qR}주보다 적게 설정할 수 없습니다. 일지에서 매도·정리 후 다시 시도하세요.`,
    };
  }

  if (qO === 0) {
    const ledgerAvg = roundMoney(aR, currency);
    if (Math.abs(ledgerAvg - targetAvgR) > 0.0001) {
      return {
        ok: false,
        message:
          '일지상 수량과 같습니다. 이 경우 평단은 매매일지 누적 결과와 같아야 합니다. 평단을 바꾸려면 수량을 늘리거나 일지를 조정하세요.',
      };
    }
    return { ok: true, trades: [...withoutOpeningBalanceForTicker(trades, ticker)] };
  }

  const numer = targetQty * targetAvgR - qR * aR;
  if (numer <= 0) {
    return {
      ok: false,
      message: '계산된 초기보유 단가가 0 이하입니다. 평단·수량을 다시 확인하세요.',
    };
  }
  const pO = numer / qO;
  if (!Number.isFinite(pO) || pO <= 0) {
    return { ok: false, message: '유효하지 않은 평단·수량 조합입니다.' };
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

  return {
    ok: true,
    trades: [...withoutOpeningBalanceForTicker(trades, ticker), opening],
  };
}
