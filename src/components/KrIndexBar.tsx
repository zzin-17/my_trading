import { useEffect, useState } from 'react';
import { formatKiwoomIndexQuote } from '../lib/krIndexChange';
import { fetchKrIndices, type KrIndexQuote } from '../lib/krIndexQuote';
import { krPnLTextClass } from '../lib/pnlTone';

const PLACEHOLDERS: KrIndexQuote[] = [
  { id: 'KOSPI', name: '코스피', price: Number.NaN, change: 0, changePct: 0 },
  { id: 'KOSDAQ', name: '코스닥', price: Number.NaN, change: 0, changePct: 0 },
];

function IndexCell({ quote }: { quote: KrIndexQuote }) {
  const ready = Number.isFinite(quote.price);
  if (!ready) {
    return (
      <p className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="font-medium text-textMuted">{quote.name}</span>
        <span className="text-textMuted">—</span>
      </p>
    );
  }
  const parts = formatKiwoomIndexQuote(quote.price, quote.change, quote.changePct);
  const tone = krPnLTextClass(parts.direction);
  const spoken =
    parts.direction > 0
      ? `${quote.name} ${parts.priceText}, 전일대비 상승 ${parts.changeText.replace('▲ ', '')}, ${parts.rateText}`
      : parts.direction < 0
        ? `${quote.name} ${parts.priceText}, 전일대비 하락 ${parts.changeText.replace('▼ ', '')}, ${parts.rateText}`
        : `${quote.name} ${parts.priceText}, 보합`;
  return (
    <p
      className="flex items-baseline gap-1 whitespace-nowrap tabular-nums"
      aria-label={spoken}
    >
      <span className="font-medium text-textMuted">{quote.name}</span>
      <span className={`font-semibold ${tone}`}>{parts.priceText}</span>
      <span className={tone}>{parts.changeText}</span>
      <span className={tone}>{parts.rateText}</span>
    </p>
  );
}

/** 하단 고정 바의 코스피·코스닥 한 줄. 등락은 키움 전일대비 형식. */
export function KrIndexBar() {
  const [indices, setIndices] = useState<KrIndexQuote[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const data = await fetchKrIndices();
        if (cancel) return;
        setIndices(data.indices);
        setFailed(false);
      } catch {
        if (!cancel) setFailed(true);
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, []);

  const rows = indices ?? PLACEHOLDERS;

  return (
    <div className="flex w-full items-center justify-center overflow-x-auto text-[10.5px] md:w-auto md:justify-start md:text-[12px]">
      <div
        className="flex items-center justify-center gap-x-8 md:justify-start md:gap-x-6"
        aria-label="코스피 코스닥 지수"
      >
        {rows.map((quote) => (
          <IndexCell key={quote.id} quote={quote} />
        ))}
      </div>
      {failed && indices == null ? (
        <span className="shrink-0 text-[11px] text-textMuted">지수 조회 실패</span>
      ) : null}
    </div>
  );
}
