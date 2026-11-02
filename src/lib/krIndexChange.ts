const indexNumber = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface KiwoomIndexQuoteParts {
  priceText: string;
  /** 상승 ▲ 128.34, 하락 ▼ 9.98, 보합 0.00 */
  changeText: string;
  /** +2.24% / -1.38% / 0.00% */
  rateText: string;
  /** 1 상승, -1 하락, 0 보합 */
  direction: 1 | 0 | -1;
}

/**
 * 키움 시장종합·현재가와 같은 등락 표기.
 * 전일대비는 방향 화살표와 절대값(소수 둘째 자리)이고, 등락률만 부호를 붙인다.
 * 보합은 화살표 없이 0.00, 0.00%.
 */
export function formatKiwoomIndexQuote(
  price: number,
  change: number,
  changePct: number,
): KiwoomIndexQuoteParts {
  const direction: 1 | 0 | -1 =
    !Number.isFinite(change) || Math.abs(change) < 0.005
      ? 0
      : change > 0
        ? 1
        : -1;
  const priceText = indexNumber.format(price);
  if (direction === 0) {
    return {
      priceText,
      changeText: indexNumber.format(0),
      rateText: '0.00%',
      direction,
    };
  }
  const absChange = indexNumber.format(Math.abs(change));
  const absPct = Math.abs(changePct).toFixed(2);
  return {
    priceText,
    changeText: direction > 0 ? `▲ ${absChange}` : `▼ ${absChange}`,
    rateText: direction > 0 ? `+${absPct}%` : `-${absPct}%`,
    direction,
  };
}
