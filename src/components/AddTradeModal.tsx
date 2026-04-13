import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { Market } from '../types/portfolio';
import type { Trade, TradeSide } from '../types/trade';
import {
  defaultCurrencyForMarket,
  inferMarketFromTicker,
} from '../lib/market';
import { roundMoney } from '../lib/portfolioMath';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { lookupKrStockName, searchKrStocksByName } from '../lib/krxLookup';

interface AddTradeModalProps {
  open: boolean;
  /** 한국장 탭에서 열었을 때: 티커·종목명이 영문이어도 항상 KR/KRW로 저장·조회 */
  contextMarket?: Market;
  /** null이면 신규, 값이 있으면 해당 매매 수정 */
  initialTrade?: Trade | null;
  onClose: () => void;
  onAdd: (trade: Trade) => void;
  onUpdate?: (trade: Trade) => void;
  /** 매도 시 보유 가능 수량 (해당 티커). 수정 시 두 번째 인자로 편집 중인 거래 id 제외 */
  getAvailableQuantity: (ticker: string, excludeTradeId?: string) => number;
}

export function AddTradeModal({
  open,
  contextMarket,
  initialTrade = null,
  onClose,
  onAdd,
  onUpdate,
  getAvailableQuantity,
}: AddTradeModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [date, setDate] = useState(() => todayIso());
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [sector, setSector] = useState('기타');
  const [side, setSide] = useState<TradeSide>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [marketManual, setMarketManual] = useState<Market | ''>('');
  const [note, setNote] = useState('');
  const [orderPending, setOrderPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<
    { ticker: string; name: string; sector: string }[]
  >([]);
  const [nameSuggestLoading, setNameSuggestLoading] = useState(false);

  const krMarketMode = contextMarket === 'KR';

  /** KRX 자동완성·6자리 onBlur 등 ‘한국장 전용’ UI */
  const krLookupActive = useMemo(() => {
    if (krMarketMode) return true;
    if (marketManual === 'US') return false;
    if (marketManual === 'KR') return true;
    const t = ticker.trim();
    const tDigits = t.replace(/\s/g, '');
    if (/^\d{6}$/.test(tDigits)) return true;
    if (/[가-힣]/.test(t)) return true;
    if (/[가-힣]/.test(name.trim())) return true;
    return false;
  }, [krMarketMode, marketManual, ticker, name]);

  /** 시장을 ‘미국’으로 고정하지 않았으면 조회 버튼 표시 (영문 티커만 있어도 KRX 이름 검색 시도 가능) */
  const showKrLookupButton = krMarketMode || marketManual !== 'US';

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLookupMessage(null);
    setNameSuggestions([]);
    if (initialTrade) {
      setDate(initialTrade.date);
      setTicker(initialTrade.ticker);
      setName(initialTrade.name);
      setSector(initialTrade.sector || '기타');
      setSide(initialTrade.side);
      setQuantity(String(initialTrade.quantity));
      setPrice(String(initialTrade.price));
      setMarketManual(contextMarket === 'KR' ? 'KR' : initialTrade.market);
      setNote(initialTrade.note ?? '');
      setOrderPending(initialTrade.executionStatus === 'pending');
    } else {
      setDate(todayIso());
      setTicker('');
      setName('');
      setSector('기타');
      setSide('buy');
      setQuantity('');
      setPrice('');
      setMarketManual(contextMarket === 'KR' ? 'KR' : '');
      setNote('');
      setOrderPending(false);
    }
  }, [open, initialTrade, contextMarket]);

  useEffect(() => {
    if (!open || !krLookupActive) {
      setNameSuggestions([]);
      return;
    }
    const q = name.trim();
    if (!q) {
      setNameSuggestions([]);
      return;
    }
    let cancelled = false;
    setNameSuggestLoading(true);
    searchKrStocksByName(q, 8)
      .then((items) => {
        if (cancelled) return;
        setNameSuggestions(items);
      })
      .catch(() => {
        if (cancelled) return;
        setNameSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setNameSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, krLookupActive, name]);

  const market: Market = krMarketMode
    ? 'KR'
    : marketManual || inferMarketFromTicker(ticker.trim());
  const currency = defaultCurrencyForMarket(market);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const rawTk = ticker.trim();
    const tk = /^\d{6}$/.test(rawTk) ? rawTk : rawTk.toUpperCase();
    if (!tk) {
      setError('종목코드를 입력하세요.');
      return;
    }
    const nm = name.trim() || tk;
    const q = Number(quantity);
    const p = Number(price);
    if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) {
      setError('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setError('단가는 0 이상이어야 합니다.');
      return;
    }

    if (side === 'sell' && !orderPending) {
      const avail = getAvailableQuantity(
        tk,
        initialTrade ? initialTrade.id : undefined,
      );
      if (q > avail) {
        setError(`매도 수량이 보유(${avail})를 초과합니다.`);
        return;
      }
    }

    const priceRounded = roundMoney(p, currency);
    if (initialTrade) {
      if (!onUpdate) {
        setError('수정 저장 경로가 없습니다.');
        return;
      }
      const next: Trade = {
        id: initialTrade.id,
        date,
        ticker: tk,
        name: nm,
        sector: sector.trim() || '기타',
        market,
        side,
        quantity: q,
        price: priceRounded,
        currency,
        ...(initialTrade.excludeFromJournal
          ? { excludeFromJournal: true as const }
          : {}),
        ...(orderPending ? { executionStatus: 'pending' as const } : {}),
      };
      if (note.trim()) next.note = note.trim();
      onUpdate(next);
    } else {
      const trade: Trade = {
        id: `tr-user-${Date.now()}`,
        date,
        ticker: tk,
        name: nm,
        sector: sector.trim() || '기타',
        market,
        side,
        quantity: q,
        price: priceRounded,
        currency,
        ...(orderPending ? { executionStatus: 'pending' as const } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      onAdd(trade);
    }
    onClose();
  };

  const inferredLabel = krMarketMode
    ? '한국장 탭(고정)'
    : inferMarketFromTicker(ticker.trim()) === 'KR'
      ? '한국(6자리 숫자)'
      : '미국';

  /** @param primaryOverride 첫 번째 입력칸 값 (onBlur 시 최신 DOM 값 반영용) */
  const handleLookup = async (primaryOverride?: string) => {
    if (!showKrLookupButton) return;
    const fromTicker = (primaryOverride ?? ticker).trim();
    const fromName = name.trim();
    const codeFromPrimary = fromTicker.replace(/\s/g, '');
    const codeFromName = fromName.replace(/\s/g, '');
    const sixDigit =
      /^\d{6}$/.test(codeFromPrimary) ? codeFromPrimary
      : /^\d{6}$/.test(codeFromName) ? codeFromName
      : '';

    if (sixDigit) {
      try {
        setLookupLoading(true);
        setLookupMessage(null);
        const found = await lookupKrStockName(sixDigit);
        if (!found) {
          setLookupMessage('조회 결과가 없습니다. 종목명 검색을 시도해 보세요.');
          return;
        }
        setTicker(found.ticker);
        setName(found.name);
        setSector(found.sector);
        setLookupMessage(`조회 완료: ${found.name}`);
      } catch {
        setLookupMessage(
          '자동조회 실패. 잠시 후 다시 시도하거나 종목명을 직접 입력해 주세요.',
        );
      } finally {
        setLookupLoading(false);
      }
      return;
    }

    const q = fromTicker || fromName;
    if (!q) {
      setLookupMessage(
        '종목코드(6자리) 또는 종목명을 입력한 뒤 조회해 주세요.',
      );
      return;
    }

    try {
      setLookupLoading(true);
      setLookupMessage(null);
      const items = await searchKrStocksByName(q, 8);
      setNameSuggestions(items);
      if (items.length === 0) {
        setLookupMessage('조회 결과가 없습니다. 검색어를 바꿔 보세요.');
      } else if (items.length === 1) {
        const item = items[0];
        setName(item.name);
        setTicker(item.ticker);
        setSector(item.sector);
        setLookupMessage(`조회 완료: ${item.name} (${item.ticker})`);
      } else {
        setLookupMessage(`${items.length}건의 후보입니다. 목록에서 선택해 주세요.`);
      }
    } catch {
      setLookupMessage('검색 실패. 잠시 후 다시 시도해 주세요.');
      setNameSuggestions([]);
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      aria-hidden
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-trade-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="add-trade-title" className="text-base font-semibold text-textMain">
          {initialTrade ? '매매 수정' : '매매 추가'}
        </h2>
        <p className="mt-1 text-[12px] text-textMuted">
          추론 시장: {inferredLabel}
          {!krMarketMode && marketManual ? ` · 수동: ${marketManual}` : ''} · 통화{' '}
          {currency}
          {initialTrade ? ' · 등록 후에도 내용을 고칠 수 있습니다.' : ''}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="at-date" className="text-[12px] text-textMuted">
                날짜
              </label>
              <input
                id="at-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label htmlFor="at-side" className="text-[12px] text-textMuted">
                구분
              </label>
              <select
                id="at-side"
                value={side}
                onChange={(e) => setSide(e.target.value as TradeSide)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
              >
                <option value="buy">매수</option>
                <option value="sell">매도</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="at-ticker" className="text-[12px] text-textMuted">
              종목코드 또는 종목명
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="at-ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onBlur={(e) => {
                  if (!krLookupActive) return;
                  const t = e.target.value.trim().replace(/\s/g, '');
                  if (/^\d{6}$/.test(t) && !name.trim()) void handleLookup(e.target.value);
                }}
                placeholder="예: AAPL, 005930, 삼성"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                required
              />
              {showKrLookupButton ? (
                <button
                  type="button"
                  onClick={() => void handleLookup()}
                  disabled={lookupLoading}
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-xs text-textMain hover:bg-white/5 disabled:opacity-60"
                >
                  {lookupLoading ? '조회중' : '조회'}
                </button>
              ) : null}
            </div>
          </div>

          {lookupMessage ? (
            <p className="text-[12px] text-textMuted">{lookupMessage}</p>
          ) : null}

          <div>
            <label htmlFor="at-name" className="text-[12px] text-textMuted">
              종목명 (비우면 종목코드와 동일)
            </label>
            <input
              id="at-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            />
          </div>

          {krLookupActive ? (
            <div className="rounded-md border border-border bg-background p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-textMuted">
                <span>종목명 검색 결과</span>
                {nameSuggestLoading ? <span>조회중…</span> : null}
              </div>
              {nameSuggestions.length === 0 ? (
                <p className="text-[11px] text-textMuted">
                  {name.trim()
                    ? '일치하는 후보가 없습니다. 종목명을 직접 입력해도 됩니다.'
                    : '종목명을 입력하거나, 위 칸에 종목명·코드를 넣고 「조회」하면 후보가 표시됩니다.'}
                </p>
              ) : (
                <ul className="max-h-36 space-y-1 overflow-auto">
                  {nameSuggestions.map((item) => (
                    <li key={`${item.ticker}-${item.name}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setName(item.name);
                          setTicker(item.ticker);
                          setSector(item.sector);
                          setLookupMessage(`선택됨: ${item.name} (${item.ticker})`);
                        }}
                        className="flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left text-xs text-textMain hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0 truncate">{item.name}</span>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 sm:items-end">
                          <span className="tabular-nums text-textMuted">
                            {item.ticker}
                          </span>
                          <span className="max-w-[200px] truncate text-[10px] text-textMuted/90">
                            {item.sector}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div>
            <label htmlFor="at-sector" className="text-[12px] text-textMuted">
              섹터 (한국: 조회·검색 시 KRX 업종 자동)
            </label>
            <input
              id="at-sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="at-market" className="text-[12px] text-textMuted">
              {krMarketMode ? '시장 (한국장 탭)' : '시장 (비우면 티커 규칙)'}
            </label>
            <select
              id="at-market"
              value={krMarketMode ? 'KR' : marketManual}
              onChange={(e) =>
                setMarketManual((e.target.value || '') as Market | '')
              }
              disabled={krMarketMode}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70"
            >
              {krMarketMode ? (
                <option value="KR">한국 (KRW) — 탭 기준 고정</option>
              ) : (
                <>
                  <option value="">자동</option>
                  <option value="KR">한국 (KRW)</option>
                  <option value="US">미국 (USD)</option>
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="at-qty" className="text-[12px] text-textMuted">
                수량
              </label>
              <input
                id="at-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label htmlFor="at-price" className="text-[12px] text-textMuted">
                단가
              </label>
              <input
                id="at-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="at-note" className="text-[12px] text-textMuted">
              비고 (선택)
            </label>
            <input
              id="at-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-[12px] text-textMain">
            <input
              type="checkbox"
              checked={orderPending}
              onChange={(e) => setOrderPending(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <span>
              미체결 주문으로 기록 (장부·보유에는 반영되지 않음. 체결되면 매매일지에서 「체결」로
              바꿉니다.)
            </span>
          </label>

          {error && (
            <p className="text-[12px] text-negative" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-textMain hover:bg-white/5"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {initialTrade ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
