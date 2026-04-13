import { describe, expect, it } from 'vitest';
import {
  isKrOpenAttention,
  krOpenDeviationPct,
  KR_OPEN_ATTENTION_ABS_PCT,
} from './krOpenDeviation';

describe('isKrOpenAttention', () => {
  it(`시가 대비 절대값 ${KR_OPEN_ATTENTION_ABS_PCT}% 미만이면 false`, () => {
    expect(isKrOpenAttention('KR', '005930', 106_000, 100_000)).toBe(false);
  });

  it('시가 대비 +7% 이상이면 true', () => {
    expect(isKrOpenAttention('KR', '005930', 107_000, 100_000)).toBe(true);
  });

  it('시가 대비 -7% 이하이면 true', () => {
    expect(isKrOpenAttention('KR', '005930', 93_000, 100_000)).toBe(true);
  });

  it('미국 종목은 false', () => {
    expect(isKrOpenAttention('US', 'AAPL', 200, 100)).toBe(false);
  });

  it('시가 없으면 false', () => {
    expect(isKrOpenAttention('KR', '005930', 107_000, undefined)).toBe(false);
  });
});

describe('krOpenDeviationPct', () => {
  it('계산', () => {
    expect(krOpenDeviationPct(107_000, 100_000)).toBeCloseTo(7, 5);
  });
});
