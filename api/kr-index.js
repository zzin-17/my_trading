/** 코스피·코스닥 지수 프록시 */
import { fetchKrIndices } from './krIndexFetch.js';
import { enforceRateLimit } from './_rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }
  if (
    !enforceRateLimit(req, res, {
      bucket: 'kr-index',
      windowMs: 60 * 1000,
      max: 60,
    })
  ) {
    return;
  }

  try {
    const result = await fetchKrIndices();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'index_parse_fail') {
      return res.status(422).json({ message: '지수 파싱 실패' });
    }
    return res.status(502).json({ message: '지수 조회 실패' });
  }
}
