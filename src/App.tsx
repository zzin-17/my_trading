import { lazy, Suspense, useMemo, useState } from 'react';
import { SummaryCards } from './components/SummaryCards';
import { HoldingsTable } from './components/HoldingsTable';
import { EditPriceModal } from './components/EditPriceModal';
import { mockPortfolio } from './data/mockPortfolio';
import {
  buildPortfolioSummary,
  buildPositionMetrics,
  buildSectorWeights,
  buildTopStockWeights,
  getUnifiedPortfolioCurrency,
} from './lib/portfolioMath';
import { MixedCurrencyBanner } from './components/MixedCurrencyBanner';
import type { Position } from './types/portfolio';

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

function clonePositions(positions: Position[]): Position[] {
  return positions.map((p) => ({ ...p }));
}

export default function App() {
  const [positions, setPositions] = useState<Position[]>(() =>
    clonePositions(mockPortfolio.positions),
  );
  const [filterText, setFilterText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const metrics = useMemo(() => buildPositionMetrics(positions), [positions]);
  const summary = useMemo(
    () => buildPortfolioSummary(positions, metrics),
    [positions, metrics],
  );
  const sectors = useMemo(
    () => buildSectorWeights(positions, metrics),
    [positions, metrics],
  );
  const topStocks = useMemo(
    () => buildTopStockWeights(positions, metrics, 10),
    [positions, metrics],
  );

  const editing = editingId
    ? (positions.find((p) => p.id === editingId) ?? null)
    : null;

  const unifiedCurrency = useMemo(
    () => getUnifiedPortfolioCurrency(positions),
    [positions],
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/90 px-4 py-4 backdrop-blur sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight text-textMain">
          TraderOS — Portfolio Visual
        </h1>
        <p className="text-[12px] text-textMuted">MVP v1 · 모크 데이터</p>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {unifiedCurrency === null && positions.length > 0 && <MixedCurrencyBanner />}
        <SummaryCards summary={summary} />
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartSkeleton label="섹터 차트 불러오는 중…" />
              <ChartSkeleton label="종목 차트 불러오는 중…" />
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectorDonutChart sectors={sectors} currency={summary.currency} />
            <StockBarChart data={topStocks} currency={summary.currency} />
          </div>
        </Suspense>
        <HoldingsTable
          positions={positions}
          metrics={metrics}
          summary={summary}
          filterText={filterText}
          onFilterChange={setFilterText}
          onEditPrice={setEditingId}
        />
      </main>
      <EditPriceModal
        position={editing}
        onClose={() => setEditingId(null)}
        onSave={(id, nextPrice) => {
          setPositions((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, current_price: nextPrice } : p,
            ),
          );
        }}
      />
    </div>
  );
}
