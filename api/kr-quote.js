/** 네이버 시세 프록시 — CORS 우회 (PC 지연 시세 또는 모바일·장외 호가) */
import { fetchKrQuote } from './krQuoteFetch.js';
import { enforceRateLimit } from './_rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }
  if (
    !enforceRateLimit(req, res, {
      bucket: 'kr-quote',
      windowMs: 60 * 1000,
      max: 60,
    })
  ) {
    return;
  }

  const rawCode = req.query?.code;
  const code =
    typeof rawCode === 'string' ? rawCode.trim().replace(/\s/g, '').toUpperCase() : rawCode;
  const extRaw = req.query?.extended;
  const ext0 = Array.isArray(extRaw) ? extRaw[0] : extRaw;
  const extended =
    ext0 === '1' || ext0 === 'true' || extRaw === true;

  if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code)) {
    return res
      .status(400)
      .json({ message: '6자리 한국 종목코드(예: 005930, 00680K)가 필요합니다.' });
  }

  try {
    const result = await fetchKrQuote(code, { extended });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '시세 조회 실패';
    if (msg === 'parse_fail' || msg === 'mobile_parse_fail') {
      return res.status(422).json({ message: '시세 파싱 실패' });
    }
    return res.status(502).json({ message: '시세 조회 실패' });
  }
}
