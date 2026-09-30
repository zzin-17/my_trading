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

export function krChangeTriangle(amount: number): string {
  return amount > 0 ? '▲' : amount < 0 ? '▼' : '─';
}

export function formatKrChangeAmount(
  amount: number,
  currency: CurrencyCode,
): string {
  if (amount === 0) return formatMoney(0, currency);
  return `${amount > 0 ? '+' : '-'}${formatMoney(Math.abs(amount), currency)}`;
}

/** 한 줄 표기: ▼ -₩400, -0.86% */
export function formatKrDayChange(
  amount: number,
  pct: number,
  currency: CurrencyCode,
): string {
  return `${krChangeTriangle(amount)} ${formatKrChangeAmount(amount, currency)}, ${formatPercent(pct, true)}`;
}
