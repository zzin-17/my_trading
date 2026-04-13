const store = globalThis.__traderosRateLimitStore ?? new Map();
globalThis.__traderosRateLimitStore = store;

function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).trim();
  }
  return 'unknown';
}

/**
 * 고정 윈도우 레이트 리밋 (서버리스 인스턴스 단위).
 * 완전한 전역 제한은 아니지만, 단일 IP의 과도한 연속 호출을 빠르게 완화한다.
 */
export function enforceRateLimit(req, res, options) {
  const windowMs = options.windowMs;
  const max = options.max;
  const bucket = options.bucket;
  const now = Date.now();
  const ip = clientIp(req);
  const key = `${bucket}:${ip}`;
  const row = store.get(key);
  const resetAt = row && row.resetAt > now ? row.resetAt : now + windowMs;
  const count = row && row.resetAt > now ? row.count + 1 : 1;
  store.set(key, { count, resetAt });

  // 간단한 메모리 정리: 만료 버킷 제거
  if (store.size > 2000) {
    for (const [k, v] of store.entries()) {
      if (v.resetAt <= now) store.delete(k);
    }
  }

  const remaining = Math.max(0, max - count);
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(resetAt / 1000)));
  if (count > max) {
    res.setHeader('Retry-After', String(retryAfterSec));
    res
      .status(429)
      .json({ message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    return false;
  }
  return true;
}
