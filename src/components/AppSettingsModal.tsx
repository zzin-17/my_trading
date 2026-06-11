import { useEffect, useState } from 'react';
import {
  clampKrSellCommissionRate,
  KR_SELL_TAX_RATE,
} from '../lib/krTradingAssumptions';

interface SnapshotRecoveryItem {
  id: string;
  createdAtMs: number;
  reason: string | null;
  tradeCount: number;
  todoCount: number;
  latestTradeDate: string | null;
}

interface DeletedTradeRecoveryItem {
  trashId: string;
  deletedAtMs: number;
  reason: string | null;
  trade: {
    date: string;
    ticker: string;
    name: string;
    side: 'buy' | 'sell';
    quantity: number;
  };
}

interface DeletedTodoRecoveryItem {
  trashId: string;
  deletedAtMs: number;
  reason: string | null;
  todo: {
    ticker: string;
    name?: string;
    action: 'buy' | 'sell';
    quantity: number;
  };
}

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
  /** false면 클라우드·원격 동기 불가(오프라인) 안내 */
  networkOnline?: boolean;
  onCloudSignIn?: () => void | Promise<void>;
  onCloudSignOut?: () => void | Promise<void>;
  onCloudPushNow?: () => void | Promise<void>;
  onExportPortfolio?: () => void;
  onImportPortfolioPick?: () => void;
  recoveryBusy?: boolean;
  snapshotItems?: SnapshotRecoveryItem[];
  deletedTradeItems?: DeletedTradeRecoveryItem[];
  deletedTodoItems?: DeletedTodoRecoveryItem[];
  onRestoreSnapshot?: (snapshotId: string) => void | Promise<void>;
  onRestoreDeletedTrade?: (trashId: string) => void | Promise<void>;
  onRestoreDeletedTodo?: (trashId: string) => void | Promise<void>;
  onOpenTutorial?: () => void;
  themeMode?: 'dark' | 'light';
  onThemeModeChange?: (mode: 'dark' | 'light') => void;
  appLockEnabled?: boolean;
  onSetAppPin?: () => void | Promise<void>;
  onDisableAppPin?: () => void | Promise<void>;
  onLockNow?: () => void;
  notificationPermission?: NotificationPermission | 'unsupported';
  todoAlertsEnabled?: boolean;
  todoNearAlertsEnabled?: boolean;
  notificationError?: string | null;
  onToggleTodoAlerts?: (enabled: boolean) => void | Promise<void>;
  onToggleTodoNearAlerts?: (enabled: boolean) => void;
  krSellCommissionRate?: number;
  onKrSellCommissionRateChange?: (rate: number) => void;
  krPreferExtendedQuote?: boolean;
  onKrPreferExtendedQuoteChange?: (value: boolean) => void;
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
  networkOnline = true,
  onCloudSignIn,
  onCloudSignOut,
  onCloudPushNow,
  onExportPortfolio,
  onImportPortfolioPick,
  recoveryBusy = false,
  snapshotItems = [],
  deletedTradeItems = [],
  deletedTodoItems = [],
  onRestoreSnapshot,
  onRestoreDeletedTrade,
  onRestoreDeletedTodo,
  onOpenTutorial,
  themeMode = 'dark',
  onThemeModeChange,
  appLockEnabled = false,
  onSetAppPin,
  onDisableAppPin,
  onLockNow,
  notificationPermission = 'unsupported',
  todoAlertsEnabled = false,
  todoNearAlertsEnabled = false,
  notificationError = null,
  onToggleTodoAlerts,
  onToggleTodoNearAlerts,
  krSellCommissionRate = 0.00015,
  onKrSellCommissionRateChange,
  krPreferExtendedQuote = false,
  onKrPreferExtendedQuoteChange,
}: AppSettingsModalProps) {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const formatDateTime = (valueMs: number) => {
    if (!Number.isFinite(valueMs) || valueMs <= 0) return '-';
    return new Date(valueMs).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const notificationStatusLabel =
    notificationPermission === 'granted'
      ? '허용됨'
      : notificationPermission === 'denied'
        ? '차단됨'
        : notificationPermission === 'default'
          ? '미요청'
          : '지원 안 함';

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

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">동기화</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
            한국장 종목명·섹터를 최신 목록으로 맞춥니다.
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
          <h3 className="text-[12px] font-semibold text-textMain">한국장 계산</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
            예상손익·실현손익 계산에 쓰는 값입니다. 세금은 고정{' '}
            <span className="tabular-nums">{(KR_SELL_TAX_RATE * 100).toFixed(2)}%</span>
            .
          </p>
          <label className="mt-3 flex items-center gap-3 text-[13px] text-textMain">
            <span className="whitespace-nowrap">위탁 수수료율 (%)</span>
            <input
              type="number"
              min={0.01}
              max={0.15}
              step={0.005}
              value={krSellCommissionRate * 100}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onKrSellCommissionRateChange?.(clampKrSellCommissionRate(v / 100));
              }}
              className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums text-textMain outline-none focus:border-accent"
            />
          </label>
          <p className="mt-2 text-[11px] text-textMuted">
            권장 범위 0.01% ~ 0.15%
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-textMain">
            <input
              type="checkbox"
              checked={krPreferExtendedQuote}
              onChange={(e) => onKrPreferExtendedQuoteChange?.(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>시세 갱신 시 장외(Over·NXT) 호가 우선</span>
          </label>
        </section>

        {firebaseCloudEnabled ? (
          <section className="mt-5 border-t border-border/60 pt-4">
            <h3 className="text-[12px] font-semibold text-textMain">
              Google · 클라우드
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
              같은 계정이면 다른 기기와 자동 동기화됩니다.
            </p>
            {!networkOnline ? (
              <p
                role="status"
                className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[12px] text-warning"
              >
                오프라인입니다. Wi‑Fi·셀룰러 연결 후 클라우드 로그인·저장을 다시
                시도해 주세요. 이 기기의 데이터는 로컬에만 반영됩니다.
              </p>
            ) : null}
            {!cloudAuthReady ? (
              <p className="mt-2 text-[12px] text-textMuted">인증 확인 중…</p>
            ) : cloudUserEmail ? (
              <p className="mt-2 text-[12px] text-textMain">
                로그인: <span className="font-medium">{cloudUserEmail}</span>
              </p>
            ) : null}
            {cloudError ? (
              <div
                role="alert"
                className="mt-2 rounded border border-negative/40 bg-negative/10 px-2 py-1.5 text-[12px] text-negative"
              >
                <p>{cloudError}</p>
                {!networkOnline ? (
                  <p className="mt-1 text-[11px] text-textMuted">
                    연결이 복구되면 변경분이 자동으로 다시 동기화됩니다.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-textMuted">
                    문제가 계속되면 잠시 후 다시 시도하거나 백업 파일을 저장해 주세요.
                  </p>
                )}
              </div>
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
                    {cloudBusy ? '처리 중…' : '지금 스냅샷 백업 저장'}
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

        {firebaseCloudEnabled && cloudUserEmail ? (
          <section className="mt-5 border-t border-border/60 pt-4">
            <button
              type="button"
              onClick={() => setRecoveryOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 text-left"
              aria-expanded={recoveryOpen}
            >
              <span>
                <span className="block text-[12px] font-semibold text-textMain">복구 센터</span>
                <span className="mt-0.5 block text-[11px] text-textMuted">
                  스냅샷 {snapshotItems.length}건 · 삭제 {deletedTradeItems.length + deletedTodoItems.length}건
                </span>
              </span>
              <span className="text-[12px] text-textMuted">{recoveryOpen ? '접기' : '보기'}</span>
            </button>
            {recoveryOpen ? (
              <>
                {recoveryBusy ? (
                  <p className="mt-2 text-[12px] text-textMuted">복구 목록을 불러오는 중…</p>
                ) : null}

                <div className="mt-3 rounded-md border border-border/70 bg-background/40 p-3">
                  <p className="text-[12px] font-medium text-textMain">최근 스냅샷</p>
                  {snapshotItems.length === 0 ? (
                    <p className="mt-2 text-[12px] text-textMuted">저장된 스냅샷이 없습니다.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {snapshotItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded border border-border/60 bg-surface/70 p-2 text-[12px] text-textMain"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{item.reason ?? '자동 백업'}</p>
                              <p className="mt-1 text-textMuted">
                                {formatDateTime(item.createdAtMs)} · 거래 {item.tradeCount}건 · To-do{' '}
                                {item.todoCount}건
                              </p>
                              <p className="mt-1 text-textMuted">
                                최신 거래일: {item.latestTradeDate ?? '-'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={recoveryBusy}
                              onClick={() => void onRestoreSnapshot?.(item.id)}
                              className="shrink-0 rounded border border-border px-2 py-1 text-[11px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
                            >
                              복구
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-md border border-border/70 bg-background/40 p-3">
                  <p className="text-[12px] font-medium text-textMain">삭제 보관함</p>
                  {deletedTradeItems.length === 0 && deletedTodoItems.length === 0 ? (
                    <p className="mt-2 text-[12px] text-textMuted">삭제 보관함이 비어 있습니다.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {deletedTradeItems.map((item) => (
                        <div
                          key={item.trashId}
                          className="rounded border border-border/60 bg-surface/70 p-2 text-[12px] text-textMain"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">
                                거래 · {item.trade.date} · {item.trade.ticker} {item.trade.name}
                              </p>
                              <p className="mt-1 text-textMuted">
                                {item.trade.side === 'buy' ? '매수' : '매도'} {item.trade.quantity}주 ·{' '}
                                {formatDateTime(item.deletedAtMs)}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={recoveryBusy}
                              onClick={() => void onRestoreDeletedTrade?.(item.trashId)}
                              className="shrink-0 rounded border border-border px-2 py-1 text-[11px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
                            >
                              복구
                            </button>
                          </div>
                        </div>
                      ))}
                      {deletedTodoItems.map((item) => (
                        <div
                          key={item.trashId}
                          className="rounded border border-border/60 bg-surface/70 p-2 text-[12px] text-textMain"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">
                                계획 · {item.todo.ticker} {item.todo.name ?? ''}
                              </p>
                              <p className="mt-1 text-textMuted">
                                {item.todo.action === 'buy' ? '매수' : '매도'} {item.todo.quantity}주 ·{' '}
                                {formatDateTime(item.deletedAtMs)}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={recoveryBusy}
                              onClick={() => void onRestoreDeletedTodo?.(item.trashId)}
                              className="shrink-0 rounded border border-border px-2 py-1 text-[11px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
                            >
                              복구
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">브라우저 알림</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
            목표가 도달 알림을 보냅니다. 근접 알림은 2% 이내에서만 추가됩니다.
          </p>
          <p className="mt-1 text-[12px] text-textMain">
            상태: {notificationStatusLabel}
          </p>
          {notificationError ? (
            <p className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[12px] text-warning">
              {notificationError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void onToggleTodoAlerts?.(!todoAlertsEnabled)}
              className={`rounded-md border px-3 py-2.5 text-left text-[13px] font-medium ${
                todoAlertsEnabled
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-background text-textMain hover:bg-white/5'
              }`}
            >
              {todoAlertsEnabled ? '도달 알림 켜짐' : '도달 알림 켜기'}
            </button>
            <button
              type="button"
              disabled={!todoAlertsEnabled || notificationPermission !== 'granted'}
              onClick={() => onToggleTodoNearAlerts?.(!todoNearAlertsEnabled)}
              className={`rounded-md border px-3 py-2.5 text-left text-[13px] font-medium ${
                todoAlertsEnabled && todoNearAlertsEnabled
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-background text-textMain hover:bg-white/5 disabled:opacity-50'
              }`}
            >
              {todoNearAlertsEnabled ? '근접 알림 켜짐 (목표가 2% 이내)' : '근접 알림 켜기 (선택)'}
            </button>
          </div>
        </section>

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">도움말</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
            첫 화면 안내를 다시 엽니다.
          </p>
          <button
            type="button"
            onClick={() => void onOpenTutorial?.()}
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5"
          >
            첫 화면 튜토리얼 다시 보기
          </button>
        </section>

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">화면 테마</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
            라이트 / 다크 모드를 선택합니다.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onThemeModeChange?.('light')}
              className={`rounded-md border px-3 py-2.5 text-[13px] font-medium ${
                themeMode === 'light'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-background text-textMain hover:bg-white/5'
              }`}
            >
              일반(라이트)
            </button>
            <button
              type="button"
              onClick={() => onThemeModeChange?.('dark')}
              className={`rounded-md border px-3 py-2.5 text-[13px] font-medium ${
                themeMode === 'dark'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-background text-textMain hover:bg-white/5'
              }`}
            >
              다크
            </button>
          </div>
        </section>

        <section className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-[12px] font-semibold text-textMain">앱 잠금 (PIN)</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
            이 기기에서 앱을 다시 열 때 4자리 PIN을 요구합니다. 약 5분 미사용 시
            자동 잠금됩니다.
          </p>
          <p className="mt-1 text-[12px] text-textMain">
            상태: {appLockEnabled ? '설정됨' : '미설정'}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void onSetAppPin?.()}
              className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5"
            >
              {appLockEnabled ? 'PIN 변경' : 'PIN 설정'}
            </button>
            <button
              type="button"
              disabled={!appLockEnabled}
              onClick={() => void onLockNow?.()}
              className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13px] font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
            >
              지금 잠그기
            </button>
            <button
              type="button"
              disabled={!appLockEnabled}
              onClick={() => void onDisableAppPin?.()}
              className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2.5 text-left text-[13px] font-medium text-negative hover:bg-negative/15 disabled:opacity-50"
            >
              PIN 제거
            </button>
          </div>
        </section>

        <section className="mt-5 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setBackupOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 text-left"
            aria-expanded={backupOpen}
          >
            <span>
              <span className="block text-[12px] font-semibold text-textMain">JSON 백업</span>
              <span className="mt-0.5 block text-[11px] text-textMuted">
                내보내기 / 가져오기
              </span>
            </span>
            <span className="text-[12px] text-textMuted">{backupOpen ? '접기' : '보기'}</span>
          </button>
          {backupOpen ? (
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
          ) : null}
        </section>

        <section className="mt-5 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setResetOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-md border border-negative/30 bg-negative/5 px-3 py-2.5 text-left"
            aria-expanded={resetOpen}
          >
            <span>
              <span className="block text-[12px] font-semibold text-negative">초기화</span>
              <span className="mt-0.5 block text-[11px] text-textMuted">
                전체 기록 삭제 또는 샘플 재시작
              </span>
            </span>
            <span className="text-[12px] text-textMuted">{resetOpen ? '접기' : '보기'}</span>
          </button>
          {resetOpen ? (
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
          ) : null}
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
