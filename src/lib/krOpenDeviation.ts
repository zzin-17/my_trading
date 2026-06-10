import type { Market } from '../types/portfolio';

/** 시가 대비 현재가 변동률(%) 절댓값이 이 값 이상이면 보유표에서 주목 표시 */
export const KR_OPEN_ATTENTION_ABS_PCT = 7;

export function isKrOpenAttention(
  market: Market,
  ticker: string,
  currentPrice: number,
  dayOpen: number | undefined,
): boolean {
  if (market !== 'KR' || !/^[A-Z0-9]{6}$/.test(ticker.replace(/\s/g, '').toUpperCase())) {
    return false;
  }
  if (
    dayOpen === undefined ||
    !Number.isFinite(dayOpen) ||
    dayOpen <= 0 ||
    !Number.isFinite(currentPrice)
  ) {
    return false;
  }
  const pct = ((currentPrice - dayOpen) / dayOpen) * 100;
  return Math.abs(pct) >= KR_OPEN_ATTENTION_ABS_PCT;
}

/** 시가 대비 등락률(%) — 표시·툴팁용 */
export function krOpenDeviationPct(
  currentPrice: number,
  dayOpen: number,
): number {
  return ((currentPrice - dayOpen) / dayOpen) * 100;
}
