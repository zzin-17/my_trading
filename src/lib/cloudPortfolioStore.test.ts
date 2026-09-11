import { describe, expect, it } from 'vitest';
import { shouldHydrateFromLegacy } from './cloudPortfolioStore';

describe('shouldHydrateFromLegacy', () => {
  it('라이브 거래가 있으면 레거시를 쓰지 않는다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 3,
        liveTodoCount: 0,
        hasDeleteHistory: false,
        legacyHasItems: true,
      }),
    ).toBe(false);
  });

  it('삭제 이력이 있으면 빈 라이브를 레거시로 채우지 않는다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 0,
        liveTodoCount: 0,
        hasDeleteHistory: true,
        legacyHasItems: true,
      }),
    ).toBe(false);
  });

  it('라이브가 비고 메타만 있어도 레거시 항목이 있으면 복구한다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 0,
        liveTodoCount: 0,
        hasDeleteHistory: false,
        legacyHasItems: true,
      }),
    ).toBe(true);
  });

  it('레거시도 비어 있으면 복구하지 않는다', () => {
    expect(
      shouldHydrateFromLegacy({
        liveTradeCount: 0,
        liveTodoCount: 0,
        hasDeleteHistory: false,
        legacyHasItems: false,
      }),
    ).toBe(false);
  });
});
