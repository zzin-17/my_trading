export interface KrNaverQuoteResponse {
  price: number;
  fetchedAt: string;
  source?: string;
}

function quoteBaseUrl(): string {
  return (
    (import.meta.env.VITE_KR_QUOTE_BASE as string | undefined) ?? '/api/kr-quote'
  );
}

/** 한국 6자리 숫자 종목 — 네이버 증권 지연 시세(프록시 경유) */
export async function fetchKrNaverDelayedQuote(
  code: string,
): Promise<KrNaverQuoteResponse> {
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) {
    throw new Error('한국 종목은 6자리 숫자 코드만 시세 연동됩니다.');
  }
  const url = `${quoteBaseUrl()}?code=${encodeURIComponent(c)}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    price?: number;
    fetchedAt?: string;
    source?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  if (typeof data.price !== 'number' || !Number.isFinite(data.price)) {
    throw new Error('시세 응답이 올바르지 않습니다.');
  }
  return {
    price: data.price,
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    source: data.source,
  };
}
