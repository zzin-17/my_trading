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
    <div className="space-y-3 rounded-lg border border-border/80 bg-surface/60 px-3 py-2.5 text-[12px] text-textMuted">
      <div>
        <p className="text-[13px] font-semibold text-textMain">
          한국장 손익·시세 가정
        </p>
        <p className="mt-1 leading-snug">
          아래 비율은 <span className="text-textMain">요약 카드·보유 종목·매매일지(종목
          요약)·실현손익(패널·최근 거래일 차트)</span>에 동일하게 적용됩니다. 매도
          금액 기준으로 증권거래세+농특세 <span className="tabular-nums">{taxPct}%</span>와
          위탁 수수료 <span className="tabular-nums">{commPct}%</span>(설정)을 빼고,
          매수 수수료는 평단에 넣지 않은 값으로 따로 차감하지 않습니다.
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
      <p className="border-t border-border/50 pt-2 text-[11px] leading-snug">
        장외 우선 시 네이버 모바일 API를 쓰고, 없으면 PC 지연 시세로 넘깁니다. KRX
        시간외 단일가 표시와 숫자가 다를 수 있습니다.
      </p>
    </div>
  );
}
