export function fetchKrQuote(
  code: string,
  options: { extended: boolean },
): Promise<{
  price: number;
  fetchedAt: string;
  source: string;
  /** 당일 시가(원). integration 실패 시 생략 */
  openPrice?: number;
}>;
