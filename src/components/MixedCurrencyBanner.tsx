export function MixedCurrencyBanner() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-[13px] text-textMain"
    >
      <p className="font-medium text-warning">통화가 섞인 포트폴리오 (MVP 비지원)</p>
      <p className="mt-1 text-textMuted">
        §3.2에 따라 한 스냅샷에는 한 가지 통화만 두는 것이 정합합니다.         상단 요약은 한국장(KRW)과 미국장(USD)을 따로 보여 줍니다. 섹터·비중 차트는 숫자가 섞인 참고용이며, 환율 연동은 이후 버전에서
        제공 예정입니다.
      </p>
    </div>
  );
}
