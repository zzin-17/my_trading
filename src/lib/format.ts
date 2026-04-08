import type { CurrencyCode } from '../types/portfolio';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const krw = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number, currency: CurrencyCode): string {
  return currency === 'KRW' ? krw.format(amount) : usd.format(amount);
}

export function formatPercent(value: number, signed = false): string {
  const s = `${value >= 0 && signed ? '+' : ''}${value.toFixed(2)}%`;
  return s;
}
