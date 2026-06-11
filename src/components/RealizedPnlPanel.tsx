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

function formatSignedMoney(value: number, currency: CurrencyCode): string {
  if (value === 0) return formatMoney(0, currency);
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

const GRANULARITIES: { id: RealizedPeriodGranularity; label: string }[] = [
  { id: 'day', label: '일' },
  { id: 'month', label: '월' },
  { id: 'year', label: '년' },
];

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstDayOfMonth(dateIso: string): string {
  const [y, m] = dateIso.split('-');
  if (!y || !m) return '';
  return `${y}-${m}-01`;
}

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
  const defaultDayRangeStart = useMemo(() => firstDayOfMonth(todayIso()), []);
  const [granularity, setGranularity] =
    useState<RealizedPeriodGranularity>('month');
  const [monthRangeStart, setMonthRangeStart] = useState('');
  const [monthRangeEnd, setMonthRangeEnd] = useState('');
  const [dayRangeStart, setDayRangeStart] = useState(defaultDayRangeStart);
  const [dayRangeEnd, setDayRangeEnd] = useState('');
  const [drill, setDrill] = useState<{
    period: string;
    currency: CurrencyCode;
  } | null>(null);

  const events = useMemo(
    () => computeRealizedSellEvents(trades, krSellCommissionRate),
    [trades, krSellCommissionRate],
  );

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (granularity === 'month') {
        const monthKey = e.date.slice(0, 7);
        if (monthRangeStart && monthKey < monthRangeStart) return false;
        if (monthRangeEnd && monthKey > monthRangeEnd) return false;
        return true;
      }
      if (dayRangeStart && e.date < dayRangeStart) return false;
      if (dayRangeEnd && e.date > dayRangeEnd) return false;
      return true;
    });
  }, [dayRangeEnd, dayRangeStart, events, granularity, monthRangeEnd, monthRangeStart]);

  const periodRows = useMemo(
    () => summarizeRealizedByPeriod(filteredEvents, granularity),
    [filteredEvents, granularity],
  );

  const tickerRows = useMemo(() => {
    if (!drill) return [];
    return aggregateRealizedByTickerForPeriod(
      filteredEvents,
      drill.period,
      drill.currency,
      granularity,
    );
  }, [filteredEvents, drill, granularity]);

  useEffect(() => {
    if (granularity !== 'day') return;
    if (dayRangeStart) return;
    setDayRangeStart(defaultDayRangeStart);
  }, [dayRangeStart, defaultDayRangeStart, granularity]);

  useEffect(() => {
    if (!drill) return;
    if (granularity === 'month') {
      if (monthRangeStart && drill.period < monthRangeStart) {
        setDrill(null);
        return;
      }
      if (monthRangeEnd && drill.period > monthRangeEnd) {
        setDrill(null);
        return;
      }
    } else {
      if (dayRangeStart && drill.period < dayRangeStart) {
        setDrill(null);
        return;
      }
      if (dayRangeEnd && drill.period > dayRangeEnd) {
        setDrill(null);
      }
    }
  }, [dayRangeEnd, dayRangeStart, drill, granularity, monthRangeEnd, monthRangeStart]);

  const hasActiveFilter =
    granularity === 'month'
      ? Boolean(monthRangeStart) || Boolean(monthRangeEnd)
      : Boolean(dayRangeStart) || Boolean(dayRangeEnd);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5 md:rounded-none md:border-x-0 md:border-y md:bg-transparent md:px-0">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-sm font-semibold text-textMain tracking-tight">
            실현손익
          </h3>
          <RealizedPnlConceptTooltip
            taxPctLabel={(KR_SELL_TAX_RATE * 100).toFixed(2)}
          />
        </div>
        <div
          className="flex shrink-0 flex-wrap gap-1"
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
                className={`rounded-full px-2.5 py-0.75 text-[12px] font-medium transition ${
                  active
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-textMuted hover:bg-white/5 hover:text-textMain'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1.5 md:px-0 md:py-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {granularity === 'month' ? (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-textMuted">
                <span>시작</span>
                <input
                  type="month"
                  value={monthRangeStart}
                  max={monthRangeEnd || undefined}
                  onChange={(e) => {
                    setMonthRangeStart(e.target.value);
                    setDrill(null);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-textMain outline-none focus:border-accent"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-textMuted">
                <span>종료</span>
                <input
                  type="month"
                  value={monthRangeEnd}
                  min={monthRangeStart || undefined}
                  onChange={(e) => {
                    setMonthRangeEnd(e.target.value);
                    setDrill(null);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-textMain outline-none focus:border-accent"
                />
              </label>
            </>
          ) : (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-textMuted">
                <span>시작</span>
                <input
                  type="date"
                  value={dayRangeStart}
                  max={dayRangeEnd || undefined}
                  onChange={(e) => {
                    setDayRangeStart(e.target.value);
                    setDrill(null);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-textMain outline-none focus:border-accent"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-textMuted">
                <span>종료</span>
                <input
                  type="date"
                  value={dayRangeEnd}
                  min={dayRangeStart || undefined}
                  onChange={(e) => {
                    setDayRangeEnd(e.target.value);
                    setDrill(null);
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-textMain outline-none focus:border-accent"
                />
              </label>
            </>
          )}
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={() => {
                setMonthRangeStart('');
                setMonthRangeEnd('');
                setDayRangeStart(defaultDayRangeStart);
                setDayRangeEnd('');
                setDrill(null);
              }}
              className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-textMain hover:bg-white/5"
            >
              필터 초기화
            </button>
          ) : null}
        </div>
      </div>

      {!drill ? (
        <>
        <div className="mt-3 max-h-[20rem] space-y-1.5 overflow-y-auto pr-1 md:hidden">
          {periodRows.length === 0 ? (
            <div className="rounded-md border border-border px-4 py-8 text-center text-textMuted">
              {hasActiveFilter
                ? '선택한 조건에 해당하는 실현손익이 없습니다.'
                : '해당 기간에 실현된 매도가 없습니다.'}
            </div>
          ) : (
            periodRows.map((row) => (
              <button
                key={`${row.period}\t${row.currency}`}
                type="button"
                onClick={() =>
                  setDrill({ period: row.period, currency: row.currency })
                }
                className="w-full rounded-lg border border-border/60 bg-background/35 p-2.5 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-textMain">
                      {formatPeriodLabel(row.period, granularity)}
                    </p>
                    <p className="mt-0.5 text-[12px] tabular-nums text-textMuted">
                      {row.currency}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-base font-semibold tabular-nums ${pnlToneClass(
                        row.netTotal,
                        row.currency,
                      )}`}
                    >
                      {formatSignedMoney(row.netTotal, row.currency)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-textMuted">
                      총 실현손익
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <RealizedMobileCell
                    label="실현수익"
                    value={formatSignedMoney(row.positiveTotal, row.currency)}
                    tone={pnlToneClass(row.positiveTotal, row.currency)}
                  />
                  <RealizedMobileCell
                    label="실현손실"
                    value={formatSignedMoney(row.negativeTotal, row.currency)}
                    tone={pnlToneClass(row.negativeTotal, row.currency)}
                  />
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
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
                  실현수익
                </th>
                <th className="py-2 pr-3 text-right font-medium tabular-nums">
                  실현손실
                </th>
                <th className="py-2 pr-3 text-right font-medium tabular-nums">
                  총 실현손익(세후)
                </th>
              </tr>
            </thead>
            <tbody>
              {periodRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-textMuted"
                  >
                    {hasActiveFilter
                      ? '선택한 조건에 해당하는 실현손익이 없습니다.'
                      : '해당 기간에 실현된 매도가 없습니다.'}
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
                        row.positiveTotal,
                        row.currency,
                      )}`}
                    >
                      {formatSignedMoney(row.positiveTotal, row.currency)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right tabular-nums font-medium ${pnlToneClass(
                        row.negativeTotal,
                        row.currency,
                      )}`}
                    >
                      {formatSignedMoney(row.negativeTotal, row.currency)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right tabular-nums font-medium ${pnlToneClass(
                        row.netTotal,
                        row.currency,
                      )}`}
                    >
                      {formatSignedMoney(row.netTotal, row.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
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
          <div className="mt-3 md:hidden">
            {tickerRows.length === 0 ? (
              <div className="rounded-md border border-border px-4 py-8 text-center text-textMuted">
                내역이 없습니다.
              </div>
            ) : (
              <div className="max-h-[20rem] overflow-auto rounded-lg border border-border/60 bg-background/10">
                <div style={{ minWidth: '34rem' }}>
                  <div
                    className="sticky top-0 z-10 grid border-b border-border/60 bg-surface/95 text-[10px] font-medium text-textMuted shadow-sm backdrop-blur"
                    style={{
                      gridTemplateColumns:
                        '8.5rem 3.5rem 5.5rem 4.5rem 5.25rem 5.25rem',
                    }}
                  >
                    <div className="sticky left-0 z-20 border-r border-border/60 bg-surface px-2 py-2">
                      종목
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right">
                      매도수량
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right">
                      실현손익
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right">
                      수익률
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right">
                      매입가
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right">
                      매도가
                    </div>
                  </div>

                  {tickerRows.map((r) => (
                    <div
                      key={r.ticker}
                      className="grid border-t border-border/40 text-[11px]"
                      style={{
                        gridTemplateColumns:
                          '8.5rem 3.5rem 5.5rem 4.5rem 5.25rem 5.25rem',
                      }}
                    >
                      <div className="sticky left-0 z-[11] border-r border-border/60 bg-surface px-2 py-2 shadow-[8px_0_12px_-10px_rgba(0,0,0,0.45)]">
                        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-textMain">
                          {r.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-textMuted">{r.ticker}</p>
                      </div>
                      <div className="border-l border-border/50 px-1.5 py-2 text-right tabular-nums text-textMain">
                        {r.quantitySold}
                      </div>
                      <div
                        className={`border-l border-border/50 px-1.5 py-2 text-right tabular-nums font-semibold ${pnlToneClass(
                          r.netPnl,
                          r.currency,
                        )}`}
                      >
                        {formatMoney(r.netPnl, r.currency)}
                      </div>
                      <div
                        className={`border-l border-border/50 px-1.5 py-2 text-right tabular-nums ${pnlToneClass(
                          r.returnPct,
                          r.currency,
                        )}`}
                      >
                        {formatPercent(r.returnPct, true)}
                      </div>
                      <div className="border-l border-border/50 px-1.5 py-2 text-right tabular-nums text-textMain">
                        {formatMoney(r.avgBuyPrice, r.currency)}
                      </div>
                      <div className="border-l border-border/50 px-1.5 py-2 text-right tabular-nums text-textMain">
                        {formatMoney(r.avgSellPrice, r.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 hidden overflow-x-auto md:block">
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

function RealizedMobileCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-surface px-3 py-2">
      <p className="text-[11px] text-textMuted">{label}</p>
      <p className={`mt-1 text-[13px] font-semibold tabular-nums ${tone ?? 'text-textMain'}`}>
        {value}
      </p>
    </div>
  );
}
