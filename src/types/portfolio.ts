/**
 * TraderOS Portfolio Visual — 공통 타입 (MVP v1)
 * @see TraderOS_Spec.md
 */

/** 통화별 반올림: KRW 0자리, USD 2자리 */
export type CurrencyCode = 'KRW' | 'USD';

/** 집중도 경고 임계값 (%). §1.4: 섹터·종목 각각 동일 기준(≥ 이 값). */
export const CONCENTRATION_WARNING_PCT = 40;

/**
 * 보유 종목 (mock.json / 수동 입력 기준)
 * 스펙 원본 필드에 `currency`만 추가 (반올림 규칙 적용용)
 */
export interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  currency: CurrencyCode;
}

/** `/data/mock.json` 루트 스키마 */
export interface PortfolioMockFile {
  positions: Position[];
}

/** 단일 포지션 기준 파생 지표 (테이블·차트·합계 검증용) */
export interface PositionMetrics {
  positionId: string;
  cost_basis: number;
  market_value: number;
  pnl: number;
  /** 포트폴리오 대비 비중 (%) */
  weight_pct: number;
}

/** 대시보드 요약 카드 (하단 테이블 합계와 일치해야 함) */
export interface PortfolioSummary {
  currency: CurrencyCode;
  total_cost_basis: number;
  total_market_value: number;
  total_pnl: number;
  /** 총 투자금 대비 수익률 (%) */
  total_return_pct: number;
}

/** 섹터별 비중 (도넛 차트) */
export interface SectorWeight {
  sector: string;
  weight_pct: number;
  market_value: number;
}

/** 종목별 비중 (가로 막대, Top N + Others) */
export interface StockWeight {
  ticker: string;
  name: string;
  weight_pct: number;
  market_value: number;
}

export interface TopStockWeightsResult {
  top: StockWeight[];
  others: StockWeight | null;
}
