import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { tradeAppliesToLedger, type LedgerRow } from '../lib/ledger';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatMoney, formatPercent } from '../lib/format';
import {
  estimateNetUnrealizedPnl,
  roundMoney,
  roundPercent,
} from '../lib/portfolioMath';
import { computeRealizedSellEvents } from '../lib/realizedPnl';
import { todayIsoLocal } from '../lib/tradePendingExpiry';
import type { Trade } from '../types/trade';

interface TradeJournalProps {
  trades: Trade[];
  ledger: Map<string, LedgerRow>;
  quotes: Record<string, number>;
  onOpenAddTrade: () => void;
  onEditTrade: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => boolean;
  onMarkTradeFilled: (id: string) => void;
  krSellCommissionRate: number;
}

type MainTab = 'today' | 'history';
type HistoryView = 'month' | 'calendar' | 'list';

const WEEK_HEADERS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function formatMonthTitle(key: string): string {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  return `${y}년 ${parseInt(m, 10)}월`;
}

/** 체결 건만: 통화별 거래액(수량×단가)을 한 줄용 문자열로 */
function turnoverParts(krw: number, usd: number): string {
  if (krw <= 0 && usd <= 0) return '—';
  const bits: string[] = [];
  if (krw > 0) bits.push(formatMoney(krw, 'KRW'));
  if (usd > 0) bits.push(formatMoney(usd, 'USD'));
  return bits.join(' + ');
}

type FilledDaySummary = {
  buyKinds: number;
  sellKinds: number;
  buyKrw: number;
  buyUsd: number;
  sellKrw: number;
  sellUsd: number;
};

function computeFilledDaySummary(trades: Trade[]): FilledDaySummary {
  const list = trades.filter(tradeAppliesToLedger);
  const buyTk = new Set<string>();
  const sellTk = new Set<string>();
  let buyKrw = 0;
  let buyUsd = 0;
  let sellKrw = 0;
  let sellUsd = 0;
  for (const t of list) {
    const gross = t.quantity * t.price;
    if (t.side === 'buy') {
      buyTk.add(t.ticker);
      if (t.currency === 'KRW') buyKrw += gross;
      else buyUsd += gross;
    } else {
      sellTk.add(t.ticker);
      if (t.currency === 'KRW') sellKrw += gross;
      else sellUsd += gross;
    }
  }
  return {
    buyKinds: buyTk.size,
    sellKinds: sellTk.size,
    buyKrw,
    buyUsd,
    sellKrw,
    sellUsd,
  };
}

function normalizeJournalSearchQuery(q: string): string {
  return q.trim().toLowerCase();
}

/** 종목코드·종목명 부분 일치(대소문자 무시) */
function filterJournalTradesBySearch(trades: Trade[], rawQuery: string): Trade[] {
  const q = normalizeJournalSearchQuery(rawQuery);
  if (!q) return [];
  return trades.filter(
    (t) =>
      t.ticker.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q),
  );
}

function FilledSummaryLine({ summary }: { summary: FilledDaySummary }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <p
        className="min-w-0 whitespace-nowrap text-[12px] text-textMain"
        title="미체결은 제외한 집계입니다."
      >
        <span className="text-textMuted">체결만</span>
        {' · 매수 '}
        <span className="tabular-nums font-medium text-textMain">
          {summary.buyKinds}
        </span>
        종 <span className="text-textMuted">거래액</span>{' '}
        <span className="tabular-nums">
          {turnoverParts(summary.buyKrw, summary.buyUsd)}
        </span>
        {' · 매도 '}
        <span className="tabular-nums font-medium text-textMain">
          {summary.sellKinds}
        </span>
        종 <span className="text-textMuted">거래액</span>{' '}
        <span className="tabular-nums">
          {turnoverParts(summary.sellKrw, summary.sellUsd)}
        </span>
      </p>
    </div>
  );
}

/** 해당 월의 날짜 셀(1..lastDay), 앞뒤 null 패딩 */
function calendarCellsForMonth(year: number, monthIndex0: number): (number | null)[][] {
  const firstDow = new Date(year, monthIndex0, 1).getDay();
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  const flat: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) flat.push(null);
  for (let d = 1; d <= lastDay; d++) flat.push(d);
  while (flat.length % 7 !== 0) flat.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    rows.push(flat.slice(i, i + 7));
  }
  return rows;
}

export function TradeJournal({
  trades,
  ledger,
  quotes,
  onOpenAddTrade,
  onEditTrade,
  onDeleteTrade,
  onMarkTradeFilled,
  krSellCommissionRate,
}: TradeJournalProps) {
  const [today, setToday] = useState(todayIsoLocal);
  const [mainTab, setMainTab] = useState<MainTab>('today');
  const [historyView, setHistoryView] = useState<HistoryView>('month');
  const [journalSearchText, setJournalSearchText] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const searchModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(searchModalRef, searchModalOpen);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = todayIsoLocal().split('-').map(Number);
    return { y: t[0]!, m: t[1]! };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToday(todayIsoLocal());
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const journalTrades = useMemo(
    () => trades.filter((x) => !x.excludeFromJournal),
    [trades],
  );

  const todayTrades = useMemo(() => {
    const list = journalTrades.filter((x) => x.date === today);
    return list.sort((a, b) => b.id.localeCompare(a.id));
  }, [journalTrades, today]);

  const todayFilledSummary = useMemo(
    () => computeFilledDaySummary(todayTrades),
    [todayTrades],
  );

  const pastTrades = useMemo(() => {
    const list = journalTrades.filter((x) => x.date < today);
    return list;
  }, [journalTrades, today]);

  const futureTrades = useMemo(() => {
    const list = journalTrades.filter((x) => x.date > today);
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [journalTrades, today]);

  const pastSortedDesc = useMemo(
    () =>
      [...pastTrades].sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        return d !== 0 ? d : b.id.localeCompare(a.id);
      }),
    [pastTrades],
  );

  const monthGroups = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const tr of pastSortedDesc) {
      const k = monthKey(tr.date);
      const cur = map.get(k) ?? [];
      cur.push(tr);
      map.set(k, cur);
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
    return keys.map((k) => ({ key: k, trades: map.get(k)! }));
  }, [pastSortedDesc]);

  const tradesOnSelectedCalendarDay = useMemo(() => {
    if (!selectedDay) return [];
    return pastSortedDesc.filter((t) => t.date === selectedDay);
  }, [pastSortedDesc, selectedDay]);

  const pastListFilledSummary = useMemo(
    () => computeFilledDaySummary(pastSortedDesc),
    [pastSortedDesc],
  );

  const calendarDayFilledSummary = useMemo(
    () => computeFilledDaySummary(tradesOnSelectedCalendarDay),
    [tradesOnSelectedCalendarDay],
  );

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of pastTrades) {
      m.set(t.date, (m.get(t.date) ?? 0) + 1);
    }
    return m;
  }, [pastTrades]);

  const matchingSearchTrades = useMemo(() => {
    return filterJournalTradesBySearch(journalTrades, searchModalQuery).sort(
      (a, b) => {
        const d = b.date.localeCompare(a.date);
        return d !== 0 ? d : b.id.localeCompare(a.id);
      },
    );
  }, [journalTrades, searchModalQuery]);

  const searchModalDetailTicker = useMemo(() => {
    if (!searchModalOpen || matchingSearchTrades.length === 0) return null;
    const u = new Set(matchingSearchTrades.map((x) => x.ticker));
    return u.size === 1 ? [...u][0]! : null;
  }, [searchModalOpen, matchingSearchTrades]);

  const searchModalLedgerRow = searchModalDetailTicker
    ? ledger.get(searchModalDetailTicker)
    : undefined;
  const searchModalQuote =
    searchModalDetailTicker && quotes[searchModalDetailTicker] !== undefined
      ? quotes[searchModalDetailTicker]
      : undefined;

  const searchModalStats = useMemo(() => {
    if (!searchModalDetailTicker || !searchModalLedgerRow) return null;
    const avg = searchModalLedgerRow.avgCost;
    const cur =
      searchModalQuote !== undefined && Number.isFinite(searchModalQuote)
        ? searchModalQuote
        : avg;
    const curRounded = roundMoney(cur, searchModalLedgerRow.currency);
    const qty = searchModalLedgerRow.quantity;
    const mv = qty > 0 ? roundMoney(curRounded * qty, searchModalLedgerRow.currency) : 0;
    const cost = qty > 0 ? roundMoney(avg * qty, searchModalLedgerRow.currency) : 0;
    const unreal =
      qty > 0
        ? estimateNetUnrealizedPnl(
            searchModalLedgerRow.market,
            avg,
            curRounded,
            qty,
            searchModalLedgerRow.currency,
            krSellCommissionRate,
          )
        : 0;
    const realized = roundMoney(
      searchModalLedgerRow.realizedPnl,
      searchModalLedgerRow.currency,
    );
    const retPct =
      cost > 0 && qty > 0 ? roundPercent((unreal / cost) * 100) : 0;
    return {
      qty,
      avg: roundMoney(avg, searchModalLedgerRow.currency),
      curRounded,
      mv,
      cost,
      unreal,
      realized,
      retPct,
    };
  }, [
    searchModalDetailTicker,
    searchModalLedgerRow,
    searchModalQuote,
    krSellCommissionRate,
  ]);

  const searchModalFilledSummary = useMemo(
    () => computeFilledDaySummary(matchingSearchTrades),
    [matchingSearchTrades],
  );

  const tradeNetPnlById = useMemo(() => {
    const events = computeRealizedSellEvents(trades, krSellCommissionRate);
    return new Map(events.map((e) => [e.tradeId, e.netPnl]));
  }, [trades, krSellCommissionRate]);

  const runJournalSearch = useCallback(() => {
    const raw = journalSearchText.trim();
    if (!raw) {
      window.alert('종목코드 또는 종목명을 입력해 주세요.');
      return;
    }
    setSearchModalQuery(raw);
    setSearchModalOpen(true);
  }, [journalSearchText]);

  const calRows = useMemo(
    () => calendarCellsForMonth(calendarMonth.y, calendarMonth.m - 1),
    [calendarMonth.y, calendarMonth.m],
  );

  const monthLabelNav = `${calendarMonth.y}년 ${calendarMonth.m}월`;

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      let m = prev.m + delta;
      let y = prev.y;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      return { y, m };
    });
    setSelectedDay(null);
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5 md:rounded-none md:border-x-0 md:border-y md:bg-transparent md:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-sm font-semibold text-textMain tracking-tight">
            매매일지
          </h3>
          <JournalHelpTooltip />
        </div>
        <form
          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
          onSubmit={(e) => {
            e.preventDefault();
            runJournalSearch();
          }}
        >
          <label htmlFor="journal-search" className="sr-only">
            매매일지 종목 검색
          </label>
          <input
            id="journal-search"
            type="search"
            enterKeyHint="search"
            placeholder="코드·종목명 검색…"
            value={journalSearchText}
            onChange={(e) => setJournalSearchText(e.target.value)}
            className="min-w-0 w-full flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent sm:min-w-[12rem] sm:max-w-md"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5"
          >
            검색
          </button>
        </form>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div
          className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-0.5"
          role="tablist"
          aria-label="매매일지 구분"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'today'}
            onClick={() => setMainTab('today')}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition ${
              mainTab === 'today'
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            오늘 ({todayTrades.length}건)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'history'}
            onClick={() => setMainTab('history')}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition ${
              mainTab === 'history'
                ? 'bg-accent text-white'
                : 'text-textMuted hover:bg-white/5 hover:text-textMain'
            }`}
          >
            과거 ({pastTrades.length}건)
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenAddTrade}
          className="shrink-0 self-end rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 sm:self-center"
        >
          거래 추가
        </button>
      </div>

      {mainTab === 'today' ? (
        <>
          <p className="mt-2 text-[11px] text-textMuted">
            기준일 <span className="tabular-nums text-textMain">{today}</span>
          </p>
          <FilledSummaryLine summary={todayFilledSummary} />
          <JournalTradesTable
            trades={todayTrades}
            tradeNetPnlById={tradeNetPnlById}
            onEditTrade={onEditTrade}
            onDeleteTrade={onDeleteTrade}
            onMarkTradeFilled={onMarkTradeFilled}
            emptyLabel="오늘 등록된 매매가 없습니다."
          />
        </>
      ) : (
        <>
          <div
            className="mt-3 flex flex-wrap gap-1 rounded-md border border-border/80 bg-background/50 p-0.5"
            role="tablist"
            aria-label="과거 매매 보기 방식"
          >
            {(
              [
                ['month', '월별'],
                ['calendar', '캘린더'],
                ['list', '목록'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={historyView === id}
                onClick={() => {
                  setHistoryView(id);
                  if (id !== 'calendar') setSelectedDay(null);
                }}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                  historyView === id
                    ? 'bg-white/10 text-textMain'
                    : 'text-textMuted hover:text-textMain'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {pastTrades.length === 0 && futureTrades.length === 0 ? (
            <p className="mt-4 py-8 text-center text-[13px] text-textMuted">
              과거·예정 일자 매매가 없습니다.
            </p>
          ) : (
            <>
              {historyView === 'list' && (
                <>
                  {pastSortedDesc.length > 0 ? (
                    <div className="mt-4">
                      <p className="text-[11px] text-textMuted">
                        과거 전체 · 체결만 집계
                      </p>
                      <FilledSummaryLine summary={pastListFilledSummary} />
                    </div>
                  ) : null}
                  <JournalTradesTable
                    trades={pastSortedDesc}
                    tradeNetPnlById={tradeNetPnlById}
                    onEditTrade={onEditTrade}
                    onDeleteTrade={onDeleteTrade}
                    onMarkTradeFilled={onMarkTradeFilled}
                    emptyLabel="표시할 과거 매매가 없습니다."
                  />
                </>
              )}

              {historyView === 'month' && (
                <div className="mt-4 space-y-6">
                  {monthGroups.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-textMuted">
                      표시할 과거 매매가 없습니다.
                    </p>
                  ) : (
                    monthGroups.map(({ key, trades: group }) => (
                      <div key={key}>
                        <h4 className="mb-2 text-[13px] font-semibold text-textMain">
                          {formatMonthTitle(key)}{' '}
                          <span className="font-normal text-textMuted">
                            ({group.length}건)
                          </span>
                        </h4>
                        <FilledSummaryLine
                          summary={computeFilledDaySummary(group)}
                        />
                        <JournalTradesTable
                          trades={group}
                          tradeNetPnlById={tradeNetPnlById}
                          onEditTrade={onEditTrade}
                          onDeleteTrade={onDeleteTrade}
                          onMarkTradeFilled={onMarkTradeFilled}
                          emptyLabel=""
                        />
                      </div>
                    ))
                  )}
                </div>
              )}

              {historyView === 'calendar' && (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => shiftCalendarMonth(-1)}
                      className="rounded border border-border px-2 py-1 text-[12px] text-textMain hover:bg-white/5"
                      aria-label="이전 달"
                    >
                      ←
                    </button>
                    <span className="text-[13px] font-medium text-textMain">
                      {monthLabelNav}
                    </span>
                    <button
                      type="button"
                      onClick={() => shiftCalendarMonth(1)}
                      className="rounded border border-border px-2 py-1 text-[12px] text-textMain hover:bg-white/5"
                      aria-label="다음 달"
                    >
                      →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[280px] border-collapse text-center text-[11px]">
                      <thead>
                        <tr className="text-textMuted">
                          {WEEK_HEADERS_KO.map((h) => (
                            <th key={h} className="py-1 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {calRows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => {
                              if (cell === null) {
                                return (
                                  <td
                                    key={ci}
                                    className="border border-border/40 p-0.5"
                                  />
                                );
                              }
                              const iso = `${calendarMonth.y}-${String(calendarMonth.m).padStart(2, '0')}-${String(cell).padStart(2, '0')}`;
                              const n = countByDate.get(iso) ?? 0;
                              const isPastDay = iso < today;
                              const active = selectedDay === iso;
                              return (
                                <td
                                  key={ci}
                                  className="border border-border/40 p-0.5 align-top"
                                >
                                  <button
                                    type="button"
                                    disabled={!isPastDay || n === 0}
                                    onClick={() =>
                                      setSelectedDay((d) =>
                                        d === iso ? null : iso,
                                      )
                                    }
                                    className={`flex min-h-[3rem] w-full flex-col items-center justify-start rounded px-0.5 py-1 ${
                                      !isPastDay || n === 0
                                        ? 'cursor-default text-textMuted/50'
                                        : 'text-textMain hover:bg-white/5'
                                    } ${active ? 'bg-accent/20 ring-1 ring-accent' : ''}`}
                                  >
                                    <span className="tabular-nums">{cell}</span>
                                    {n > 0 ? (
                                      <span className="mt-0.5 rounded bg-border/60 px-1 text-[10px] tabular-nums text-textMuted">
                                        {n}건
                                      </span>
                                    ) : null}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-textMuted">
                    과거 일자만 선택할 수 있습니다. 캘린더 건수는 일지 전체 기준입니다.
                  </p>
                  {selectedDay ? (
                    <div>
                      <h4 className="mb-2 text-[12px] font-medium text-textMain">
                        {selectedDay} ({tradesOnSelectedCalendarDay.length}건)
                      </h4>
                      {tradesOnSelectedCalendarDay.length > 0 ? (
                        <FilledSummaryLine summary={calendarDayFilledSummary} />
                      ) : null}
                      <JournalTradesTable
                        trades={tradesOnSelectedCalendarDay}
                        tradeNetPnlById={tradeNetPnlById}
                        onEditTrade={onEditTrade}
                        onDeleteTrade={onDeleteTrade}
                        onMarkTradeFilled={onMarkTradeFilled}
                        emptyLabel="이 날짜에 표시할 매매가 없습니다."
                      />
                    </div>
                  ) : (
                    <p className="text-[12px] text-textMuted">
                      날짜를 눌러 그날의 매매만 볼 수 있습니다.
                    </p>
                  )}
                </div>
              )}

              {futureTrades.length > 0 ? (
                <div className="mt-8 border-t border-border/60 pt-4">
                  <h4 className="text-[12px] font-semibold text-textMain">
                    오늘 이후 일자(예정)
                  </h4>
                  <p className="mt-1 text-[11px] text-textMuted">
                    일지에 미래 날짜로 적어 둔 건입니다.
                  </p>
                  <div className="mt-3">
                    <JournalTradesTable
                      trades={futureTrades}
                      tradeNetPnlById={tradeNetPnlById}
                      onEditTrade={onEditTrade}
                      onDeleteTrade={onDeleteTrade}
                      onMarkTradeFilled={onMarkTradeFilled}
                      emptyLabel=""
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      {searchModalOpen ? (
        <JournalSearchResultsModal
          dialogRef={searchModalRef}
          query={searchModalQuery}
          trades={matchingSearchTrades}
          filledSummary={searchModalFilledSummary}
          stats={searchModalStats}
          summaryRow={searchModalLedgerRow}
          tradeNetPnlById={tradeNetPnlById}
          onClose={() => {
            setSearchModalOpen(false);
            setSearchModalQuery('');
          }}
          onEditTrade={(t) => {
            onEditTrade(t);
            setSearchModalOpen(false);
            setSearchModalQuery('');
          }}
          onDeleteTrade={(t) => {
            const deleted = onDeleteTrade(t);
            if (!deleted) return false;
            setSearchModalOpen(false);
            setSearchModalQuery('');
            return true;
          }}
          onMarkTradeFilled={onMarkTradeFilled}
        />
      ) : null}
    </div>
  );
}

type SearchModalStatsRow = {
  qty: number;
  avg: number;
  curRounded: number;
  mv: number;
  cost: number;
  unreal: number;
  realized: number;
  retPct: number;
};

function JournalSearchResultsModal({
  dialogRef,
  query,
  trades,
  filledSummary,
  stats,
  summaryRow,
  tradeNetPnlById,
  onClose,
  onEditTrade,
  onDeleteTrade,
  onMarkTradeFilled,
}: {
  dialogRef: RefObject<HTMLDivElement | null>;
  query: string;
  trades: Trade[];
  filledSummary: FilledDaySummary;
  stats: SearchModalStatsRow | null;
  summaryRow: LedgerRow | undefined;
  tradeNetPnlById: Map<string, number>;
  onClose: () => void;
  onEditTrade: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => boolean;
  onMarkTradeFilled: (id: string) => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-search-modal-title"
        className="max-h-[min(90vh,40rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2
              id="journal-search-modal-title"
              className="text-base font-semibold text-textMain"
            >
              매매 검색 결과
            </h2>
            <p className="mt-1 text-[12px] text-textMuted">
              검색어{' '}
              <span className="font-medium text-textMain">「{query}」</span> ·{' '}
              <span className="tabular-nums">{trades.length}</span>건
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5"
          >
            닫기
          </button>
        </div>

        {trades.length > 0 ? (
          <FilledSummaryLine summary={filledSummary} />
        ) : null}

        {stats && summaryRow ? (
          <>
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
            {stats.qty > 0 ? (
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
            ) : null}
            {summaryRow.quantity <= 0 ? (
              <p className="mt-2 text-[12px] text-warning">
                잔여 보유 없음(청산). 누적실현손익만 참고하세요.
              </p>
            ) : null}
          </>
        ) : trades.length > 0 ? (
          <p className="mt-3 text-[12px] text-textMuted">
            여러 종목이 검색되었습니다. 장부 요약은 검색 결과가 한 종목일 때만
            표시됩니다.
          </p>
        ) : null}

        <JournalTradesTable
          trades={trades}
          tradeNetPnlById={tradeNetPnlById}
          onEditTrade={onEditTrade}
          onDeleteTrade={onDeleteTrade}
          onMarkTradeFilled={onMarkTradeFilled}
          emptyLabel="일치하는 매매가 없습니다."
        />
      </div>
    </div>
  );
}

function JournalTradesTable({
  trades,
  tradeNetPnlById,
  onEditTrade,
  onDeleteTrade,
  onMarkTradeFilled,
  emptyLabel,
}: {
  trades: Trade[];
  tradeNetPnlById: Map<string, number>;
  onEditTrade: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => boolean;
  onMarkTradeFilled: (id: string) => void;
  emptyLabel: string;
}) {
  const mobileGridTemplate =
    '8.25rem 3.25rem 3.75rem 3.5rem 5.25rem 5.25rem 5.25rem 4.75rem';

  return (
      <div className="mt-3">
      <div className="md:hidden">
        {trades.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-8 text-center text-textMuted">
            {emptyLabel}
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-auto rounded-lg border border-border/70 bg-background/10">
            <div style={{ minWidth: '39.25rem' }}>
              <div
                className="sticky top-0 z-10 grid border-b border-border/60 bg-surface/95 text-[10px] font-medium text-textMuted shadow-sm backdrop-blur"
                style={{ gridTemplateColumns: mobileGridTemplate }}
              >
                <div className="sticky left-0 z-20 border-r border-border/60 bg-surface px-2 py-2">
                  종목
                </div>
                <div className="border-l border-border/50 px-1.5 py-2 text-center">구분</div>
                <div className="border-l border-border/50 px-1.5 py-2 text-center">체결</div>
                <div className="border-l border-border/50 px-1.5 py-2 text-right">수량</div>
                <div className="border-l border-border/50 px-1.5 py-2 text-right">단가</div>
                <div className="border-l border-border/50 px-1.5 py-2 text-right">거래금액</div>
                <div className="border-l border-border/50 px-1.5 py-2 text-right">매매손익</div>
                <div className="border-l border-border/50 px-1.5 py-2 text-center">동작</div>
              </div>

              {trades.map((tr) => {
                const amt = roundMoney(tr.quantity * tr.price, tr.currency);
                const sell = tr.side === 'sell';
                const pending = !tradeAppliesToLedger(tr);
                const tradeNetPnl =
                  !pending && sell ? tradeNetPnlById.get(tr.id) ?? null : null;
                return (
                  <div
                    key={tr.id}
                    className={`grid border-t border-border/40 text-[11px] ${
                      pending ? 'opacity-90' : ''
                    } ${sell ? 'bg-negative/5' : 'bg-positive/5'}`}
                    style={{ gridTemplateColumns: mobileGridTemplate }}
                  >
                    <div className="sticky left-0 z-[11] border-r border-border/60 bg-surface px-2 py-2 shadow-[8px_0_12px_-10px_rgba(0,0,0,0.45)]">
                      <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-textMain">
                        {tr.name}
                      </p>
                      <p className="mt-0.5 text-[10px] tabular-nums text-textMuted">
                        {tr.ticker} · {tr.date}
                      </p>
                    </div>
                    <div
                      className={`border-l border-border/50 px-1.5 py-2 text-center font-semibold ${
                        sell ? 'text-negative' : 'text-positive'
                      }`}
                    >
                      {sell ? '매도' : '매수'}
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-center text-textMuted">
                      {pending ? '미체결' : '체결'}
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right tabular-nums text-textMain">
                      {tr.quantity}
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right tabular-nums text-textMain">
                      {formatMoney(tr.price, tr.currency)}
                    </div>
                    <div className="border-l border-border/50 px-1.5 py-2 text-right tabular-nums text-textMain">
                      {formatMoney(amt, tr.currency)}
                    </div>
                    <div
                      className={`border-l border-border/50 px-1.5 py-2 text-right tabular-nums ${
                        tradeNetPnl === null
                          ? 'text-textMuted'
                          : tradeNetPnl > 0
                            ? 'text-red-400'
                            : tradeNetPnl < 0
                              ? 'text-blue-400'
                              : 'text-textMain'
                      }`}
                    >
                      {tradeNetPnl === null ? '—' : formatMoney(tradeNetPnl, tr.currency)}
                    </div>
                    <div className="border-l border-border/50 px-1 py-1.5">
                      <div className="flex flex-wrap justify-center gap-1">
                        {pending ? (
                          <button
                            type="button"
                            onClick={() => onMarkTradeFilled(tr.id)}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-textMain hover:bg-white/5"
                          >
                            체결
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onEditTrade(tr)}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-textMain hover:bg-white/5"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTrade(tr)}
                          className="rounded border border-negative/40 px-1.5 py-0.5 text-[10px] font-medium text-negative hover:bg-negative/10"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[960px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-border text-textMuted">
            <th className="py-2 pr-3 font-medium">날짜</th>
            <th className="py-2 pr-3 font-medium">종목코드</th>
            <th className="py-2 pr-3 font-medium">종목명</th>
            <th className="py-2 pr-3 font-medium">구분</th>
            <th className="py-2 pr-3 font-medium">체결</th>
            <th className="py-2 pr-3 text-right font-medium tabular-nums">수량</th>
            <th className="py-2 pr-3 text-right font-medium tabular-nums">단가</th>
            <th className="py-2 pr-3 text-right font-medium tabular-nums">거래금액</th>
            <th className="py-2 pr-3 text-right font-medium tabular-nums">매매손익</th>
            <th className="py-2 pr-2 text-right font-medium">동작</th>
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 ? (
            <tr>
              <td colSpan={10} className="py-8 text-center text-textMuted">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            trades.map((tr) => {
              const amt = roundMoney(tr.quantity * tr.price, tr.currency);
              const sell = tr.side === 'sell';
              const pending = !tradeAppliesToLedger(tr);
              const tradeNetPnl =
                !pending && sell ? tradeNetPnlById.get(tr.id) ?? null : null;
              return (
                <tr
                  key={tr.id}
                  className={`border-b border-border/60 ${
                    pending ? 'opacity-90' : ''
                  } ${sell ? 'bg-negative/5' : 'bg-positive/5'}`}
                >
                  <td className="py-2 pr-3 tabular-nums text-textMain">{tr.date}</td>
                  <td className="py-2 pr-3 font-medium text-textMain">{tr.ticker}</td>
                  <td className="max-w-[160px] truncate py-2 pr-3 text-textMain">
                    {tr.name}
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
                  <td className="py-2 pr-3">
                    {pending ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                          미체결
                        </span>
                        <button
                          type="button"
                          onClick={() => onMarkTradeFilled(tr.id)}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-textMain hover:bg-white/5"
                        >
                          체결 처리
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-textMuted">체결</span>
                    )}
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
                  <td
                    className={`py-2 pr-2 text-right tabular-nums ${
                      tradeNetPnl === null
                        ? 'text-textMuted'
                        : tradeNetPnl > 0
                          ? 'text-red-400'
                          : tradeNetPnl < 0
                            ? 'text-blue-400'
                            : 'text-textMain'
                    }`}
                  >
                    {tradeNetPnl === null ? '—' : formatMoney(tradeNetPnl, tr.currency)}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEditTrade(tr)}
                        className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-textMain hover:bg-white/5"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTrade(tr)}
                        className="rounded border border-negative/40 px-2 py-0.5 text-[11px] font-medium text-negative hover:bg-negative/10"
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
    </div>
  );
}

function JournalHelpTooltip() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        id="journal-help-trigger"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-[12px] font-bold leading-none text-textMuted transition-colors hover:border-accent hover:text-textMain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-expanded={open}
        aria-controls="journal-help-panel"
        aria-label={
          open ? '매매일지 안내 닫기' : '매매일지 안내 열기'
        }
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <div
          id="journal-help-panel"
          role="region"
          aria-label="매매일지 안내"
          className="absolute left-0 top-full z-[80] mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-lg border border-border bg-surface px-3 py-3 shadow-lg"
        >
          <div className="max-h-[min(70vh,24rem)] space-y-2 overflow-y-auto text-[12px] leading-relaxed text-textMain">
            <p>
              <span className="font-semibold text-textMain">오늘</span> 탭은 오늘
              날짜로 적힌 매매만,{' '}
              <span className="font-semibold text-textMain">과거</span> 탭에서는 그
              이전 일자를 월별·캘린더·목록으로 볼 수 있습니다.
            </p>
            <p>
              상단 검색으로 코드·종목명에 맞는 매매만 모달에서 모아 볼 수 있습니다.
              오늘·과거 탭의 목록은 필터 없이 전체 일지 기준입니다.
            </p>
            <p>
              미체결 주문은 일지에만 표시되며 「체결」 후 장부·보유에 반영됩니다.
              일지에 적은 날(로컬)이 지나도 미체결이면 자동 삭제됩니다.
            </p>
            <p>보유종목·CSV로 넣은 분은 매매일지에 포함되지 않습니다.</p>
            <p>오등록은 각 행의 「수정」으로 고치거나 「삭제」로 제거할 수 있습니다.</p>
            <p className="text-[11px] leading-normal text-textMuted">
              매매·시세는 이 브라우저 localStorage에 저장됩니다. KRX 섹터 동기화·
              보유 초기화·샘플 복구는 상단 헤더의 설정에서 할 수 있습니다.
            </p>
          </div>
        </div>
      ) : null}
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
