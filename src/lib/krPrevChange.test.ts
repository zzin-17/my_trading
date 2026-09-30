import { describe, expect, it } from 'vitest';
import { formatKrDayChange, krChangeFromPrevClose } from './krPrevChange';

describe('krChangeFromPrevClose', () => {
  it('전일 종가 대비 등락액·등락률을 계산한다', () => {
    expect(krChangeFromPrevClose(218000, 203500)).toEqual({
      amount: 14500,
      pct: (14500 / 203500) * 100,
    });
  });

  it('전일 종가가 없으면 null', () => {
    expect(krChangeFromPrevClose(218000, undefined)).toBeNull();
    expect(krChangeFromPrevClose(218000, 0)).toBeNull();
  });
});

describe('formatKrDayChange', () => {
  it('상승은 삼각형과 부호를 붙인다', () => {
    expect(formatKrDayChange(14500, 7.13, 'KRW')).toBe('▲ +₩14,500 +7.13%');
  });

  it('하락은 역삼각형과 마이너스를 붙인다', () => {
    expect(formatKrDayChange(-750, -0.28, 'KRW')).toBe('▼ -₩750 -0.28%');
  });
});
