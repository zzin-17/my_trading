import type { PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent } from '../lib/format';

interface SummaryCardsProps {
  summary: PortfolioSummary;
  /** 시세 지연·예상 손익 안내 (한국장 등) */
  quoteDisclaimer?: string | null;
}

export function SummaryCards({ summary, quoteDisclaimer }: SummaryCardsProps) {
  const { currency } = summary;
  const pnlPositive = summary.total_pnl >= 0;

  return (
    <div className="space-y-2">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[12px] font-medium text-textMuted">총 투자금</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-textMain">
          {formatMoney(summary.total_cost_basis, currency)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[12px] font-medium text-textMuted">총 평가액</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-textMain">
          {formatMoney(summary.total_market_value, currency)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[12px] font-medium text-textMuted">예상손익</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${pnlPositive ? 'text-positive' : 'text-negative'}`}
        >
          {formatMoney(summary.total_pnl, currency)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[12px] font-medium text-textMuted">예상수익률</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${pnlPositive ? 'text-positive' : 'text-negative'}`}
        >
          {formatPercent(summary.total_return_pct, true)}
        </p>
      </div>
    </div>
    {quoteDisclaimer ? (
      <p className="text-[11px] leading-relaxed text-textMuted">{quoteDisclaimer}</p>
    ) : null}
    </div>
  );
}
