import {
  useEffect,
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
import { lookupKrStockName } from '../lib/krxLookup';

interface AddTradeModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (trade: Trade) => void;
  /** 매도 시 보유 가능 수량 (해당 티커) */
  getAvailableQuantity: (ticker: string) => number;
}

export function AddTradeModal({
  open,
  onClose,
  onAdd,
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
  const [error, setError] = useState<string | null>(null);

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
    if (open) {
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const market: Market = marketManual || inferMarketFromTicker(ticker.trim());
  const currency = defaultCurrencyForMarket(market);

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

    if (side === 'sell') {
      const avail = getAvailableQuantity(tk);
      if (q > avail) {
        setError(`매도 수량이 보유(${avail})를 초과합니다.`);
        return;
      }
    }

    const trade: Trade = {
      id: `tr-user-${Date.now()}`,
      date,
      ticker: tk,
      name: nm,
      sector: sector.trim() || '기타',
      market,
      side,
      quantity: q,
      price: roundMoney(p, currency),
      currency,
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    onAdd(trade);
    onClose();
    setTicker('');
    setName('');
    setSector('기타');
    setSide('buy');
    setQuantity('');
    setPrice('');
    setMarketManual('');
    setNote('');
    setDate(todayIso());
  };

  const inferredLabel =
    inferMarketFromTicker(ticker.trim()) === 'KR' ? '한국(6자리 숫자)' : '미국';

  const handleTickerBlur = () => {
    const tk = ticker.trim();
    if (!/^\d{6}$/.test(tk)) return;
    const mkt = marketManual || inferMarketFromTicker(tk);
    if (mkt !== 'KR') return;
    void (async () => {
      try {
        const found = await lookupKrStockName(tk);
        if (found) {
          setName((n) => (n.trim() ? n : found.name));
          setSector(found.sector);
        }
      } catch {
        /* KRX 목록 실패 시 무시 */
      }
    })();
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
          매매 추가
        </h2>
        <p className="mt-1 text-[12px] text-textMuted">
          추론 시장: {inferredLabel}
          {marketManual ? ` · 수동: ${marketManual}` : ''} · 통화 {currency}
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
              종목코드
            </label>
            <input
              id="at-ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onBlur={handleTickerBlur}
              placeholder="예: AAPL, 005930"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
              required
            />
          </div>

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

          <div>
            <label htmlFor="at-sector" className="text-[12px] text-textMuted">
              섹터 (한국 6자리·포커스 아웃 시 KRX 업종 자동)
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
              시장 (비우면 티커 규칙)
            </label>
            <select
              id="at-market"
              value={marketManual}
              onChange={(e) =>
                setMarketManual((e.target.value || '') as Market | '')
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
            >
              <option value="">자동</option>
              <option value="KR">한국 (KRW)</option>
              <option value="US">미국 (USD)</option>
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
              추가
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
