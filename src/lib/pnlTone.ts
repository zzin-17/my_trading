/** 한국 증시 관례: 상승·수익 빨강, 하락·손실 파랑 */
export function krPnLTextClass(value: number): string {
  if (value > 0) return 'text-red-400';
  if (value < 0) return 'text-blue-400';
  return 'text-textMain';
}

/** KRW는 한국 관례, 그 외는 일반(수익 초록·손실 빨강) */
export function pnlTextClass(value: number, koreanConvention: boolean): string {
  if (koreanConvention) return krPnLTextClass(value);
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-negative';
  return 'text-textMain';
}

export function pnlToneClass(
  tone: 'pos' | 'neg' | undefined,
  koreanConvention: boolean,
): string {
  if (tone === 'pos') return koreanConvention ? 'text-red-400' : 'text-positive';
  if (tone === 'neg') return koreanConvention ? 'text-blue-400' : 'text-negative';
  return 'text-textMain';
}
