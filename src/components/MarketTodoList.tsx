import { useMemo, useState } from 'react';
import type { Market } from '../types/portfolio';
import type { TradePlanTodo, PlanAction } from '../types/todo';
import { defaultCurrencyForMarket } from '../lib/market';
import { formatMoney } from '../lib/format';
import { roundMoney } from '../lib/portfolioMath';

interface MarketTodoListProps {
  market: Market;
  items: TradePlanTodo[];
  quotes: Record<string, number>;
  onAdd: (todo: Omit<TradePlanTodo, 'id' | 'done' | 'createdAt'>) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  /** 보유 중인 동일 종목이 있으면 상세 모달로 이동 */
  onOpenHoldingDetail?: (ticker: string, market: Market) => void;
}

export function MarketTodoList({
  market,
  items,
  quotes,
  onAdd,
  onToggleDone,
  onDelete,
  onOpenHoldingDetail,
}: MarketTodoListProps) {
  const [ticker, setTicker] = useState('');
  const [action, setAction] = useState<PlanAction>('buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

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

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-textMain">{title}</h3>
        <p className="text-[12px] text-textMuted">
          예) 평단 근처면 3주 매수 / 목표가 도달하면 일부 매도
        </p>
        <p className="mt-1 text-[11px] text-textMuted">
          상태: 도달 {statusCounts.reached} · 근접 {statusCounts.near} · 대기 {statusCounts.waiting}
        </p>
      </div>

      <form
        className="grid grid-cols-1 gap-2 md:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          const tk = market === 'KR' ? ticker.trim() : ticker.trim().toUpperCase();
          const p = Number(targetPrice);
          const q = Number(quantity);
          if (!tk || !Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
            return;
          }
          onAdd({
            market,
            ticker: tk,
            action,
            targetPrice: roundMoney(p, currency),
            quantity: Math.floor(q),
            note: note.trim() || undefined,
          });
          setTicker('');
          setTargetPrice('');
          setQuantity('');
          setNote('');
        }}
      >
        <input
          placeholder="종목코드"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as PlanAction)}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
        >
          <option value="buy">매수 계획</option>
          <option value="sell">매도 계획</option>
        </select>
        <input
          type="number"
          min={0}
          step="any"
          placeholder={`목표가 (${currency})`}
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
        />
        <input
          type="number"
          min={1}
          step={1}
          placeholder="수량"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
        />
        <input
          placeholder="메모(선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent md:col-span-2"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 md:col-span-6"
        >
          계획 추가
        </button>
      </form>

      <ul className="mt-3 space-y-2">
        {sorted.length === 0 ? (
          <li className="rounded-md border border-border px-3 py-4 text-center text-[12px] text-textMuted">
            등록된 계획이 없습니다.
          </li>
        ) : (
          sorted.map((x) => (
            <li
              key={x.id}
              className={`flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 ${
                x.done ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className={`text-sm ${x.done ? 'line-through text-textMuted' : 'text-textMain'}`}>
                  {x.ticker} · {x.action === 'buy' ? '매수' : '매도'} {x.quantity}주 @{' '}
                  {formatMoney(x.targetPrice, currency)}
                </p>
                {!x.done && (
                  <p className="mt-0.5 text-[11px]">
                    <StatusBadge status={getTodoStatus(x, quotes)} />
                  </p>
                )}
                {x.note && <p className="truncate text-[12px] text-textMuted">{x.note}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
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
            </li>
          ))
        )}
      </ul>
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
      <span className="rounded bg-positive/20 px-1.5 py-0.5 font-medium text-positive">
        도달
      </span>
    );
  }
  if (status === 'near') {
    return (
      <span className="rounded bg-warning/20 px-1.5 py-0.5 font-medium text-warning">
        근접(2%)
      </span>
    );
  }
  return (
    <span className="rounded bg-border px-1.5 py-0.5 font-medium text-textMuted">
      대기
    </span>
  );
}

