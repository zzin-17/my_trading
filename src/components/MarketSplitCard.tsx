import { Pie, PieChart, Cell, ResponsiveContainer } from 'recharts';
import type { Market } from '../types/portfolio';
import { roundPercent } from '../lib/portfolioMath';

interface MarketSplitCardProps {
  /** 평가액 기준 (통화 혼합이면 참고용) */
  weights: Record<Market, number>;
}

const COLORS: Record<Market, string> = {
  KR: '#4C7DFF',
  US: '#A0A3BD',
};

export function MarketSplitCard({ weights }: MarketSplitCardProps) {
  const kr = roundPercent(weights.KR ?? 0);
  const us = roundPercent(weights.US ?? 0);
  const data = [
    { key: 'KR' as Market, label: '한국장', value: kr },
    { key: 'US' as Market, label: '미국장', value: us },
  ];

  return (
    <div className="rounded-xl border border-border/70 bg-surface/40 p-4">
      <h3 className="text-sm font-medium text-textMain">시장별 비중 (KR / US)</h3>
      <p className="mt-0.5 text-[11px] text-textMuted">평가액 기준</p>

      <div className="mt-2 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={100}
              paddingAngle={2}
              labelLine={false}
              label={renderInsidePercentLabel}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={COLORS[entry.key]}
                  stroke="#262B36"
                  strokeWidth={1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-textMuted">
        {data.map((d) => (
          <li key={d.key} className="flex justify-between gap-2">
            <span className="flex items-center gap-2 truncate text-textMain">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[d.key] }}
              />
              <span className="truncate">
                {d.key} · {d.label}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-textMain">
              {d.value.toFixed(2)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderInsidePercentLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  value?: number;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, value = 0 } = props;
  if (value < 5) return null;

  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#E8EAED"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
      className="tabular-nums"
    >
      {value.toFixed(1)}%
    </text>
  );
}


