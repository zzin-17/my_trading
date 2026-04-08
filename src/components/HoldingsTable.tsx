import type { Position, PositionMetrics, PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent } from '../lib/format';
import { isConcentrationRisk, roundPercent } from '../lib/portfolioMath';

interface HoldingsTableProps {
  positions: Position[];
  metrics: PositionMetrics[];
  summary: PortfolioSummary;
  filterText: string;
  onFilterChange: (text: string) => void;
  onEditPrice: (id: string) => void;
}

export function HoldingsTable({
  positions,
  metrics,
  summary,
  filterText,
  onFilterChange,
  onEditPrice,
}: HoldingsTableProps) {
  const byId = new Map(metrics.map((m) => [m.positionId, m]));
  const q = filterText.trim().toLowerCase();
  const rows = positions
    .map((p) => ({ p, m: byId.get(p.id)! }))
    .filter(
      ({ p }) =>
        !q ||
        p.ticker.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.sector.toLowerCase().includes(q),
    );

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-textMain">보유 종목</h3>
          <p className="text-[12px] text-textMuted">
            티커 · 종목명 · 섹터로 필터 · 합계는 현재 탭(시장) 기준
          </p>
        </div>
        <input
          type="search"
          placeholder="필터…"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent sm:w-64"
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-border text-textMuted">
              <th className="py-2 pr-3 font-medium">티커</th>
              <th className="py-2 pr-2 font-medium">시장</th>
              <th className="py-2 pr-3 font-medium">종목</th>
              <th className="py-2 pr-3 font-medium">섹터</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">수량</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">평단</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">현재가</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">평가액</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">손익</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">수익률</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">비중</th>
              <th className="py-2 pl-2 text-right font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && q && (
              <tr>
                <td
                  colSpan={12}
                  className="py-10 text-center text-[13px] text-textMuted"
                >
                  조건에 맞는 종목이 없습니다. 필터를 바꿔 보세요.
                </td>
              </tr>
            )}
            {rows.map(({ p, m }) => {
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
                  <td className="py-2 pr-3 font-medium text-textMain">{p.ticker}</td>
                  <td className="py-2 pr-2">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        p.market === 'KR'
                          ? 'bg-accent/20 text-accent'
                          : 'bg-textMuted/20 text-textMuted'
                      }`}
                    >
                      {p.market === 'KR' ? 'KR' : 'US'}
                    </span>
                  </td>
                  <td className="max-w-[140px] truncate py-2 pr-3 text-textMain">{p.name}</td>
                  <td className="max-w-[160px] truncate py-2 pr-3 text-textMuted">{p.sector}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {p.quantity}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {formatMoney(p.avg_price, p.currency)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {formatMoney(p.current_price, p.currency)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                    {formatMoney(m.market_value, p.currency)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums ${m.pnl >= 0 ? 'text-positive' : 'text-negative'}`}
                  >
                    {formatMoney(m.pnl, p.currency)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums ${m.pnl >= 0 ? 'text-positive' : 'text-negative'}`}
                  >
                    {formatPercent(ret, true)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span className={rowWarn ? 'text-warning' : 'text-textMain'}>
                      {m.weight_pct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <button
                      type="button"
                      onClick={() => onEditPrice(p.id)}
                      className="rounded border border-border px-2 py-1 text-[11px] font-medium text-accent hover:bg-white/5"
                    >
                      현재가
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={7} className="py-3 pr-3 text-textMuted">
                전체 합계
              </td>
              <td className="py-3 pr-3 text-right tabular-nums text-textMain">
                {formatMoney(summary.total_market_value, summary.currency)}
              </td>
              <td
                className={`py-3 pr-3 text-right tabular-nums ${summary.total_pnl >= 0 ? 'text-positive' : 'text-negative'}`}
              >
                {formatMoney(summary.total_pnl, summary.currency)}
              </td>
              <td
                className={`py-3 pr-3 text-right tabular-nums ${summary.total_pnl >= 0 ? 'text-positive' : 'text-negative'}`}
              >
                {formatPercent(summary.total_return_pct, true)}
              </td>
              <td className="py-3 pr-3 text-right tabular-nums text-textMain">
                {roundPercent(
                  metrics.reduce((s, m) => s + m.weight_pct, 0),
                ).toFixed(2)}
                %
              </td>
              <td className="py-3 pl-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
