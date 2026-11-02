import { describe, expect, it } from 'vitest';
import { formatKiwoomIndexQuote } from './krIndexChange';
import {
  directionFromNaverIndex,
  parseNaverIndexBasic,
} from '../../api/krIndexFetch.js';

describe('formatKiwoomIndexQuote', () => {
  it('상승은 화살표와 절대값, 등락률만 플러스', () => {
    expect(formatKiwoomIndexQuote(5859.08, 128.34, 2.24)).toEqual({
      priceText: '5,859.08',
      changeText: '▲ 128.34',
      rateText: '+2.24%',
      direction: 1,
    });
  });

  it('하락은 역삼각형과 절대값, 등락률만 마이너스', () => {
    expect(formatKiwoomIndexQuote(734.36, -9.98, -1.38)).toEqual({
      priceText: '734.36',
      changeText: '▼ 9.98',
      rateText: '-1.38%',
      direction: -1,
    });
  });

  it('보합은 화살표 없이 0.00', () => {
    expect(formatKiwoomIndexQuote(1000, 0, 0)).toEqual({
      priceText: '1,000.00',
      changeText: '0.00',
      rateText: '0.00%',
      direction: 0,
    });
  });
});

describe('parseNaverIndexBasic', () => {
  it('상승 코드면 부호 없는 숫자도 플러스로 만든다', () => {
    const row = parseNaverIndexBasic(
      {
        itemCode: 'KOSPI',
        stockName: '코스피',
        closePrice: '5,859.08',
        compareToPreviousClosePrice: '128.34',
        fluctuationsRatio: '2.24',
        compareToPreviousPrice: { code: '2', text: '상승', name: 'RISING' },
      },
      { id: 'KOSPI', name: '코스피' },
    );
    expect(row).toMatchObject({
      id: 'KOSPI',
      name: '코스피',
      price: 5859.08,
      change: 128.34,
      changePct: 2.24,
    });
  });

  it('하락이면 절대값을 음수로 만든다', () => {
    expect(directionFromNaverIndex({
      compareToPreviousPrice: { code: '5', text: '하락', name: 'FALLING' },
    })).toBe(-1);
    const row = parseNaverIndexBasic(
      {
        closePrice: '734.36',
        compareToPreviousClosePrice: '9.98',
        fluctuationsRatio: '1.38',
        compareToPreviousPrice: { code: '5', text: '하락', name: 'FALLING' },
      },
      { id: 'KOSDAQ', name: '코스닥' },
    );
    expect(row.change).toBe(-9.98);
    expect(row.changePct).toBe(-1.38);
  });
});
