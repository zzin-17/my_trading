import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Market } from '../types/portfolio';
import type { Trade } from '../types/trade';
import type { TradePlanTodo, PlanAction } from '../types/todo';
import type { LedgerRow } from '../lib/ledger';
import { defaultCurrencyForMarket } from '../lib/market';
import { formatMoney } from '../lib/format';
import { roundMoney } from '../lib/portfolioMath';
import { lookupKrStockName, searchKrStocksByName } from '../lib/krxLookup';
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
  /** 보유 중인 동일 종목이 있으면 상세 모달로 이동 */
  onOpenHoldingDetail?: (ticker: string, market: Market) => void;
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
  onOpenHoldingDetail,
}: MarketTodoListProps) {
  const [symbolField, setSymbolField] = useState('');
  const [pickedKrName, setPickedKrName] = useState('');
  const [action, setAction] = useState<PlanAction>('buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [listSearchText, setListSearchText] = useState('');
  const [krSuggestions, setKrSuggestions] = useState<
    { ticker: string; name: string; sector: string }[]
  >([]);
  const [krSuggestLoading, setKrSuggestLoading] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TradePlanTodo | null>(null);
  const [editAction, setEditAction] = useState<PlanAction>('buy');
  const [editTargetPrice, setEditTargetPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editNote, setEditNote] = useState('');

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 목록에서 고른 코드·이름 쌍(같은 6자리 유지 시 이름 유지, 코드 바꾸면 초기화) */
  const lastKrPickRef = useRef<{ ticker: string; name: string } | null>(null);

  const currency = defaultCurrencyForMarket(market);
  const title = market === 'KR' ? '한국장 To-do' : '미국장 To-do';

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.createdAt.localeCompare(b.createdAt);
      }),
    [items],
  );

  const filteredSorted = useMemo(
    () => filterTodosBySearch(sorted, listSearchText),
    [sorted, listSearchText],
  );

  const statusCounts = useMemo(() => {
    let reached = 0;
    let near = 0;
    let waiting = 0;
    for (const item of sorted) {
      if (item.done) continue;
      const st = getTodoStatus(item, quotes);
      if (st === 'reached') reached += 1;
      else if (st === 'near') near += 1;
      else waiting += 1;
    }
    return { reached, near, waiting };
  }, [sorted, quotes]);

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

  const trimmedSymbol = symbolField.trim();
  const krDigitsOnly = market === 'KR' && /^\d+$/.test(trimmedSymbol.replace(/\s/g, ''));
  const krSixDigit =
    market === 'KR' && /^\d{6}$/.test(trimmedSymbol.replace(/\s/g, ''));

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
      if (market === 'KR' && /^\d{6}$/.test(tk)) {
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
    if (!/^\d{6}$/.test(raw)) return;
    void lookupKrStockName(raw).then((r) => {
      const nm = r?.name ?? '';
      setPickedKrName(nm);
      lastKrPickRef.current = nm ? { ticker: raw, name: nm } : null;
    });
  }, [market, symbolField]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tk =
      market === 'KR'
        ? symbolField.trim().replace(/\s/g, '')
        : symbolField.trim().toUpperCase();
    const p = Number(targetPrice);
    const q = Number(quantity);
    if (!tk || !Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
      return;
    }
    if (market === 'KR' && !/^\d{6}$/.test(tk)) {
      window.alert('한국장은 6자리 종목코드를 입력하거나, 아래 목록에서 종목을 선택해 주세요.');
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
    } finally {
      setAddSubmitting(false);
    }
  };

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

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-textMain">{title}</h3>
        <p className="text-[12px] text-textMuted">
          예) 평단 근처면 3주 매수 / 목표가 도달하면 일부 매도 · 종목은 코드 또는(한국) 종목명 검색
        </p>
        <p className="mt-1 text-[11px] text-textMuted">
          상태: 도달 {statusCounts.reached} · 근접 {statusCounts.near} · 대기 {statusCounts.waiting}
        </p>
      </div>

      <form className="space-y-2.5" onSubmit={(e) => void handleAddSubmit(e)}>
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
            {market === 'KR' && krSuggestions.length > 0 && !krSixDigit ? (
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
            {market === 'KR' && pickedKrName ? (
              <p className="mt-1 truncate text-[11px] text-textMuted">선택·조회명: {pickedKrName}</p>
            ) : null}
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as PlanAction)}
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
            onChange={(e) => setTargetPrice(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-2"
          />
          <input
            type="number"
            min={1}
            step={1}
            placeholder="수량"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-1"
          />
          <input
            placeholder="메모(선택)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-3"
          />
          <button
            type="submit"
            disabled={addSubmitting}
            className="rounded-md bg-accent px-2.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 md:col-span-1"
          >
            {addSubmitting ? '추가 중…' : '추가'}
          </button>
        </div>
      </form>

      <div className="mt-4">
        <label className="text-[12px] text-textMuted" htmlFor="todo-list-search">
          목록 검색 (종목코드·종목명)
        </label>
        <input
          id="todo-list-search"
          value={listSearchText}
          onChange={(e) => setListSearchText(e.target.value)}
          placeholder="예: 005930, 삼성…"
          className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
        />
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {filteredSorted.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-8 text-center text-textMuted">
            {sorted.length === 0
              ? '등록된 계획이 없습니다.'
              : '검색 조건에 맞는 계획이 없습니다.'}
          </div>
        ) : (
          filteredSorted.map((x) => {
            const displayName = resolveTodoDisplayName(x, market, ledger, trades);
            const sell = x.action === 'sell';
            return (
              <section
                key={x.id}
                className={`rounded-lg border border-border/70 px-3 py-2.5 ${
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
                      <span className="block truncate text-[15px] font-medium text-textMain underline-offset-2 hover:underline">
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

                <div className="mt-2 grid grid-cols-[auto_1fr_auto_1fr] items-start gap-x-2 gap-y-1 text-[12px]">
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

                <div className="mt-2.5 flex flex-wrap justify-end gap-1">
                  {onOpenHoldingDetail ? (
                    <button
                      type="button"
                      onClick={() => onOpenHoldingDetail(x.ticker, market)}
                      className="rounded border border-accent/40 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/10"
                    >
                      보유 상세
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onToggleDone(x.id)}
                    className="rounded border border-border px-2 py-1 text-[10px] text-textMain hover:bg-white/5"
                  >
                    {x.done ? '미완료' : '완료'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(x.id)}
                    className="rounded border border-negative/40 px-2 py-1 text-[10px] text-negative hover:bg-negative/10"
                  >
                    삭제
                  </button>
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
            {filteredSorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-textMuted">
                  {sorted.length === 0
                    ? '등록된 계획이 없습니다.'
                    : '검색 조건에 맞는 계획이 없습니다.'}
                </td>
              </tr>
            ) : (
              filteredSorted.map((x) => {
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
                    <td className="py-2 pr-3 text-right tabular-nums text-textMain">{x.quantity}</td>
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
                    <td className="py-2 pr-0 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {onOpenHoldingDetail ? (
                          <button
                            type="button"
                            onClick={() => onOpenHoldingDetail(x.ticker, market)}
                            className="rounded border border-accent/40 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
                          >
                            보유 상세
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onToggleDone(x.id)}
                          className="rounded border border-border px-2 py-1 text-[11px] text-textMain hover:bg-white/5"
                        >
                          {x.done ? '미완료' : '완료'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(x.id)}
                          className="rounded border border-negative/40 px-2 py-1 text-[11px] text-negative hover:bg-negative/10"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
