import type { Market } from '../types/portfolio';

/** KRX 시장 뱃지 색 (코스피 / 코스닥 / 코넥스) */
export function krBoardBadgeClass(board: string | undefined): string {
  if (board === '코스닥') return 'bg-violet-500/20 text-violet-300';
  if (board === '코스피') return 'bg-accent/20 text-accent';
  if (board === '코넥스') return 'bg-amber-500/15 text-amber-200';
  if (board === 'ETF') return 'bg-emerald-500/20 text-emerald-300';
  if (board === 'ETN') return 'bg-cyan-500/20 text-cyan-300';
  return 'bg-textMuted/20 text-textMuted';
}

/** 테이블·모달에 표시할 짧은 시장명 */
export function krBoardDisplayLabel(market: Market, board: string | undefined): string {
  if (market !== 'KR') return 'US';
  const b = board?.trim();
  return b || '—';
}
