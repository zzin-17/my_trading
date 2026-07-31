import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Position, PositionMetrics, PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent, formatQuoteUpdatedLabel } from '../lib/format';
import { isConcentrationRisk, roundPercent } from '../lib/portfolioMath';
import { fetchKrBoardByTicker } from '../lib/krxLookup';
import { krBoardBadgeClass, krBoardDisplayLabel } from '../lib/krBoardUi';
import { normalizeKrTicker } from '../lib/krxLookup';
import type { KrPriceStatus } from '../lib/naverKrQuote';
import { ExpandableText } from './ExpandableText';
import {
  isKrOpenAttention,
  krOpenDeviationPct,
  KR_OPEN_ATTENTION_ABS_PCT,
} from '../lib/krOpenDeviation';

/** 한국 장 관례: 플러스 빨강, 마이너스 파랑 */
function krPnLClass(value: number): string {
  if (value > 0) return 'text-red-400';
  if (value < 0) return 'text-blue-400';
  return 'text-textMain';
}

function todoBadgeLabel(pendingCount: number, reachedCount: number): string {
  if (pendingCount <= 0) return '';
  if (reachedCount <= 0) return String(pendingCount);
  if (reachedCount >= pendingCount) return `${pendingCount} 도달`;
  return `${reachedCount}/${pendingCount} 도달`;
}

function currentPriceEmphasis(
  openAttention: boolean,
  currentPrice: number,
  dayOpen?: number,
): 'pos' | 'neg' | 'warn' | undefined {
  if (!openAttention) return undefined;
  if (dayOpen === undefined || dayOpen <= 0) return 'warn';
  if (currentPrice > dayOpen) return 'pos';
  if (currentPrice < dayOpen) return 'neg';
  return 'warn';
}

function krPriceStatusLabel(status: KrPriceStatus): string {
  switch (status) {
    case 'upper_limit':
      return '상';
    case 'lower_limit':
      return '하';
    case 'buy_circuit':
      return '서킷';
    case 'sell_circuit':
      return '서킷';
  }
}

function krPriceStatusTone(status: KrPriceStatus): 'pos' | 'neg' {
  return status === 'upper_limit' || status === 'buy_circuit' ? 'pos' : 'neg';
}

export type HoldingSortKey =
  | 'board'
  | 'ticker'
  | 'name'
  | 'current_price'
  | 'avg_price'
  | 'quantity'
  | 'market_value'
  | 'pnl'
  | 'return_pct'
  | 'weight';

export type SortDir = 'asc' | 'desc';

function SortableColumnHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string;
  columnKey: HoldingSortKey;
  sortKey: HoldingSortKey;
  sortDir: SortDir;
  onSort: (k: HoldingSortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sortKey === columnKey;
  const sortTitle = active
    ? sortDir === 'asc'
      ? '오름차순 · 다시 클릭하면 내림차순'
      : '내림차순 · 다시 클릭하면 오름차순'
    : '클릭하여 오름차순 정렬';
  return (
    <th scope="col" className={className} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        title={sortTitle}
        className={`inline-flex w-full min-w-0 items-center gap-0.5 rounded px-0.5 py-0.5 text-textMuted transition hover:bg-white/5 hover:text-textMain ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        <span>{label}</span>
        <span
          className={`shrink-0 text-[10px] tabular-nums ${active ? 'text-accent' : 'text-textMuted/35'}`}
          aria-hidden
        >
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

interface HoldingsTableProps {
  positions: Position[];
  metrics: PositionMetrics[];
  summary: PortfolioSummary;
  filterText: string;
  onFilterChange: (text: string) => void;
  onOpenDetail: (id: string) => void;
  onOpenAddHolding: () => void;
  onUploadCsv: (file: File) => void;
  krQuoteRefreshing: boolean;
  onRefreshKrQuotes: () => void;
  /** 마지막 시세 갱신 버튼으로 일괄 반영한 시각 */
  lastKrQuoteBulkAt: string | null;
  /** 시세 갱신 시 받은 당일 시가(티커→원). 없으면 시가 대비 강조 없음 */
  krDayOpenByTicker?: Record<string, number>;
  /** 현재가 앞에 붙일 상/하한가·서킷 상태 */
  krPriceStatusByTicker?: Record<string, KrPriceStatus>;
  /** 포지션별 미완료 To-do 개수(보유와 티커·시장이 일치하는 항목) */
  pendingTodoCountByPositionId?: Record<string, number>;
  /** 포지션별 도달 상태 미완료 To-do 개수 */
  reachedTodoCountByPositionId?: Record<string, number>;
  /** 포지션별 거래 가능 수량 = 보유수량 - 미체결 매도 수량 */
  availableQuantityByPositionId?: Record<string, number>;
}

export function HoldingsTable({
  positions,
  metrics,
  summary,
  filterText,
  onFilterChange,
  onOpenDetail,
  onOpenAddHolding,
  onUploadCsv,
  krQuoteRefreshing,
  onRefreshKrQuotes,
  lastKrQuoteBulkAt,
  krDayOpenByTicker = {},
  krPriceStatusByTicker = {},
  pendingTodoCountByPositionId = {},
  reachedTodoCountByPositionId = {},
  availableQuantityByPositionId = {},
}: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<HoldingSortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [mobileScrollLeft, setMobileScrollLeft] = useState(0);
  const [krBoardByTicker, setKrBoardByTicker] = useState<Map<string, string>>(
    () => new Map(),
  );
  const mobileNameColWidth = '7.25rem';
  const mobileMetricGridTemplate =
    'minmax(5.35rem,1.2fr) minmax(4.25rem,0.95fr) minmax(5.35rem,1.2fr) minmax(5.35rem,1.2fr)';
  const mobileMetricColsWidth = '20.3rem';
  const mobileTotalMinWidth = '27.55rem';

  const handleSortHeader = useCallback((key: HoldingSortKey) => {
    // setSortDir를 setSortKey 업데이트 함수 안에서 호출하면 배치 순서 때문에 토글이 누락될 수 있음
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  useEffect(() => {
    let cancelled = false;
    fetchKrBoardByTicker()
      .then((m) => {
        if (!cancelled) setKrBoardByTicker(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const q = filterText.trim().toLowerCase();
  const rows = useMemo(() => {
    const byId = new Map(metrics.map((m) => [m.positionId, m]));
    return positions
      .map((p) => ({ p, m: byId.get(p.id)! }))
      .filter(
        ({ p }) =>
          !q ||
          p.ticker.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.sector.toLowerCase().includes(q),
      );
  }, [positions, metrics, q]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const retPct = (m: PositionMetrics) =>
      m.cost_basis > 0 ? (m.pnl / m.cost_basis) * 100 : 0;

    arr.sort((a, b) => {
      const { p: pa, m: ma } = a;
      const { p: pb, m: mb } = b;
      let v = 0;
      switch (sortKey) {
        case 'name':
          v = pa.name.localeCompare(pb.name, 'ko');
          break;
        case 'ticker':
          v = pa.ticker.localeCompare(pb.ticker, undefined, { numeric: true });
          break;
        case 'board': {
          const la = krBoardDisplayLabel(
            pa.market,
            pa.market === 'KR' ? krBoardByTicker.get(pa.ticker) : undefined,
          );
          const lb = krBoardDisplayLabel(
            pb.market,
            pb.market === 'KR' ? krBoardByTicker.get(pb.ticker) : undefined,
          );
          v = la.localeCompare(lb, 'ko');
          break;
        }
        case 'current_price':
          v = pa.current_price - pb.current_price;
          break;
        case 'avg_price':
          v = pa.avg_price - pb.avg_price;
          break;
        case 'quantity':
          v = pa.quantity - pb.quantity;
          break;
        case 'market_value':
          v = ma.market_value - mb.market_value;
          break;
        case 'pnl':
          v = ma.pnl - mb.pnl;
          break;
        case 'return_pct':
          v = retPct(ma) - retPct(mb);
          break;
        case 'weight':
          v = ma.weight_pct - mb.weight_pct;
          break;
        default:
          v = 0;
      }
      if (v !== 0) return sortDir === 'asc' ? v : -v;
      return pa.ticker.localeCompare(pb.ticker, undefined, { numeric: true });
    });
    return arr;
  }, [rows, sortKey, sortDir, krBoardByTicker]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 md:rounded-none md:border-x-0 md:border-y md:bg-transparent md:px-0">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-textMain">보유 종목</h3>
            <p className="mt-0.5 hidden text-[10px] leading-relaxed text-textMuted md:block">
              검색 · 정렬 · 상세 확인 · 시가 대비 ±{KR_OPEN_ATTENTION_ABS_PCT}% 이상 현재가 강조
            </p>
            <ExpandableText
              text={`검색 · 정렬 · 상세 확인 · 시가 대비 ±${KR_OPEN_ATTENTION_ABS_PCT}% 이상 현재가 강조`}
              maxChars={26}
              className="mt-0.5 md:hidden"
              textClassName="text-[12px] leading-relaxed text-textMuted"
            />
          </div>
          {lastKrQuoteBulkAt ? (
            <p className="shrink-0 text-[11px] tabular-nums text-textMuted/90 sm:pt-0.5 sm:text-right">
              시세 갱신 {formatQuoteUpdatedLabel(lastKrQuoteBulkAt)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <input
            type="search"
            placeholder="코드·종목 검색"
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            className="min-w-0 w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-textMain outline-none focus:border-accent sm:max-w-[14rem] lg:max-w-[16rem]"
          />
          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
            <button
              type="button"
              onClick={onRefreshKrQuotes}
              disabled={krQuoteRefreshing}
              className="rounded-md border border-accent/50 bg-accent/10 px-2.5 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {krQuoteRefreshing ? '갱신 중…' : '시세'}
            </button>
            <label className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-textMain hover:bg-white/5">
              CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadCsv(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={onOpenAddHolding}
              className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              + 보유
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 md:hidden">
        {sortedRows.length === 0 && q ? (
          <div className="rounded-md border border-border/60 px-4 py-10 text-center text-[13px] text-textMuted">
            조건에 맞는 종목이 없습니다. 필터를 바꿔 보세요.
          </div>
        ) : null}

        {sortedRows.length > 0 ? (
          <div className="rounded-lg border border-border/45 bg-background/10">
            <div className="sticky top-0 z-20 flex overflow-hidden rounded-t-lg border-b border-border/60 bg-surface/95 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => handleSortHeader('name')}
                title={
                  sortKey === 'name'
                    ? sortDir === 'asc'
                      ? '오름차순 · 다시 클릭하면 내림차순'
                      : '내림차순 · 다시 클릭하면 오름차순'
                    : '클릭하여 오름차순 정렬'
                }
                className="flex shrink-0 items-center justify-between gap-1 border-r border-border/60 bg-surface px-2 py-1.5 text-left text-[11px] font-medium text-textMuted"
                style={{ width: mobileNameColWidth, height: '72px' }}
              >
                <span className="truncate">종목</span>
                <span
                  className={`shrink-0 text-[10px] tabular-nums ${
                    sortKey === 'name' ? 'text-accent' : 'text-textMuted/35'
                  }`}
                  aria-hidden
                >
                  {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                </span>
              </button>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div
                  className="grid"
                  style={{
                    minWidth: mobileMetricColsWidth,
                    gridTemplateColumns: mobileMetricGridTemplate,
                    gridTemplateRows: 'repeat(2, 36px)',
                    transform: `translateX(-${mobileScrollLeft}px)`,
                  }}
                >
                  <HoldingHeaderCell
                    label="매입가"
                    columnKey="avg_price"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSortHeader}
                  />
                  <HoldingHeaderCell
                    label="보유수량"
                    columnKey="quantity"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSortHeader}
                    borderLeft
                  />
                  <HoldingHeaderCell
                    label="평가손익"
                    columnKey="pnl"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSortHeader}
                    borderLeft
                  />
                  <HoldingHeaderCell
                    label="매입금액"
                    borderLeft
                  />
                  <HoldingHeaderCell
                    label="현재가"
                    columnKey="current_price"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSortHeader}
                    borderTop
                  />
                  <HoldingHeaderCell
                    label="가능수량"
                    borderTop
                    borderLeft
                  />
                  <HoldingHeaderCell
                    label="수익률"
                    columnKey="return_pct"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSortHeader}
                    borderTop
                    borderLeft
                  />
                  <HoldingHeaderCell
                    label="평가금액"
                    columnKey="market_value"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSortHeader}
                    borderTop
                    borderLeft
                  />
                </div>
              </div>
            </div>
            <div
              className="overflow-x-auto"
              onScroll={(e) => setMobileScrollLeft(e.currentTarget.scrollLeft)}
            >
              <div style={{ minWidth: mobileTotalMinWidth }}>
                {sortedRows.map(({ p, m }) => {
                const ret =
                  m.cost_basis > 0
                    ? roundPercent((m.pnl / m.cost_basis) * 100)
                    : 0;
                const rowWarn = isConcentrationRisk(m.weight_pct);
                const dayOpen = krDayOpenByTicker[p.ticker];
                const openAttention = isKrOpenAttention(
                  p.market,
                  p.ticker,
                  p.current_price,
                  dayOpen,
                );
                const openTip =
                  dayOpen !== undefined &&
                  dayOpen > 0 &&
                  p.market === 'KR' &&
                  Boolean(normalizeKrTicker(p.ticker))
                    ? `당일 시가 ${formatMoney(dayOpen, p.currency)} · 시가 대비 ${krOpenDeviationPct(p.current_price, dayOpen).toFixed(2)}% (±${KR_OPEN_ATTENTION_ABS_PCT}% 이상이면 주목 표시)`
                    : undefined;
                const board = krBoardDisplayLabel(
                  p.market,
                  p.market === 'KR' ? krBoardByTicker.get(p.ticker) : undefined,
                );
                const pendingTodoCount = pendingTodoCountByPositionId[p.id] ?? 0;
                const reachedTodoCount = reachedTodoCountByPositionId[p.id] ?? 0;
                const availableQty = availableQuantityByPositionId[p.id] ?? p.quantity;
                const priceStatus =
                  p.market === 'KR' ? krPriceStatusByTicker[p.ticker] : undefined;
                const currentPriceEmph = currentPriceEmphasis(
                  openAttention,
                  p.current_price,
                  dayOpen,
                );

                return (
                  <section
                    key={p.id}
                    className={`grid border-t border-border/40 ${
                      rowWarn ? 'bg-warning/5' : ''
                    }`}
                    style={{ gridTemplateColumns: `${mobileNameColWidth} ${mobileMetricGridTemplate}` }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenDetail(p.id)}
                      className="sticky left-0 z-[11] row-span-2 min-w-0 overflow-hidden border-r border-border/60 bg-surface px-2 py-1.5 text-left shadow-[8px_0_12px_-10px_rgba(0,0,0,0.45)]"
                    >
                      <span className="block line-clamp-2 text-[12px] font-semibold leading-snug text-textMain underline-offset-2 hover:underline">
                        {p.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-0.5">
                        <span
                          className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold ${krBoardBadgeClass(
                            p.market === 'KR' ? krBoardByTicker.get(p.ticker) : undefined,
                          )}`}
                        >
                          {board}
                        </span>
                        {pendingTodoCount > 0 ? (
                          <span
                            className="inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-accent/25 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-accent"
                            title={
                              reachedTodoCount > 0
                                ? `도달 ${reachedTodoCount}건 / 미완료 ${pendingTodoCount}건`
                                : `미완료 To-do ${pendingTodoCount}건`
                            }
                          >
                            {todoBadgeLabel(pendingTodoCount, reachedTodoCount)}
                          </span>
                        ) : null}
                      </span>
                    </button>

                    <HoldingValueCell
                      value={formatMoney(p.avg_price, p.currency)}
                    />
                    <HoldingValueCell value={`${p.quantity}`} borderLeft />
                    <HoldingValueCell
                      value={formatMoney(m.pnl, p.currency)}
                      emph={m.pnl >= 0 ? 'pos' : 'neg'}
                      borderLeft
                    />
                    <HoldingValueCell
                      value={formatMoney(m.cost_basis, p.currency)}
                      borderLeft
                    />

                    <HoldingValueCell
                      value={formatMoney(p.current_price, p.currency)}
                      emph={currentPriceEmph}
                      badgeLabel={priceStatus ? krPriceStatusLabel(priceStatus) : undefined}
                      badgeTone={priceStatus ? krPriceStatusTone(priceStatus) : undefined}
                      title={openTip}
                      borderTop
                    />
                    <HoldingValueCell
                      value={`${availableQty}`}
                      borderTop
                      borderLeft
                    />
                    <HoldingValueCell
                      value={formatPercent(ret, true)}
                      emph={ret >= 0 ? 'pos' : 'neg'}
                      borderTop
                      borderLeft
                    />
                    <HoldingValueCell
                      value={formatMoney(m.market_value, p.currency)}
                      borderTop
                      borderLeft
                    />
                  </section>
                );
                })}
              </div>
            </div>
          </div>
        ) : null}

      </div>

      <div className="mt-3 hidden max-h-[min(65vh,720px)] overflow-auto rounded-md border border-border/60 md:block">
        <table className="w-full min-w-[880px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface shadow-sm">
            <tr>
              <SortableColumnHeader
                label="소속"
                columnKey="board"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                className="py-2 pr-2"
              />
              <SortableColumnHeader
                label="코드"
                columnKey="ticker"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                className="py-2 pr-3"
              />
              <SortableColumnHeader
                label="종목"
                columnKey="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                className="min-w-[100px] py-2 pr-3"
              />
              <SortableColumnHeader
                label="현재가"
                columnKey="current_price"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
              <SortableColumnHeader
                label="평단"
                columnKey="avg_price"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
              <SortableColumnHeader
                label="수량"
                columnKey="quantity"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
              <SortableColumnHeader
                label="평가액"
                columnKey="market_value"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
              <SortableColumnHeader
                label="예상손익"
                columnKey="pnl"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
              <SortableColumnHeader
                label="예상수익률"
                columnKey="return_pct"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
              <SortableColumnHeader
                label="비중"
                columnKey="weight"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSortHeader}
                align="right"
                className="py-2 pr-3 tabular-nums"
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && q && (
              <tr>
                <td
                  colSpan={10}
                  className="py-10 text-center text-[13px] text-textMuted"
                >
                  조건에 맞는 종목이 없습니다. 필터를 바꿔 보세요.
                </td>
              </tr>
            )}
            {sortedRows.map(({ p, m }) => {
              const ret =
                m.cost_basis > 0
                  ? roundPercent((m.pnl / m.cost_basis) * 100)
                  : 0;
              const rowWarn = isConcentrationRisk(m.weight_pct);
              const dayOpen = krDayOpenByTicker[p.ticker];
              const openAttention = isKrOpenAttention(
                p.market,
                p.ticker,
                p.current_price,
                dayOpen,
              );
              const openTip =
                dayOpen !== undefined &&
                dayOpen > 0 &&
                p.market === 'KR' &&
                Boolean(normalizeKrTicker(p.ticker))
                  ? `당일 시가 ${formatMoney(dayOpen, p.currency)} · 시가 대비 ${krOpenDeviationPct(p.current_price, dayOpen).toFixed(2)}% (±${KR_OPEN_ATTENTION_ABS_PCT}% 이상이면 주목 표시)`
                  : undefined;
              const currentPriceEmph = currentPriceEmphasis(
                openAttention,
                p.current_price,
                dayOpen,
              );
              const priceStatus =
                p.market === 'KR' ? krPriceStatusByTicker[p.ticker] : undefined;
              return (
                <tr
                  key={p.id}
                  className={`border-b border-border/70 ${rowWarn ? 'bg-warning/5' : ''}`}
                >
                  <td className="py-2 pr-2">
                    <span
                      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${krBoardBadgeClass(
                        p.market === 'KR'
                          ? krBoardByTicker.get(p.ticker)
                          : undefined,
                      )}`}
                    >
                      {krBoardDisplayLabel(
                        p.market,
                        p.market === 'KR' ? krBoardByTicker.get(p.ticker) : undefined,
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-medium text-textMain">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{p.ticker}</span>
                      {(pendingTodoCountByPositionId[p.id] ?? 0) > 0 ? (
                        <span
                          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent"
                          title={
                            (reachedTodoCountByPositionId[p.id] ?? 0) > 0
                              ? `도달 ${(reachedTodoCountByPositionId[p.id] ?? 0)}건 / 미완료 ${(pendingTodoCountByPositionId[p.id] ?? 0)}건`
                              : `미완료 To-do ${(pendingTodoCountByPositionId[p.id] ?? 0)}건`
                          }
                        >
                          {todoBadgeLabel(
                            pendingTodoCountByPositionId[p.id] ?? 0,
                            reachedTodoCountByPositionId[p.id] ?? 0,
                          )}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="max-w-[180px] py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(p.id)}
                      className="line-clamp-2 w-full text-left text-textMain underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </button>
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums ${
                      currentPriceEmph === 'pos'
                        ? 'font-semibold text-red-400'
                        : currentPriceEmph === 'neg'
                          ? 'font-semibold text-blue-400'
                          : currentPriceEmph === 'warn'
                            ? 'font-semibold text-warning'
                            : 'text-textMain'
                    }`}
                    title={openTip}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {priceStatus ? (
                        <span
                          className={`shrink-0 whitespace-nowrap text-[10px] font-semibold ${
                            krPriceStatusTone(priceStatus) === 'pos'
                              ? 'text-red-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {krPriceStatusLabel(priceStatus)}
                        </span>
                      ) : null}
                      <span>{formatMoney(p.current_price, p.currency)}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {formatMoney(p.avg_price, p.currency)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {p.quantity}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {formatMoney(m.market_value, p.currency)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums ${krPnLClass(m.pnl)}`}
                  >
                    {formatMoney(m.pnl, p.currency)}
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${krPnLClass(ret)}`}>
                    {formatPercent(ret, true)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span className={rowWarn ? 'text-warning' : 'text-textMain'}>
                      {m.weight_pct.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-surface shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.25)]">
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={6} className="py-3 pr-3 align-top text-textMuted">
                <div className="text-textMain">전체 합계</div>
                <div className="mt-0.5 text-[11px] font-normal tabular-nums text-textMuted">
                  전체 {sortedRows.length}개 종목
                </div>
              </td>
              <td className="py-3 pr-3 text-right tabular-nums text-textMain">
                {formatMoney(summary.total_market_value, summary.currency)}
              </td>
              <td
                className={`py-3 pr-3 text-right tabular-nums ${krPnLClass(summary.total_pnl)}`}
              >
                {formatMoney(summary.total_pnl, summary.currency)}
              </td>
              <td
                className={`py-3 pr-3 text-right tabular-nums ${krPnLClass(summary.total_return_pct)}`}
              >
                {formatPercent(summary.total_return_pct, true)}
              </td>
              <td className="py-3 pr-3 text-right tabular-nums text-textMain">
                {roundPercent(
                  metrics.reduce((s, m) => s + m.weight_pct, 0),
                ).toFixed(2)}
                %
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function HoldingHeaderCell({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  borderLeft = false,
  borderTop = false,
}: {
  label: string;
  columnKey?: HoldingSortKey;
  sortKey?: HoldingSortKey;
  sortDir?: SortDir;
  onSort?: (k: HoldingSortKey) => void;
  borderLeft?: boolean;
  borderTop?: boolean;
}) {
  const active = !!columnKey && sortKey === columnKey;
  const baseClass = `flex h-[36px] items-center px-1.5 py-1.5 text-[10px] font-medium text-textMuted ${
    borderLeft ? 'border-l border-border/50' : ''
  } ${
    borderTop ? 'border-t border-border/50' : ''
  }`;

  if (!columnKey || !onSort || !sortKey || !sortDir) {
    return <div className={baseClass}>{label}</div>;
  }

  const sortTitle = active
    ? sortDir === 'asc'
      ? '오름차순 · 다시 클릭하면 내림차순'
      : '내림차순 · 다시 클릭하면 오름차순'
    : '클릭하여 오름차순 정렬';

  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      title={sortTitle}
      className={`${baseClass} inline-flex min-w-0 items-center gap-1 text-left transition hover:bg-white/5 hover:text-textMain`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`shrink-0 text-[10px] tabular-nums ${
          active ? 'text-accent' : 'text-textMuted/35'
        }`}
        aria-hidden
      >
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

function HoldingValueCell({
  value,
  emph,
  badgeLabel,
  badgeTone,
  title,
  borderLeft = false,
  borderTop = false,
}: {
  value: string;
  emph?: 'pos' | 'neg' | 'warn';
  badgeLabel?: string;
  badgeTone?: 'pos' | 'neg';
  title?: string;
  borderLeft?: boolean;
  borderTop?: boolean;
}) {
  return (
    <div
      className={`px-1.5 py-1 text-right ${borderLeft ? 'border-l border-border/50' : ''} ${
        borderTop ? 'border-t border-border/50' : ''
      }`}
      title={title}
    >
      <div className="inline-flex items-center justify-end gap-1">
        {badgeLabel ? (
          <span
            className={`shrink-0 whitespace-nowrap text-[9px] font-semibold ${
              badgeTone === 'pos' ? 'text-red-400' : 'text-blue-400'
            }`}
          >
            {badgeLabel}
          </span>
        ) : null}
        <p
          className={`whitespace-nowrap text-[12px] font-semibold tabular-nums ${
            emph === 'pos'
              ? 'text-red-400'
              : emph === 'neg'
                ? 'text-blue-400'
                : emph === 'warn'
                  ? 'text-warning'
                  : 'text-textMain'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
