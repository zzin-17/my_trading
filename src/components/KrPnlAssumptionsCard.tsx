import {
  clampKrSellCommissionRate,
  KR_SELL_TAX_RATE,
} from '../lib/krTradingAssumptions';

interface KrPnlAssumptionsCardProps {
  krSellCommissionRate: number;
  onKrSellCommissionRateChange: (rate: number) => void;
  krPreferExtendedQuote: boolean;
  onKrPreferExtendedQuoteChange: (value: boolean) => void;
}

/**
 * 한국장 예상손익·실현손익·시세 갱신에 쓰는 가정을 한곳에 모은 카드.
 */
export function KrPnlAssumptionsCard({
  krSellCommissionRate,
  onKrSellCommissionRateChange,
  krPreferExtendedQuote,
  onKrPreferExtendedQuoteChange,
}: KrPnlAssumptionsCardProps) {
  const taxPct = (KR_SELL_TAX_RATE * 100).toFixed(2);
  const commPct = (krSellCommissionRate * 100).toFixed(3);

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-surface/40 px-3 py-2.5 text-[12px] text-textMuted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[13px] font-semibold text-textMain">
          한국장 손익·시세 가정
        </p>
        <p className="text-[11px] leading-snug text-textMuted">
          세금 <span className="tabular-nums text-textMain">{taxPct}%</span> + 수수료{' '}
          <span className="tabular-nums text-textMain">{commPct}%</span> 반영
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-3">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap font-medium text-textMain">
            위탁 수수료율 (%)
          </span>
          <input
            type="number"
            min={0.01}
            max={0.15}
            step={0.005}
            value={krSellCommissionRate * 100}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              onKrSellCommissionRateChange(clampKrSellCommissionRate(v / 100));
            }}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums text-textMain outline-none focus:border-accent"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={krPreferExtendedQuote}
            onChange={(e) => onKrPreferExtendedQuoteChange(e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-textMain">시세 갱신 시 장외(Over·NXT) 호가 우선</span>
        </label>
      </div>
      <p className="border-t border-border/50 pt-2 text-[10px] leading-snug">
        장외 우선 시 모바일 시세를 먼저 보고, 없으면 PC 지연 시세로 대체합니다.
      </p>
    </div>
  );
}
