export function MixedCurrencyBanner() {
  return (
    <div
      role="alert"
      className="rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2 text-[11px] text-textMain"
    >
      <span className="font-medium text-warning">통화 혼합 포트폴리오</span>
      <span className="ml-2 text-textMuted">
        합산 대신 KRW / USD를 분리 표시하며, 비중 차트는 참고용입니다.
      </span>
    </div>
  );
}
