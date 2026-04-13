import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SummaryCards } from './components/SummaryCards';
import { MarketPairSummaryCards } from './components/MarketPairSummaryCards';
import { HoldingsTable } from './components/HoldingsTable';
import { TradeJournal } from './components/TradeJournal';
import { AppSettingsModal } from './components/AppSettingsModal';
import { RealizedPnlPanel } from './components/RealizedPnlPanel';
import { AddTradeModal } from './components/AddTradeModal';
import { AddHoldingModal, type AddHoldingPayload } from './components/AddHoldingModal';
import { MarketTodoList } from './components/MarketTodoList';
import { PositionDetailModal } from './components/PositionDetailModal';
import { MarketTabs, type MarketTab } from './components/MarketTabs';
import { MarketSplitCard } from './components/MarketSplitCard';
import { tradeSeed } from './data/tradeSeed';
import {
  buildPortfolioSummary,
  buildPositionMetrics,
  buildTopStockWeights,
  getUnifiedPortfolioCurrency,
  roundMoney,
} from './lib/portfolioMath';
import {
  defaultCurrencyForMarket,
  filterByMarket,
  tickersEqual,
} from './lib/market';
import { computeLedger, ledgerToPositions } from './lib/ledger';
import {
  savePersisted,
  clearPersisted,
  type PersistedPortfolioV1,
} from './lib/persistence';
import {
  getInitialAppState,
  clearInitialAppStateCache,
  normalizeLoadedPortfolio,
} from './lib/portfolioBootstrap';
import {
  buildExportFile,
  downloadJsonFile,
  parsePortfolioImportJson,
} from './lib/portfolioExport';
import {
  fetchCloudPortfolio,
  pushCloudPortfolio,
} from './lib/cloudPortfolio';
import { useAuth } from './auth/AuthContext';
import { MixedCurrencyBanner } from './components/MixedCurrencyBanner';
import { KrPnlAssumptionsCard } from './components/KrPnlAssumptionsCard';
import type { Market } from './types/portfolio';
import type { Trade } from './types/trade';
import type { TradePlanTodo } from './types/todo';
import { parseHoldingCsv } from './lib/holdingCsv';
import { applyKrxMetadataToKrTrades } from './lib/krxLookup';
import { adjustOpeningBalanceTrade } from './lib/positionAdjust';
import { fetchKrNaverDelayedQuote } from './lib/naverKrQuote';
import { formatQuoteUpdatedLabel } from './lib/format';
import { todayIsoLocal, withoutExpiredPendingOrders } from './lib/tradePendingExpiry';
import {
  KR_SELL_TAX_RATE,
  normalizeKrSellCommissionRate,
} from './lib/krTradingAssumptions';
import { humanizeCloudError } from './lib/cloudMessages';

const APP_PIN_HASH_KEY = 'traderos-app-pin-hash-v1';
const APP_AUTO_LOCK_MS = 5 * 60 * 1000;
const APP_PIN_MAX_FAILS = 5;
const APP_PIN_LOCKOUT_MS = 30 * 1000;
const THEME_MODE_KEY = 'traderos-theme-mode-v1';
const ONBOARDING_DONE_KEY = 'traderos-onboarding-done-v1';

type ThemeMode = 'dark' | 'light';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function loadAppPinHash(): string | null {
  try {
    return window.localStorage.getItem(APP_PIN_HASH_KEY);
  } catch {
    return null;
  }
}

function loadThemeMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(THEME_MODE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function isOnboardingDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markOnboardingDone(done: boolean): void {
  try {
    if (done) window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    else window.localStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch {
    /* ignore */
  }
}

function applyThemeVariables(mode: ThemeMode): void {
  const root = document.documentElement;
  const body = document.body;
  const target = mode === 'light'
    ? {
        '--color-background': '255 255 255',
        '--color-surface': '255 255 255',
        '--color-border': '218 223 233',
        '--color-text-main': '17 24 39',
        '--color-text-muted': '75 85 99',
        '--color-positive': '16 163 127',
        '--color-negative': '225 29 72',
        '--color-accent': '37 99 235',
        '--color-warning': '217 119 6',
        '--color-ui-hover': '17 24 39',
        '--ui-hover-alpha': '0.06',
      }
    : {
        '--color-background': '15 17 21',
        '--color-surface': '23 26 33',
        '--color-border': '38 43 54',
        '--color-text-main': '232 234 237',
        '--color-text-muted': '160 163 189',
        '--color-positive': '20 199 132',
        '--color-negative': '255 77 79',
        '--color-accent': '76 125 255',
        '--color-warning': '255 159 28',
        '--color-ui-hover': '255 255 255',
        '--ui-hover-alpha': '0.05',
      };
  for (const [k, v] of Object.entries(target)) {
    root.style.setProperty(k, v);
    body.style.setProperty(k, v);
  }
}

async function verifyCurrentPinOrAlert(storedHash: string): Promise<boolean> {
  const current = window.prompt('현재 PIN 4자리를 입력하세요.');
  if (current === null) return false;
  const pin = current.trim();
  if (!/^\d{4}$/.test(pin)) {
    window.alert('현재 PIN 형식이 올바르지 않습니다.');
    return false;
  }
  const hash = await sha256Hex(pin);
  if (hash !== storedHash) {
    window.alert('현재 PIN이 일치하지 않습니다.');
    return false;
  }
  return true;
}

const StockBarChart = lazy(() =>
  import('./components/StockBarChart').then((m) => ({
    default: m.StockBarChart,
  })),
);

const RealizedDailyBarChart = lazy(() =>
  import('./components/RealizedDailyBarChart').then((m) => ({
    default: m.RealizedDailyBarChart,
  })),
);

function ChartSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-[300px] flex-col rounded-lg border border-border bg-surface p-4">
      <div className="h-4 w-28 animate-pulse rounded bg-border" />
      <div className="mt-2 h-3 w-44 max-w-full animate-pulse rounded bg-border/70" />
      <div className="mt-6 flex flex-1 items-center justify-center">
        <span className="text-[12px] text-textMuted">{label}</span>
      </div>
    </div>
  );
}

export default function App() {
  const enabledTabs: MarketTab[] = ['KR'];
  const [trades, setTrades] = useState<Trade[]>(
    () => getInitialAppState().trades,
  );
  const [quotes, setQuotes] = useState<Record<string, number>>(
    () => getInitialAppState().quotes,
  );
  const [positionIds, setPositionIds] = useState<Record<string, string>>(
    () => getInitialAppState().positionIds,
  );
  const [todos, setTodos] = useState<TradePlanTodo[]>(
    () => getInitialAppState().todos,
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    () => getInitialAppState().notes,
  );
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<Record<string, string>>(
    () => getInitialAppState().quoteUpdatedAt,
  );
  const [lastKrQuoteBulkAt, setLastKrQuoteBulkAt] = useState<string | null>(
    () => getInitialAppState().lastKrQuoteBulkAt,
  );
  const [krSellCommissionRate, setKrSellCommissionRate] = useState(() =>
    normalizeKrSellCommissionRate(getInitialAppState().krSellCommissionRate),
  );
  const [krPreferExtendedQuote, setKrPreferExtendedQuote] = useState(
    () => getInitialAppState().krPreferExtendedQuote === true,
  );
  /** 한국장 시세 갱신 시 수집한 당일 시가(시초가) — 시가 대비 ±7% 이상이면 보유표 강조 */
  const [krDayOpenByTicker, setKrDayOpenByTicker] = useState<
    Record<string, number>
  >(() => getInitialAppState().krDayOpenByTicker ?? {});

  const [marketTab, setMarketTab] = useState<MarketTab>('KR');
  const [filterText, setFilterText] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);
  const [krQuoteRefreshing, setKrQuoteRefreshing] = useState(false);
  const [krxSectorSyncing, setKrxSectorSyncing] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => !isOnboardingDone());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());
  const [appLockEnabled, setAppLockEnabled] = useState(
    () => !!loadAppPinHash(),
  );
  const [appLocked, setAppLocked] = useState(
    () => !!loadAppPinHash(),
  );
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockFailCount, setUnlockFailCount] = useState(0);
  const [unlockBlockedUntil, setUnlockBlockedUntil] = useState(0);
  const [unlockNowTs, setUnlockNowTs] = useState(() => Date.now());
  const autoLockTimerRef = useRef<number | null>(null);

  const {
    user,
    authReady,
    firebaseConfigured,
    signInWithGoogle,
    signOutUser,
  } = useAuth();

  const initialPortfolio = useMemo(() => getInitialAppState(), []);
  const portfolioRef = useRef<PersistedPortfolioV1>({
    trades: initialPortfolio.trades,
    quotes: initialPortfolio.quotes,
    positionIds: initialPortfolio.positionIds,
    todos: initialPortfolio.todos,
    notes: initialPortfolio.notes,
    quoteUpdatedAt: initialPortfolio.quoteUpdatedAt,
    lastKrQuoteBulkAt: initialPortfolio.lastKrQuoteBulkAt,
    krSellCommissionRate: initialPortfolio.krSellCommissionRate,
    krPreferExtendedQuote: initialPortfolio.krPreferExtendedQuote,
    krDayOpenByTicker: initialPortfolio.krDayOpenByTicker ?? {},
  });
  const importFileRef = useRef<HTMLInputElement>(null);
  const hadUserRef = useRef(false);
  const [cloudSessionReady, setCloudSessionReady] = useState(true);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [networkOnline, setNetworkOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );
  const cloudMergeChoiceKey = useMemo(
    () => (user ? `traderos-cloud-merge-choice:${user.uid}` : null),
    [user],
  );

  useEffect(() => {
    portfolioRef.current = {
      trades,
      quotes,
      positionIds,
      todos,
      notes,
      quoteUpdatedAt,
      lastKrQuoteBulkAt,
      krSellCommissionRate,
      krPreferExtendedQuote,
      krDayOpenByTicker,
    };
  }, [
    trades,
    quotes,
    positionIds,
    todos,
    notes,
    quoteUpdatedAt,
    lastKrQuoteBulkAt,
    krSellCommissionRate,
    krPreferExtendedQuote,
    krDayOpenByTicker,
  ]);

  useEffect(() => {
    if (!firebaseConfigured) {
      setCloudSessionReady(true);
      setCloudBusy(false);
      setCloudError(null);
    }
  }, [firebaseConfigured]);

  useEffect(() => {
    if (firebaseConfigured && !user) {
      setCloudSessionReady(true);
      setCloudBusy(false);
      setCloudError(null);
    }
  }, [firebaseConfigured, user]);

  const applyNormalizedPortfolio = useCallback((h: PersistedPortfolioV1) => {
    clearInitialAppStateCache();
    setTrades(h.trades);
    setQuotes(h.quotes);
    setPositionIds(h.positionIds);
    setTodos(h.todos);
    setNotes(h.notes);
    setQuoteUpdatedAt(h.quoteUpdatedAt);
    setLastKrQuoteBulkAt(h.lastKrQuoteBulkAt);
    setKrSellCommissionRate(normalizeKrSellCommissionRate(h.krSellCommissionRate));
    setKrPreferExtendedQuote(h.krPreferExtendedQuote === true);
    setKrDayOpenByTicker(h.krDayOpenByTicker ?? {});
  }, []);

  /** 로그아웃 시 개인정보(보유·일지·계획·메모 등) 로컬 흔적 제거 */
  const wipePrivatePortfolio = useCallback(() => {
    clearPersisted();
    clearInitialAppStateCache();
    setTrades([]);
    setQuotes({});
    setPositionIds({});
    setTodos([]);
    setNotes({});
    setQuoteUpdatedAt({});
    setLastKrQuoteBulkAt(null);
    setDetailId(null);
    setKrSellCommissionRate(normalizeKrSellCommissionRate(undefined));
    setKrPreferExtendedQuote(false);
    setKrDayOpenByTicker({});
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !authReady) return;
    if (user) {
      hadUserRef.current = true;
      return;
    }
    if (hadUserRef.current) {
      wipePrivatePortfolio();
      hadUserRef.current = false;
    }
  }, [firebaseConfigured, authReady, user, wipePrivatePortfolio]);

  useEffect(() => {
    if (!firebaseConfigured || !user || !authReady) return;
    setCloudSessionReady(false);
    let cancelled = false;
    void (async () => {
      setCloudBusy(true);
      setCloudError(null);
      try {
        const remote = await fetchCloudPortfolio(user.uid);
        if (cancelled) return;
        if (!remote) {
          await pushCloudPortfolio(user.uid, portfolioRef.current);
        } else {
          const savedChoice =
            cloudMergeChoiceKey &&
            typeof window !== 'undefined'
              ? window.localStorage.getItem(cloudMergeChoiceKey)
              : null;
          let useRemote: boolean;
          if (savedChoice === 'remote') {
            useRemote = true;
          } else if (savedChoice === 'local') {
            useRemote = false;
          } else {
            const msg =
              `클라우드에 저장된 데이터가 있습니다 (${new Date(remote.updatedAtMs).toLocaleString('ko-KR')}).\n\n` +
              '[확인] 클라우드 데이터를 이 기기에 불러오기\n' +
              '[취소] 이 기기 데이터로 클라우드 덮어쓰기\n\n' +
              '(이 선택은 이 기기에서 기억되어 다음 로그인부터 자동 적용됩니다.)';
            useRemote = window.confirm(msg);
            if (cloudMergeChoiceKey && typeof window !== 'undefined') {
              window.localStorage.setItem(
                cloudMergeChoiceKey,
                useRemote ? 'remote' : 'local',
              );
            }
          }
          if (cancelled) return;
          if (useRemote) {
            applyNormalizedPortfolio(
              normalizeLoadedPortfolio(remote.portfolio),
            );
          } else {
            await pushCloudPortfolio(user.uid, portfolioRef.current);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setCloudError(humanizeCloudError(e));
        }
      } finally {
        if (!cancelled) {
          setCloudBusy(false);
          setCloudSessionReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    firebaseConfigured,
    user?.uid,
    authReady,
    applyNormalizedPortfolio,
    cloudMergeChoiceKey,
  ]);

  useEffect(() => {
    if (!firebaseConfigured || !user || !cloudSessionReady) return;
    const uid = user.uid;
    const tid = window.setTimeout(() => {
      void (async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        try {
          await pushCloudPortfolio(uid, portfolioRef.current);
          setCloudError(null);
        } catch (e) {
          setCloudError(humanizeCloudError(e));
        }
      })();
    }, 3000);
    return () => window.clearTimeout(tid);
  }, [
    firebaseConfigured,
    user,
    cloudSessionReady,
    trades,
    quotes,
    positionIds,
    todos,
    notes,
    quoteUpdatedAt,
    lastKrQuoteBulkAt,
    krSellCommissionRate,
    krPreferExtendedQuote,
    krDayOpenByTicker,
  ]);

  const handleExportPortfolio = useCallback(() => {
    const file = buildExportFile(portfolioRef.current);
    const d = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`traderos-backup-${d}.json`, file);
  }, []);

  const handleImportPortfolioFiles = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (!f) return;
      void (async () => {
        const text = await f.text();
        const parsed = parsePortfolioImportJson(text);
        if (!parsed) {
          window.alert(
            '지원하지 않는 백업 형식이거나 데이터가 손상되었습니다.',
          );
          return;
        }
        if (
          !window.confirm(
            '현재 이 기기의 포트폴리오를 백업 파일 내용으로 바꿉니다. 계속할까요?',
          )
        ) {
          return;
        }
        applyNormalizedPortfolio(normalizeLoadedPortfolio(parsed));
        window.alert('가져오기를 완료했습니다.');
      })();
    },
    [applyNormalizedPortfolio],
  );

  const handleCloudPushNow = useCallback(async () => {
    if (!user) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.alert(
        '오프라인입니다. 네트워크 연결 후 「지금 클라우드에 저장」을 다시 눌러 주세요.',
      );
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    try {
      await pushCloudPortfolio(user.uid, portfolioRef.current);
      window.alert('클라우드에 저장했습니다.');
    } catch (e) {
      setCloudError(humanizeCloudError(e));
    } finally {
      setCloudBusy(false);
    }
  }, [user]);

  const handleCloudSignIn = useCallback(async () => {
    setCloudError(null);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCloudError(
        '오프라인이라 Google 로그인을 할 수 없습니다. 연결을 확인해 주세요.',
      );
      return;
    }
    try {
      await signInWithGoogle();
    } catch (e) {
      setCloudError(humanizeCloudError(e));
    }
  }, [signInWithGoogle]);

  const handleCloudSignOut = useCallback(async () => {
    setCloudError(null);
    setCloudBusy(true);
    try {
      if (user) {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          await pushCloudPortfolio(user.uid, portfolioRef.current);
        } else {
          const ok = window.confirm(
            '지금 오프라인이라 클라우드에 마지막 저장을 할 수 없습니다. 로그아웃하면 이 브라우저의 포트폴리오 데이터가 삭제됩니다. 계속할까요?\n\n(권장: 연결 복구 후 다시 시도하거나, 설정에서 「백업 파일 보내기」)',
          );
          if (!ok) {
            setCloudBusy(false);
            return;
          }
        }
      }
      await signOutUser();
      wipePrivatePortfolio();
    } catch (e) {
      setCloudError(
        `로그아웃 처리 중 오류: ${humanizeCloudError(e)}`,
      );
    } finally {
      setCloudBusy(false);
    }
  }, [signOutUser, wipePrivatePortfolio, user]);

  const handleSetAppPin = useCallback(async () => {
    const stored = loadAppPinHash();
    if (stored) {
      const okCurrent = await verifyCurrentPinOrAlert(stored);
      if (!okCurrent) return;
    }
    const first = window.prompt('설정할 4자리 PIN을 입력하세요.');
    if (first === null) return;
    const pin = first.trim();
    if (!/^\d{4}$/.test(pin)) {
      window.alert('PIN은 숫자 4자리로 입력해 주세요.');
      return;
    }
    const second = window.prompt('확인을 위해 같은 PIN을 다시 입력하세요.');
    if (second === null) return;
    if (pin !== second.trim()) {
      window.alert('PIN이 일치하지 않습니다.');
      return;
    }
    try {
      const hash = await sha256Hex(pin);
      window.localStorage.setItem(APP_PIN_HASH_KEY, hash);
      setAppLockEnabled(true);
      setAppLocked(false);
      setUnlockPin('');
      setUnlockError(null);
      setUnlockFailCount(0);
      setUnlockBlockedUntil(0);
      window.alert('앱 잠금 PIN을 저장했습니다.');
    } catch {
      window.alert('PIN 저장 중 오류가 발생했습니다.');
    }
  }, []);

  const handleDisableAppPin = useCallback(async () => {
    const stored = loadAppPinHash();
    if (!stored) {
      setAppLockEnabled(false);
      setAppLocked(false);
      return;
    }
    const okCurrent = await verifyCurrentPinOrAlert(stored);
    if (!okCurrent) return;
    const ok = window.confirm('앱 잠금 PIN을 제거할까요?');
    if (!ok) return;
    try {
      window.localStorage.removeItem(APP_PIN_HASH_KEY);
    } catch {
      /* ignore */
    }
    setAppLockEnabled(false);
    setAppLocked(false);
    setUnlockPin('');
    setUnlockError(null);
    setUnlockFailCount(0);
    setUnlockBlockedUntil(0);
  }, []);

  const handleLockNow = useCallback(() => {
    if (!appLockEnabled) return;
    setSettingsOpen(false);
    setAppLocked(true);
    setUnlockPin('');
    setUnlockError(null);
    setUnlockFailCount(0);
    setUnlockBlockedUntil(0);
  }, [appLockEnabled]);

  const handleUnlockApp = useCallback(async () => {
    const now = Date.now();
    if (unlockBlockedUntil > now) {
      const sec = Math.ceil((unlockBlockedUntil - now) / 1000);
      setUnlockError(`잠시 후 다시 시도해 주세요. (${sec}초)`);
      return;
    }
    if (!appLockEnabled) {
      setAppLocked(false);
      return;
    }
    const stored = loadAppPinHash();
    if (!stored) {
      setAppLockEnabled(false);
      setAppLocked(false);
      return;
    }
    if (!/^\d{4}$/.test(unlockPin.trim())) {
      setUnlockError('PIN은 숫자 4자리입니다.');
      return;
    }
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const hash = await sha256Hex(unlockPin.trim());
      if (hash !== stored) {
        const nextFail = unlockFailCount + 1;
        setUnlockFailCount(nextFail);
        if (nextFail >= APP_PIN_MAX_FAILS) {
          const until = Date.now() + APP_PIN_LOCKOUT_MS;
          setUnlockBlockedUntil(until);
          setUnlockNowTs(Date.now());
          setUnlockError('실패 횟수 초과로 30초 동안 잠금 해제 시도가 제한됩니다.');
        } else {
          setUnlockError(
            `PIN이 일치하지 않습니다. (${nextFail}/${APP_PIN_MAX_FAILS})`,
          );
        }
        return;
      }
      setAppLocked(false);
      setUnlockPin('');
      setUnlockError(null);
      setUnlockFailCount(0);
      setUnlockBlockedUntil(0);
      setUnlockNowTs(Date.now());
    } finally {
      setUnlockBusy(false);
    }
  }, [appLockEnabled, unlockPin, unlockFailCount, unlockBlockedUntil]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.body.dataset.theme = themeMode;
    applyThemeVariables(themeMode);
    try {
      window.localStorage.setItem(THEME_MODE_KEY, themeMode);
    } catch {
      /* ignore */
    }
  }, [themeMode]);

  const closeOnboarding = useCallback((remember: boolean) => {
    if (remember) markOnboardingDone(true);
    setOnboardingOpen(false);
  }, []);

  const unlockBlockedSec = Math.max(
    0,
    Math.ceil((unlockBlockedUntil - unlockNowTs) / 1000),
  );

  useEffect(() => {
    if (unlockBlockedUntil <= Date.now()) return;
    const id = window.setInterval(() => {
      setUnlockNowTs(Date.now());
    }, 500);
    return () => window.clearInterval(id);
  }, [unlockBlockedUntil]);

  useEffect(() => {
    if (!appLockEnabled || appLocked) {
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
      return;
    }

    const armAutoLock = () => {
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
      }
      autoLockTimerRef.current = window.setTimeout(() => {
        setAppLocked(true);
        setUnlockPin('');
        setUnlockError(null);
      }, APP_AUTO_LOCK_MS);
    };

    const onActivity = () => armAutoLock();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setAppLocked(true);
        setUnlockPin('');
        setUnlockError(null);
      } else {
        armAutoLock();
      }
    };

    armAutoLock();
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('scroll', onActivity, { passive: true });
    window.addEventListener('focus', onActivity);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('scroll', onActivity);
      window.removeEventListener('focus', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [appLockEnabled, appLocked]);

  /** 미체결 주문: 일지에 적은 날(local)이 지나면 자동 삭제(당일 자정 이후 미체결 = 무효) */
  useEffect(() => {
    const sweep = () => {
      setTrades((prev) => {
        const today = todayIsoLocal();
        const next = withoutExpiredPendingOrders(prev, today);
        return next.length === prev.length ? prev : next;
      });
    };
    sweep();
    const id = window.setInterval(sweep, 60_000);
    const onFocus = () => sweep();
    const onVisible = () => {
      if (document.visibilityState === 'visible') sweep();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const ok = savePersisted({
      trades,
      quotes,
      positionIds,
      todos,
      notes,
      quoteUpdatedAt,
      lastKrQuoteBulkAt,
      krSellCommissionRate,
      krPreferExtendedQuote,
      krDayOpenByTicker,
    });
    setPersistenceWarning(
      ok
        ? null
        : '브라우저에 저장하지 못했습니다. 저장 공간 부족·비공개 모드일 수 있습니다. 이 사이트의 저장 용량을 줄인 뒤 다시 시도해 주세요.',
    );
  }, [
    trades,
    quotes,
    positionIds,
    todos,
    notes,
    quoteUpdatedAt,
    lastKrQuoteBulkAt,
    krSellCommissionRate,
    krPreferExtendedQuote,
    krDayOpenByTicker,
  ]);

  useEffect(() => {
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const ledger = useMemo(() => computeLedger(trades), [trades]);
  const positions = useMemo(
    () => ledgerToPositions(ledger, quotes, positionIds),
    [ledger, quotes, positionIds],
  );

  const pendingTodoCountByPositionId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of positions) {
      if (p.quantity <= 0) continue;
      let c = 0;
      for (const t of todos) {
        if (t.done) continue;
        if (t.market !== p.market) continue;
        if (tickersEqual(t.ticker, p.ticker, p.market)) c += 1;
      }
      if (c > 0) map[p.id] = c;
    }
    return map;
  }, [positions, todos]);

  const handleOpenHoldingFromTodo = useCallback(
    (ticker: string, market: Market) => {
      const pos = positions.find(
        (p) =>
          p.market === market &&
          tickersEqual(p.ticker, ticker, market) &&
          p.quantity > 0,
      );
      if (!pos) {
        window.alert(
          '해당 종목의 보유 내역이 없습니다. 보유종목을 먼저 추가해 주세요.',
        );
        return;
      }
      setDetailId(pos.id);
    },
    [positions],
  );

  const getAvailableQuantity = useCallback(
    (ticker: string, excludeTradeId?: string) => {
      const trs = excludeTradeId
        ? trades.filter((t) => t.id !== excludeTradeId)
        : trades;
      const led = computeLedger(trs);
      const q = led.get(ticker)?.quantity ?? 0;
      const pendingSell = trs
        .filter(
          (tr) =>
            tr.ticker === ticker &&
            tr.side === 'sell' &&
            tr.executionStatus === 'pending',
        )
        .reduce((sum, tr) => sum + tr.quantity, 0);
      return Math.max(0, q - pendingSell);
    },
    [trades],
  );

  const handleMarkTradeFilled = useCallback((id: string) => {
    setTrades((prev) =>
      prev.map((tr) =>
        tr.id === id ? { ...tr, executionStatus: 'filled' as const } : tr,
      ),
    );
  }, []);

  const handleAdjustPosition = useCallback(
    (
      ticker: string,
      qty: number,
      avg: number,
      meta: Pick<Trade, 'name' | 'sector' | 'market' | 'currency'>,
    ): boolean => {
      const r = adjustOpeningBalanceTrade(trades, ticker, qty, avg, meta);
      if (!r.ok) {
        window.alert(r.message);
        return false;
      }
      setTrades(r.trades);
      return true;
    },
    [trades],
  );

  const handleAddTrade = useCallback((t: Trade) => {
    setTrades((prev) => [...prev, t]);
    setPositionIds((prev) =>
      prev[t.ticker] ? prev : { ...prev, [t.ticker]: `p-${Date.now()}` },
    );
    setQuotes((prev) =>
      prev[t.ticker] !== undefined ? prev : { ...prev, [t.ticker]: t.price },
    );
  }, []);

  const handleUpdateTrade = useCallback((updated: Trade) => {
    setTrades((prev) =>
      prev.map((tr) => (tr.id === updated.id ? updated : tr)),
    );
    setQuotes((prev) =>
      prev[updated.ticker] !== undefined
        ? prev
        : { ...prev, [updated.ticker]: updated.price },
    );
    setPositionIds((prev) =>
      prev[updated.ticker]
        ? prev
        : { ...prev, [updated.ticker]: `p-${Date.now()}` },
    );
  }, []);

  const handleOpenAddTrade = useCallback(() => {
    setTradeToEdit(null);
    setAddTradeOpen(true);
  }, []);

  const handleOpenEditTrade = useCallback((trade: Trade) => {
    setTradeToEdit(trade);
    setAddTradeOpen(true);
  }, []);

  const handleCloseAddTradeModal = useCallback(() => {
    setAddTradeOpen(false);
    setTradeToEdit(null);
  }, []);

  const handleAddHolding = useCallback(
    (payload: AddHoldingPayload) => {
      const m = payload.market;
      const existing = positions.find(
        (p) =>
          p.market === m &&
          tickersEqual(p.ticker, payload.ticker, m) &&
          p.quantity > 0,
      );
      if (existing) {
        const ok = window.confirm(
          '이미 보유 중인 종목입니다.\n\n보유 종목을 수정하시겠습니까?',
        );
        setAddHoldingOpen(false);
        if (ok) setDetailId(existing.id);
        return;
      }

      const trade: Trade = {
        id: `tr-user-holding-${Date.now()}`,
        date: payload.date,
        ticker: payload.ticker,
        name: payload.name,
        sector: payload.sector,
        market: payload.market,
        side: 'buy',
        quantity: payload.quantity,
        price: payload.avgPrice,
        currency: payload.market === 'KR' ? 'KRW' : 'USD',
        excludeFromJournal: true,
        note: '보유종목 추가(일지 제외)',
      };
      setTrades((prev) => [...prev, trade]);
      setPositionIds((prev) =>
        prev[payload.ticker]
          ? prev
          : { ...prev, [payload.ticker]: `p-${Date.now()}` },
      );
      setQuotes((prev) => ({ ...prev, [payload.ticker]: payload.currentPrice }));
    },
    [positions],
  );

  const handleUploadCsv = useCallback(async (file: File) => {
    const text = await file.text();
    const { rows, errors } = parseHoldingCsv(text);
    if (rows.length === 0) {
      window.alert(
        `업로드 실패: 유효한 행이 없습니다.\n${errors.slice(0, 5).join('\n')}`,
      );
      return;
    }

    const now = Date.now();
    const importedTrades: Trade[] = rows.map((r, idx) => {
      const currency = defaultCurrencyForMarket(r.market);
      return {
        id: `tr-csv-${now}-${idx}`,
        date: r.date,
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        market: r.market,
        side: 'buy',
        quantity: r.quantity,
        price: roundMoney(r.avgPrice, currency),
        currency,
        excludeFromJournal: true,
      };
    });

    setTrades((prev) => [...prev, ...importedTrades]);
    setPositionIds((prev) => {
      const next = { ...prev };
      rows.forEach((r, idx) => {
        if (!next[r.ticker]) next[r.ticker] = `p-csv-${now}-${idx}`;
      });
      return next;
    });
    setQuotes((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        const currency = defaultCurrencyForMarket(r.market);
        next[r.ticker] = roundMoney(r.currentPrice, currency);
      });
      return next;
    });

    const doneMsg = `CSV 업로드 완료: ${rows.length}건 반영`;
    if (errors.length > 0) {
      window.alert(`${doneMsg}\n(건너뜀 ${errors.length}건)\n${errors.slice(0, 5).join('\n')}`);
      return;
    }
    window.alert(doneMsg);
  }, []);

  const handleResetData = useCallback(() => {
    clearPersisted();
    clearInitialAppStateCache();
    setTrades([...tradeSeed.trades]);
    setQuotes({ ...tradeSeed.quotes });
    setPositionIds({ ...tradeSeed.positionIds });
    setTodos([]);
    setNotes({});
    setQuoteUpdatedAt({});
    setLastKrQuoteBulkAt(null);
    setKrSellCommissionRate(normalizeKrSellCommissionRate(undefined));
    setKrPreferExtendedQuote(false);
    setKrDayOpenByTicker({});
  }, []);

  /** 매매·보유·시세 등 전부 비움 (샘플 아님) */
  const handleClearHoldings = useCallback(() => {
    clearInitialAppStateCache();
    setTrades([]);
    setQuotes({});
    setPositionIds({});
    setTodos([]);
    setNotes({});
    setQuoteUpdatedAt({});
    setLastKrQuoteBulkAt(null);
    setKrDayOpenByTicker({});
  }, []);

  const refreshKrQuotes = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.alert(
        '네트워크에 연결되어 있지 않습니다. 연결 후 시세 갱신을 다시 시도해 주세요.',
      );
      return;
    }
    const tickers = [
      ...new Set(
        positions
          .filter((p) => p.market === 'KR' && /^\d{6}$/.test(p.ticker))
          .map((p) => p.ticker),
      ),
    ];
    if (tickers.length === 0) {
      window.alert('한국장 6자리 숫자 종목이 없습니다.');
      return;
    }
    setKrQuoteRefreshing(true);
    let ok = 0;
    let fail = 0;
    const nextQuotes: Record<string, number> = {};
    const nextAt: Record<string, string> = {};
    const nextOpen: Record<string, number> = {};
    const chunk = 5;
    for (let i = 0; i < tickers.length; i += chunk) {
      const part = tickers.slice(i, i + chunk);
      await Promise.all(
        part.map(async (t) => {
          try {
            const r = await fetchKrNaverDelayedQuote(t, {
              preferExtendedQuote: krPreferExtendedQuote,
            });
            nextQuotes[t] = roundMoney(r.price, 'KRW');
            nextAt[t] = r.fetchedAt;
            if (
              r.openPrice !== undefined &&
              Number.isFinite(r.openPrice) &&
              r.openPrice > 0
            ) {
              nextOpen[t] = roundMoney(r.openPrice, 'KRW');
            }
            ok += 1;
          } catch {
            fail += 1;
          }
        }),
      );
    }
    setQuotes((prev) => ({ ...prev, ...nextQuotes }));
    if (Object.keys(nextOpen).length > 0) {
      setKrDayOpenByTicker((prev) => ({ ...prev, ...nextOpen }));
    }
    setQuoteUpdatedAt((prev) => ({ ...prev, ...nextAt }));
    if (ok > 0) {
      setLastKrQuoteBulkAt(new Date().toISOString());
    }
    setKrQuoteRefreshing(false);
    if (fail > 0) {
      const allFailed = ok === 0;
      window.alert(
        allFailed
          ? `시세를 가져오지 못했습니다(${fail}건). 네트워크·배포 환경의 시세 프록시(/api/kr-quote)를 확인해 주세요.`
          : `시세 갱신: 성공 ${ok}건, 실패 ${fail}건`,
      );
    }
  }, [positions, krPreferExtendedQuote]);

  const handleSyncKrxSectors = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.alert(
        '네트워크에 연결되어 있지 않습니다. 연결 후 KRX 동기화를 다시 시도해 주세요.',
      );
      return;
    }
    setKrxSectorSyncing(true);
    try {
      const next = await applyKrxMetadataToKrTrades(trades);
      let changed = 0;
      next.forEach((t, i) => {
        const o = trades[i];
        if (t.sector !== o.sector || t.name !== o.name) changed += 1;
      });
      setTrades(next);
      window.alert(
        `KRX 상장목록 기준으로 종목명·섹터(업종)를 맞췄습니다. 변경: ${changed}건`,
      );
    } catch {
      window.alert(
        'KRX 목록을 불러오지 못했습니다. 개발 서버 재시작 후 다시 시도해 주세요.',
      );
    } finally {
      setKrxSectorSyncing(false);
    }
  }, [trades]);

  const visibleTodos = useMemo(
    () =>
      marketTab === 'all'
        ? []
        : todos.filter((x) => x.market === marketTab),
    [todos, marketTab],
  );

  const marketCounts = useMemo(
    () => ({
      all: positions.length,
      KR: positions.filter((p) => p.market === 'KR').length,
      US: positions.filter((p) => p.market === 'US').length,
    }),
    [positions],
  );

  const visiblePositions = useMemo(
    () => filterByMarket(positions, marketTab),
    [positions, marketTab],
  );

  const krQuoteDisclaimer = useMemo(() => {
    if (marketTab !== 'KR') return null;
    const suffix = '(시차·지연 가능, 예상 손익은 참고용)';
    const pnlNote =
      `한국장 예상손익·수익률: 현재가로 전량 매도 가정 시 증권거래세+농특세 ${(KR_SELL_TAX_RATE * 100).toFixed(2)}%` +
      ` 및 위탁 수수료 ${(krSellCommissionRate * 100).toFixed(3)}%(설정값)을 매도금액 기준으로 차감했습니다. 매수측 수수료는 평단에 포함된 것으로 보지 않고 별도로 빼지 않습니다.`;
    let head: string;
    const extLine = krPreferExtendedQuote
      ? '갱신 시 네이버 모바일 API로 장외(Over market·NXT 등) 호가를 우선하며, 없으면 PC 지연 시세로 대체합니다. KRX 「시간외 단일가」 전용 표기와 숫자가 다를 수 있습니다.'
      : '';
    if (lastKrQuoteBulkAt) {
      head = `시세: 네이버 증권 지연 시세 · 마지막 일괄 갱신 ${formatQuoteUpdatedLabel(lastKrQuoteBulkAt)} ${suffix}`;
    } else {
      const times = visiblePositions
        .filter((p) => p.market === 'KR' && /^\d{6}$/.test(p.ticker))
        .map((p) => quoteUpdatedAt[p.ticker])
        .filter(Boolean) as string[];
      if (times.length === 0) {
        head =
          '시세는 네이버 증권 지연 시세입니다. 「시세 갱신」으로 불러오세요. 장 운영·지연에 따라 실제 체결가와 다를 수 있습니다.';
      } else {
        const latest = times.reduce((a, b) => (a > b ? a : b));
        head = `시세: 네이버 증권 지연 시세 · 시세 기준 ${formatQuoteUpdatedLabel(latest)} ${suffix}`;
      }
    }
    const lines = [head, pnlNote];
    if (extLine) lines.push(extLine);
    return lines.join('\n');
  }, [
    marketTab,
    visiblePositions,
    quoteUpdatedAt,
    lastKrQuoteBulkAt,
    krSellCommissionRate,
    krPreferExtendedQuote,
  ]);

  const krPnlCostFootnote = useMemo(
    () =>
      `한국장 손익: 매도 시 세금 ${(KR_SELL_TAX_RATE * 100).toFixed(2)}% + 수수료 ${(krSellCommissionRate * 100).toFixed(3)}%(설정) 반영.`,
    [krSellCommissionRate],
  );
  const visibleTrades = useMemo(
    () =>
      marketTab === 'all'
        ? trades
        : trades.filter((t) => t.market === marketTab),
    [trades, marketTab],
  );

  const metrics = useMemo(
    () =>
      buildPositionMetrics(visiblePositions, {
        krSellCommissionRate,
      }),
    [visiblePositions, krSellCommissionRate],
  );
  const summary = useMemo(
    () => buildPortfolioSummary(visiblePositions, metrics),
    [visiblePositions, metrics],
  );
  const topStocks = useMemo(
    () => buildTopStockWeights(visiblePositions, metrics, 10),
    [visiblePositions, metrics],
  );

  const allKrPositions = useMemo(
    () => positions.filter((p) => p.market === 'KR'),
    [positions],
  );
  const allUsPositions = useMemo(
    () => positions.filter((p) => p.market === 'US'),
    [positions],
  );
  const krMetricsAll = useMemo(
    () =>
      buildPositionMetrics(allKrPositions, {
        krSellCommissionRate,
      }),
    [allKrPositions, krSellCommissionRate],
  );
  const usMetricsAll = useMemo(
    () => buildPositionMetrics(allUsPositions),
    [allUsPositions],
  );
  const krSummaryAll = useMemo(
    () =>
      allKrPositions.length === 0
        ? null
        : buildPortfolioSummary(allKrPositions, krMetricsAll),
    [allKrPositions, krMetricsAll],
  );
  const usSummaryAll = useMemo(
    () =>
      allUsPositions.length === 0
        ? null
        : buildPortfolioSummary(allUsPositions, usMetricsAll),
    [allUsPositions, usMetricsAll],
  );

  const marketSplitWeights = useMemo(() => {
    const total = metrics.reduce((s, m) => s + m.market_value, 0);
    let kr = 0;
    let us = 0;
    visiblePositions.forEach((p, i) => {
      const mv = metrics[i]?.market_value ?? 0;
      if (p.market === 'KR') kr += mv;
      else us += mv;
    });
    return {
      KR: total > 0 ? (kr / total) * 100 : 0,
      US: total > 0 ? (us / total) * 100 : 0,
    } as const;
  }, [visiblePositions, metrics]);

  const detailPosition = detailId
    ? (positions.find((p) => p.id === detailId) ?? null)
    : null;
  const metricById = useMemo(
    () => new Map(metrics.map((m) => [m.positionId, m])),
    [metrics],
  );
  const detailMetric = detailPosition
    ? metricById.get(detailPosition.id) ?? null
    : null;
  const detailTrades = useMemo(
    () =>
      detailPosition
        ? trades.filter((t) => t.ticker === detailPosition.ticker)
        : [],
    [detailPosition, trades],
  );
  const detailTodos = useMemo(
    () =>
      detailPosition
        ? todos.filter(
            (x) =>
              x.ticker === detailPosition.ticker &&
              x.market === detailPosition.market,
          )
        : [],
    [detailPosition, todos],
  );
  const detailNoteKey = detailPosition
    ? `${detailPosition.market}:${detailPosition.ticker}`
    : '';

  const unifiedCurrency = useMemo(
    () => getUnifiedPortfolioCurrency(visiblePositions),
    [visiblePositions],
  );

  const unifiedCurrencyAll = useMemo(
    () => getUnifiedPortfolioCurrency(positions),
    [positions],
  );

  const showMixedBanner =
    marketTab === 'all' &&
    unifiedCurrency === null &&
    visiblePositions.length > 0;

  const showSplitSummary =
    marketTab === 'all' &&
    positions.length > 0 &&
    unifiedCurrencyAll === null;

  useEffect(() => {
    if (!enabledTabs.includes(marketTab)) {
      setMarketTab(enabledTabs[0]);
    }
  }, [marketTab, enabledTabs]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background">
      <div
        className={
          appLocked
            ? 'pointer-events-none select-none blur-[2px]'
            : undefined
        }
      >
      <header className="border-b border-border bg-surface/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] backdrop-blur sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-textMain">
              TraderOS — Portfolio Visual
            </h1>
            <p className="text-[12px] text-textMuted">
              매매일지·시세 기반 평단 · 한국장/미국장 탭 · 로컬 저장
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {user ? (
              <p className="rounded-md border border-border px-2 py-1 text-[12px] text-textMuted">
                계정: {user.email ?? user.displayName ?? '로그인됨'}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="min-h-[44px] min-w-[44px] rounded-md border border-border px-3 py-2 text-sm font-medium text-textMuted hover:bg-white/5 hover:text-textMain sm:min-h-0 sm:min-w-0"
            >
              설정
            </button>
          </div>
        </div>
      </header>
      {!networkOnline ? (
        <div
          role="status"
          className="border-b border-warning/45 bg-warning/15 px-4 py-2.5 text-center text-[12px] leading-snug text-warning sm:px-6"
        >
          오프라인입니다. 시세 갱신·KRX 동기화·클라우드 저장은 연결 후 다시 시도해
          주세요. 이 기기의 편집은 로컬에만 반영됩니다.
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:px-6">
        <MarketTabs
          value={marketTab}
          onChange={setMarketTab}
          counts={marketCounts}
          enabledTabs={enabledTabs}
        />

        {persistenceWarning ? (
          <div
            role="alert"
            className="rounded-lg border border-warning/50 bg-warning/15 px-3 py-2.5 text-[12px] leading-snug text-warning"
          >
            {persistenceWarning}
          </div>
        ) : null}

        {marketTab === 'KR' ? (
          <KrPnlAssumptionsCard
            krSellCommissionRate={krSellCommissionRate}
            onKrSellCommissionRateChange={setKrSellCommissionRate}
            krPreferExtendedQuote={krPreferExtendedQuote}
            onKrPreferExtendedQuoteChange={setKrPreferExtendedQuote}
          />
        ) : null}

        {visiblePositions.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-14 text-center">
            <p className="text-sm text-textMuted">
              {marketTab === 'all'
                ? '보유 종목이 없습니다. 매매일지에서 거래를 추가하세요.'
                : marketTab === 'KR'
                  ? '한국장에 해당하는 종목이 없습니다.'
                  : '미국장에 해당하는 종목이 없습니다.'}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setAddHoldingOpen(true)}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                + 보유종목 추가
              </button>
            </div>
          </div>
        ) : (
          <>
            {showMixedBanner && <MixedCurrencyBanner />}
            {showSplitSummary ? (
              <MarketPairSummaryCards
                krSummary={krSummaryAll}
                usSummary={usSummaryAll}
                krFootnote={krPnlCostFootnote}
              />
            ) : (
              <SummaryCards
                summary={summary}
                quoteDisclaimer={krQuoteDisclaimer}
              />
            )}
            <HoldingsTable
              positions={visiblePositions}
              metrics={metrics}
              summary={summary}
              filterText={filterText}
              onFilterChange={setFilterText}
              onOpenDetail={setDetailId}
              onOpenAddHolding={() => setAddHoldingOpen(true)}
              onUploadCsv={handleUploadCsv}
              krQuoteRefreshing={krQuoteRefreshing}
              onRefreshKrQuotes={() => void refreshKrQuotes()}
              lastKrQuoteBulkAt={lastKrQuoteBulkAt}
              krDayOpenByTicker={krDayOpenByTicker}
              pendingTodoCountByPositionId={pendingTodoCountByPositionId}
            />
          </>
        )}

        <RealizedPnlPanel
          trades={visibleTrades}
          krSellCommissionRate={krSellCommissionRate}
        />
        <TradeJournal
          trades={visibleTrades}
          ledger={ledger}
          quotes={quotes}
          onOpenAddTrade={handleOpenAddTrade}
          onEditTrade={handleOpenEditTrade}
          onMarkTradeFilled={handleMarkTradeFilled}
          krSellCommissionRate={krSellCommissionRate}
        />

        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartSkeleton label="종목 비중 차트 불러오는 중…" />
              <ChartSkeleton label="실현손익 차트 불러오는 중…" />
            </div>
          }
        >
          <div className="space-y-6">
            {marketTab === 'all' ? (
              <MarketSplitCard weights={marketSplitWeights} />
            ) : null}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <StockBarChart
                data={topStocks}
                currency={summary.currency}
              />
              <RealizedDailyBarChart
                trades={visibleTrades}
                krSellCommissionRate={krSellCommissionRate}
                marketTab={marketTab}
              />
            </div>
          </div>
        </Suspense>
      </main>
      {marketTab !== 'all' && (
        <div className="mx-auto mb-6 max-w-7xl px-4 sm:px-6">
          <MarketTodoList
            market={marketTab}
            items={visibleTodos}
            quotes={quotes}
            onAdd={(payload) =>
              setTodos((prev) => [
                ...prev,
                {
                  id: `todo-${Date.now()}`,
                  done: false,
                  createdAt: new Date().toISOString(),
                  ...payload,
                },
              ])
            }
            onToggleDone={(id) =>
              setTodos((prev) =>
                prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
              )
            }
            onDelete={(id) =>
              setTodos((prev) => prev.filter((x) => x.id !== id))
            }
            onOpenHoldingDetail={handleOpenHoldingFromTodo}
          />
        </div>
      )}
      <input
        ref={importFileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          handleImportPortfolioFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <AppSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onConfirmResetSample={handleResetData}
        onSyncKrxSectors={handleSyncKrxSectors}
        krxSectorSyncing={krxSectorSyncing}
        onConfirmClearHoldings={handleClearHoldings}
        firebaseCloudEnabled={firebaseConfigured}
        cloudAuthReady={authReady}
        cloudUserEmail={user?.email ?? user?.displayName ?? null}
        cloudBusy={cloudBusy}
        cloudSessionReady={cloudSessionReady}
        cloudError={cloudError}
        networkOnline={networkOnline}
        onCloudSignIn={handleCloudSignIn}
        onCloudSignOut={handleCloudSignOut}
        onCloudPushNow={handleCloudPushNow}
        onExportPortfolio={handleExportPortfolio}
        onImportPortfolioPick={() => importFileRef.current?.click()}
        onOpenTutorial={() => {
          markOnboardingDone(false);
          setSettingsOpen(false);
          setOnboardingOpen(true);
        }}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        appLockEnabled={appLockEnabled}
        onSetAppPin={handleSetAppPin}
        onDisableAppPin={handleDisableAppPin}
        onLockNow={handleLockNow}
      />
      <AddTradeModal
        open={addTradeOpen}
        contextMarket={marketTab === 'KR' ? 'KR' : undefined}
        initialTrade={tradeToEdit}
        onClose={handleCloseAddTradeModal}
        onAdd={handleAddTrade}
        onUpdate={handleUpdateTrade}
        getAvailableQuantity={getAvailableQuantity}
      />
      <AddHoldingModal
        open={addHoldingOpen}
        market={marketTab === 'all' ? 'KR' : marketTab}
        onClose={() => setAddHoldingOpen(false)}
        onAdd={handleAddHolding}
      />
      <PositionDetailModal
        position={detailPosition}
        metric={detailMetric}
        trades={detailTrades}
        todos={detailTodos}
        note={detailNoteKey ? notes[detailNoteKey] ?? '' : ''}
        onSaveNote={(next) => {
          if (!detailNoteKey) return;
          setNotes((prev) => ({ ...prev, [detailNoteKey]: next }));
        }}
        onAddTodo={(payload) =>
          setTodos((prev) => [
            ...prev,
            {
              id: `todo-${Date.now()}`,
              done: false,
              createdAt: new Date().toISOString(),
              ...payload,
            },
          ])
        }
        onClose={() => setDetailId(null)}
        onAdjustPosition={
          detailPosition
            ? (qty, avg) =>
                handleAdjustPosition(detailPosition.ticker, qty, avg, {
                  name: detailPosition.name,
                  sector: detailPosition.sector,
                  market: detailPosition.market,
                  currency: detailPosition.currency,
                })
            : undefined
        }
        onMarkTradeFilled={handleMarkTradeFilled}
      />
      {onboardingOpen && !appLocked ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-textMain">처음 사용 가이드</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-textMuted">
              30초만 보면 바로 쓸 수 있어요.
            </p>
            <ol className="mt-4 space-y-2 text-[13px] text-textMain">
              <li>1) 「+ 보유종목」으로 현재 보유를 먼저 입력하세요.</li>
              <li>2) 「시세 갱신」으로 현재가/당일 시가를 동기화하세요.</li>
              <li>3) 하단 To-do에서 매수/매도 계획을 기록하세요.</li>
              <li>4) 설정의 「백업 파일 보내기」로 정기 백업하세요.</li>
            </ol>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => closeOnboarding(false)}
                className="rounded-md border border-border px-3 py-2 text-sm text-textMain hover:bg-white/5"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={() => closeOnboarding(true)}
                className="rounded-md border border-border px-3 py-2 text-sm text-textMain hover:bg-white/5"
              >
                다시 보지 않기
              </button>
              <button
                type="button"
                onClick={() => closeOnboarding(true)}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                시작하기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
      {appLocked ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-textMain">앱 잠금</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-textMuted">
              이 기기의 개인정보 보호를 위해 PIN을 입력해 잠금을 해제하세요.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleUnlockApp();
              }}
            >
              <input
                value={unlockPin}
                onChange={(e) => {
                  setUnlockPin(e.target.value);
                  if (unlockError) setUnlockError(null);
                }}
                disabled={unlockBusy || unlockBlockedSec > 0}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="PIN 4자리"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
              />
              {unlockError ? (
                <p className="text-[12px] text-negative">{unlockError}</p>
              ) : null}
              {unlockBlockedSec > 0 ? (
                <p className="text-[12px] text-warning">
                  잠금 해제 시도 제한 중: {unlockBlockedSec}초 후 다시 시도
                </p>
              ) : null}
              <button
                type="submit"
                disabled={unlockBusy || unlockBlockedSec > 0}
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {unlockBusy ? '확인 중…' : '잠금 해제'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
