import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { Position } from '../types/portfolio';
import { roundMoney } from '../lib/portfolioMath';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface EditPriceModalProps {
  position: Position | null;
  onClose: () => void;
  onSave: (id: string, nextPrice: number) => void;
}

export function EditPriceModal({
  position,
  onClose,
  onSave,
}: EditPriceModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusTrap(dialogRef, Boolean(position));

  useEffect(() => {
    if (position) {
      setValue(String(position.current_price));
      setError(null);
    }
  }, [position]);

  useEffect(() => {
    if (!position) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [position, onClose]);

  useEffect(() => {
    if (!position) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [position]);

  if (!position) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError('0 이상의 유효한 숫자를 입력하세요.');
      return;
    }
    setError(null);
    const rounded = roundMoney(n, position.currency);
    onSave(position.id, rounded);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      aria-hidden
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-price-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-price-title" className="text-base font-semibold text-textMain">
          현재가 편집
        </h2>
        <p className="mt-1 text-[12px] text-textMuted">
          {position.name} ({position.ticker}) · {position.currency}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="current-price" className="text-[12px] font-medium text-textMuted">
              현재가
            </label>
            <input
              ref={inputRef}
              id="current-price"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'current-price-error' : undefined}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textMain outline-none focus:border-accent"
            />
            {error && (
              <p id="current-price-error" className="mt-1 text-[12px] text-negative">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
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
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
