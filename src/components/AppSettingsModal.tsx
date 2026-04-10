import { useEffect } from 'react';

interface AppSettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** 샘플 시드로 복구 */
  onConfirmResetSample: () => void;
  /** KRX 목록으로 한국장 종목명·섹터 보정 */
  onSyncKrxSectors: () => void | Promise<void>;
  krxSectorSyncing: boolean;
  /** 매매·보유·시세 등 전부 비우기 */
  onConfirmClearHoldings: () => void;
}

export function AppSettingsModal({
  open,
  onClose,
  onConfirmResetSample,
  onSyncKrxSectors,
  krxSectorSyncing,
  onConfirmClearHoldings,
}: AppSettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
        aria-label="설정 닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative z-[101] max-h-[min(90vh,32rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <h2
          id="settings-modal-title"
          className="text-base font-semibold text-textMain"
        >
          설정
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-textMuted">
          동기화·초기화처럼 자주 쓰지 않는 작업을 모아 두었습니다. 위험한 작업은
          확인 창이 뜹니다.
        </p>

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">동기화</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-textMuted">
            KRX 상장목록에 맞춰 한국장 거래의 종목명·섹터(업종)를 덮어씁니다.
          </p>
          <button
            type="button"
            disabled={krxSectorSyncing}
            onClick={() => void onSyncKrxSectors()}
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
          >
            {krxSectorSyncing ? '섹터 동기화 중…' : 'KRX 기준 섹터·종목명 동기화'}
          </button>
        </section>

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">초기화</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-textMuted">
            보유종목 초기화는 매매일지·시세·메모·할 일까지 모두 지우고 빈
            포트폴리오로 만듭니다. 샘플 초기화는 예시 데이터로 채웁니다.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    '모든 매매일지·보유·시세·메모·할 일을 지웁니다. 빈 포트폴리오가 되며 복구할 수 없습니다. 계속할까요?',
                  )
                ) {
                  onConfirmClearHoldings();
                  onClose();
                }
              }}
              className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2.5 text-left text-[13px] font-medium text-negative hover:bg-negative/15"
            >
              보유종목 초기화 (전체 기록 삭제)
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    '저장된 매매일지·시세를 지우고 샘플 데이터로 돌아갑니다. 계속할까요?',
                  )
                ) {
                  onConfirmResetSample();
                  onClose();
                }
              }}
              className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2.5 text-left text-[13px] font-medium text-negative hover:bg-negative/15"
            >
              샘플로 초기화
            </button>
          </div>
        </section>

        <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
