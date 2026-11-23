import type { Market } from './portfolio';

/** 보유와 분리된 관심종목. 수량·평단을 갖지 않는다. */
export interface WatchItem {
  /** watch-KR-272450. 시장+코드로 고정해 같은 종목이 두 번 들어가지 않게 한다. */
  id: string;
  market: Market;
  ticker: string;
  name: string;
  memo: string;
  createdAt: string;
}
