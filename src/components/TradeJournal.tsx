import { useEffect, useMemo, useState } from 'react';
import type { LedgerRow } from '../lib/ledger';
import { formatMoney, formatPercent } from '../lib/format';
import { roundMoney, roundPercent } from '../lib/portfolioMath';
import type { Trade } from '../types/trade';

interface TradeJournalProps {
  trades: Trade[];
  ledger: Map<string, LedgerRow>;
  quotes: Record<string, number>;
  onOpenAddTrade: () => void;
  onResetData: () => void;
}

export function TradeJournal({
  trades,
  ledger,
  quotes,
  onOpenAddTrade,
  onResetData,
}: TradeJournalProps) {
  const [tickerFilter, setTickerFilter] = useState<string>('');

  const journalTrades = useMemo(
    () => trades.filter((x) => !x.excludeFromJournal),
    [trades],
  );

  const tickerOptions = useMemo(() => {
    const s = new Set(journalTrades.map((x) => x.ticker));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [journalTrades]);

  useEffect(() => {
    if (tickerFilter && !tickerOptions.includes(tickerFilter)) {
      setTickerFilter('');
    }
  }, [tickerFilter, tickerOptions]);

  const filteredTrades = useMemo(() => {
    let list = journalTrades;
    if (tickerFilter) {
      list = list.filter((x) => x.ticker === tickerFilter);
    }
    return [...list].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      return d !== 0 ? d : b.id.localeCompare(a.id);
    });
  }, [journalTrades, tickerFilter]);

  const summaryRow = tickerFilter ? ledger.get(tickerFilter) : undefined;
  const quote =
    tickerFilter && quotes[tickerFilter] !== undefined
      ? quotes[tickerFilter]
      : undefined;

  const stats = useMemo(() => {
    if (!tickerFilter || !summaryRow) return null;
    const avg = summaryRow.avgCost;
    const cur =
      quote !== undefined && Number.isFinite(quote) ? quote : avg;
    const curRounded = roundMoney(cur, summaryRow.currency);
    const qty = summaryRow.quantity;
    const mv = qty > 0 ? roundMoney(curRounded * qty, summaryRow.currency) : 0;
    const cost = qty > 0 ? roundMoney(avg * qty, summaryRow.currency) : 0;
    const unreal =
      qty > 0 ? roundMoney((curRounded - avg) * qty, summaryRow.currency) : 0;
    const realized = roundMoney(summaryRow.realizedPnl, summaryRow.currency);
    const retPct =
      cost > 0 && qty > 0 ? roundPercent((unreal / cost) * 100) : 0;
    return {
      qty,
      avg: roundMoney(avg, summaryRow.currency),
      curRounded,
      mv,
      cost,
      unreal,
      realized,
      retPct,
    };
  }, [tickerFilter, summaryRow, quote]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-textMain">매매일지</h3>
          <p className="text-[12px] text-textMuted">
            종목을 고르면 매수·매도 내역과 장부 기준 평단·예상 손익을 볼 수 있습니다. 보유종목·CSV로
            넣은 분은 매매일지에 포함되지 않습니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center">
            <span className="text-[12px] text-textMuted sm:mr-2">종목코드</span>
            <select
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            >
              <option value="">전체 ({journalTrades.length}건)</option>
              {tickerOptions.map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="mt-1 text-[11px] text-textMuted">
        매매·시세는 이 브라우저 localStorage에 저장됩니다.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenAddTrade}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          거래 추가
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                '저장된 매매일지·시세를 지우고 샘플 데이터로 돌아갑니다. 계속할까요?',
              )
            ) {
              onResetData();
            }
          }}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-textMuted hover:bg-white/5 hover:text-textMain"
        >
          샘플로 초기화
        </button>
      </div>

      {stats && summaryRow && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="보유수량" value={String(stats.qty)} warn={stats.qty === 0} />
          <Stat
            label="평단(장부)"
            value={formatMoney(stats.avg, summaryRow.currency)}
          />
          <Stat
            label="현재가(시세)"
            value={formatMoney(stats.curRounded, summaryRow.currency)}
          />
          <Stat
            label="평가금액"
            value={formatMoney(stats.mv, summaryRow.currency)}
            muted={stats.qty === 0}
          />
          <Stat
            label="예상손익"
            value={formatMoney(stats.unreal, summaryRow.currency)}
            positive={stats.unreal > 0}
            negative={stats.unreal < 0}
            muted={stats.qty === 0}
          />
          <Stat
            label="누적실현"
            value={formatMoney(stats.realized, summaryRow.currency)}
            positive={stats.realized > 0}
            negative={stats.realized < 0}
          />
        </div>
      )}
      {stats && summaryRow && stats.qty > 0 && (
        <p className="mt-2 text-[12px] text-textMuted">
          예상 수익률(잔여 물량 기준):{' '}
          <span
            className={
              stats.retPct >= 0 ? 'text-positive' : 'text-negative'
            }
          >
            {formatPercent(stats.retPct, true)}
          </span>
        </p>
      )}
      {tickerFilter && summaryRow && summaryRow.quantity <= 0 && (
        <p className="mt-3 text-[12px] text-warning">
          잔여 보유 없음(청산). 누적실현손익만 참고하세요.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-border text-textMuted">
              <th className="py-2 pr-3 font-medium">날짜</th>
              <th className="py-2 pr-3 font-medium">종목코드</th>
              <th className="py-2 pr-3 font-medium">종목명</th>
              <th className="py-2 pr-3 font-medium">구분</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">수량</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">단가</th>
              <th className="py-2 pr-3 text-right font-medium tabular-nums">거래금액</th>
              <th className="py-2 pr-3 font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-textMuted">
                  내역이 없습니다.
                </td>
              </tr>
            ) : (
              filteredTrades.map((tr) => {
                const amt = roundMoney(tr.quantity * tr.price, tr.currency);
                const sell = tr.side === 'sell';
                return (
                  <tr
                    key={tr.id}
                    className={`border-b border-border/60 ${
                      sell ? 'bg-negative/5' : 'bg-positive/5'
                    }`}
                  >
                    <td className="py-2 pr-3 tabular-nums text-textMain">{tr.date}</td>
                    <td className="py-2 pr-3 font-medium text-textMain">{tr.ticker}</td>
                    <td className="max-w-[160px] truncate py-2 pr-3 text-textMain">{tr.name}</td>
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
                      {tr.quantity}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                      {formatMoney(tr.price, tr.currency)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-textMain">
                      {formatMoney(amt, tr.currency)}
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-2 text-textMuted">
                      {tr.note ?? '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
  negative,
  muted,
  warn,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-border bg-background px-3 py-2 ${
        muted ? 'opacity-60' : ''
      }`}
    >
      <p className="text-[11px] text-textMuted">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          warn
            ? 'text-warning'
            : positive
              ? 'text-positive'
              : negative
                ? 'text-negative'
                : 'text-textMain'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
