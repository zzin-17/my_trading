import type { PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent } from '../lib/format';
import { ExpandableText } from './ExpandableText';

interface MarketPairSummaryCardsProps {
  krSummary: PortfolioSummary | null;
  usSummary: PortfolioSummary | null;
  /** 한국장 블록 아래 표시할 비용 가정 안내 */
  krFootnote?: string | null;
}

/**
 * 전체 탭 + 통화 혼합 시: 단순 합산 대신 시장·통화별로 나눠 표시
 */
export function MarketPairSummaryCards({
  krSummary,
  usSummary,
  krFootnote,
}: MarketPairSummaryCardsProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-textMuted">
        통화가 달라 합산 대신 KRW / USD를 나눠 표시합니다.
      </p>
      <div className="flex flex-col gap-2.5">
        <MarketBlock
          title="한국장"
          badge="KRW"
          accent="border-accent/40 bg-accent/5"
          summary={krSummary}
          footnote={krFootnote}
        />
        <MarketBlock
          title="미국장"
          badge="USD"
          accent="border-textMuted/40 bg-background"
          summary={usSummary}
          footnote={null}
        />
      </div>
    </div>
  );
}

function MarketBlock({
  title,
  badge,
  accent,
  summary,
  footnote,
}: {
  title: string;
  badge: string;
  accent: string;
  summary: PortfolioSummary | null;
  footnote?: string | null;
}) {
  if (!summary) {
    return (
      <div
        className={`rounded-xl border px-4 py-3 text-center text-sm text-textMuted ${accent}`}
      >
        <div className="mb-1 flex items-center justify-center gap-2">
          <span className="font-medium text-textMain">{title}</span>
          <span className="rounded bg-border px-1.5 py-0.5 text-[10px] font-semibold text-textMuted">
            {badge}
          </span>
        </div>
        보유 종목 없음
      </div>
    );
  }

  const pnlOk = summary.total_pnl >= 0;

  return (
    <div className={`rounded-xl border px-4 py-2.5 ${accent}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-textMain">{title}</span>
        <span className="rounded bg-border px-2 py-0.5 text-[11px] font-semibold text-textMuted">
          {badge}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 md:hidden">
        <Mini
          label="평가액"
          value={formatMoney(summary.total_market_value, summary.currency)}
        />
        <Mini
          label="투자금"
          value={formatMoney(summary.total_cost_basis, summary.currency)}
        />
        <Mini
          label="손익"
          value={formatMoney(summary.total_pnl, summary.currency)}
          positive={pnlOk}
          negative={!pnlOk}
        />
        <Mini
          label="수익률"
          value={formatPercent(summary.total_return_pct, true)}
          positive={pnlOk}
          negative={!pnlOk}
        />
      </div>
      <div className="hidden grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4 sm:gap-x-5 md:grid">
        <Mini
          label="투자금"
          value={formatMoney(summary.total_cost_basis, summary.currency)}
        />
        <Mini
          label="평가액"
          value={formatMoney(summary.total_market_value, summary.currency)}
        />
        <Mini
          label="평가손익"
          value={formatMoney(summary.total_pnl, summary.currency)}
          positive={pnlOk}
          negative={!pnlOk}
        />
        <Mini
          label="수익률"
          value={formatPercent(summary.total_return_pct, true)}
          positive={pnlOk}
          negative={!pnlOk}
        />
      </div>
      {footnote ? (
        <>
          <p className="mt-1.5 hidden text-[10px] leading-relaxed text-textMuted md:block">
            {footnote}
          </p>
          <ExpandableText
            text={footnote}
            maxChars={30}
            className="mt-1.5 md:hidden"
            textClassName="text-[11px] leading-relaxed text-textMuted"
          />
        </>
      ) : null}
    </div>
  );
}

function Mini({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 whitespace-nowrap">
      <p className="text-[11px] font-medium leading-tight text-textMuted">
        {label}
      </p>
      <p
        className={`text-[12px] font-semibold leading-tight tabular-nums ${
          positive ? 'text-positive' : negative ? 'text-negative' : 'text-textMain'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
