import type { Market } from '../types/portfolio';

export type MarketTab = 'all' | Market;

interface MarketTabsProps {
  value: MarketTab;
  onChange: (tab: MarketTab) => void;
  counts: { all: number; KR: number; US: number };
  enabledTabs?: MarketTab[];
}

const tabs: { id: MarketTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'KR', label: '한국장' },
  { id: 'US', label: '미국장' },
];

export function MarketTabs({
  value,
  onChange,
  counts,
  enabledTabs,
}: MarketTabsProps) {
  const visibleTabs =
    enabledTabs && enabledTabs.length > 0
      ? tabs.filter((t) => enabledTabs.includes(t.id))
      : tabs;
  return (
    <div
      role="tablist"
      aria-label="거래 시장"
      className="flex flex-wrap gap-1"
    >
      {visibleTabs.map((tab) => {
        const active = value === tab.id;
        const n = counts[tab.id === 'all' ? 'all' : tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-accent text-white shadow-sm'
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
