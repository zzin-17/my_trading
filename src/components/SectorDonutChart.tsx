import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { CurrencyCode, SectorWeight } from '../types/portfolio';
import { formatMoney } from '../lib/format';
import { isConcentrationRisk } from '../lib/portfolioMath';

const SECTOR_COLORS = [
  '#4C7DFF',
  '#14C784',
  '#FF9F1C',
  '#A855F7',
  '#38BDF8',
  '#F472B6',
  '#94A3B8',
  '#FACC15',
];

interface SectorDonutChartProps {
  sectors: SectorWeight[];
  currency: CurrencyCode;
}

export function SectorDonutChart({ sectors, currency }: SectorDonutChartProps) {
  const data = sectors.map((s) => ({
    name: s.sector,
    value: s.weight_pct,
    marketValue: s.market_value,
    warn: isConcentrationRisk(s.weight_pct),
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-textMain">섹터별 비중</h3>
      <p className="mt-0.5 text-[12px] text-textMuted">
        §1.4 · 섹터 평가액 비중 ≥40% 시 경고(주황)
      </p>
      <div className="mt-2 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={entry.warn ? '#FF9F1C' : SECTOR_COLORS[i % SECTOR_COLORS.length]}
                  stroke="#262B36"
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as {
                  name: string;
                  value: number;
                  marketValue: number;
                  warn: boolean;
                };
                return (
                  <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                    <div className="font-medium text-textMain">{p.name}</div>
                    <div className="text-textMuted">
                      비중:{' '}
                      <span className="tabular-nums text-textMain">{p.value.toFixed(2)}%</span>
                    </div>
                    <div className="text-textMuted">
                      평가:{' '}
                      <span className="text-textMain">
                        {formatMoney(p.marketValue, currency)}
                      </span>
                    </div>
                    {p.warn && (
                      <div className="mt-1 text-warning">집중도 40% 이상</div>
                    )}
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-[12px] text-textMuted">
        {data.map((d, i) => (
          <li key={d.name} className="flex justify-between gap-2">
            <span className="flex items-center gap-2 truncate text-textMain">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: d.warn
                    ? '#FF9F1C'
                    : SECTOR_COLORS[i % SECTOR_COLORS.length],
                }}
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {d.value.toFixed(2)}%
              {d.warn && <span className="ml-1 text-warning">!</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
