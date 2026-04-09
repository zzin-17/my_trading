import { useEffect, useState, type FormEvent } from 'react';
import type { Market } from '../types/portfolio';
import { defaultCurrencyForMarket } from '../lib/market';
import { roundMoney } from '../lib/portfolioMath';
import { lookupKrStockName, searchKrStocksByName } from '../lib/krxLookup';

export interface AddHoldingPayload {
  market: Market;
  ticker: string;
  name: string;
  sector: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  date: string;
}

interface AddHoldingModalProps {
  open: boolean;
  market: Market;
  onClose: () => void;
  onAdd: (payload: AddHoldingPayload) => void;
}

export function AddHoldingModal({
  open,
  market,
  onClose,
  onAdd,
}: AddHoldingModalProps) {
  const currency = defaultCurrencyForMarket(market);
  const [date, setDate] = useState(todayIso());
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [sector, setSector] = useState('기타');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<
    { ticker: string; name: string; sector: string }[]
  >([]);
  const [nameSuggestLoading, setNameSuggestLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLookupMessage(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || market !== 'KR') return;
    const q = name.trim();
    if (!q || q.length < 1) {
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
  }, [open, market, name]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const raw = ticker.trim();
    const code = market === 'KR' ? raw : raw.toUpperCase();
    const q = Number(quantity);
    const avg = Number(avgPrice);
    const cur = Number(currentPrice || avgPrice);
    if (!code) return setError('종목코드를 입력하세요.');
    if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) {
      return setError('수량은 1 이상의 정수여야 합니다.');
    }
    if (!Number.isFinite(avg) || avg <= 0) {
      return setError('평단은 0보다 커야 합니다.');
    }
    if (!Number.isFinite(cur) || cur < 0) {
      return setError('현재가는 0 이상이어야 합니다.');
    }
    onAdd({
      market,
      ticker: code,
      name: name.trim() || code,
      sector: sector.trim() || '기타',
      quantity: q,
      avgPrice: roundMoney(avg, currency),
      currentPrice: roundMoney(cur, currency),
      date,
    });
    onClose();
    setTicker('');
    setName('');
    setSector('기타');
    setQuantity('');
    setAvgPrice('');
    setCurrentPrice('');
    setDate(todayIso());
  };

  const handleLookup = async () => {
    if (market !== 'KR') return;
    const code = ticker.trim();
    if (!/^\d{6}$/.test(code)) {
      setLookupMessage('한국 종목코드는 6자리 숫자로 입력해 주세요.');
      return;
    }
    try {
      setLookupLoading(true);
      setLookupMessage(null);
      const found = await lookupKrStockName(code);
      if (!found) {
        setLookupMessage('조회 결과가 없습니다. 종목명을 직접 입력해 주세요.');
        return;
      }
      setName(found.name);
      setSector(found.sector);
      setLookupMessage(`조회 완료: ${found.name}`);
    } catch {
      setLookupMessage('자동조회 실패. 잠시 후 다시 시도하거나 종목명을 직접 입력해 주세요.');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-textMain">보유종목 추가</h2>
        <p className="mt-1 text-[12px] text-textMuted">
          초기 보유분을 한 번에 등록합니다. 매매일지에는 올라가지 않으며, 평단·수량만 장부에 반영됩니다.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-border bg-background px-2 py-2 text-sm text-textMain outline-none focus:border-accent"
              required
            />
            <div className="flex gap-2">
              <input
                placeholder="종목코드"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onBlur={() => {
                  if (market === 'KR' && !name.trim()) void handleLookup();
                }}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
                required
              />
              {market === 'KR' && (
                <button
                  type="button"
                  onClick={() => void handleLookup()}
                  disabled={lookupLoading}
                  className="shrink-0 rounded border border-border px-3 py-2 text-xs text-textMain hover:bg-white/5 disabled:opacity-60"
                >
                  {lookupLoading ? '조회중' : '조회'}
                </button>
              )}
            </div>
          </div>
          {lookupMessage && <p className="text-[12px] text-textMuted">{lookupMessage}</p>}
          <input
            placeholder="종목명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
          />
          {market === 'KR' && (
            <div className="rounded border border-border bg-background p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-textMuted">
                <span>종목명 검색 결과</span>
                {nameSuggestLoading ? <span>조회중…</span> : null}
              </div>
              {nameSuggestions.length === 0 ? (
                <p className="text-[11px] text-textMuted">
                  {name.trim()
                    ? '일치하는 후보가 없습니다. 종목명을 직접 입력해도 됩니다.'
                    : '종목명을 입력하면 코드 후보가 표시됩니다.'}
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
          )}
          <input
            placeholder="섹터 (KRX 업종 자동 · 수정 가능)"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              min={1}
              step={1}
              placeholder="수량"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
              required
            />
            <input
              type="number"
              min={0}
              step="any"
              placeholder={`평단 (${currency})`}
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
              required
            />
            <input
              type="number"
              min={0}
              step="any"
              placeholder={`현재가 (${currency})`}
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-[12px] text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-2 text-sm text-textMain hover:bg-white/5"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

