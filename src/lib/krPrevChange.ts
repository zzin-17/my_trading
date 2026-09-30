import type { CurrencyCode } from '../types/portfolio';
import { formatMoney, formatPercent } from './format';

export function krChangeFromPrevClose(
  currentPrice: number,
  prevClose: number | undefined,
): { amount: number; pct: number } | null {
  if (
    prevClose === undefined ||
    !Number.isFinite(prevClose) ||
    prevClose <= 0 ||
    !Number.isFinite(currentPrice)
  ) {
    return null;
  }
  const amount = currentPrice - prevClose;
  return { amount, pct: (amount / prevClose) * 100 };
}

/** 주식앱 스타일: ▲ +₩1,450 +7.13% */
export function formatKrDayChange(
  amount: number,
  pct: number,
  currency: CurrencyCode,
): string {
  const tri = amount > 0 ? '▲' : amount < 0 ? '▼' : '─';
  const signedAmt =
    amount === 0
      ? formatMoney(0, currency)
      : `${amount > 0 ? '+' : '-'}${formatMoney(Math.abs(amount), currency)}`;
  return `${tri} ${signedAmt} ${formatPercent(pct, true)}`;
}
