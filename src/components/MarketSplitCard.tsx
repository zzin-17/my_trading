import type { Market } from '../types/portfolio';
import { roundPercent } from '../lib/portfolioMath';

interface MarketSplitCardProps {
  /** 평가액 기준 (통화 혼합이면 참고용) */
  weights: Record<Market, number>;
}

export function MarketSplitCard({ weights }: MarketSplitCardProps) {
  const kr = roundPercent(weights.KR ?? 0);
  const us = roundPercent(weights.US ?? 0);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const krW = clamp(kr);
  const usW = clamp(us);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-textMain">시장별 비중 (KR / US)</h3>
      <p className="mt-0.5 text-[12px] text-textMuted">평가액 기준 비중</p>

      <div className="mt-4 space-y-3">
        <Row label="한국장" code="KR" pct={kr} color="bg-accent" widthPct={krW} />
        <Row label="미국장" code="US" pct={us} color="bg-textMuted" widthPct={usW} />
      </div>
    </div>
  );
}

function Row({
  label,
  code,
  pct,
  color,
  widthPct,
}: {
  label: string;
  code: string;
  pct: number;
  color: string;
  widthPct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-semibold text-textMuted">
            {code}
          </span>
          <span className="text-[12px] font-medium text-textMain">{label}</span>
        </div>
        <span className="tabular-nums text-[12px] font-semibold text-textMain">
          {pct.toFixed(2)}%
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded bg-background">
        <div className={`h-2 rounded ${color}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

