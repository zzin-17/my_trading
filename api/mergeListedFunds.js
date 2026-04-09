/**
 * 네이버 금융 ETF/ETN API (EUC-KR JSON) + KRX 상장법인 목록 병합
 */

const decoder = new TextDecoder('euc-kr');

/**
 * @returns {Promise<{ ticker: string, name: string, sector: string, board: string }[]>}
 */
export async function fetchNaverEtfEtnRows() {
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/plain,*/*',
  };
  const endpoints = [
    {
      url: 'https://finance.naver.com/api/sise/etfItemList.nhn',
      listKey: 'etfItemList',
      kind: 'ETF',
    },
    {
      url: 'https://finance.naver.com/api/sise/etnItemList.nhn',
      listKey: 'etnItemList',
      kind: 'ETN',
    },
  ];
  const out = [];
  for (const { url, listKey, kind } of endpoints) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const text = decoder.decode(buf);
      const json = JSON.parse(text);
      const list = json?.result?.[listKey];
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        let digits = String(row.itemcode ?? '').replace(/\D/g, '');
        if (!digits) continue;
        if (digits.length > 6) digits = digits.slice(-6);
        const ticker = digits.padStart(6, '0').toUpperCase();
        if (!/^[0-9]{6}$/.test(ticker)) continue;
        const name = String(row.itemname ?? '').replace(/\s+/g, ' ').trim();
        if (!name) continue;
        out.push({
          ticker: ticker.toUpperCase(),
          name,
          sector: kind === 'ETN' ? 'ETN' : 'ETF',
          board: kind,
        });
      }
    } catch {
      /* 한 소스 실패 시 다른 소스만 사용 */
    }
  }
  return out;
}

/**
 * @param {{ ticker: string, name: string, sector: string, board: string }[]} stockItems
 * @param {{ ticker: string, name: string, sector: string, board: string }[]} fundItems
 */
export function mergeStockAndFunds(stockItems, fundItems) {
  const by = new Map(stockItems.map((x) => [x.ticker, x]));
  for (const f of fundItems) {
    if (!by.has(f.ticker)) by.set(f.ticker, f);
  }
  return [...by.values()];
}
