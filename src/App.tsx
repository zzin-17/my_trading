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
import { defaultCurrencyForMarket, filterByMarket } from './lib/market';
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

function tickersEqual(a: string, b: string, market: Market): boolean {
  const na =
    market === 'KR' ? a.replace(/\s/g, '').trim() : a.trim().toUpperCase();
  const nb =
    market === 'KR' ? b.replace(/\s/g, '').trim() : b.trim().toUpperCase();
  return na === nb;
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

  const [marketTab, setMarketTab] = useState<MarketTab>('KR');
  const [filterText, setFilterText] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);
  const [krQuoteRefreshing, setKrQuoteRefreshing] = useState(false);
  const [krxSectorSyncing, setKrxSectorSyncing] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  });
  const importFileRef = useRef<HTMLInputElement>(null);
  const hadUserRef = useRef(false);
  const [cloudSessionReady, setCloudSessionReady] = useState(true);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
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
          setCloudError(
            e instanceof Error ? e.message : '클라우드 동기화에 실패했습니다.',
          );
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
        try {
          await pushCloudPortfolio(uid, portfolioRef.current);
          setCloudError(null);
        } catch (e) {
          setCloudError(
            e instanceof Error
              ? e.message
              : '클라우드 자동 저장에 실패했습니다.',
          );
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
    setCloudBusy(true);
    setCloudError(null);
    try {
      await pushCloudPortfolio(user.uid, portfolioRef.current);
      window.alert('클라우드에 저장했습니다.');
    } catch (e) {
      setCloudError(
        e instanceof Error ? e.message : '클라우드에 저장하지 못했습니다.',
      );
    } finally {
      setCloudBusy(false);
    }
  }, [user]);

  const handleCloudSignIn = useCallback(async () => {
    setCloudError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setCloudError(
        e instanceof Error ? e.message : 'Google 로그인에 실패했습니다.',
      );
    }
  }, [signInWithGoogle]);

  const handleCloudSignOut = useCallback(async () => {
    setCloudError(null);
    setCloudBusy(true);
    try {
      if (user) {
        await pushCloudPortfolio(user.uid, portfolioRef.current);
      }
      await signOutUser();
      wipePrivatePortfolio();
    } catch (e) {
      setCloudError(
        e instanceof Error
          ? `로그아웃 전 클라우드 저장/로그아웃 실패: ${e.message}`
          : '로그아웃 전 클라우드 저장 또는 로그아웃에 실패했습니다.',
      );
    } finally {
      setCloudBusy(false);
    }
  }, [signOutUser, wipePrivatePortfolio, user]);

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
  ]);

  const ledger = useMemo(() => computeLedger(trades), [trades]);
  const positions = useMemo(
    () => ledgerToPositions(ledger, quotes, positionIds),
    [ledger, quotes, positionIds],
  );

  const getAvailableQuantity = useCallback(
    (ticker: string) => {
      const q = ledger.get(ticker)?.quantity ?? 0;
      const pendingSell = trades
        .filter(
          (tr) =>
            tr.ticker === ticker &&
            tr.side === 'sell' &&
            tr.executionStatus === 'pending',
        )
        .reduce((sum, tr) => sum + tr.quantity, 0);
      return Math.max(0, q - pendingSell);
    },
    [ledger, trades],
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
            ok += 1;
          } catch {
            fail += 1;
          }
        }),
      );
    }
    setQuotes((prev) => ({ ...prev, ...nextQuotes }));
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/90 px-4 py-4 backdrop-blur sm:px-6">
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
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-textMuted hover:bg-white/5 hover:text-textMain"
            >
              설정
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
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
          onOpenAddTrade={() => setAddTradeOpen(true)}
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
        onCloudSignIn={handleCloudSignIn}
        onCloudSignOut={handleCloudSignOut}
        onCloudPushNow={handleCloudPushNow}
        onExportPortfolio={handleExportPortfolio}
        onImportPortfolioPick={() => importFileRef.current?.click()}
      />
      <AddTradeModal
        open={addTradeOpen}
        onClose={() => setAddTradeOpen(false)}
        onAdd={handleAddTrade}
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
    </div>
  );
}
