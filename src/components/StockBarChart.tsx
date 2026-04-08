import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CurrencyCode } from '../types/portfolio';
import type { TopStockWeightsResult } from '../types/portfolio';
import { formatMoney } from '../lib/format';
import { isConcentrationRisk } from '../lib/portfolioMath';

interface StockBarChartProps {
  data: TopStockWeightsResult;
  currency: CurrencyCode;
}

export function StockBarChart({ data, currency }: StockBarChartProps) {
  const rows = [
    ...data.top.map((s) => ({
      label: `${s.ticker}`,
      sub: s.name,
      weight_pct: s.weight_pct,
      market_value: s.market_value,
      warn: isConcentrationRisk(s.weight_pct),
    })),
    ...(data.others
      ? [
          {
            label: data.others.ticker,
            sub: data.others.name,
            weight_pct: data.others.weight_pct,
            market_value: data.others.market_value,
            warn: isConcentrationRisk(data.others.weight_pct),
          },
        ]
      : []),
  ];

  const maxW = Math.max(8, ...rows.map((r) => r.weight_pct));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-textMain">종목별 비중 (Top 10 + Others)</h3>
      <p className="mt-0.5 text-[12px] text-textMuted">
        §1.4 · 단일 종목 비중 ≥40% 시 막대 경고(주황)
      </p>
      <div className="mt-3 h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
          >
            <XAxis
              type="number"
              domain={[0, Math.ceil(maxW)]}
              tickFormatter={(v) => `${v}%`}
              stroke="#A0A3BD"
              tick={{ fill: '#A0A3BD', fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={118}
              stroke="#A0A3BD"
              interval={0}
              tick={(props: {
                x?: number;
                y?: number;
                payload?: { value?: string };
              }) => {
                const { x = 0, y = 0, payload } = props;
                const key = String(payload?.value ?? '');
                const row = rows.find((r) => r.label === key);
                const code = row?.label ?? key;
                const nameLine = row?.sub ?? '';
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text textAnchor="end" fill="#E8EAED" fontSize={11} fontWeight={600}>
                      <tspan x={-4} dy={-5}>
                        {code}
                      </tspan>
                      <tspan
                        x={-4}
                        dy={14}
                        fill="#A0A3BD"
                        fontSize={10}
                        fontWeight={400}
                      >
                        {nameLine}
                      </tspan>
                    </text>
                  </g>
                );
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as (typeof rows)[0];
                return (
                  <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                    <div className="font-medium text-textMain">{p.sub}</div>
                    <div className="text-textMuted">
                      비중:{' '}
                      <span className="tabular-nums text-textMain">
                        {p.weight_pct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-textMuted">
                      평가:{' '}
                      <span className="text-textMain">
                        {formatMoney(p.market_value, currency)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="weight_pct" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {rows.map((entry, i) => (
                <Cell
                  key={`${entry.label}-${i}`}
                  fill={entry.warn ? '#FF9F1C' : '#4C7DFF'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
