import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Position, PositionMetrics } from '../types/portfolio';
import type { Trade } from '../types/trade';
import type { TradePlanTodo } from '../types/todo';
import { formatMoney, formatPercent } from '../lib/format';
import { roundMoney } from '../lib/portfolioMath';
import { fetchKrBoardByTicker } from '../lib/krxLookup';
import { krBoardBadgeClass, krBoardDisplayLabel } from '../lib/krBoardUi';
import { tradeAppliesToLedger } from '../lib/ledger';

interface PositionDetailModalProps {
  position: Position | null;
  metric: PositionMetrics | null;
  trades: Trade[];
  todos: TradePlanTodo[];
  note: string;
  onSaveNote: (next: string) => void;
  onAddTodo: (todo: Omit<TradePlanTodo, 'id' | 'done' | 'createdAt'>) => void;
  onClose: () => void;
  /** 보유수량·평단 수정 (매매일지 체결은 유지하고 초기보유 레이어만 조정) */
  onAdjustPosition?: (quantity: number, avgPrice: number) => boolean;
  onMarkTradeFilled: (id: string) => void;
}

export function PositionDetailModal({
  position,
  metric,
  trades,
  todos,
  note,
  onSaveNote,
  onAddTodo,
  onClose,
  onAdjustPosition,
  onMarkTradeFilled,
}: PositionDetailModalProps) {
  const [editingBasis, setEditingBasis] = useState(false);
  const [editQty, setEditQty] = useState('');
  const [editAvg, setEditAvg] = useState('');
  const [todoAction, setTodoAction] = useState<'buy' | 'sell'>('buy');
  const [todoPrice, setTodoPrice] = useState('');
  const [todoQty, setTodoQty] = useState('');
  const [todoMemo, setTodoMemo] = useState('');
  const [krBoardByTicker, setKrBoardByTicker] = useState<Map<string, string>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    fetchKrBoardByTicker()
      .then((m) => {
        if (!cancelled) setKrBoardByTicker(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!position) return;
    setEditingBasis(false);
    setEditQty(String(position.quantity));
    setEditAvg(String(position.avg_price));
  }, [position?.id, position?.quantity, position?.avg_price]);

  useEffect(() => {
    if (!position) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [position, onClose]);

  const sortedTodos = useMemo(
    () =>
      [...todos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [todos],
  );

  if (!position || !metric) return null;

  const krBoard =
    position.market === 'KR' ? krBoardByTicker.get(position.ticker) : undefined;

  const journalTrades = trades.filter((t) => !t.excludeFromJournal);
  const ledgerJournalTrades = journalTrades.filter(tradeAppliesToLedger);
  const adjustmentTrades = trades.filter(
    (t) => t.excludeFromJournal && tradeAppliesToLedger(t),
  );

  const retPct =
    metric.cost_basis > 0 ? (metric.pnl / metric.cost_basis) * 100 : 0;
  const tradeSummary = ledgerJournalTrades.reduce(
    (acc, t) => {
      if (t.side === 'buy') {
        acc.buyQty += t.quantity;
        acc.buyAmount += t.quantity * t.price;
      } else {
        acc.sellQty += t.quantity;
        acc.sellAmount += t.quantity * t.price;
      }
      return acc;
    },
    { buyQty: 0, sellQty: 0, buyAmount: 0, sellAmount: 0 },
  );
  const adjustmentSummary = adjustmentTrades.reduce(
    (acc, t) => {
      const signedQty = t.side === 'buy' ? t.quantity : -t.quantity;
      const signedAmount = t.side === 'buy' ? t.quantity * t.price : -t.quantity * t.price;
      acc.qty += signedQty;
      acc.amount += signedAmount;
      return acc;
    },
    { qty: 0, amount: 0 },
  );
  const adjustmentDeltaQty = adjustmentTrades.reduce((acc, trade) => {
    const deltaQty = getTradeAdjustmentDelta(trade);
    return deltaQty === null ? acc : acc + deltaQty;
  }, 0);
  const hasStoredAdjustmentDelta = adjustmentTrades.some(
    (trade) => getTradeAdjustmentDelta(trade) !== null,
  );
  const netQty = tradeSummary.buyQty - tradeSummary.sellQty;
  const hasAdjustment = Math.abs(adjustmentSummary.qty) > 0.0001;
  const adjustmentAvgPrice = hasAdjustment
    ? formatMoney(
        roundMoney(adjustmentSummary.amount / adjustmentSummary.qty, position.currency),
        position.currency,
      )
    : null;
  const adjustmentDisplayDate = hasAdjustment
    ? formatAdjustmentDisplayDate(adjustmentTrades)
    : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-textMain">
              {position.name}{' '}
              <span className="font-normal text-textMuted">({position.ticker})</span>
            </h2>
            <p className="mt-1 text-[12px] text-textMuted">
              <span
                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${krBoardBadgeClass(
                  position.market === 'KR' ? krBoard : undefined,
                )}`}
              >
                {krBoardDisplayLabel(position.market, krBoard)}
              </span>
            </p>
            <div className="mt-2 rounded-md border border-border/80 bg-background/50 px-3 py-2">
              <p className="text-[11px] font-medium text-textMuted">업종 (섹터)</p>
              <p className="mt-0.5 text-[13px] leading-snug text-textMain">{position.sector}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-2 py-1 text-xs text-textMain hover:bg-white/5"
          >
            닫기
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Mini label="보유수량" value={`${position.quantity}`} />
          <Mini label="평단" value={formatMoney(position.avg_price, position.currency)} />
          <Mini label="현재가" value={formatMoney(position.current_price, position.currency)} />
          <Mini label="예상손익" value={formatMoney(metric.pnl, position.currency)} emph={metric.pnl >= 0 ? 'pos' : 'neg'} />
          <Mini label="예상수익률" value={formatPercent(retPct, true)} emph={retPct >= 0 ? 'pos' : 'neg'} />
        </div>

        {onAdjustPosition ? (
          <section className="mt-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-textMain">보유·평단 수정</h3>
              {!editingBasis ? (
                <button
                  type="button"
                  onClick={() => setEditingBasis(true)}
                  className="rounded border border-border px-2 py-1 text-xs font-medium text-textMain hover:bg-white/5"
                >
                  수정
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-textMuted">
              매매일지에 있는 체결은 그대로 두고, 그 차이만 「초기보유」로 맞춥니다. 일지만으로
              결정되는 수량·평단과 같게 두면 초기보유 줄이 없어집니다.
            </p>
            {editingBasis ? (
              <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  const q = Number(editQty);
                  const a = Number(editAvg);
                  if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) return;
                  if (!Number.isFinite(a) || a <= 0) return;
                  const ok = onAdjustPosition(q, a);
                  if (ok) setEditingBasis(false);
                }}
              >
                <label className="flex flex-col gap-0.5 text-[11px] text-textMuted">
                  보유수량
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm text-textMain outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] text-textMuted">
                  평단 ({position.currency})
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editAvg}
                    onChange={(e) => setEditAvg(e.target.value)}
                    className="w-36 rounded border border-border bg-background px-2 py-1.5 text-sm text-textMain outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBasis(false);
                    setEditQty(String(position.quantity));
                    setEditAvg(String(position.avg_price));
                  }}
                  className="rounded border border-border px-3 py-1.5 text-xs text-textMain hover:bg-white/5"
                >
                  취소
                </button>
              </form>
            ) : null}
          </section>
        ) : null}

        <div
          className={`mt-3 grid grid-cols-1 gap-2 ${hasAdjustment ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}
        >
          <Mini
            label={`총매수 (${tradeSummary.buyQty}주)`}
            value={formatMoney(tradeSummary.buyAmount, position.currency)}
          />
          <Mini
            label={`총매도 (${tradeSummary.sellQty}주)`}
            value={formatMoney(tradeSummary.sellAmount, position.currency)}
          />
          <Mini
            label="순매수(수량)"
            value={`${netQty}주`}
            emph={netQty >= 0 ? 'pos' : 'neg'}
          />
          {hasAdjustment ? (
            <Mini
              label="조정"
              value={
                hasStoredAdjustmentDelta
                  ? `${adjustmentDeltaQty > 0 ? '+' : ''}${adjustmentDeltaQty}주 -> 현재 ${position.quantity}주${adjustmentAvgPrice ? ` · ${adjustmentAvgPrice}` : ''}`
                  : `원본 ${Math.abs(adjustmentSummary.qty)}주 -> 현재 ${position.quantity}주${adjustmentAvgPrice ? ` · ${adjustmentAvgPrice}` : ''}`
              }
              emph={
                hasStoredAdjustmentDelta
                  ? adjustmentDeltaQty >= 0
                    ? 'pos'
                    : 'neg'
                  : adjustmentSummary.qty >= 0
                    ? 'pos'
                    : 'neg'
              }
            />
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-border p-3">
            <h3 className="text-sm font-medium text-textMain">매매현황</h3>
            <p className="mt-1 text-[11px] text-textMuted">
              위 총매수·총매도·순매수는 체결 건만 집계합니다. 보유수정으로 반영된 수량은
              「조정」으로 따로 표시되며, 아래 목록에는 미체결 주문도 함께 표시됩니다.
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-[12px]">
              {journalTrades.length === 0 && !hasAdjustment ? (
                <li className="text-textMuted">내역 없음</li>
              ) : (
                <>
                  {hasAdjustment ? (
                    <li key="adjustment-row" className="space-y-1">
                      <div className="grid grid-cols-[96px_minmax(0,1fr)_132px] items-center gap-x-2 gap-y-1">
                        <span className="text-textMuted">
                          {adjustmentDisplayDate ?? '조정일'}
                        </span>
                        <span
                          className={`whitespace-nowrap ${
                            hasStoredAdjustmentDelta
                              ? adjustmentDeltaQty >= 0
                                ? 'text-positive'
                                : 'text-negative'
                              : adjustmentSummary.qty >= 0
                                ? 'text-positive'
                                : 'text-negative'
                          }`}
                        >
                          {hasStoredAdjustmentDelta ? (
                            <>
                              조정 {adjustmentDeltaQty > 0 ? '+' : ''}
                              {adjustmentDeltaQty}주 {'->'} 현재 {position.quantity}주
                            </>
                          ) : (
                            <>
                              조정원본 {Math.abs(adjustmentSummary.qty)}주 {'->'} 현재 {position.quantity}주
                            </>
                          )}
                        </span>
                        <span className="text-right tabular-nums text-textMain">
                          {adjustmentAvgPrice ?? '-'}
                        </span>
                      </div>
                    </li>
                  ) : null}
                  {journalTrades.map((t) => {
                    const pending = t.executionStatus === 'pending';
                    return (
                      <li key={t.id} className="space-y-1">
                        <div className="grid grid-cols-[96px_minmax(0,1fr)_132px] items-center gap-x-2 gap-y-1">
                          <span className="text-textMuted">{t.date}</span>
                          <span className={t.side === 'buy' ? 'text-positive' : 'text-negative'}>
                            {t.side === 'buy' ? '매수' : '매도'} {t.quantity}주
                          </span>
                          <span className="text-right tabular-nums text-textMain">
                            {formatMoney(t.price, t.currency)}
                          </span>
                        </div>
                        {pending ? (
                          <span className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                            <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                              미체결
                            </span>
                            <button
                              type="button"
                              onClick={() => onMarkTradeFilled(t.id)}
                              className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-textMain hover:bg-white/5"
                            >
                              체결 처리
                            </button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </>
              )}
            </ul>
          </section>

          <section className="rounded-md border border-border p-3">
            <h3 className="text-sm font-medium text-textMain">To-do</h3>
            <form
              className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const p = Number(todoPrice);
                const q = Number(todoQty);
                if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) return;
                onAddTodo({
                  market: position.market,
                  ticker: position.ticker,
                  name: position.name,
                  action: todoAction,
                  targetPrice: roundMoney(p, position.currency),
                  quantity: Math.floor(q),
                  note: todoMemo.trim() || undefined,
                });
                setTodoPrice('');
                setTodoQty('');
                setTodoMemo('');
              }}
            >
              <select
                value={todoAction}
                onChange={(e) => setTodoAction(e.target.value as 'buy' | 'sell')}
                className="rounded border border-border bg-background px-2 py-1.5 text-xs text-textMain outline-none focus:border-accent"
              >
                <option value="buy">매수</option>
                <option value="sell">매도</option>
              </select>
              <input
                type="number"
                min={0}
                step="any"
                value={todoPrice}
                onChange={(e) => setTodoPrice(e.target.value)}
                placeholder={`목표가(${position.currency})`}
                className="rounded border border-border bg-background px-2 py-1.5 text-xs text-textMain outline-none focus:border-accent"
              />
              <input
                type="number"
                min={1}
                step={1}
                value={todoQty}
                onChange={(e) => setTodoQty(e.target.value)}
                placeholder="수량"
                className="rounded border border-border bg-background px-2 py-1.5 text-xs text-textMain outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="rounded bg-accent px-2 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                To-do 추가
              </button>
              <input
                value={todoMemo}
                onChange={(e) => setTodoMemo(e.target.value)}
                placeholder="메모(선택)"
                className="rounded border border-border bg-background px-2 py-1.5 text-xs text-textMain outline-none focus:border-accent md:col-span-4"
              />
            </form>
            <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-[12px]">
              {sortedTodos.length === 0 ? (
                <li className="text-textMuted">등록된 계획 없음</li>
              ) : (
                sortedTodos.map((x) => (
                  <li
                    key={x.id}
                    className="rounded border border-border/70 bg-background/50 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-textMain">
                        <span className="font-medium">{position.ticker}</span>
                        {(x.name ?? position.name) ? (
                          <span className="text-textMuted">
                            {' '}
                            · {x.name ?? position.name}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block">
                          {x.action === 'buy' ? '매수' : '매도'} {x.quantity}주
                        </span>
                      </span>
                      <div className="shrink-0 text-right">
                        <span className="block tabular-nums text-textMain">
                          {formatMoney(x.targetPrice, position.currency)}
                        </span>
                        <span className={x.done ? 'text-textMuted' : 'text-warning'}>
                          {x.done ? '완료' : '진행'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-textMuted">
                      <span className="tabular-nums">
                        {x.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    {x.note?.trim() ? (
                      <p className="mt-1 whitespace-pre-wrap text-[12px] text-textMain">
                        {x.note}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <section className="mt-4 rounded-md border border-border p-3">
          <h3 className="text-sm font-medium text-textMain">종목 메모</h3>
          <textarea
            value={note}
            onChange={(e) => onSaveNote(e.target.value)}
            placeholder="이 종목에 대한 매매 기준/리스크/체크포인트를 기록하세요."
            className="mt-2 min-h-[110px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
          />
        </section>
      </div>
    </div>
  );
}

function formatAdjustmentDisplayDate(trades: Trade[]): string | null {
  const latest = [...trades]
    .map((trade) => getTradeEditedAtMs(trade))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];
  if (!latest) return null;
  const d = new Date(latest);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTradeEditedAtMs(trade: Trade): number | null {
  const match = trade.id.match(/^tr-ob-(\d{11,13})(?:-delta--?\d+)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getTradeAdjustmentDelta(trade: Trade): number | null {
  const match = trade.id.match(/^tr-ob-\d{11,13}-delta-(-?\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function Mini({
  label,
  value,
  emph,
}: {
  label: string;
  value: string;
  emph?: 'pos' | 'neg';
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-textMuted">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          emph === 'pos'
            ? 'text-positive'
            : emph === 'neg'
              ? 'text-negative'
              : 'text-textMain'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

