/**
 * 네이버 시세 조회 (PC 지연 시세 vs 모바일 JSON·장외 호가)
 * api/kr-quote.js · Vite dev 미들웨어에서 공통 사용
 */

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/html' };

export function parseCommaInt(str) {
  if (typeof str !== 'string') return null;
  const n = parseInt(str.replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseNaverMainPrice(html) {
  let m = html.match(/오늘의시세\s*([\d,]+)\s*포인트/);
  if (!m) {
    const krx = html.match(/id="rate_info_krx"[\s\S]*?<\/table>/);
    if (krx) m = krx[0].match(/오늘의시세\s*([\d,]+)\s*포인트/);
  }
  if (!m) {
    const block = html.match(/<p class="no_today"[\s\S]*?<\/p>/);
    if (block) m = block[0].match(/<span class="blind">([\d,]+)<\/span>/);
  }
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** PC 종목 메인 — 기존 지연 시세(정규장 중심) */
export async function fetchNaverPcDelayedQuote(code) {
  const upstream = `https://finance.naver.com/item/main.naver?code=${code}`;
  const r = await fetch(upstream, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml' },
  });
  if (!r.ok) throw new Error(`Upstream ${r.status}`);
  const html = await r.text();
  const price = parseNaverMainPrice(html);
  if (price === null) throw new Error('parse_fail');
  return {
    price,
    fetchedAt: new Date().toISOString(),
    source: 'naver_finance_delayed',
  };
}

/**
 * 모바일 API — 장외(Over market / NXT 등) 호가가 있으면 우선, 없으면 종가 표시값
 */
export async function fetchNaverMobileQuotePreferOver(code) {
  const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`Mobile ${r.status}`);
  const data = await r.json();
  const overRaw = data?.overMarketPriceInfo?.overPrice;
  const over = parseCommaInt(overRaw);
  if (over != null) {
    return {
      price: over,
      fetchedAt: new Date().toISOString(),
      source: 'naver_mobile_over_market',
    };
  }
  const close = parseCommaInt(data?.closePrice);
  if (close != null) {
    return {
      price: close,
      fetchedAt: new Date().toISOString(),
      source: 'naver_mobile_krx',
    };
  }
  throw new Error('mobile_parse_fail');
}

/** extended=1: 모바일(장외 우선) → 실패 시 PC */
export async function fetchKrQuote(code, { extended }) {
  if (extended) {
    try {
      return await fetchNaverMobileQuotePreferOver(code);
    } catch {
      /* fall through */
    }
  }
  return fetchNaverPcDelayedQuote(code);
}
