import { useEffect, useMemo, useState } from 'react';
import type { Position, PositionMetrics, PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent, formatQuoteUpdatedLabel } from '../lib/format';
import { isConcentrationRisk, roundPercent } from '../lib/portfolioMath';
import { fetchKrBoardByTicker } from '../lib/krxLookup';
import { krBoardBadgeClass, krBoardDisplayLabel } from '../lib/krBoardUi';

/** 한국 장 관례: 플러스 빨강, 마이너스 파랑 */
function krPnLClass(value: number): string {
  if (value > 0) return 'text-red-400';
  if (value < 0) return 'text-blue-400';
  return 'text-textMain';
}

export type HoldingSortKey =
  | 'name'
  | 'ticker'
  | 'sector'
  | 'board'
  | 'quantity'
  | 'cost_basis'
  | 'market_value'
  | 'pnl'
  | 'return_pct'
  | 'weight';

export type SortDir = 'asc' | 'desc';

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
  /** 한국장: KRX 상장목록으로 매매일지의 종목명·섹터(업종) 일괄 보정 */
  onSyncKrxSectors?: () => void;
  krxSectorSyncing?: boolean;
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
  onSyncKrxSectors,
  krxSectorSyncing = false,
}: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<HoldingSortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [krBoardByTicker, setKrBoardByTicker] = useState<Map<string, string>>(
    () => new Map(),
  );

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
        case 'sector':
          v = pa.sector.localeCompare(pb.sector, 'ko');
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
        case 'quantity':
          v = pa.quantity - pb.quantity;
          break;
        case 'cost_basis':
          v = ma.cost_basis - mb.cost_basis;
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-textMain">보유 종목</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-textMuted">
              코드·이름으로 검색 · 업종은 종목 클릭 시 표시 · 합계는 현재 탭 기준
            </p>
          </div>
          {lastKrQuoteBulkAt ? (
            <p className="shrink-0 text-[11px] tabular-nums text-textMuted/90 sm:pt-0.5 sm:text-right">
              시세 갱신 {formatQuoteUpdatedLabel(lastKrQuoteBulkAt)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="search"
            placeholder="검색…"
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
          />
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-[11px] text-textMuted">정렬</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as HoldingSortKey)}
              className="min-w-[7.5rem] rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
            >
              <option value="name">종목명</option>
              <option value="ticker">종목코드</option>
              <option value="sector">섹터</option>
              <option value="board">코스피·코스닥</option>
              <option value="quantity">수량</option>
              <option value="cost_basis">총매입금액</option>
              <option value="market_value">평가액</option>
              <option value="pnl">예상손익</option>
              <option value="return_pct">예상수익률</option>
              <option value="weight">비중</option>
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDir)}
              className="w-[5.5rem] rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
              title="오름차순 / 내림차순"
            >
              <option value="asc">오름차순</option>
              <option value="desc">내림차순</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onOpenAddHolding}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
          >
            + 보유종목
          </button>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onRefreshKrQuotes}
              disabled={krQuoteRefreshing}
              className="rounded-md border border-accent/50 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {krQuoteRefreshing ? '시세 갱신 중…' : '시세 갱신'}
            </button>
            {onSyncKrxSectors ? (
              <button
                type="button"
                onClick={onSyncKrxSectors}
                disabled={krxSectorSyncing}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5 disabled:opacity-50"
              >
                {krxSectorSyncing ? '섹터 동기화 중…' : '섹터 동기화'}
              </button>
            ) : null}
            <label className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5">
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
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-border text-textMuted">
              <th className="py-2 pr-2 font-medium">소속</th>
              <th className="py-2 pr-3 font-medium">코드</th>
              <th className="min-w-[100px] py-2 pr-3 font-medium">종목</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">현재가</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">평단</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">수량</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">평가액</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">예상손익</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">예상수익률</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">비중</th>
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
                  <td className="py-2 pr-3 font-medium text-textMain">{p.ticker}</td>
                  <td className="max-w-[180px] py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(p.id)}
                      className="line-clamp-2 w-full text-left text-textMain underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {formatMoney(p.current_price, p.currency)}
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
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={6} className="py-3 pr-3 text-textMuted">
                전체 합계
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
