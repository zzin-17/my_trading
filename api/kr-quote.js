/** 네이버 증권 PC 페이지(지연 시세)에서 현재가 추출 — CORS 우회용 프록시 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const code = req.query?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: '6자리 숫자 종목코드가 필요합니다.' });
  }

  try {
    const upstream = `https://finance.naver.com/item/main.naver?code=${code}`;
    const r = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) {
      return res.status(502).json({ message: `Upstream ${r.status}` });
    }
    const html = await r.text();
    const price = parseNaverMainPrice(html);
    if (price === null) {
      return res.status(422).json({ message: '시세 파싱 실패' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      price,
      fetchedAt: new Date().toISOString(),
      source: 'naver_finance_delayed',
    });
  } catch {
    return res.status(502).json({ message: '시세 조회 실패' });
  }
}

function parseNaverMainPrice(html) {
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
