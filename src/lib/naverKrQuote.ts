export type KrPriceStatus =
  | 'upper_limit'
  | 'lower_limit'
  | 'buy_circuit'
  | 'sell_circuit';

export interface KrNaverQuoteResponse {
  price: number;
  fetchedAt: string;
  /** naver_finance_delayed | naver_mobile_over_market | naver_mobile_krx */
  source?: string;
  /** 당일 시가(시초가). 시세 갱신 직후에만 내려오며, 시가 대비 ±7% 이상이면 보유표에서 강조에 사용 */
  openPrice?: number;
  /** 상한가/하한가/매수·매도 서킷 상태가 감지되면 내려옴 */
  priceStatus?: KrPriceStatus;
}

function quoteBaseUrl(): string {
  return (
    (import.meta.env.VITE_KR_QUOTE_BASE as string | undefined) ?? '/api/kr-quote'
  );
}

export interface FetchKrNaverQuoteOptions {
  /**
   * true: 모바일 API로 장외(Over market·NXT 등) 호가 우선, 실패 시 PC 지연 시세
   * false: 기존 PC 페이지 지연 시세만
   */
  preferExtendedQuote?: boolean;
}

/** 한국 6자리 숫자 종목 — 네이버 증권(프록시 경유). `preferExtendedQuote` 시 장외 호가 우선 */
export async function fetchKrNaverDelayedQuote(
  code: string,
  options?: FetchKrNaverQuoteOptions,
): Promise<KrNaverQuoteResponse> {
  const c = code.trim().replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)) {
    throw new Error('한국 종목은 6자리 코드(예: 005930, 00680K)만 시세 연동됩니다.');
  }
  const ext = options?.preferExtendedQuote ? '&extended=1' : '';
  const url = `${quoteBaseUrl()}?code=${encodeURIComponent(c)}${ext}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    price?: number;
    fetchedAt?: string;
    source?: string;
    priceStatus?: KrPriceStatus;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  if (typeof data.price !== 'number' || !Number.isFinite(data.price)) {
    throw new Error('시세 응답이 올바르지 않습니다.');
  }
  const openRaw = (data as { openPrice?: unknown }).openPrice;
  const openPrice =
    typeof openRaw === 'number' && Number.isFinite(openRaw) && openRaw > 0
      ? openRaw
      : undefined;
  return {
    price: data.price,
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    source: data.source,
    ...(openPrice !== undefined ? { openPrice } : {}),
    ...(data.priceStatus ? { priceStatus: data.priceStatus } : {}),
  };
}
