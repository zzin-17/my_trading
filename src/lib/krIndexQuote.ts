export interface KrIndexQuote {
  id: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

export interface KrIndexQuoteResponse {
  fetchedAt: string;
  indices: KrIndexQuote[];
}

function indexUrl(): string {
  const quoteBase = import.meta.env.VITE_KR_QUOTE_BASE as string | undefined;
  if (quoteBase) return quoteBase.replace(/\/kr-quote\/?$/, '/kr-index');
  return import.meta.env.DEV
    ? '/api/kr-index'
    : 'https://my-trading-phi.vercel.app/api/kr-index';
}

export async function fetchKrIndices(): Promise<KrIndexQuoteResponse> {
  const res = await fetch(indexUrl());
  const data = (await res.json()) as {
    fetchedAt?: string;
    indices?: KrIndexQuote[];
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  if (!Array.isArray(data.indices) || data.indices.length === 0) {
    throw new Error('지수 응답이 올바르지 않습니다.');
  }
  return {
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    indices: data.indices.filter(
      (row) =>
        typeof row.price === 'number' &&
        Number.isFinite(row.price) &&
        typeof row.change === 'number' &&
        typeof row.changePct === 'number',
    ),
  };
}
