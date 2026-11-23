import { useEffect, useRef, useState } from 'react';
import type { Market } from '../types/portfolio';
import { alertItemTitle, type StoredAlertEvent } from '../lib/priceAlerts';

export interface BellAlert {
  key: string;
  source: 'watch' | 'todo';
  sourceId: string;
  ticker: string;
  market: Market;
  title: string;
  detail: string;
  status: 'reached' | 'near';
}

interface AlertBellProps {
  reached: BellAlert[];
  recent: StoredAlertEvent[];
  onOpenItem: (item: BellAlert) => void;
  onMarkRead: () => void;
}

export function AlertBell({ reached, recent, onOpenItem, onMarkRead }: AlertBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reachedCount = reached.filter((item) => item.status === 'reached').length;
  const unread = recent.filter((item) => !item.read).length;
  const badge = Math.max(reachedCount, unread);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={badge > 0 ? `알림 ${badge}건` : '알림'}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          onMarkRead();
        }}
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border text-textMain hover:bg-white/5 md:min-h-0 md:min-w-0 md:px-2.5 md:py-2"
      >
        <BellIcon />
        {badge > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-negative px-1 text-[10px] font-semibold leading-4 text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="알림 목록"
          className="absolute right-0 z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <h2 className="text-[13px] font-semibold text-textMain">알림</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-textMuted">
            [보유]는 할 일 목표가, [관심]은 관심종목 가격입니다. 할 일 매수는 이하, 매도는 이상입니다.
          </p>
          <AlertGroup
            title="지금 도달"
            empty="도달한 종목이 없습니다."
            rows={reached.map((item) => ({
              key: item.key,
              title: alertItemTitle(item.source, item.title),
              detail: item.detail,
              status: item.status,
              onClick: () => {
                setOpen(false);
                onOpenItem(item);
              },
            }))}
          />
          <AlertGroup
            title="최근 알림"
            empty="아직 울린 알림이 없습니다."
            rows={recent.slice(0, 12).map((item) => ({
              key: item.id,
              title: alertItemTitle(item.source, item.title),
              detail: item.body,
              status: item.status,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function AlertGroup({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { key: string; title: string; detail: string; status: 'reached' | 'near'; onClick?: () => void }[];
}) {
  return (
    <section className="mt-3 border-t border-border/70 pt-2">
      <h3 className="text-[11px] font-medium text-textMuted">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px] text-textMuted">{empty}</p>
      ) : (
        <ul className="mt-1 max-h-52 space-y-1 overflow-y-auto">
          {rows.map((row) => {
            const body = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-textMain">{row.title}</span>
                  <span
                    className={`shrink-0 text-[10px] font-medium ${
                      row.status === 'reached' ? 'text-positive' : 'text-warning'
                    }`}
                  >
                    {row.status === 'reached' ? '도달' : '근접'}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-textMuted">{row.detail}</span>
              </>
            );
            return (
              <li key={row.key}>
                {row.onClick ? (
                  <button
                    type="button"
                    onClick={row.onClick}
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="px-2 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}
