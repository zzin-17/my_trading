import { useEffect, useState } from 'react';
import type { PortfolioSummary } from '../types/portfolio';
import { formatMoney, formatPercent } from '../lib/format';
import { ExpandableText } from './ExpandableText';
import { pnlTextClass, pnlToneClass } from '../lib/pnlTone';

const DESKTOP_SUMMARY_COLLAPSED_KEY = 'traderos-desktop-summary-collapsed-v1';

function readDesktopSummaryCollapsed(): boolean {
  try {
    return window.localStorage.getItem(DESKTOP_SUMMARY_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface SummaryCardsProps {
  summary: PortfolioSummary;
  /** 시세 지연·예상 손익 안내 (한국장 등) */
  quoteDisclaimer?: string | null;
}

export function SummaryCards({ summary, quoteDisclaimer }: SummaryCardsProps) {
  const { currency } = summary;
  const koreanPnl = currency === 'KRW';
  const pnlClass = pnlTextClass(summary.total_pnl, koreanPnl);
  const pnlTone = summary.total_pnl >= 0 ? 'pos' : 'neg';
  const [desktopCollapsed, setDesktopCollapsed] = useState(readDesktopSummaryCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DESKTOP_SUMMARY_COLLAPSED_KEY,
        desktopCollapsed ? '1' : '0',
      );
    } catch {
      /* 저장이 막혀도 이번 화면의 접기 상태는 유지한다 */
    }
  }, [desktopCollapsed]);

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border border-border/70 bg-surface md:hidden">
        <div className="px-4 py-2.5">
          <p className="text-[13px] font-semibold text-textMain">총평가손익(예상)</p>
          <div className="mt-1.5 text-right">
            <p
              className={`max-w-full text-[clamp(20px,7vw,30px)] font-bold tabular-nums leading-none ${pnlClass}`}
            >
              {formatMoney(summary.total_pnl, currency)}
            </p>
            <p
              className={`mt-1 text-[14px] font-semibold tabular-nums leading-none ${pnlClass}`}
            >
              {formatPercent(summary.total_return_pct, true)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border/60">
          <CompactSummaryCell
            label="총 평가액"
            value={formatMoney(summary.total_market_value, currency)}
          />
          <CompactSummaryCell
            label="총 투자금"
            value={formatMoney(summary.total_cost_basis, currency)}
            bordered
          />
        </div>
      </div>

      <div className="hidden rounded-xl border border-border/60 bg-surface/50 md:block">
        <button
          type="button"
          aria-expanded={!desktopCollapsed}
          aria-controls="desktop-summary-body"
          onClick={() => setDesktopCollapsed((open) => !open)}
          className={`flex w-full items-center justify-between gap-3 px-3 text-left hover:bg-white/[0.03] ${
            desktopCollapsed ? 'py-2' : 'pt-1.5'
          }`}
        >
          {desktopCollapsed ? (
            <span className="min-w-0 truncate text-[12px]">
              <span className="font-medium text-textMuted">평가손익 </span>
              <span className={`font-semibold tabular-nums ${pnlClass}`}>
                {formatMoney(summary.total_pnl, currency)}
              </span>
              <span className={`ml-2 font-semibold tabular-nums ${pnlClass}`}>
                {formatPercent(summary.total_return_pct, true)}
              </span>
            </span>
          ) : (
            <span className="text-[11px] font-medium text-textMuted">투자 요약</span>
          )}
          <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-textMuted">
            {desktopCollapsed ? '펼치기' : '접기'}
          </span>
        </button>
        {desktopCollapsed ? null : (
          <div id="desktop-summary-body" className="grid grid-cols-4 gap-0 px-3 pb-2.5">
            <DesktopSummaryStat
              label="투자금"
              value={formatMoney(summary.total_cost_basis, currency)}
            />
            <DesktopSummaryStat
              label="평가액"
              value={formatMoney(summary.total_market_value, currency)}
              bordered
            />
            <DesktopSummaryStat
              label="평가손익"
              value={formatMoney(summary.total_pnl, currency)}
              tone={pnlTone}
              koreanPnl={koreanPnl}
              bordered
              strong
            />
            <DesktopSummaryStat
              label="수익률"
              value={formatPercent(summary.total_return_pct, true)}
              tone={pnlTone}
              koreanPnl={koreanPnl}
              bordered
            />
          </div>
        )}
      </div>
      {quoteDisclaimer ? (
        <>
          {desktopCollapsed ? null : (
            <p className="hidden text-[10px] leading-relaxed text-textMuted md:block">
              {quoteDisclaimer}
            </p>
          )}
          <ExpandableText
            text={quoteDisclaimer}
            maxChars={30}
            className="md:hidden"
            textClassName="text-[11px] leading-relaxed text-textMuted"
          />
        </>
      ) : null}
    </div>
  );
}

function DesktopSummaryStat({
  label,
  value,
  tone,
  koreanPnl = false,
  bordered = false,
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  koreanPnl?: boolean;
  bordered?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`min-w-0 px-3 py-1 ${bordered ? 'border-l border-border/60' : ''}`}>
      <p className="text-[11px] font-medium tracking-tight text-textMuted">{label}</p>
      <p
        className={`mt-1 truncate tabular-nums ${
          strong ? 'text-[22px] font-bold' : 'text-[18px] font-semibold'
        } ${pnlToneClass(tone, koreanPnl)}`}
      >
        {value}
      </p>
    </div>
  );
}

function CompactSummaryCell({
  label,
  value,
  tone,
  koreanPnl = false,
  bordered = false,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  koreanPnl?: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={`px-4 py-2.5 ${bordered ? 'border-l border-border/70' : ''}`}>
      <p className="text-[12px] font-medium text-textMuted">{label}</p>
      <p
        className={`mt-0.5 text-[15px] font-semibold tabular-nums ${pnlToneClass(tone, koreanPnl)}`}
      >
        {value}
      </p>
    </div>
  );
}
