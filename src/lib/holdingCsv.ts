import type { Market } from '../types/portfolio';
import { inferMarketFromTicker } from './market';

export interface HoldingCsvRow {
  ticker: string;
  name: string;
  sector: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  market: Market;
  date: string;
}

export interface HoldingCsvParseResult {
  rows: HoldingCsvRow[];
  errors: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  ticker: ['ticker', 'code', 'symbol', '종목코드', '코드'],
  name: ['name', '종목명'],
  sector: ['sector', '섹터', '업종'],
  quantity: ['quantity', 'qty', '수량'],
  avgPrice: ['avgprice', 'avg_price', 'price', '평단', '매수가', '평균단가'],
  currentPrice: ['currentprice', 'current_price', 'nowprice', '현재가'],
  market: ['market', '시장'],
  date: ['date', '날짜', '매수일'],
};

export function parseHoldingCsv(text: string): HoldingCsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV 데이터가 비어있거나 헤더만 있습니다.'] };
  }

  const header = parseCsvLine(lines[0]).map(normalizeHeader);
  const col = resolveColumns(header);
  const errors: string[] = [];
  const rows: HoldingCsvRow[] = [];

  if (col.ticker < 0 || col.quantity < 0 || col.avgPrice < 0) {
    return {
      rows: [],
      errors: [
        '필수 헤더 누락: 종목코드(ticker), 수량(quantity), 평단(avgPrice/price)이 필요합니다.',
      ],
    };
  }

  lines.slice(1).forEach((line, i) => {
    const rowNo = i + 2;
    const cells = parseCsvLine(line);
    const ticker = (cells[col.ticker] ?? '').trim();
    const qty = Number((cells[col.quantity] ?? '').replace(/,/g, ''));
    const avgPrice = Number((cells[col.avgPrice] ?? '').replace(/,/g, ''));
    const name = ((col.name >= 0 ? cells[col.name] : '') ?? '').trim();
    const sector = ((col.sector >= 0 ? cells[col.sector] : '') ?? '').trim();
    const marketRaw = ((col.market >= 0 ? cells[col.market] : '') ?? '')
      .trim()
      .toUpperCase();
    const currentRaw = ((col.currentPrice >= 0 ? cells[col.currentPrice] : '') ?? '')
      .replace(/,/g, '')
      .trim();
    const date = ((col.date >= 0 ? cells[col.date] : '') ?? '').trim() || todayIso();

    if (!ticker) {
      errors.push(`${rowNo}행: 종목코드가 비어 있습니다.`);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      errors.push(`${rowNo}행: 수량은 1 이상의 정수여야 합니다.`);
      return;
    }
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
      errors.push(`${rowNo}행: 평단은 0보다 커야 합니다.`);
      return;
    }

    const market: Market =
      marketRaw === 'KR' || marketRaw === 'US'
        ? marketRaw
        : inferMarketFromTicker(ticker);
    const currentPrice = currentRaw ? Number(currentRaw) : avgPrice;
    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      errors.push(`${rowNo}행: 현재가는 0 이상 숫자여야 합니다.`);
      return;
    }

    rows.push({
      ticker: market === 'KR' ? ticker : ticker.toUpperCase(),
      name: name || ticker,
      sector: sector || '기타',
      quantity: qty,
      avgPrice,
      currentPrice,
      market,
      date,
    });
  });

  return { rows, errors };
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, '');
}

function resolveColumns(header: string[]) {
  const findIdx = (key: keyof typeof HEADER_ALIASES) =>
    header.findIndex((h) => HEADER_ALIASES[key].map(normalizeHeader).includes(h));
  return {
    ticker: findIdx('ticker'),
    name: findIdx('name'),
    sector: findIdx('sector'),
    quantity: findIdx('quantity'),
    avgPrice: findIdx('avgPrice'),
    currentPrice: findIdx('currentPrice'),
    market: findIdx('market'),
    date: findIdx('date'),
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

