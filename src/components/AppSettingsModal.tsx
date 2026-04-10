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
  /** VITE_FIREBASE_* 설정 시에만 true */
  firebaseCloudEnabled?: boolean;
  cloudAuthReady?: boolean;
  cloudUserEmail?: string | null;
  cloudBusy?: boolean;
  cloudSessionReady?: boolean;
  cloudError?: string | null;
  onCloudSignIn?: () => void | Promise<void>;
  onCloudSignOut?: () => void | Promise<void>;
  onCloudPushNow?: () => void | Promise<void>;
  onExportPortfolio?: () => void;
  onImportPortfolioPick?: () => void;
}

export function AppSettingsModal({
  open,
  onClose,
  onConfirmResetSample,
  onSyncKrxSectors,
  krxSectorSyncing,
  onConfirmClearHoldings,
  firebaseCloudEnabled = false,
  cloudAuthReady = true,
  cloudUserEmail = null,
  cloudBusy = false,
  cloudSessionReady = true,
  cloudError = null,
  onCloudSignIn,
  onCloudSignOut,
  onCloudPushNow,
  onExportPortfolio,
  onImportPortfolioPick,
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

        {firebaseCloudEnabled ? (
          <section className="mt-5 border-t border-border/60 pt-4">
            <h3 className="text-[12px] font-semibold text-textMain">
              Google · 클라우드
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-textMuted">
              로그인한 계정의 Firestore에 포트폴리오를 저장합니다. 다른 PC에서도
              같은 계정으로 이어 쓸 수 있습니다. Firebase 콘솔에서 보안 규칙을
              본인만 읽고 쓰도록 설정해야 합니다.
            </p>
            {!cloudAuthReady ? (
              <p className="mt-2 text-[12px] text-textMuted">인증 확인 중…</p>
            ) : cloudUserEmail ? (
              <p className="mt-2 text-[12px] text-textMain">
                로그인: <span className="font-medium">{cloudUserEmail}</span>
              </p>
            ) : null}
            {cloudError ? (
              <p
                role="alert"
                className="mt-2 rounded border border-negative/40 bg-negative/10 px-2 py-1.5 text-[12px] text-negative"
              >
                {cloudError}
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-2">
              {!cloudUserEmail ? (
                <button
                  type="button"
                  disabled={cloudBusy || !cloudAuthReady}
                  onClick={() => void onCloudSignIn?.()}
                  className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
                >
                  Google로 로그인
                </button>
              ) : (
                <>
                  {!cloudSessionReady ? (
                    <p className="text-[12px] text-textMuted">
                      클라우드와 맞추는 중… 잠시만 기다려 주세요.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={cloudBusy || !cloudSessionReady}
                    onClick={() => void onCloudPushNow?.()}
                    className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
                  >
                    {cloudBusy ? '처리 중…' : '지금 클라우드에 저장'}
                  </button>
                  <button
                    type="button"
                    disabled={cloudBusy}
                    onClick={() => void onCloudSignOut?.()}
                    className="rounded-md border border-border px-3 py-2.5 text-left text-[13px] font-medium text-textMuted hover:bg-white/5 disabled:opacity-50"
                  >
                    로그아웃
                  </button>
                </>
              )}
            </div>
          </section>
        ) : null}

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">JSON 백업</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-textMuted">
            파일로 보내거나, 예전에 저장한 파일을 이 기기로 가져옵니다.
            가져오기는 현재 데이터를 덮어씁니다.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={onExportPortfolio}
              className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5"
            >
              백업 파일 보내기
            </button>
            <button
              type="button"
              onClick={onImportPortfolioPick}
              className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5"
            >
              백업 파일 가져오기…
            </button>
          </div>
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
