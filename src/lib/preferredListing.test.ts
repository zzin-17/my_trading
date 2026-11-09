import { describe, expect, it } from 'vitest';
import {
  isPreferredStockName,
  mergeStockAndFunds,
  preferredRowsFromMarketValueStocks,
} from '../../api/mergeListedFunds.js';

describe('isPreferredStockName', () => {
  it('우선주 접미사를 구분한다', () => {
    expect(isPreferredStockName('삼성전기우')).toBe(true);
    expect(isPreferredStockName('현대차2우B')).toBe(true);
    expect(isPreferredStockName('삼성전기')).toBe(false);
  });
});

describe('preferredRowsFromMarketValueStocks', () => {
  it('시가총액 목록에서 우선주만 시장과 함께 고른다', () => {
    const rows = preferredRowsFromMarketValueStocks(
      [
        { itemCode: '009150', stockName: '삼성전기' },
        { itemCode: '009155', stockName: '삼성전기우' },
        { itemCode: '078350', stockName: '한양디지텍' },
      ],
      '코스피',
    );
    expect(rows).toEqual([
      { ticker: '009155', name: '삼성전기우', sector: '기타', board: '코스피' },
    ]);
  });
});

describe('mergeStockAndFunds', () => {
  it('보통주 목록에 없는 우선주를 시장과 함께 넣는다', () => {
    const merged = mergeStockAndFunds(
      [{ ticker: '009150', name: '삼성전기', sector: '전자', board: '코스피' }],
      [],
      [{ ticker: '009155', name: '삼성전기우', sector: '기타', board: '코스피' }],
    );
    expect(merged.find((row) => row.ticker === '009155')).toMatchObject({
      name: '삼성전기우',
      board: '코스피',
    });
  });

  it('시장이 비어 있는 기존 행은 우선주 시장으로 채운다', () => {
    const merged = mergeStockAndFunds(
      [{ ticker: '009155', name: '삼성전기우', sector: '기타', board: '' }],
      [],
      [{ ticker: '009155', name: '삼성전기우', sector: '기타', board: '코스피' }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.board).toBe('코스피');
  });
});
