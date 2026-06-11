import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Market } from '../types/portfolio';
import type { Trade } from '../types/trade';
import type { TradePlanTodo, PlanAction } from '../types/todo';
import type { LedgerRow } from '../lib/ledger';
import { defaultCurrencyForMarket } from '../lib/market';
import { formatMoney } from '../lib/format';
import { roundMoney } from '../lib/portfolioMath';
import {
  lookupKrStockName,
  normalizeKrTicker,
  searchKrStocksByName,
} from '../lib/krxLookup';
import { ExpandableText } from './ExpandableText';

interface MarketTodoListProps {
  market: Market;
  items: TradePlanTodo[];
  quotes: Record<string, number>;
  ledger: Map<string, LedgerRow>;
  trades: Trade[];
  onAdd: (todo: Omit<TradePlanTodo, 'id' | 'done' | 'createdAt'>) => void;
  onUpdate: (
    id: string,
    updates: Pick<TradePlanTodo, 'action' | 'targetPrice' | 'quantity' | 'note'>,
  ) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateTrade?: (todo: TradePlanTodo) => void;
  /** 보유 중인 동일 종목이 있으면 상세 모달로 이동 */
  onOpenHoldingDetail?: (ticker: string, market: Market) => void;
}

type TodoViewTab = 'open' | 'done';
type TodoDisplayMode = 'item' | 'group';

interface GroupedTodoEntry {
  ticker: string;
  displayName: string;
  latest: TradePlanTodo;
  items: TradePlanTodo[];
}

function normalizeTodoSearchQuery(q: string): string {
  return q.trim().toLowerCase();
}

function filterTodosBySearch(items: TradePlanTodo[], rawQuery: string): TradePlanTodo[] {
  const q = normalizeTodoSearchQuery(rawQuery);
  if (!q) return items;
  return items.filter((x) => {
    const name = (x.name ?? '').toLowerCase();
    return x.ticker.toLowerCase().includes(q) || name.includes(q);
  });
}

function todoListDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveTodoDisplayName(
  todo: TradePlanTodo,
  market: Market,
  ledger: Map<string, LedgerRow>,
  trades: Trade[],
): string {
  if (todo.name?.trim()) return todo.name.trim();
  const row = ledger.get(todo.ticker);
  if (row?.market === market && row.name?.trim()) return row.name.trim();
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i]!;
    if (t.ticker === todo.ticker && t.market === market && t.name?.trim()) {
      return t.name.trim();
    }
  }
  return '—';
}

export function MarketTodoList({
  market,
  items,
  quotes,
  ledger,
  trades,
  onAdd,
  onUpdate,
  onToggleDone,
  onDelete,
  onCreateTrade,
  onOpenHoldingDetail,
}: MarketTodoListProps) {
  const [symbolField, setSymbolField] = useState('');
  const [pickedKrName, setPickedKrName] = useState('');
  const [action, setAction] = useState<PlanAction>('buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [listSearchText, setListSearchText] = useState('');
  const [viewTab, setViewTab] = useState<TodoViewTab>('open');
  const [displayMode, setDisplayMode] = useState<TodoDisplayMode>('item');
  const [krSuggestions, setKrSuggestions] = useState<
    { ticker: string; name: string; sector: string }[]
  >([]);
  const [krSuggestLoading, setKrSuggestLoading] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<TradePlanTodo | null>(null);
  const [editAction, setEditAction] = useState<PlanAction>('buy');
  const [editTargetPrice, setEditTargetPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editNote, setEditNote] = useState('');
  const [groupModalTicker, setGroupModalTicker] = useState<string | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 목록에서 고른 코드·이름 쌍(같은 6자리 유지 시 이름 유지, 코드 바꾸면 초기화) */
  const lastKrPickRef = useRef<{ ticker: string; name: string } | null>(null);

  const currency = defaultCurrencyForMarket(market);
  const title = market === 'KR' ? '한국장 To-do' : '미국장 To-do';

  const openItems = useMemo(
    () =>
      items
        .filter((x) => !x.done)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items],
  );

  const doneItems = useMemo(
    () =>
      items
        .filter((x) => x.done)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );

  const selectedItems = useMemo(
    () => (viewTab === 'open' ? openItems : doneItems),
    [viewTab, openItems, doneItems],
  );

  const filteredSelected = useMemo(
    () => filterTodosBySearch(selectedItems, listSearchText),
    [selectedItems, listSearchText],
  );

  const groupedSelected = useMemo(() => {
    const map = new Map<string, GroupedTodoEntry>();
    for (const item of filteredSelected) {
      const cur = map.get(item.ticker);
      const displayName = resolveTodoDisplayName(item, market, ledger, trades);
      if (!cur) {
        map.set(item.ticker, {
          ticker: item.ticker,
          displayName,
          latest: item,
          items: [item],
        });
        continue;
      }
      cur.items.push(item);
      if (item.createdAt > cur.latest.createdAt) {
        cur.latest = item;
        cur.displayName = displayName;
      }
    }
    return [...map.values()]
      .map((entry) => ({
        ...entry,
        items: [...entry.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }))
      .sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [filteredSelected, ledger, market, trades]);

  const totalTodoCount = openItems.length + doneItems.length;
  const statusCounts = useMemo(() => {
    let reached = 0;
    let near = 0;
    let waiting = 0;
    for (const item of openItems) {
      const st = getTodoStatus(item, quotes);
      if (st === 'reached') reached += 1;
      else if (st === 'near') near += 1;
      else waiting += 1;
    }
    return { reached, near, waiting };
  }, [openItems, quotes]);

  const editingDisplayName = useMemo(
    () =>
      editingTodo
        ? resolveTodoDisplayName(editingTodo, market, ledger, trades)
        : '—',
    [editingTodo, market, ledger, trades],
  );

  const editingTodoNotes = useMemo(() => {
    if (!editingTodo) return [];
    return items
      .filter(
        (x) =>
          x.market === editingTodo.market &&
          x.ticker === editingTodo.ticker &&
          !!x.note?.trim(),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [editingTodo, items]);

  const groupModalEntry = useMemo(() => {
    if (!groupModalTicker) return null;
    return groupedSelected.find((x) => x.ticker === groupModalTicker) ?? null;
  }, [groupModalTicker, groupedSelected]);

  const trimmedSymbol = symbolField.trim();
  const krDigitsOnly = market === 'KR' && /^\d+$/.test(trimmedSymbol.replace(/\s/g, ''));

  useEffect(() => {
    if (market !== 'KR') {
      setKrSuggestions([]);
      return;
    }
    const raw = trimmedSymbol.replace(/\s/g, '');
    if (krDigitsOnly && raw.length <= 6) {
      setKrSuggestions([]);
      return;
    }
    if (!trimmedSymbol) {
      setKrSuggestions([]);
      return;
    }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => {
      setKrSuggestLoading(true);
      searchKrStocksByName(trimmedSymbol, 8)
        .then((items) => setKrSuggestions(items))
        .catch(() => setKrSuggestions([]))
        .finally(() => setKrSuggestLoading(false));
    }, 280);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [market, trimmedSymbol, krDigitsOnly]);

  const resolveNameForSubmit = useCallback(
    async (tk: string): Promise<string | undefined> => {
      const fromPick = pickedKrName.trim();
      if (fromPick) return fromPick;
      if (market === 'KR' && normalizeKrTicker(tk)) {
        const looked = await lookupKrStockName(tk);
        if (looked?.name) return looked.name;
      }
      const row = ledger.get(tk);
      if (row?.market === market && row.name?.trim()) return row.name.trim();
      for (let i = trades.length - 1; i >= 0; i--) {
        const t = trades[i]!;
        if (t.ticker === tk && t.market === market && t.name?.trim()) {
          return t.name.trim();
        }
      }
      return undefined;
    },
    [pickedKrName, market, ledger, trades],
  );

  const handleKrBlurLookup = useCallback(() => {
    if (market !== 'KR') return;
    const raw = symbolField.trim().replace(/\s/g, '');
    const code = normalizeKrTicker(raw);
    if (!code) return;
    void lookupKrStockName(code).then((r) => {
      const nm = r?.name ?? '';
      setPickedKrName(nm);
      lastKrPickRef.current = nm ? { ticker: code, name: nm } : null;
    });
  }, [market, symbolField]);

  const submitAddTodo = useCallback(async () => {
    setAddError(null);
    const tk =
      market === 'KR'
        ? symbolField.trim().replace(/\s/g, '')
        : symbolField.trim().toUpperCase();
    const p = Number(targetPrice);
    const q = Number(quantity);
    if (!tk) {
      setAddError(
        market === 'KR'
          ? '종목코드를 입력하거나 검색 목록에서 종목을 선택해 주세요.'
          : '티커를 입력해 주세요.',
      );
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setAddError('목표가는 0보다 큰 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setAddError('수량은 1 이상의 숫자로 입력해 주세요.');
      return;
    }
    if (market === 'KR' && !normalizeKrTicker(tk)) {
      setAddError(
        '한국장은 6자리 종목코드(예: 005930, 00680K)를 입력하거나, 아래 목록에서 종목을 선택해 주세요.',
      );
      return;
    }
    setAddSubmitting(true);
    try {
      const resolvedName = await resolveNameForSubmit(tk);
      onAdd({
        market,
        ticker: tk,
        name: resolvedName,
        action,
        targetPrice: roundMoney(p, currency),
        quantity: Math.floor(q),
        note: note.trim() || undefined,
      });
      setSymbolField('');
      setPickedKrName('');
      lastKrPickRef.current = null;
      setKrSuggestions([]);
      setTargetPrice('');
      setQuantity('');
      setNote('');
      setAddError(null);
    } finally {
      setAddSubmitting(false);
    }
  }, [
    action,
    currency,
    market,
    note,
    onAdd,
    quantity,
    resolveNameForSubmit,
    symbolField,
    targetPrice,
  ]);

  const openEditModal = useCallback((todo: TradePlanTodo) => {
    setEditingTodo(todo);
    setEditAction(todo.action);
    setEditTargetPrice(String(todo.targetPrice));
    setEditQuantity(String(todo.quantity));
    setEditNote(todo.note ?? '');
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingTodo(null);
    setEditAction('buy');
    setEditTargetPrice('');
    setEditQuantity('');
    setEditNote('');
  }, []);

  const closeGroupModal = useCallback(() => {
    setGroupModalTicker(null);
  }, []);

  const handleEditSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTodo) return;
      const p = Number(editTargetPrice);
      const q = Number(editQuantity);
      if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
        return;
      }
      onUpdate(editingTodo.id, {
        action: editAction,
        targetPrice: roundMoney(p, currency),
        quantity: Math.floor(q),
        note: editNote.trim() || undefined,
      });
      closeEditModal();
    },
    [
      editingTodo,
      editTargetPrice,
      editQuantity,
      editAction,
      editNote,
      onUpdate,
      currency,
      closeEditModal,
    ],
  );

  const handleDeleteTodo = useCallback(
    (todo: TradePlanTodo) => {
      onDelete(todo.id);
    },
    [onDelete],
  );

  const renderTodoActions = useCallback(
    (todo: TradePlanTodo, small = false) => (
      <div className="flex flex-wrap justify-end gap-1">
        {onOpenHoldingDetail ? (
          <button
            type="button"
            onClick={() => onOpenHoldingDetail(todo.ticker, market)}
            className={`rounded border border-accent/40 font-medium text-accent hover:bg-accent/10 ${
              small ? 'px-2 py-1 text-[10px]' : 'px-2 py-1 text-[11px]'
            }`}
          >
            보유 상세
          </button>
        ) : null}
        {todo.done ? (
          <button
            type="button"
            onClick={() => onToggleDone(todo.id)}
            className={`rounded border border-border text-textMain hover:bg-white/5 ${
              small ? 'px-2 py-1 text-[10px]' : 'px-2 py-1 text-[11px]'
            }`}
          >
            미완료
          </button>
        ) : null}
        {!todo.done && onCreateTrade ? (
          <button
            type="button"
            onClick={() => onCreateTrade(todo)}
            className={`rounded border border-positive/40 font-medium text-positive hover:bg-positive/10 ${
              small ? 'px-2 py-1 text-[10px]' : 'px-2 py-1 text-[11px]'
            }`}
          >
            체결 등록
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => handleDeleteTodo(todo)}
          className={`rounded border border-negative/40 text-negative hover:bg-negative/10 ${
            small ? 'px-2 py-1 text-[10px]' : 'px-2 py-1 text-[11px]'
          }`}
        >
          삭제
        </button>
      </div>
    ),
    [handleDeleteTodo, market, onCreateTrade, onOpenHoldingDetail, onToggleDone],
  );

  const emptyListMessage =
    selectedItems.length === 0
      ? viewTab === 'open'
        ? '진행중인 계획이 없습니다.'
        : '완료된 계획이 없습니다.'
      : '검색 조건에 맞는 계획이 없습니다.';

  return (
    <div className="rounded-lg border border-border bg-surface p-4 md:rounded-none md:border-x-0 md:border-y md:bg-transparent md:px-0">
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-textMain">{title}</h3>
          <p className="text-[11px] text-textMuted">
              코드·종목명 검색으로 빠르게 등록
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
            {viewTab === 'open' ? (
              <>
                <SummaryCountChip label="도달" count={statusCounts.reached} tone="positive" />
                <SummaryCountChip label="근접" count={statusCounts.near} tone="warning" />
                <SummaryCountChip label="대기" count={statusCounts.waiting} />
              </>
            ) : (
              <span className="rounded-full border border-border/70 px-2 py-0.5 text-textMuted">
                완료 <span className="tabular-nums text-textMain">{doneItems.length}</span> / 전체{' '}
                <span className="tabular-nums text-textMain">{totalTodoCount}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <form
        className="rounded-xl border border-border/60 bg-background/25 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submitAddTodo();
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-textMuted">빠른 등록</p>
          {market === 'KR' && pickedKrName ? (
            <p className="truncate text-[11px] text-textMuted" title={pickedKrName}>
              {pickedKrName}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="relative md:col-span-3">
            <input
              placeholder={
                market === 'KR' ? '종목코드(6자리) 또는 종목명 검색' : '티커 (예: AAPL)'
              }
              value={symbolField}
              onChange={(e) => {
                const v = e.target.value;
                setSymbolField(v);
                if (addError) setAddError(null);
                if (market !== 'KR') return;
                const compact = v.trim().replace(/\s/g, '');
                if (lastKrPickRef.current && compact === lastKrPickRef.current.ticker) {
                  setPickedKrName(lastKrPickRef.current.name);
                  return;
                }
                lastKrPickRef.current = null;
                setPickedKrName('');
              }}
              onBlur={() => {
                handleKrBlurLookup();
              }}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            />
            {market === 'KR' && krSuggestions.length > 0 && !normalizeKrTicker(trimmedSymbol) ? (
              <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg">
                {krSuggestions.map((item) => (
                  <li key={item.ticker}>
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        lastKrPickRef.current = { ticker: item.ticker, name: item.name };
                        setSymbolField(item.ticker);
                        setPickedKrName(item.name);
                        setKrSuggestions([]);
                      }}
                      className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-xs text-textMain hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="shrink-0 tabular-nums text-textMuted">{item.ticker}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {market === 'KR' && krSuggestLoading ? (
              <p className="mt-1 text-[11px] text-textMuted">종목명 검색 중…</p>
            ) : null}
          </div>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as PlanAction);
              if (addError) setAddError(null);
            }}
            className="rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-2"
          >
            <option value="buy">매수</option>
            <option value="sell">매도</option>
          </select>
          <input
            type="number"
            min={0}
            step="any"
            placeholder={`목표가 (${currency})`}
            value={targetPrice}
            onChange={(e) => {
              setTargetPrice(e.target.value);
              if (addError) setAddError(null);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-2"
          />
          <input
            type="number"
            min={1}
            step={1}
            placeholder="수량"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              if (addError) setAddError(null);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-1"
          />
          <input
            placeholder="메모(선택)"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (addError) setAddError(null);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-3"
          />
          <button
            type="button"
            disabled={addSubmitting}
            onPointerDown={() => {
              if (typeof document === 'undefined') return;
              const active = document.activeElement;
              if (active instanceof HTMLElement) active.blur();
            }}
            onClick={() => void submitAddTodo()}
            className="rounded-md bg-accent px-2.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 md:col-span-1"
          >
            {addSubmitting ? '추가 중…' : '추가'}
          </button>
        </div>
        {addError ? (
          <p className="mt-2 text-[12px] text-negative">{addError}</p>
        ) : null}
      </form>

      <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 lg:flex-row lg:items-end">
        <div className="min-w-[14rem] flex-1">
          <label className="sr-only" htmlFor="todo-list-search">
            {viewTab === 'open' ? '진행중 검색' : '완료 검색'}
          </label>
          <input
            id="todo-list-search"
            value={listSearchText}
            onChange={(e) => setListSearchText(e.target.value)}
            placeholder="종목코드·종목명 검색"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
          />
        </div>

        <div
          className="flex shrink-0 flex-wrap gap-1 rounded-md border border-border bg-background p-0.5"
          role="tablist"
          aria-label="To-do 보기 구분"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'open'}
            onClick={() => setViewTab('open')}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition ${
              viewTab === 'open'
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            진행중 ({openItems.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'done'}
            onClick={() => setViewTab('done')}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition ${
              viewTab === 'done'
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            완료 ({doneItems.length})
          </button>
        </div>

        <div
          className="flex shrink-0 flex-wrap gap-1 rounded-md border border-border bg-background p-0.5"
          role="tablist"
          aria-label="To-do 표시 방식"
        >
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === 'item'}
            onClick={() => setDisplayMode('item')}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition ${
              displayMode === 'item'
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            건건이
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === 'group'}
            onClick={() => setDisplayMode('group')}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition ${
              displayMode === 'group'
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            종목별
          </button>
        </div>
      </div>

      {displayMode === 'item' ? (
        <>
          <div className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1 md:hidden">
            {filteredSelected.length === 0 ? (
              <div className="rounded-md border border-border px-4 py-8 text-center text-textMuted">
                {emptyListMessage}
              </div>
            ) : (
              filteredSelected.map((x) => {
                const displayName = resolveTodoDisplayName(x, market, ledger, trades);
                const sell = x.action === 'sell';
                return (
                  <section
                    key={x.id}
                    className={`rounded-lg border border-border/70 px-3 py-2 ${
                      x.done ? 'opacity-60' : ''
                    } ${sell ? 'bg-negative/5' : 'bg-positive/5'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(x)}
                          className="block max-w-full text-left"
                        >
                          <span className="block truncate text-[14px] font-medium text-textMain underline-offset-2 hover:underline">
                            {displayName}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-textMuted">
                            {x.ticker} · {todoListDateLabel(x.createdAt)}
                          </span>
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span
                          className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                            sell ? 'text-negative' : 'text-positive'
                          }`}
                        >
                          {sell ? '매도' : '매수'}
                        </span>
                        <div className="inline-flex items-center justify-end">
                          {x.done ? (
                            <span className="rounded bg-border px-1.5 py-0.5 text-[11px] font-medium leading-none text-textMuted">
                              완료
                            </span>
                          ) : (
                            <StatusBadge status={getTodoStatus(x, quotes)} />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-1.5 grid grid-cols-[auto_1fr_auto_1fr] items-start gap-x-2 gap-y-1 text-[12px]">
                      <span className="text-textMuted">목표가</span>
                      <span className="truncate text-right font-semibold tabular-nums text-textMain">
                        {formatMoney(x.targetPrice, currency)}
                      </span>
                      <span className="text-textMuted">수량</span>
                      <span className="text-right font-semibold tabular-nums text-textMain">
                        {x.quantity}주
                      </span>
                      <span className="self-start text-textMuted">비고</span>
                      <div className="col-span-3 min-w-0">
                        <ExpandableText
                          text={x.note ?? '—'}
                          maxChars={30}
                          preserveWhitespace={false}
                          textClassName="text-[13px] text-textMain"
                          buttonClassName="text-[10px]"
                        />
                      </div>
                    </div>

                    <div className="mt-2">{renderTodoActions(x, true)}</div>
                  </section>
                );
              })
            )}
          </div>

          <div className="mt-4 hidden max-h-[30rem] overflow-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-textMuted">
                  <th className="py-2 pr-3 font-medium">등록일</th>
                  <th className="py-2 pr-3 font-medium">종목코드</th>
                  <th className="py-2 pr-3 font-medium">종목명</th>
                  <th className="py-2 pr-3 font-medium">구분</th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">목표가</th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">수량</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="min-w-[100px] py-2 pr-3 font-medium">비고</th>
                  <th className="py-2 pr-2 text-right font-medium">동작</th>
                </tr>
              </thead>
              <tbody>
                {filteredSelected.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-textMuted">
                      {emptyListMessage}
                    </td>
                  </tr>
                ) : (
                  filteredSelected.map((x) => {
                    const displayName = resolveTodoDisplayName(x, market, ledger, trades);
                    const sell = x.action === 'sell';
                    return (
                      <tr
                        key={x.id}
                        className={`border-b border-border/60 ${
                          x.done ? 'opacity-60' : ''
                        } ${sell ? 'bg-negative/5' : 'bg-positive/5'}`}
                      >
                        <td className="py-2 pr-3 tabular-nums text-textMain">
                          {todoListDateLabel(x.createdAt)}
                        </td>
                        <td className="py-2 pr-3 font-medium text-textMain">{x.ticker}</td>
                        <td className="max-w-[180px] truncate py-2 pr-3 text-textMain">
                          <button
                            type="button"
                            onClick={() => openEditModal(x)}
                            className="max-w-full truncate text-left text-textMain underline-offset-2 hover:underline"
                            title={`${displayName} 수정`}
                          >
                            {displayName}
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                              sell ? 'text-negative' : 'text-positive'
                            }`}
                          >
                            {sell ? '매도' : '매수'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                          {formatMoney(x.targetPrice, currency)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                          {x.quantity}
                        </td>
                        <td className="py-2 pr-3">
                          {x.done ? (
                            <span className="text-textMuted">완료</span>
                          ) : (
                            <StatusBadge status={getTodoStatus(x, quotes)} />
                          )}
                        </td>
                        <td className="max-w-[140px] truncate py-2 pr-3 text-textMuted" title={x.note}>
                          {x.note ?? '—'}
                        </td>
                        <td className="py-2 pr-0 text-right">{renderTodoActions(x)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1 md:hidden">
            {groupedSelected.length === 0 ? (
              <div className="rounded-md border border-border px-4 py-8 text-center text-textMuted">
                {emptyListMessage}
              </div>
            ) : (
              groupedSelected.map((group) => {
                const latest = group.latest;
                const sell = latest.action === 'sell';
                return (
                  <section
                    key={group.ticker}
                    className={`rounded-lg border border-border/70 px-3 py-2 ${
                      latest.done ? 'opacity-60' : ''
                    } ${sell ? 'bg-negative/5' : 'bg-positive/5'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setGroupModalTicker(group.ticker)}
                          className="block max-w-full text-left"
                        >
                          <span className="block truncate text-[14px] font-medium text-textMain underline-offset-2 hover:underline">
                            {group.displayName}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-textMuted">
                            {group.ticker} · 최근 등록 {todoListDateLabel(latest.createdAt)} · 총{' '}
                            {group.items.length}건
                          </span>
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span
                          className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                            sell ? 'text-negative' : 'text-positive'
                          }`}
                        >
                          {sell ? '매도' : '매수'}
                        </span>
                        {latest.done ? (
                          <span className="rounded bg-border px-1.5 py-0.5 text-[11px] font-medium leading-none text-textMuted">
                            완료
                          </span>
                        ) : (
                          <StatusBadge status={getTodoStatus(latest, quotes)} />
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 text-[12px]">
                      <span className="text-textMuted">최신 목표가</span>
                      <span className="text-right font-semibold tabular-nums text-textMain">
                        {formatMoney(latest.targetPrice, currency)}
                      </span>
                      <span className="text-textMuted">최신 수량</span>
                      <span className="text-right font-semibold tabular-nums text-textMain">
                        {latest.quantity}주
                      </span>
                    </div>
                  </section>
                );
              })
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-textMuted">
                  <th className="py-2 pr-3 font-medium">종목코드</th>
                  <th className="py-2 pr-3 font-medium">종목명</th>
                  <th className="py-2 pr-3 font-medium">최근 등록일</th>
                  <th className="py-2 pr-3 font-medium">최근 구분</th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">최근 목표가</th>
                  <th className="py-2 pr-3 text-right font-medium tabular-nums">최근 수량</th>
                  <th className="py-2 pr-3 font-medium">최근 상태</th>
                  <th className="py-2 pr-2 text-right font-medium">계획 수</th>
                </tr>
              </thead>
              <tbody>
                {groupedSelected.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-textMuted">
                      {emptyListMessage}
                    </td>
                  </tr>
                ) : (
                  groupedSelected.map((group) => {
                    const latest = group.latest;
                    const sell = latest.action === 'sell';
                    return (
                      <tr
                        key={group.ticker}
                        className="cursor-pointer border-b border-border/60 transition hover:bg-white/[0.04]"
                        onClick={() => setGroupModalTicker(group.ticker)}
                      >
                        <td className="py-2 pr-3 font-medium text-textMain">{group.ticker}</td>
                        <td className="max-w-[180px] truncate py-2 pr-3 text-textMain">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGroupModalTicker(group.ticker);
                            }}
                            className="max-w-full truncate text-left text-textMain underline-offset-2 hover:underline"
                          >
                            {group.displayName}
                          </button>
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-textMain">
                          {todoListDateLabel(latest.createdAt)}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                              sell ? 'text-negative' : 'text-positive'
                            }`}
                          >
                            {sell ? '매도' : '매수'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                          {formatMoney(latest.targetPrice, currency)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                          {latest.quantity}
                        </td>
                        <td className="py-2 pr-3">
                          {latest.done ? (
                            <span className="text-textMuted">완료</span>
                          ) : (
                            <StatusBadge status={getTodoStatus(latest, quotes)} />
                          )}
                        </td>
                        <td className="py-2 pr-0 text-right tabular-nums text-textMain">
                          {group.items.length}건
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editingTodo ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={closeEditModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="todo-edit-modal-title"
            className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4
                  id="todo-edit-modal-title"
                  className="text-base font-semibold text-textMain"
                >
                  To-do 수정
                </h4>
                <p className="mt-1 text-[12px] text-textMuted">
                  <span className="font-medium text-textMain">
                    {editingTodo.ticker}
                  </span>
                  {' · '}
                  {editingDisplayName}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded border border-border px-2 py-1 text-[12px] text-textMain hover:bg-white/5"
              >
                닫기
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleEditSubmit}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as PlanAction)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                >
                  <option value="buy">매수</option>
                  <option value="sell">매도</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={editTargetPrice}
                  onChange={(e) => setEditTargetPrice(e.target.value)}
                  placeholder={`목표가 (${currency})`}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  placeholder="수량"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                />
              </div>
              <input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="메모(선택)"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
              />
              <div className="rounded-md border border-border bg-background/50 p-3">
                <p className="text-[12px] font-medium text-textMain">
                  같은 종목 메모
                </p>
                {editingTodoNotes.length === 0 ? (
                  <p className="mt-2 text-[12px] text-textMuted">
                    등록된 메모가 없습니다.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-44 space-y-2 overflow-auto">
                    {editingTodoNotes.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded border border-border/70 bg-surface px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-textMuted">
                          <span className="tabular-nums">
                            {todoListDateLabel(entry.createdAt)}
                          </span>
                          <span>
                            {entry.action === 'buy' ? '매수' : '매도'} · {entry.quantity}
                            주
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] text-textMain">
                          {entry.note}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {groupModalEntry ? (
        <div
          className="fixed inset-0 z-[79] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={closeGroupModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="todo-group-modal-title"
            className="w-full max-w-2xl rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4
                  id="todo-group-modal-title"
                  className="text-base font-semibold text-textMain"
                >
                  종목별 To-do 상세
                </h4>
                <p className="mt-1 text-[12px] text-textMuted">
                  <span className="font-medium text-textMain">{groupModalEntry.ticker}</span>
                  {' · '}
                  {groupModalEntry.displayName} · 총 {groupModalEntry.items.length}건
                </p>
              </div>
              <button
                type="button"
                onClick={closeGroupModal}
                className="rounded border border-border px-2 py-1 text-[12px] text-textMain hover:bg-white/5"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {groupModalEntry.items.map((todo) => {
                const sell = todo.action === 'sell';
                return (
                  <section
                    key={todo.id}
                    className={`rounded-lg border border-border/70 px-3 py-3 ${
                      todo.done ? 'opacity-60' : ''
                    } ${sell ? 'bg-negative/5' : 'bg-positive/5'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            closeGroupModal();
                            openEditModal(todo);
                          }}
                          className="text-left"
                        >
                          <span className="block text-[14px] font-medium text-textMain underline-offset-2 hover:underline">
                            {todoListDateLabel(todo.createdAt)}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-textMuted">
                            목표가 {formatMoney(todo.targetPrice, currency)} · 수량 {todo.quantity}주
                          </span>
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                            sell ? 'text-negative' : 'text-positive'
                          }`}
                        >
                          {sell ? '매도' : '매수'}
                        </span>
                        {todo.done ? (
                          <span className="rounded bg-border px-1.5 py-0.5 text-[11px] font-medium leading-none text-textMuted">
                            완료
                          </span>
                        ) : (
                          <StatusBadge status={getTodoStatus(todo, quotes)} />
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <ExpandableText
                        text={todo.note ?? '—'}
                        maxChars={60}
                        preserveWhitespace={false}
                        textClassName="text-[13px] text-textMain"
                        buttonClassName="text-[10px]"
                      />
                    </div>
                    <div className="mt-2.5">{renderTodoActions(todo)}</div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getTodoStatus(todo: TradePlanTodo, quotes: Record<string, number>): 'reached' | 'near' | 'waiting' {
  const current = quotes[todo.ticker];
  if (!Number.isFinite(current)) return 'waiting';

  const threshold = 0.02; // 2% 근접
  if (todo.action === 'buy') {
    if (current <= todo.targetPrice) return 'reached';
    if (current <= todo.targetPrice * (1 + threshold)) return 'near';
    return 'waiting';
  }
  if (current >= todo.targetPrice) return 'reached';
  if (current >= todo.targetPrice * (1 - threshold)) return 'near';
  return 'waiting';
}

function StatusBadge({ status }: { status: 'reached' | 'near' | 'waiting' }) {
  if (status === 'reached') {
    return (
      <span className="inline-flex items-center justify-center rounded bg-positive/20 px-1.5 py-0.5 text-[11px] font-medium leading-none text-positive">
        도달
      </span>
    );
  }
  if (status === 'near') {
    return (
      <span className="inline-flex items-center justify-center rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium leading-none text-warning">
        근접(2%)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded bg-border px-1.5 py-0.5 text-[11px] font-medium leading-none text-textMuted">
      대기
    </span>
  );
}

function SummaryCountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone?: 'positive' | 'warning';
}) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 ${
        tone === 'positive'
          ? 'border-positive/25 bg-positive/10 text-positive'
          : tone === 'warning'
            ? 'border-warning/25 bg-warning/10 text-warning'
            : 'border-border/70 text-textMuted'
      }`}
    >
      {label} <span className="tabular-nums">{count}</span>
    </span>
  );
}
