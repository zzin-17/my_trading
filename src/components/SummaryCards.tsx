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
    <div className="space-y-1.5">
      <div className="rounded-lg border border-border/70 bg-surface md:hidden">
        <div className="px-4 py-2.5">
          <p className="text-[13px] font-semibold text-textMain">총평가손익(예상)</p>
          <div className="mt-1.5 text-right">
            <p
              className={`max-w-full text-[clamp(20px,7vw,30px)] font-bold tabular-nums leading-none ${pnlPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatMoney(summary.total_pnl, currency)}
            </p>
            <p
              className={`mt-1 text-[14px] font-semibold tabular-nums leading-none ${pnlPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatPercent(summary.total_return_pct, true)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border/60">
          <CompactSummaryCell
            label="총 평가액"
            value={formatMoney(summary.total_market_value, currency)}
          />
          <CompactSummaryCell
            label="총 투자금"
            value={formatMoney(summary.total_cost_basis, currency)}
            bordered
          />
        </div>
      </div>

      <div className="hidden rounded-xl border border-border/60 bg-surface/50 px-3 py-2.5 md:block">
        <div className="grid grid-cols-4 gap-0">
          <DesktopSummaryStat
            label="투자금"
            value={formatMoney(summary.total_cost_basis, currency)}
          />
          <DesktopSummaryStat
            label="평가액"
            value={formatMoney(summary.total_market_value, currency)}
            bordered
          />
          <DesktopSummaryStat
            label="평가손익"
            value={formatMoney(summary.total_pnl, currency)}
            tone={pnlPositive ? 'pos' : 'neg'}
            bordered
            strong
          />
          <DesktopSummaryStat
            label="수익률"
            value={formatPercent(summary.total_return_pct, true)}
            tone={pnlPositive ? 'pos' : 'neg'}
            bordered
          />
        </div>
      </div>
      {quoteDisclaimer ? (
        <>
          <p className="hidden text-[10px] leading-relaxed text-textMuted md:block">
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

function DesktopSummaryStat({
  label,
  value,
  tone,
  bordered = false,
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  bordered?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`min-w-0 px-3 py-1 ${bordered ? 'border-l border-border/60' : ''}`}>
      <p className="text-[11px] font-medium tracking-tight text-textMuted">{label}</p>
      <p
        className={`mt-1 truncate tabular-nums ${
          strong ? 'text-[22px] font-bold' : 'text-[18px] font-semibold'
        } ${
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
    <div className={`px-4 py-2.5 ${bordered ? 'border-l border-border/70' : ''}`}>
      <p className="text-[12px] font-medium text-textMuted">{label}</p>
      <p
        className={`mt-0.5 text-[15px] font-semibold tabular-nums ${
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
