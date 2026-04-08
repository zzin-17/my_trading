export function MixedCurrencyBanner() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-[13px] text-textMain"
    >
      <p className="font-medium text-warning">통화가 섞인 포트폴리오 (MVP 비지원)</p>
      <p className="mt-1 text-textMuted">
        §3.2에 따라 한 스냅샷에는 한 가지 통화만 두는 것이 정합합니다. 데이터를 한 통화로
        맞추거나, 이후 버전의 기준 통화·환율 기능을 사용하세요. 지금 표시되는 합계·비중은
        참고용입니다.
      </p>
    </div>
  );
}
