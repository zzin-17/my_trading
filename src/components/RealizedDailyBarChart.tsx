import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MarketTab } from './MarketTabs';
import { formatMoney } from '../lib/format';
import {
  buildDailyRealizedBarRows,
  computeRealizedSellEvents,
} from '../lib/realizedPnl';
import { todayIsoLocal } from '../lib/tradePendingExpiry';
import type { Trade } from '../types/trade';

interface RealizedDailyBarChartProps {
  trades: Trade[];
  krSellCommissionRate: number;
  marketTab: MarketTab;
}

function fillKr(value: number): string {
  if (value === 0) return '#4b5568';
  if (value > 0) return '#f87171';
  return '#60a5fa';
}

function fillUs(value: number): string {
  if (value === 0) return '#4b5568';
  if (value > 0) return '#34d399';
  return '#fb7185';
}

function symmetricDomain(values: number[]): [number, number] {
  let maxAbs = 1;
  for (const v of values) maxAbs = Math.max(maxAbs, Math.abs(v));
  const pad = maxAbs * 0.12;
  return [-(maxAbs + pad), maxAbs + pad];
}

/** 막대·축 눈금: 소수점 1자리 (예: 2.2만, 1.0억) */
function labelKrw(v: number): string {
  if (v === 0) return '0.0';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toFixed(1)}억`;
  if (a >= 1_000) return `${sign}${(a / 10_000).toFixed(1)}만`;
  return `${sign}${a.toFixed(1)}`;
}

function labelUsd(v: number): string {
  if (v === 0) return '$0.0';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${a.toFixed(1)}`;
}

function BarEndLabel({
  x,
  y,
  width,
  height,
  value,
  fill,
  format,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  fill: string;
  format: (v: number) => string;
}) {
  const n = typeof value === 'number' ? value : Number(value);
  if (
    value === undefined ||
    !Number.isFinite(n) ||
    n === 0 ||
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }
  const cx = x + width / 2;
  const isNeg = n < 0;
  const ty = isNeg ? y + height + 12 : y - 4;
  const text = format(n);
  if (!text) return null;
  return (
    <text
      x={cx}
      y={ty}
      fill={fill}
      fontSize={10}
      textAnchor="middle"
      className="pointer-events-none tabular-nums"
    >
      {text}
    </text>
  );
}

const TRADING_DAYS = 10;

export function RealizedDailyBarChart({
  trades,
  krSellCommissionRate,
  marketTab,
}: RealizedDailyBarChartProps) {
  const rows = useMemo(() => {
    const events = computeRealizedSellEvents(trades, krSellCommissionRate);
    return buildDailyRealizedBarRows(events, todayIsoLocal(), TRADING_DAYS);
  }, [trades, krSellCommissionRate]);

  const anyKrw = useMemo(() => rows.some((r) => r.krw !== 0), [rows]);
  const anyUsd = useMemo(() => rows.some((r) => r.usd !== 0), [rows]);

  const mode = useMemo(() => {
    if (marketTab === 'KR') return 'krw' as const;
    if (marketTab === 'US') return 'usd' as const;
    if (anyKrw && anyUsd) return 'dual' as const;
    if (anyKrw) return 'krw' as const;
    return 'usd' as const;
  }, [marketTab, anyKrw, anyUsd]);

  const krwDomain = useMemo(
    () => symmetricDomain(rows.map((r) => r.krw)),
    [rows],
  );
  const usdDomain = useMemo(
    () => symmetricDomain(rows.map((r) => r.usd)),
    [rows],
  );
  const singleDomain = mode === 'krw' ? krwDomain : usdDomain;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-textMain">
        최근 {TRADING_DAYS}거래일 실현손익 (세후)
      </h3>
      <p className="mt-0.5 text-[12px] text-textMuted">
        주말 제외·공휴일 미반영. 매도 체결만 집계합니다.
      </p>
      <div className="mt-3 h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{
              top: 22,
              right: mode === 'dual' ? 16 : 8,
              left: 8,
              bottom: 4,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#A0A3BD"
              tick={{ fill: '#A0A3BD', fontSize: 11 }}
              interval={0}
            />
            {mode === 'dual' ? (
              <>
                <YAxis
                  yAxisId="krw"
                  orientation="left"
                  domain={krwDomain}
                  stroke="#A0A3BD"
                  tick={{ fill: '#A0A3BD', fontSize: 10 }}
                  width={56}
                  tickFormatter={(x) => labelKrw(Number(x))}
                />
                <YAxis
                  yAxisId="usd"
                  orientation="right"
                  domain={usdDomain}
                  stroke="#A0A3BD"
                  tick={{ fill: '#A0A3BD', fontSize: 10 }}
                  width={44}
                  tickFormatter={(x) => labelUsd(Number(x))}
                />
              </>
            ) : (
              <YAxis
                domain={singleDomain}
                stroke="#A0A3BD"
                tick={{ fill: '#A0A3BD', fontSize: 11 }}
                width={52}
                tickFormatter={(x) =>
                  mode === 'krw'
                    ? labelKrw(Number(x))
                    : labelUsd(Number(x))
                }
              />
            )}
            <ReferenceLine
              y={0}
              stroke="#5c6378"
              strokeWidth={1}
              yAxisId={mode === 'dual' ? 'krw' : undefined}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as (typeof rows)[0];
                return (
                  <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                    <div className="font-medium text-textMain">{p.date}</div>
                    {(mode === 'krw' || mode === 'dual') && (
                      <div className="text-textMuted">
                        KRW:{' '}
                        <span
                          className="tabular-nums font-medium text-textMain"
                          style={{ color: fillKr(p.krw) }}
                        >
                          {formatMoney(p.krw, 'KRW')}
                        </span>
                      </div>
                    )}
                    {(mode === 'usd' || mode === 'dual') && (
                      <div className="text-textMuted">
                        USD:{' '}
                        <span
                          className="tabular-nums font-medium text-textMain"
                          style={{ color: fillUs(p.usd) }}
                        >
                          {formatMoney(p.usd, 'USD')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {mode === 'krw' && (
              <Bar dataKey="krw" name="실현(KRW)" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {rows.map((r, i) => (
                  <Cell key={`k-${r.date}-${i}`} fill={fillKr(r.krw)} />
                ))}
                <LabelList
                  dataKey="krw"
                  content={(p) => (
                    <BarEndLabel
                      {...(p as {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                        value: number;
                      })}
                      fill="#c8cad4"
                      format={labelKrw}
                    />
                  )}
                />
              </Bar>
            )}
            {mode === 'usd' && (
              <Bar dataKey="usd" name="실현(USD)" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {rows.map((r, i) => (
                  <Cell key={`u-${r.date}-${i}`} fill={fillUs(r.usd)} />
                ))}
                <LabelList
                  dataKey="usd"
                  content={(p) => (
                    <BarEndLabel
                      {...(p as {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                        value: number;
                      })}
                      fill="#c8cad4"
                      format={labelUsd}
                    />
                  )}
                />
              </Bar>
            )}
            {mode === 'dual' && (
              <>
                <Bar
                  yAxisId="krw"
                  dataKey="krw"
                  name="실현(KRW)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                >
                  {rows.map((r, i) => (
                    <Cell key={`dk-${r.date}-${i}`} fill={fillKr(r.krw)} />
                  ))}
                  <LabelList
                    dataKey="krw"
                    content={(p) => (
                      <BarEndLabel
                        {...(p as {
                          x: number;
                          y: number;
                          width: number;
                          height: number;
                          value: number;
                        })}
                        fill="#c8cad4"
                        format={labelKrw}
                      />
                    )}
                  />
                </Bar>
                <Bar
                  yAxisId="usd"
                  dataKey="usd"
                  name="실현(USD)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                >
                  {rows.map((r, i) => (
                    <Cell key={`du-${r.date}-${i}`} fill={fillUs(r.usd)} />
                  ))}
                  <LabelList
                    dataKey="usd"
                    content={(p) => (
                      <BarEndLabel
                        {...(p as {
                          x: number;
                          y: number;
                          width: number;
                          height: number;
                          value: number;
                        })}
                        fill="#c8cad4"
                        format={labelUsd}
                      />
                    )}
                  />
                </Bar>
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
