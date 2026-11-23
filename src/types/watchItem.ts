import type { Market } from './portfolio';

/** 이상: 현재가가 이 가격 이상. 이하: 현재가가 이 가격 이하. */
export type WatchAlertDirection = 'above' | 'below';

/** 관심종목 하나에 가격 알림 하나. 수량·평단과 무관하다. */
export interface WatchPriceAlert {
  direction: WatchAlertDirection;
  price: number;
  enabled: boolean;
}

/** 보유와 분리된 관심종목. 수량·평단을 갖지 않는다. */
export interface WatchItem {
  /** watch-KR-272450. 시장+코드로 고정해 같은 종목이 두 번 들어가지 않게 한다. */
  id: string;
  market: Market;
  ticker: string;
  name: string;
  memo: string;
  createdAt: string;
  alert?: WatchPriceAlert;
}
