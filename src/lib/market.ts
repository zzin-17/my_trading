import type { CurrencyCode, Market, Position } from '../types/portfolio';

/** JSON 등에서 `market` 생략 시 티커로 추론: 6자리 숫자 → 한국, 그 외 → 미국 */
export function inferMarketFromTicker(ticker: string): Market {
  const t = ticker.trim();
  if (/^\d{6}$/.test(t)) return 'KR';
  return 'US';
}

export function defaultCurrencyForMarket(market: Market): CurrencyCode {
  return market === 'KR' ? 'KRW' : 'USD';
}

/** `market`이 없으면 티커로 채운 완전한 `Position` */
export function normalizePosition(
  p: Omit<Position, 'market'> & { market?: Market },
): Position {
  const market = p.market ?? inferMarketFromTicker(p.ticker);
  return { ...p, market };
}

export function normalizePositions(
  positions: (Omit<Position, 'market'> & { market?: Market })[],
): Position[] {
  return positions.map(normalizePosition);
}

export function filterByMarket(
  positions: Position[],
  tab: 'all' | Market,
): Position[] {
  if (tab === 'all') return positions;
  return positions.filter((p) => p.market === tab);
}

/** 할 일·보유 행 등에서 동일 종목인지 비교 (KR 공백 무시, US 대문자) */
export function tickersEqual(a: string, b: string, market: Market): boolean {
  const na =
    market === 'KR' ? a.replace(/\s/g, '').trim() : a.trim().toUpperCase();
  const nb =
    market === 'KR' ? b.replace(/\s/g, '').trim() : b.trim().toUpperCase();
  return na === nb;
}
