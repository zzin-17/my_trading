export function fetchKrQuote(
  code: string,
  options: { extended: boolean },
): Promise<{
  price: number;
  fetchedAt: string;
  source: string;
  /** 당일 시가(원). integration 실패 시 생략 */
  openPrice?: number;
  /** 전일 종가(원). 등락 파싱 실패 시 생략 */
  prevClose?: number;
  /** 전일 종가 대비 등락액(원) */
  changeValue?: number;
  /** 전일 종가 대비 등락률(%) */
  changePct?: number;
}>;
