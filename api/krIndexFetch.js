/**
 * 코스피·코스닥 지수. 네이버 모바일 index basic JSON.
 * 등락 방향은 compareToPreviousPrice(상승/하락/보합)를 따른다.
 */
import { parseSignedCommaNumber } from './krQuoteFetch.js';

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

const INDEXES = [
  { id: 'KOSPI', name: '코스피' },
  { id: 'KOSDAQ', name: '코스닥' },
];

/** 1 상승, -1 하락, 0 보합 */
export function directionFromNaverIndex(data) {
  const name = String(data?.compareToPreviousPrice?.name ?? '').toUpperCase();
  const text = String(data?.compareToPreviousPrice?.text ?? '');
  const code = String(data?.compareToPreviousPrice?.code ?? '');
  if (
    name === 'UPPER_LIMIT' ||
    name === 'RISING' ||
    code === '1' ||
    code === '2' ||
    text === '상한' ||
    text === '상승'
  ) {
    return 1;
  }
  if (
    name === 'LOWER_LIMIT' ||
    name === 'FALLING' ||
    code === '4' ||
    code === '5' ||
    text === '하한' ||
    text === '하락'
  ) {
    return -1;
  }
  if (name === 'UNCHANGED' || code === '3' || text === '보합') return 0;
  const raw = parseSignedCommaNumber(data?.compareToPreviousClosePrice);
  if (raw == null || raw === 0) return 0;
  return raw > 0 ? 1 : -1;
}

export function parseNaverIndexBasic(data, fallback) {
  const price = parseSignedCommaNumber(data?.closePrice);
  if (price == null || !(price > 0)) {
    throw new Error('index_parse_fail');
  }
  const dir = directionFromNaverIndex(data);
  const rawChange = parseSignedCommaNumber(data?.compareToPreviousClosePrice) ?? 0;
  const rawPct = parseSignedCommaNumber(data?.fluctuationsRatio) ?? 0;
  return {
    id: fallback?.id ?? data?.itemCode ?? '',
    name: fallback?.name ?? data?.stockName ?? '',
    price,
    change: dir === 0 ? 0 : dir * Math.abs(rawChange),
    changePct: dir === 0 ? 0 : dir * Math.abs(rawPct),
  };
}

export async function fetchKrIndices() {
  const indices = await Promise.all(
    INDEXES.map(async (item) => {
      const url = `https://m.stock.naver.com/api/index/${item.id}/basic`;
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`Index ${r.status}`);
      const data = await r.json();
      return parseNaverIndexBasic(data, item);
    }),
  );
  return { fetchedAt: new Date().toISOString(), indices };
}
