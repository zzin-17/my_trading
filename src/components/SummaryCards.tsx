import type { PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent } from '../lib/format';
import { ExpandableText } from './ExpandableText';

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
      <div className="rounded-lg border border-border bg-surface md:hidden">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <p className="text-[13px] font-semibold text-textMain">총 평가손익</p>
          <div className="text-right">
            <p
              className={`text-[24px] font-bold tabular-nums leading-none ${pnlPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatMoney(summary.total_pnl, currency)}
            </p>
            <p
              className={`mt-1 text-[14px] font-semibold tabular-nums ${pnlPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatPercent(summary.total_return_pct, true)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border/70">
          <CompactSummaryCell
            label="총 평가액"
            value={formatMoney(summary.total_market_value, currency)}
          />
          <CompactSummaryCell
            label="총 투자금"
            value={formatMoney(summary.total_cost_basis, currency)}
            bordered
          />
          <CompactSummaryCell
            label="예상손익"
            value={formatMoney(summary.total_pnl, currency)}
            tone={pnlPositive ? 'pos' : 'neg'}
          />
          <CompactSummaryCell
            label="예상수익률"
            value={formatPercent(summary.total_return_pct, true)}
            tone={pnlPositive ? 'pos' : 'neg'}
            bordered
          />
        </div>
      </div>

      <div className="hidden grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:grid">
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
        <>
          <p className="hidden text-[11px] leading-relaxed text-textMuted md:block">
            {quoteDisclaimer}
          </p>
          <ExpandableText
            text={quoteDisclaimer}
            maxChars={30}
            className="md:hidden"
            textClassName="text-[11px] leading-relaxed text-textMuted"
          />
        </>
      ) : null}
    </div>
  );
}

function CompactSummaryCell({
  label,
  value,
  tone,
  bordered = false,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  bordered?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${bordered ? 'border-l border-border/70' : ''}`}>
      <p className="text-[12px] font-medium text-textMuted">{label}</p>
      <p
        className={`mt-1 text-[16px] font-semibold tabular-nums ${
          tone === 'pos'
            ? 'text-positive'
            : tone === 'neg'
              ? 'text-negative'
              : 'text-textMain'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
