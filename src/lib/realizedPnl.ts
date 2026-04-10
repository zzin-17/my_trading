import type { CurrencyCode, Market } from '../types/portfolio';
import type { Trade } from '../types/trade';
import { tradeAppliesToLedger } from './ledger';
import { KR_SELL_TAX_RATE } from './krTradingAssumptions';
import { roundMoney, roundPercent } from './portfolioMath';

/** 매도 체결 1건의 실현(세전·세후) */
export interface RealizedSellEvent {
  tradeId: string;
  date: string;
  ticker: string;
  name: string;
  market: Market;
  currency: CurrencyCode;
  quantity: number;
  /** 매도 시점 장부 평단 */
  avgCostAtSell: number;
  /** 매도 체결 단가 */
  sellPrice: number;
  /** (매도가−평단)×수량 */
  grossPnl: number;
  /** KR: 세전−(매도대금×(세금+수수료)), 그 외 세전과 동일 */
  netPnl: number;
  proceeds: number;
}

interface ReplayRow {
  quantity: number;
  avgCost: number;
  currency: CurrencyCode;
  market: Market;
  name: string;
}

function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].filter(tradeAppliesToLedger).sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

function krFrictionOnProceeds(
  proceeds: number,
  currency: CurrencyCode,
  commissionRate: number,
): number {
  return roundMoney(proceeds * (KR_SELL_TAX_RATE + commissionRate), currency);
}

/**
 * 장부와 동일한 이동평균 순서로 매도건만 추출.
 * KR 매도는 설정 수수료율 + 증거래세·농특세(0.18%)를 매도대금 기준 차감한 netPnl.
 */
export function computeRealizedSellEvents(
  trades: Trade[],
  krSellCommissionRate: number,
): RealizedSellEvent[] {
  const sorted = sortTrades(trades);
  const map = new Map<string, ReplayRow>();
  const events: RealizedSellEvent[] = [];

  for (const t of sorted) {
    let row = map.get(t.ticker);
    if (!row) {
      row = {
        quantity: 0,
        avgCost: 0,
        currency: t.currency,
        market: t.market,
        name: t.name,
      };
      map.set(t.ticker, row);
    }
    row.name = t.name;
    row.currency = t.currency;
    row.market = t.market;

    if (t.side === 'buy') {
      const q = row.quantity + t.quantity;
      row.avgCost =
        q > 0
          ? (row.quantity * row.avgCost + t.quantity * t.price) / q
          : 0;
      row.quantity = q;
      continue;
    }

    const sq = Math.min(t.quantity, row.quantity);
    if (sq <= 0) continue;

    const avgCostAtSell = row.avgCost;
    const proceeds = roundMoney(t.price * sq, t.currency);
    const grossPnl = roundMoney((t.price - avgCostAtSell) * sq, t.currency);
    const friction =
      t.market === 'KR'
        ? krFrictionOnProceeds(proceeds, t.currency, krSellCommissionRate)
        : 0;
    const netPnl = roundMoney(grossPnl - friction, t.currency);

    events.push({
      tradeId: t.id,
      date: t.date,
      ticker: t.ticker,
      name: t.name,
      market: t.market,
      currency: t.currency,
      quantity: sq,
      avgCostAtSell: roundMoney(avgCostAtSell, t.currency),
      sellPrice: roundMoney(t.price, t.currency),
      grossPnl,
      netPnl,
      proceeds,
    });

    row.quantity -= sq;
  }

  return events;
}

export type RealizedPeriodGranularity = 'day' | 'month' | 'year';

export function periodKeyForGranularity(
  date: string,
  g: RealizedPeriodGranularity,
): string {
  if (g === 'day') return date;
  if (g === 'month') return date.slice(0, 7);
  return date.slice(0, 4);
}

export interface PeriodRealizedSummaryRow {
  period: string;
  currency: CurrencyCode;
  netTotal: number;
}

/** 기간·통화별 실현손익(net) 합계, 기간 내림차순 */
export function summarizeRealizedByPeriod(
  events: RealizedSellEvent[],
  g: RealizedPeriodGranularity,
): PeriodRealizedSummaryRow[] {
  const acc = new Map<string, number>();
  const currencyByKey = new Map<string, CurrencyCode>();

  for (const e of events) {
    const p = periodKeyForGranularity(e.date, g);
    const key = `${p}\t${e.currency}`;
    acc.set(key, (acc.get(key) ?? 0) + e.netPnl);
    currencyByKey.set(key, e.currency);
  }

  const rows: PeriodRealizedSummaryRow[] = [];
  for (const [key, sum] of acc) {
    const [period, c] = key.split('\t');
    const currency = (c as CurrencyCode) || currencyByKey.get(key)!;
    rows.push({
      period,
      currency,
      netTotal: roundMoney(sum, currency),
    });
  }
  rows.sort((a, b) => b.period.localeCompare(a.period));
  return rows;
}

/** 선택한 기간·통화에 속한 매도건을 종목별로 합산 */
export interface TickerRealizedInPeriod {
  ticker: string;
  name: string;
  market: Market;
  currency: CurrencyCode;
  quantitySold: number;
  netPnl: number;
  /** 매도된 물량의 매입원가 합(= Σ 평단×수량) */
  costBasisSold: number;
  /** 가중 평균 매입단가 */
  avgBuyPrice: number;
  /** 가중 평균 매도체결가 */
  avgSellPrice: number;
  returnPct: number;
}

export function aggregateRealizedByTickerForPeriod(
  events: RealizedSellEvent[],
  period: string,
  currency: CurrencyCode,
  g: RealizedPeriodGranularity,
): TickerRealizedInPeriod[] {
  const filtered = events.filter(
    (e) =>
      e.currency === currency &&
      periodKeyForGranularity(e.date, g) === period,
  );

  type Agg = {
    name: string;
    market: Market;
    qty: number;
    net: number;
    cost: number;
    proceeds: number;
  };
  const byTicker = new Map<string, Agg>();

  for (const e of filtered) {
    const cur = byTicker.get(e.ticker) ?? {
      name: e.name,
      market: e.market,
      qty: 0,
      net: 0,
      cost: 0,
      proceeds: 0,
    };
    cur.name = e.name;
    cur.market = e.market;
    cur.qty += e.quantity;
    cur.net += e.netPnl;
    cur.cost += e.avgCostAtSell * e.quantity;
    cur.proceeds += e.sellPrice * e.quantity;
    byTicker.set(e.ticker, cur);
  }

  const out: TickerRealizedInPeriod[] = [];
  for (const [ticker, a] of byTicker) {
    const qty = a.qty;
    const costBasisSold = roundMoney(a.cost, currency);
    const netPnl = roundMoney(a.net, currency);
    const avgBuyPrice =
      qty > 0 ? roundMoney(a.cost / qty, currency) : 0;
    const avgSellPrice =
      qty > 0 ? roundMoney(a.proceeds / qty, currency) : 0;
    const returnPct =
      costBasisSold > 0
        ? roundPercent((netPnl / costBasisSold) * 100)
        : 0;
    out.push({
      ticker,
      name: a.name,
      market: a.market,
      currency,
      quantitySold: qty,
      netPnl,
      costBasisSold,
      avgBuyPrice,
      avgSellPrice,
      returnPct,
    });
  }
  out.sort((a, b) => b.netPnl - a.netPnl);
  return out;
}

export function formatPeriodLabel(
  period: string,
  g: RealizedPeriodGranularity,
): string {
  if (g === 'day') return period;
  if (g === 'month') {
    const [y, m] = period.split('-');
    if (!y || !m) return period;
    return `${y}년 ${parseInt(m, 10)}월`;
  }
  return `${period}년`;
}

/**
 * endInclusive(YYYY-MM-DD)부터 거슬러 올라가며 주말을 제외한 날짜 n개.
 * 공휴일은 반영하지 않음. 반환은 시간순(가장 과거 → 가장 최근).
 */
export function lastNWeekdayDates(endInclusive: string, n: number): string[] {
  const parts = endInclusive.split('-').map((x) => parseInt(x, 10));
  const y0 = parts[0];
  const m0 = parts[1];
  const d0 = parts[2];
  if (
    y0 === undefined ||
    m0 === undefined ||
    d0 === undefined ||
    !Number.isFinite(y0) ||
    !Number.isFinite(m0) ||
    !Number.isFinite(d0)
  ) {
    return [];
  }
  const picked: string[] = [];
  const cur = new Date(y0, m0 - 1, d0);
  let safety = 0;
  while (picked.length < n && safety < 400) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) {
      const y = cur.getFullYear();
      const mo = String(cur.getMonth() + 1).padStart(2, '0');
      const da = String(cur.getDate()).padStart(2, '0');
      picked.push(`${y}-${mo}-${da}`);
    }
    cur.setDate(cur.getDate() - 1);
    safety++;
  }
  return picked.reverse();
}

/** 막대차트용: 최근 n거래일(주말 제외)별 실현손익 net 합, 통화별 */
export interface DailyRealizedBarRow {
  date: string;
  /** 축 짧은 라벨 */
  label: string;
  krw: number;
  usd: number;
}

export function buildDailyRealizedBarRows(
  events: RealizedSellEvent[],
  endInclusive: string,
  tradingDayCount: number,
): DailyRealizedBarRow[] {
  const days = lastNWeekdayDates(endInclusive, tradingDayCount);
  const krwByDay = new Map<string, number>();
  const usdByDay = new Map<string, number>();
  for (const d of days) {
    krwByDay.set(d, 0);
    usdByDay.set(d, 0);
  }
  for (const e of events) {
    if (!krwByDay.has(e.date)) continue;
    if (e.currency === 'KRW') {
      krwByDay.set(e.date, (krwByDay.get(e.date) ?? 0) + e.netPnl);
    } else {
      usdByDay.set(e.date, (usdByDay.get(e.date) ?? 0) + e.netPnl);
    }
  }
  return days.map((date) => {
    const krw = roundMoney(krwByDay.get(date) ?? 0, 'KRW');
    const usd = roundMoney(usdByDay.get(date) ?? 0, 'USD');
    const seg = date.split('-');
    const m = seg[1];
    const d = seg[2];
    const label =
      m && d ? `${parseInt(m, 10)}/${parseInt(d, 10)}` : date;
    return { date, label, krw, usd };
  });
}
