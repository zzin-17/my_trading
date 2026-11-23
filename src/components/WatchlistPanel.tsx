import { useEffect, useState } from 'react';
import type { WatchItem, WatchPriceAlert } from '../types/watchItem';
import { formatMoney } from '../lib/format';
import { watchAlertLevel } from '../lib/priceAlerts';
import { searchKrStocksByName } from '../lib/krxLookup';
import { formatKrDayChange, krChangeFromPrevClose } from '../lib/krPrevChange';
import { pnlTextClass } from '../lib/pnlTone';
import { WATCH_ITEM_LIMIT } from '../lib/watchItems';

interface WatchlistPanelProps {
  presentation: 'desktop' | 'mobile';
  items: WatchItem[];
  quotes: Record<string, number>;
  krPrevCloseByTicker: Record<string, number>;
  heldPositionIdByTicker: Record<string, string>;
  onAdd: (ticker: string, name: string) => string | null;
  onRemove: (id: string) => void;
  onMemo: (id: string, memo: string) => void;
  onAlert: (id: string, alert: WatchPriceAlert | null) => void;
  onOpenHolding: (positionId: string) => void;
  onAddHolding: (ticker: string, name: string) => void;
  /** 바깥 섹션 안에 넣을 때 카드와 제목을 빼다 */
  bare?: boolean;
}

export function WatchlistPanel({
  presentation,
  items,
  quotes,
  krPrevCloseByTicker,
  heldPositionIdByTicker,
  onAdd,
  onRemove,
  onMemo,
  onAlert,
  onOpenHolding,
  onAddHolding,
  bare = false,
}: WatchlistPanelProps) {
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const list = (
    <WatchRows
      items={items}
      quotes={quotes}
      krPrevCloseByTicker={krPrevCloseByTicker}
      heldPositionIdByTicker={heldPositionIdByTicker}
      presentation={presentation}
      onRemove={onRemove}
      onMemo={onMemo}
      onConfigure={(item) => setSelectedId(item.id)}
      onOpen={(item) => {
        const heldId = heldPositionIdByTicker[item.ticker];
        if (presentation === 'desktop' && heldId) {
          onOpenHolding(heldId);
          return;
        }
        setSelectedId(item.id);
      }}
    />
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {bare ? null : <h3 className="text-sm font-medium text-textMain">관심종목</h3>}
          <p className="mt-0.5 text-[12px] leading-relaxed text-textMuted">
            현재가와 전일대비를 봅니다. 가격 알림은 상단 종 모양에 모이고, 수량·평단은 바뀌지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          + 관심
        </button>
      </div>

      <div className="mt-3">{list}</div>

      {adding ? (
        <AddWatchSheet
          onClose={() => setAdding(false)}
          onAdd={(ticker, name) => {
            const error = onAdd(ticker, name);
            if (!error) setAdding(false);
            return error;
          }}
        />
      ) : null}

      {selected ? (
        <WatchDetailSheet
          item={selected}
          price={quotes[selected.ticker]}
          prevClose={krPrevCloseByTicker[selected.ticker]}
          heldPositionId={heldPositionIdByTicker[selected.ticker]}
          onClose={() => setSelectedId(null)}
          onMemo={(memo) => onMemo(selected.id, memo)}
          onAlert={(alert) => onAlert(selected.id, alert)}
          onRemove={() => {
            onRemove(selected.id);
            setSelectedId(null);
          }}
          onOpenHolding={(positionId) => {
            setSelectedId(null);
            onOpenHolding(positionId);
          }}
          onAddHolding={() => {
            setSelectedId(null);
            onAddHolding(selected.ticker, selected.name);
          }}
        />
      ) : null}
    </>
  );

  if (bare) return body;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 md:rounded-none md:border-x-0 md:border-y md:bg-transparent md:px-0">
      {body}
    </section>
  );
}

function WatchRows({
  items,
  quotes,
  krPrevCloseByTicker,
  heldPositionIdByTicker,
  presentation,
  onRemove,
  onMemo,
  onConfigure,
  onOpen,
}: {
  items: WatchItem[];
  quotes: Record<string, number>;
  krPrevCloseByTicker: Record<string, number>;
  heldPositionIdByTicker: Record<string, string>;
  presentation: 'desktop' | 'mobile';
  onRemove: (id: string) => void;
  onMemo: (id: string, memo: string) => void;
  onConfigure: (item: WatchItem) => void;
  onOpen: (item: WatchItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[13px] text-textMuted">
        아직 없습니다. + 관심으로 종목명이나 코드를 검색해 담아 보세요.
        <span className="mt-1 block text-[11px]">최대 {WATCH_ITEM_LIMIT}개 · 같은 계정으로 다른 기기와 맞춰집니다.</span>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  if (presentation === 'mobile') {
    return (
      <ul className="space-y-2">
        {sorted.map((item) => {
          const price = quotes[item.ticker];
          const change = changeLabel(price, krPrevCloseByTicker[item.ticker]);
          const held = Boolean(heldPositionIdByTicker[item.ticker]);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="w-full rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-left"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-textMain">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-textMuted">
                      {item.ticker}
                      {held ? ' · 보유' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-medium tabular-nums text-textMain">
                      {price ? formatMoney(price, 'KRW') : '시세 없음'}
                    </span>
                    <ChangeText change={change} />
                  </span>
                </span>
                {item.memo ? (
                  <span className="mt-1 block truncate text-[12px] text-textMuted">{item.memo}</span>
                ) : null}
                <AlertLine item={item} quote={price} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-border text-[11px] text-textMuted">
            <th className="px-2 py-2 font-medium">종목</th>
            <th className="px-2 py-2 font-medium">현재가</th>
            <th className="px-2 py-2 font-medium">전일대비</th>
            <th className="px-2 py-2 font-medium">메모</th>
            <th className="px-2 py-2 font-medium">알림</th>
            <th className="px-2 py-2 font-medium"> </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const price = quotes[item.ticker];
            const change = changeLabel(price, krPrevCloseByTicker[item.ticker]);
            const heldId = heldPositionIdByTicker[item.ticker];
            return (
              <tr key={item.id} className="border-b border-border/70">
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="text-left font-medium text-textMain underline-offset-2 hover:underline"
                  >
                    {item.name}
                  </button>
                  <span className="ml-1.5 text-[11px] text-textMuted">{item.ticker}</span>
                  {heldId ? (
                    <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      보유
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums text-textMain">
                  {price ? formatMoney(price, 'KRW') : '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-2">
                  <ChangeText change={change} />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={item.memo}
                    onChange={(e) => onMemo(item.id, e.target.value)}
                    placeholder="메모"
                    maxLength={80}
                    className="w-full min-w-[8rem] rounded-md border border-border bg-background px-2 py-1 text-[12px] text-textMain outline-none focus:border-accent"
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onConfigure(item)}
                    className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] text-textMain hover:bg-white/5"
                  >
                    <AlertLine item={item} quote={price} />
                  </button>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="rounded-md border border-border px-2 py-1 text-[11px] text-textMuted hover:text-textMain"
                  >
                    해제
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddWatchSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (ticker: string, name: string) => string | null;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<{ ticker: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setItems([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSearched(false);
    const timer = window.setTimeout(() => {
      searchKrStocksByName(q, 8)
        .then((rows) => {
          if (!cancelled) setItems(rows.map((row) => ({ ticker: row.ticker, name: row.name })));
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setSearched(true);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="관심종목 추가"
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-textMain">관심종목 추가</h4>
          <button type="button" onClick={onClose} className="text-[12px] text-textMuted">
            닫기
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder="종목명 또는 코드"
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] text-textMain outline-none focus:border-accent"
        />
        {error ? <p className="mt-2 text-[12px] text-warning">{error}</p> : null}
        <ul className="mt-3 space-y-1">
          {loading ? <li className="px-2 py-3 text-[12px] text-textMuted">검색 중…</li> : null}
          {searched && !loading && query.trim() && items.length === 0 ? (
            <li className="px-2 py-3 text-[12px] text-textMuted">검색 결과가 없습니다.</li>
          ) : null}
          {items.map((item) => (
            <li key={item.ticker}>
              <button
                type="button"
                onClick={() => setError(onAdd(item.ticker, item.name))}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-white/5"
              >
                <span className="text-[13px] text-textMain">{item.name}</span>
                <span className="text-[12px] tabular-nums text-textMuted">{item.ticker}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WatchDetailSheet({
  item,
  price,
  prevClose,
  heldPositionId,
  onClose,
  onMemo,
  onAlert,
  onRemove,
  onOpenHolding,
  onAddHolding,
}: {
  item: WatchItem;
  price: number | undefined;
  prevClose: number | undefined;
  heldPositionId: string | undefined;
  onClose: () => void;
  onMemo: (memo: string) => void;
  onAlert: (alert: WatchPriceAlert | null) => void;
  onRemove: () => void;
  onOpenHolding: (positionId: string) => void;
  onAddHolding: () => void;
}) {
  const change = changeLabel(price, prevClose);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="w-full max-w-lg rounded-t-2xl border border-border bg-surface p-4 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-textMain">{item.name}</h4>
            <p className="text-[12px] text-textMuted">{item.ticker}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[12px] text-textMuted">
            닫기
          </button>
        </div>
        <p className="mt-3 text-[18px] font-semibold tabular-nums text-textMain">
          {price ? formatMoney(price, 'KRW') : '시세 없음'}
        </p>
        <p className="mt-0.5">
          <ChangeText change={change} />
        </p>
        <label className="mt-4 block text-[12px] text-textMuted">
          메모
          <input
            value={item.memo}
            onChange={(e) => onMemo(e.target.value)}
            maxLength={80}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] text-textMain outline-none focus:border-accent"
          />
        </label>
        <WatchAlertEditor alert={item.alert} onChange={onAlert} />
        <div className="mt-4 flex flex-col gap-2">
          {heldPositionId ? (
            <button
              type="button"
              onClick={() => onOpenHolding(heldPositionId)}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              보유 상세 열기
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddHolding}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              보유종목으로 추가
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-border px-3 py-2 text-sm text-textMuted"
          >
            관심 해제
          </button>
        </div>
      </div>
    </div>
  );
}

function alertPhrase(alert: WatchPriceAlert): string {
  return `${formatMoney(alert.price, 'KRW')} ${alert.direction === 'above' ? '이상' : '이하'}`;
}

function AlertLine({ item, quote }: { item: WatchItem; quote: number | undefined }) {
  if (!item.alert?.enabled) {
    return <span className="text-[11px] text-textMuted">알림 없음</span>;
  }
  const reached = watchAlertLevel(item, quote) === 'reached';
  return (
    <span className={`text-[11px] font-medium ${reached ? 'text-positive' : 'text-textMain'}`}>
      {reached ? `도달 · ${alertPhrase(item.alert)}` : alertPhrase(item.alert)}
    </span>
  );
}

function WatchAlertEditor({
  alert,
  onChange,
}: {
  alert: WatchPriceAlert | undefined;
  onChange: (alert: WatchPriceAlert | null) => void;
}) {
  const [priceText, setPriceText] = useState(alert ? String(alert.price) : '');
  const [direction, setDirection] = useState<WatchPriceAlert['direction']>(alert?.direction ?? 'below');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPriceText(alert ? String(alert.price) : '');
    setDirection(alert?.direction ?? 'below');
    setError(null);
  }, [alert?.direction, alert?.enabled, alert?.price]);

  const commit = (
    nextDirection: WatchPriceAlert['direction'],
    nextPriceText: string,
    enabled: boolean,
  ) => {
    const price = Math.round(Number(nextPriceText.replace(/,/g, '')));
    if (!Number.isFinite(price) || price <= 0) {
      if (!enabled) {
        setError(null);
        onChange(null);
        return;
      }
      setError('1원 이상의 가격을 입력해 주세요.');
      return;
    }
    setError(null);
    onChange({ direction: nextDirection, price, enabled });
  };

  return (
    <div className="mt-4">
      <p className="text-[12px] text-textMuted">가격 알림</p>
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          onClick={() => {
            setDirection('below');
            if (alert?.enabled) commit('below', priceText, true);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-[12px] ${
            direction === 'below' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textMuted'
          }`}
        >
          이하
        </button>
        <button
          type="button"
          onClick={() => {
            setDirection('above');
            if (alert?.enabled) commit('above', priceText, true);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-[12px] ${
            direction === 'above' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textMuted'
          }`}
        >
          이상
        </button>
      </div>
      <input
        inputMode="numeric"
        value={priceText}
        onChange={(e) => setPriceText(e.target.value)}
        onBlur={() => {
          if (alert?.enabled || priceText.trim()) commit(direction, priceText, alert?.enabled === true);
        }}
        placeholder="가격"
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] tabular-nums text-textMain outline-none focus:border-accent"
      />
      {error ? <p className="mt-1 text-[12px] text-warning">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => commit(direction, priceText, true)}
          className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white"
        >
          {alert?.enabled ? '알림 갱신' : '알림 켜기'}
        </button>
        {alert ? (
          <button
            type="button"
            onClick={() => commit(direction, priceText, false)}
            className="rounded-md border border-border px-3 py-2 text-[13px] text-textMuted"
          >
            알림 끄기
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
        이 탭이 열려 있고 시세가 목표를 통과할 때 상단 종 모양과 브라우저 알림으로 알려 줍니다.
      </p>
    </div>
  );
}

function ChangeText({ change }: { change: { text: string; amount: number } | null }) {
  if (!change) return <span className="text-[11px] text-textMuted">전일대비 —</span>;
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${pnlTextClass(change.amount, true)}`}>
      {change.text}
    </span>
  );
}

function changeLabel(
  price: number | undefined,
  prevClose: number | undefined,
): { text: string; amount: number } | null {
  if (price === undefined) return null;
  const change = krChangeFromPrevClose(price, prevClose);
  if (!change) return null;
  return {
    amount: change.amount,
    text: formatKrDayChange(change.amount, change.pct, 'KRW'),
  };
}
