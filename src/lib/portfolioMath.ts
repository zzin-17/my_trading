import {
  CONCENTRATION_WARNING_PCT,
  type CurrencyCode,
  type Market,
  type Position,
  type PositionMetrics,
  type PortfolioSummary,
  type SectorWeight,
  type StockWeight,
  type TopStockWeightsResult,
} from '../types/portfolio';
import {
  DEFAULT_KR_SELL_COMMISSION_RATE,
  KR_SELL_TAX_RATE,
} from './krTradingAssumptions';

export function roundMoney(value: number, currency: CurrencyCode): number {
  if (currency === 'KRW') return Math.round(value);
  return Math.round(value * 100) / 100;
}

export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 평가손익: (현재가×수량) − (평단×수량) − 예상비용
 * - 한국장 예상비용: 매도금액 × (증거래세+농특세 0.18% + 위탁수수료율)
 * - 미국장: 예상비용 없음(기존 단순 손익)
 */
export function estimateNetUnrealizedPnl(
  market: Market,
  avgPrice: number,
  currentPrice: number,
  quantity: number,
  currency: CurrencyCode,
  krSellCommissionRate: number,
): number {
  const cost_basis = roundMoney(avgPrice * quantity, currency);
  const proceeds = roundMoney(currentPrice * quantity, currency);
  if (market === 'KR') {
    const exitRate = KR_SELL_TAX_RATE + krSellCommissionRate;
    const exitCosts = roundMoney(proceeds * exitRate, currency);
    return roundMoney(proceeds - cost_basis - exitCosts, currency);
  }
  return roundMoney(proceeds - cost_basis, currency);
}

export interface BuildPositionMetricsOptions {
  /** 한국장 매도 위탁 수수료율(소수). 미주면 기본값 */
  krSellCommissionRate?: number;
}

export function buildPositionMetrics(
  positions: Position[],
  options?: BuildPositionMetricsOptions,
): PositionMetrics[] {
  const comm =
    options?.krSellCommissionRate ?? DEFAULT_KR_SELL_COMMISSION_RATE;
  const rows: Omit<PositionMetrics, 'weight_pct'>[] = positions.map((p) => ({
    positionId: p.id,
    cost_basis: roundMoney(p.avg_price * p.quantity, p.currency),
    market_value: roundMoney(p.current_price * p.quantity, p.currency),
    pnl: estimateNetUnrealizedPnl(
      p.market,
      p.avg_price,
      p.current_price,
      p.quantity,
      p.currency,
      comm,
    ),
  }));

  const totalMv = rows.reduce((s, r) => s + r.market_value, 0);

  return rows.map((r) => ({
    ...r,
    weight_pct:
      totalMv > 0 ? roundPercent((r.market_value / totalMv) * 100) : 0,
  }));
}

export function buildPortfolioSummary(
  positions: Position[],
  metrics: PositionMetrics[],
): PortfolioSummary {
  const currency = positions[0]?.currency ?? 'USD';
  const total_cost_basis = metrics.reduce((s, m) => s + m.cost_basis, 0);
  const total_market_value = metrics.reduce((s, m) => s + m.market_value, 0);
  const total_pnl = metrics.reduce((s, m) => s + m.pnl, 0);
  const total_return_pct =
    total_cost_basis > 0
      ? roundPercent((total_pnl / total_cost_basis) * 100)
      : 0;

  return {
    currency,
    total_cost_basis: roundMoney(total_cost_basis, currency),
    total_market_value: roundMoney(total_market_value, currency),
    total_pnl: roundMoney(total_pnl, currency),
    total_return_pct,
  };
}

export function buildSectorWeights(
  positions: Position[],
  metrics: PositionMetrics[],
): SectorWeight[] {
  const map = new Map<string, number>();
  positions.forEach((p, i) => {
    const mv = metrics[i]?.market_value ?? 0;
    map.set(p.sector, (map.get(p.sector) ?? 0) + mv);
  });
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([sector, market_value]) => ({
      sector,
      market_value,
      weight_pct:
        total > 0 ? roundPercent((market_value / total) * 100) : 0,
    }))
    .sort((a, b) => b.weight_pct - a.weight_pct);
}

export function buildTopStockWeights(
  positions: Position[],
  metrics: PositionMetrics[],
  topN: number = 10,
): TopStockWeightsResult {
  const items: StockWeight[] = positions.map((p, i) => ({
    ticker: p.ticker,
    name: p.name,
    market_value: metrics[i]?.market_value ?? 0,
    weight_pct: metrics[i]?.weight_pct ?? 0,
  }));

  items.sort((a, b) => b.market_value - a.market_value);

  const top = items.slice(0, topN);
  const rest = items.slice(topN);

  if (rest.length === 0) {
    return { top, others: null };
  }

  const totalMv = items.reduce((s, x) => s + x.market_value, 0);
  const othersMv = rest.reduce((s, x) => s + x.market_value, 0);
  const others: StockWeight = {
    ticker: 'OTHERS',
    name: 'Others',
    market_value: roundMoney(othersMv, positions[0]?.currency ?? 'USD'),
    weight_pct:
      totalMv > 0 ? roundPercent((othersMv / totalMv) * 100) : 0,
  };

  return { top, others };
}

export function isConcentrationRisk(weightPct: number): boolean {
  return weightPct >= CONCENTRATION_WARNING_PCT;
}

/**
 * §3.2 단일 통화: 모든 포지션이 같은 currency면 그 값, 아니면 null.
 */
export function getUnifiedPortfolioCurrency(
  positions: Position[],
): CurrencyCode | null {
  if (positions.length === 0) return null;
  const first = positions[0].currency;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].currency !== first) return null;
  }
  return first;
}
