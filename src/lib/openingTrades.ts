import type { Trade } from '../types/trade';

/** 아이디에 들어 있는 Date.now() 시각. 2020년~2100년만 인정한다. */
export function idCreatedAtMs(id: string): number | null {
  const match = id.match(/\d{13}/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value < 1_577_836_800_000 || value > 4_102_444_800_000) {
    return null;
  }
  return value;
}

function tradeKey(trade: Trade): string {
  return `${trade.market}\u0000${trade.ticker}`;
}

function openingRank(trade: Trade): number {
  return idCreatedAtMs(trade.id) ?? 0;
}

/** 수량·평단을 맞추기 위해 만든 최신 초기보유. 이것보다 옛 숨은 매수는 장부에서 빼야 한다. */
function isOpeningBalance(trade: Trade): boolean {
  return trade.excludeFromJournal === true && trade.id.startsWith('tr-ob-');
}

/**
 * 종목마다 초기보유는 가장 최근 1건만 남긴다.
 * 그 시각보다 앞선 숨은 매수(예전 보유종목 추가·이전 초기보유)는 빼서
 * 클라우드에 다시 올라와도 수량과 평단이 합산되지 않게 한다.
 * 초기보유보다 나중에 만든 숨은 매수와 매매일지 체결은 유지한다.
 */
export function withoutRedundantHiddenTrades(trades: readonly Trade[]): Trade[] {
  const newestOpening = new Map<string, Trade>();
  for (const trade of trades) {
    if (!isOpeningBalance(trade)) continue;
    const key = tradeKey(trade);
    const current = newestOpening.get(key);
    if (!current || openingRank(trade) > openingRank(current) || (
      openingRank(trade) === openingRank(current) && trade.id.localeCompare(current.id) > 0
    )) {
      newestOpening.set(key, trade);
    }
  }
  if (newestOpening.size === 0) return [...trades];
  return trades.filter((trade) => {
    if (trade.excludeFromJournal !== true) return true;
    const keeper = newestOpening.get(tradeKey(trade));
    if (!keeper || keeper.id === trade.id) return true;
    return openingRank(trade) >= openingRank(keeper);
  });
}
