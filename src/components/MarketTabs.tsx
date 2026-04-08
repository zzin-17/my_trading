import type { Market } from '../types/portfolio';

export type MarketTab = 'all' | Market;

interface MarketTabsProps {
  value: MarketTab;
  onChange: (tab: MarketTab) => void;
  counts: { all: number; KR: number; US: number };
}

const tabs: { id: MarketTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'KR', label: '한국장' },
  { id: 'US', label: '미국장' },
];

export function MarketTabs({ value, onChange, counts }: MarketTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="거래 시장"
      className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        const n = counts[tab.id === 'all' ? 'all' : tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 tabular-nums opacity-80">({n})</span>
          </button>
        );
      })}
    </div>
  );
}
