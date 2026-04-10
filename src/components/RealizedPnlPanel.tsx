import { useEffect, useMemo, useRef, useState } from 'react';
import type { CurrencyCode } from '../types/portfolio';
import type { Trade } from '../types/trade';
import { formatMoney, formatPercent } from '../lib/format';
import {
  aggregateRealizedByTickerForPeriod,
  computeRealizedSellEvents,
  formatPeriodLabel,
  summarizeRealizedByPeriod,
  type RealizedPeriodGranularity,
} from '../lib/realizedPnl';
import { KR_SELL_TAX_RATE } from '../lib/krTradingAssumptions';

interface RealizedPnlPanelProps {
  trades: Trade[];
  krSellCommissionRate: number;
}

function pnlToneClass(value: number, currency: CurrencyCode): string {
  if (currency === 'KRW') {
    if (value > 0) return 'text-red-400';
    if (value < 0) return 'text-blue-400';
    return 'text-textMain';
  }
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-negative';
  return 'text-textMain';
}

const GRANULARITIES: { id: RealizedPeriodGranularity; label: string }[] = [
  { id: 'day', label: '일' },
  { id: 'month', label: '월' },
  { id: 'year', label: '년' },
];

function RealizedPnlConceptTooltip({ taxPctLabel }: { taxPctLabel: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-[12px] font-bold leading-none text-textMuted transition-colors hover:border-accent hover:text-textMain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-expanded={open}
        aria-label="실현손익 집계 안내 열기"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-[80] mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-lg border border-border bg-surface px-3 py-3 shadow-lg"
        >
          <p className="text-[12px] leading-relaxed text-textMain">
            장부에 반영된 매도(체결)만 집계합니다. 한국장은 매도 대금 기준
            증거래세·농특세 {taxPctLabel}%와 설정한 위탁 수수료율을 차감한
            금액입니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PeriodTableHelpTooltip() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative inline-flex shrink-0 align-middle" ref={wrapRef}>
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold leading-none text-textMuted transition-colors hover:border-accent hover:text-textMain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        aria-expanded={open}
        aria-label="기간 목록 사용 안내 열기"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-[100] mt-1.5 w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-border bg-surface px-3 py-2.5 shadow-lg"
        >
          <p className="text-[12px] leading-relaxed text-textMain">
            행을 누르면 그 기간의 종목별 실현손익을 볼 수 있습니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function RealizedPnlPanel({
  trades,
  krSellCommissionRate,
}: RealizedPnlPanelProps) {
  const [granularity, setGranularity] =
    useState<RealizedPeriodGranularity>('month');
  const [drill, setDrill] = useState<{
    period: string;
    currency: CurrencyCode;
  } | null>(null);

  const events = useMemo(
    () => computeRealizedSellEvents(trades, krSellCommissionRate),
    [trades, krSellCommissionRate],
  );

  const periodRows = useMemo(
    () => summarizeRealizedByPeriod(events, granularity),
    [events, granularity],
  );

  const tickerRows = useMemo(() => {
    if (!drill) return [];
    return aggregateRealizedByTickerForPeriod(
      events,
      drill.period,
      drill.currency,
      granularity,
    );
  }, [events, drill, granularity]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-sm font-semibold text-textMain tracking-tight">
            실현손익
          </h3>
          <RealizedPnlConceptTooltip
            taxPctLabel={(KR_SELL_TAX_RATE * 100).toFixed(2)}
          />
        </div>
        <div
          className="flex shrink-0 flex-wrap gap-1 rounded-md border border-border bg-background p-0.5"
          role="tablist"
          aria-label="집계 단위"
        >
          {GRANULARITIES.map(({ id, label }) => {
            const active = granularity === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setGranularity(id);
                  setDrill(null);
                }}
                className={`rounded px-2.5 py-1 text-[12px] font-medium transition ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-textMuted hover:bg-white/5 hover:text-textMain'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {!drill ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-textMuted">
                <th className="py-2 pr-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    기간
                    <PeriodTableHelpTooltip />
                  </span>
                </th>
                <th className="py-2 pr-3 font-medium">통화</th>
                <th className="py-2 pr-3 text-right font-medium tabular-nums">
                  실현손익(세후)
                </th>
              </tr>
            </thead>
            <tbody>
              {periodRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="py-8 text-center text-textMuted"
                  >
                    해당 기간에 실현된 매도가 없습니다.
                  </td>
                </tr>
              ) : (
                periodRows.map((row) => (
                  <tr
                    key={`${row.period}\t${row.currency}`}
                    className="cursor-pointer border-b border-border/60 transition hover:bg-white/[0.04]"
                    onClick={() =>
                      setDrill({ period: row.period, currency: row.currency })
                    }
                  >
                    <td className="py-2 pr-3 text-textMain">
                      {formatPeriodLabel(row.period, granularity)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-textMuted">
                      {row.currency}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right tabular-nums font-medium ${pnlToneClass(
                        row.netTotal,
                        row.currency,
                      )}`}
                    >
                      {formatMoney(row.netTotal, row.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDrill(null)}
              className="rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-textMain hover:bg-white/5"
            >
              ← 기간 요약
            </button>
            <span className="text-[12px] text-textMuted">
              {formatPeriodLabel(drill.period, granularity)} · {drill.currency}
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-textMuted">
                  <th className="py-2 pr-3 font-medium">종목</th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">
                    매도수량
                  </th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">
                    실현손익(세후)
                  </th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">
                    수익률
                  </th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">
                    매입가(평단)
                  </th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">
                    매도체결가
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickerRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-textMuted"
                    >
                      내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  tickerRows.map((r) => (
                    <tr
                      key={r.ticker}
                      className="border-b border-border/60"
                    >
                      <td className="max-w-[200px] py-2 pr-3">
                        <div className="truncate font-medium text-textMain">
                          {r.name}
                        </div>
                        <div className="truncate text-[11px] text-textMuted">
                          {r.ticker}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                        {r.quantitySold}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right tabular-nums font-medium ${pnlToneClass(
                          r.netPnl,
                          r.currency,
                        )}`}
                      >
                        {formatMoney(r.netPnl, r.currency)}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right tabular-nums ${pnlToneClass(
                          r.returnPct,
                          r.currency,
                        )}`}
                      >
                        {formatPercent(r.returnPct, true)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                        {formatMoney(r.avgBuyPrice, r.currency)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                        {formatMoney(r.avgSellPrice, r.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
