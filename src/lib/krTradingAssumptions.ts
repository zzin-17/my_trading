/**
 * 한국 주식 예상 손익(평가)용 가정치
 * - 매도 시 증권거래세·농어촌특별세: 2026년 기준 코스피·코스닥 공통 0.18% (매도금액 기준)
 * - 위탁매매수수료: 증권사·이벤트별로 달라 사용자 설정(0.01%~0.15% 권장 범위)
 */

/** 매도 금액 대비 세금 합(증거래세+농특세) — 소수. 0.18% = 0.0018 */
export const KR_SELL_TAX_RATE = 0.0018;

/** 기본 위탁 수수료율(소수). 0.015% = 0.00015 */
export const DEFAULT_KR_SELL_COMMISSION_RATE = 0.00015;

/** 위탁 수수료율 하한·상한 (소수). 0.01% ~ 0.15% */
export const KR_SELL_COMMISSION_MIN = 0.0001;
export const KR_SELL_COMMISSION_MAX = 0.0015;

export function clampKrSellCommissionRate(r: number): number {
  return Math.min(KR_SELL_COMMISSION_MAX, Math.max(KR_SELL_COMMISSION_MIN, r));
}

export function normalizeKrSellCommissionRate(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return DEFAULT_KR_SELL_COMMISSION_RATE;
  }
  return clampKrSellCommissionRate(v);
}
