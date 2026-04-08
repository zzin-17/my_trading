import type { PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent } from '../lib/format';

interface MarketPairSummaryCardsProps {
  krSummary: PortfolioSummary | null;
  usSummary: PortfolioSummary | null;
}

/**
 * 전체 탭 + 통화 혼합 시: 단순 합산 대신 시장·통화별로 나눠 표시
 */
export function MarketPairSummaryCards({
  krSummary,
  usSummary,
}: MarketPairSummaryCardsProps) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-textMuted">
        통화가 달라 합산하지 않습니다. 한국장(KRW)과 미국장(USD)을 각각 확인하세요.
      </p>
      <div className="flex flex-col gap-3">
        <MarketBlock
          title="한국장"
          badge="KRW"
          accent="border-accent/40 bg-accent/5"
          summary={krSummary}
        />
        <MarketBlock
          title="미국장"
          badge="USD"
          accent="border-textMuted/40 bg-background"
          summary={usSummary}
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
}: {
  title: string;
  badge: string;
  accent: string;
  summary: PortfolioSummary | null;
}) {
  if (!summary) {
    return (
      <div
        className={`rounded-lg border px-4 py-6 text-center text-sm text-textMuted ${accent}`}
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
    <div className={`rounded-lg border px-4 py-2 ${accent}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-textMain">{title}</span>
        <span className="rounded bg-border px-2 py-0.5 text-[11px] font-semibold text-textMuted">
          {badge}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 sm:gap-x-5">
        <Mini
          label="총 투자금"
          value={formatMoney(summary.total_cost_basis, summary.currency)}
        />
        <Mini
          label="총 평가액"
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
    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <p className="text-[11px] font-medium leading-tight text-textMuted">
        {label}
      </p>
      <p
        className={`text-[13px] font-semibold leading-tight tabular-nums ${
          positive ? 'text-positive' : negative ? 'text-negative' : 'text-textMain'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
