import { describe, expect, it } from 'vitest';
import type { Trade } from '../types/trade';
import {
  buildExportFile,
  parsePortfolioImportJson,
  TRADEROS_EXPORT_FORMAT,
} from './portfolioExport';

const sampleTrade: Trade = {
  id: 'x1',
  date: '2026-01-15',
  ticker: '005930',
  name: '삼성전자',
  sector: '반도체',
  market: 'KR',
  side: 'buy',
  quantity: 1,
  price: 70000,
  currency: 'KRW',
};

const samplePortfolio = {
  trades: [sampleTrade],
  quotes: { '005930': 71000 } as Record<string, number>,
  positionIds: { '005930': 'pos-1' } as Record<string, string>,
  todos: [],
  notes: {} as Record<string, string>,
  quoteUpdatedAt: {} as Record<string, string>,
  lastKrQuoteBulkAt: null as string | null,
};

describe('portfolioExport', () => {
  it('보내기 JSON을 가져오기로 다시 파싱하면 매매가 복원된다', () => {
    const file = buildExportFile(samplePortfolio);
    expect(file.format).toBe(TRADEROS_EXPORT_FORMAT);
    const text = JSON.stringify(file);
    const restored = parsePortfolioImportJson(text);
    expect(restored).not.toBeNull();
    expect(restored!.trades).toHaveLength(1);
    expect(restored!.trades[0]!.ticker).toBe('005930');
    expect(restored!.quotes['005930']).toBe(71000);
  });

  it('래퍼 없이 로컬 저장 원본 객체만 있어도 파싱된다', () => {
    const text = JSON.stringify(samplePortfolio);
    const restored = parsePortfolioImportJson(text);
    expect(restored).not.toBeNull();
    expect(restored!.trades[0]!.id).toBe('x1');
  });
});
