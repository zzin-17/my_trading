import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SummaryCards } from './components/SummaryCards';
import { MarketPairSummaryCards } from './components/MarketPairSummaryCards';
import { HoldingsTable } from './components/HoldingsTable';
import { TradeJournal } from './components/TradeJournal';
import { EditPriceModal } from './components/EditPriceModal';
import { AddTradeModal } from './components/AddTradeModal';
import { MarketTabs, type MarketTab } from './components/MarketTabs';
import { MarketSplitCard } from './components/MarketSplitCard';
import { tradeSeed } from './data/tradeSeed';
import {
  buildPortfolioSummary,
  buildPositionMetrics,
  buildSectorWeights,
  buildTopStockWeights,
  getUnifiedPortfolioCurrency,
} from './lib/portfolioMath';
import { filterByMarket } from './lib/market';
import { computeLedger, ledgerToPositions } from './lib/ledger';
import { savePersisted, clearPersisted } from './lib/persistence';
import {
  getInitialAppState,
  clearInitialAppStateCache,
} from './lib/portfolioBootstrap';
import { MixedCurrencyBanner } from './components/MixedCurrencyBanner';
import type { Trade } from './types/trade';

const SectorDonutChart = lazy(() =>
  import('./components/SectorDonutChart').then((m) => ({
    default: m.SectorDonutChart,
  })),
);

const StockBarChart = lazy(() =>
  import('./components/StockBarChart').then((m) => ({
    default: m.StockBarChart,
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
  const [trades, setTrades] = useState<Trade[]>(
    () => getInitialAppState().trades,
  );
  const [quotes, setQuotes] = useState<Record<string, number>>(
    () => getInitialAppState().quotes,
  );
  const [positionIds, setPositionIds] = useState<Record<string, string>>(
    () => getInitialAppState().positionIds,
  );

  const [marketTab, setMarketTab] = useState<MarketTab>('all');
  const [filterText, setFilterText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addTradeOpen, setAddTradeOpen] = useState(false);

  useEffect(() => {
    savePersisted({ trades, quotes, positionIds });
  }, [trades, quotes, positionIds]);

  const ledger = useMemo(() => computeLedger(trades), [trades]);
  const positions = useMemo(
    () => ledgerToPositions(ledger, quotes, positionIds),
    [ledger, quotes, positionIds],
  );

  const getAvailableQuantity = useCallback(
    (ticker: string) => ledger.get(ticker)?.quantity ?? 0,
    [ledger],
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

  const handleResetData = useCallback(() => {
    clearPersisted();
    clearInitialAppStateCache();
    setTrades([...tradeSeed.trades]);
    setQuotes({ ...tradeSeed.quotes });
    setPositionIds({ ...tradeSeed.positionIds });
  }, []);

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
  const visibleTrades = useMemo(
    () =>
      marketTab === 'all'
        ? trades
        : trades.filter((t) => t.market === marketTab),
    [trades, marketTab],
  );

  const metrics = useMemo(
    () => buildPositionMetrics(visiblePositions),
    [visiblePositions],
  );
  const summary = useMemo(
    () => buildPortfolioSummary(visiblePositions, metrics),
    [visiblePositions, metrics],
  );
  const sectors = useMemo(
    () => buildSectorWeights(visiblePositions, metrics),
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
    () => buildPositionMetrics(allKrPositions),
    [allKrPositions],
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

  const editing = editingId
    ? (positions.find((p) => p.id === editingId) ?? null)
    : null;

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/90 px-4 py-4 backdrop-blur sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight text-textMain">
          TraderOS — Portfolio Visual
        </h1>
        <p className="text-[12px] text-textMuted">
          매매일지·시세 기반 평단 · 한국장/미국장 탭 · 로컬 저장
        </p>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <MarketTabs
          value={marketTab}
          onChange={setMarketTab}
          counts={marketCounts}
        />

        {visiblePositions.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-14 text-center">
            <p className="text-sm text-textMuted">
              {marketTab === 'all'
                ? '보유 종목이 없습니다. 매매일지에서 거래를 추가하세요.'
                : marketTab === 'KR'
                  ? '한국장에 해당하는 종목이 없습니다.'
                  : '미국장에 해당하는 종목이 없습니다.'}
            </p>
          </div>
        ) : (
          <>
            {showMixedBanner && <MixedCurrencyBanner />}
            {showSplitSummary ? (
              <MarketPairSummaryCards
                krSummary={krSummaryAll}
                usSummary={usSummaryAll}
              />
            ) : (
              <SummaryCards summary={summary} />
            )}
            <Suspense
              fallback={
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <ChartSkeleton label="시장별 차트 불러오는 중…" />
                  <ChartSkeleton label="섹터 차트 불러오는 중…" />
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {marketTab === 'all' ? (
                  <>
                    <MarketSplitCard weights={marketSplitWeights} />
                    <SectorDonutChart
                      sectors={sectors}
                      currency={summary.currency}
                    />
                  </>
                ) : (
                  <>
                    <SectorDonutChart
                      sectors={sectors}
                      currency={summary.currency}
                    />
                    <StockBarChart
                      data={topStocks}
                      currency={summary.currency}
                    />
                  </>
                )}
              </div>
            </Suspense>
            <HoldingsTable
              positions={visiblePositions}
              metrics={metrics}
              summary={summary}
              filterText={filterText}
              onFilterChange={setFilterText}
              onEditPrice={setEditingId}
            />
          </>
        )}

        <TradeJournal
          trades={visibleTrades}
          ledger={ledger}
          quotes={quotes}
          onOpenAddTrade={() => setAddTradeOpen(true)}
          onResetData={handleResetData}
        />
      </main>
      <EditPriceModal
        position={editing}
        onClose={() => setEditingId(null)}
        onSave={(id, nextPrice) => {
          const p = positions.find((x) => x.id === id);
          if (p) {
            setQuotes((prev) => ({ ...prev, [p.ticker]: nextPrice }));
          }
        }}
      />
      <AddTradeModal
        open={addTradeOpen}
        onClose={() => setAddTradeOpen(false)}
        onAdd={handleAddTrade}
        getAvailableQuantity={getAvailableQuantity}
      />
    </div>
  );
}
