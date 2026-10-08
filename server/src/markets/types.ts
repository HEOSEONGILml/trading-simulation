// 시장별 1분봉 공급원. 라운드는 시장에 상관없이 이 인터페이스로 과거와 미래 봉을 받는다
// 봉 시각은 모두 "봉 시작 시각"(ms)으로 맞춘다

import type { Candle } from '../binance.ts';

export type Market = 'coin' | 'kr' | 'us';
export const MARKETS: Market[] = ['coin', 'kr', 'us'];

export interface MarketSource {
  market: Market;
  /** 1분봉을 받을 수 있는 가장 이른 시각 */
  earliest: number;
  /** before(제외) 직전의 봉 최대 count개, 오래된 순 */
  history(symbol: string, before: number, count: number): Promise<Candle[]>;
  /** from(포함) 이후의 봉 최대 count개, 오래된 순. 데이터 끝(현재 근처)에 닿으면 count보다 적다 */
  future(symbol: string, from: number, count: number): Promise<Candle[]>;
}

/** 가린 가격을 고를 범위와 실제 호가 단위 (표시 소수 자릿수 계산용) */
export interface PriceStyle {
  fakeMin: number;
  fakeMax: number;
  fakeStep: number;
  realTick: number;
  /** 표시 소수 자릿수 하한 */
  minPrecision: number;
  currency: 'USDT' | 'KRW' | 'USD';
}

export const PRICE_STYLE: Record<Market, PriceStyle> = {
  coin: { fakeMin: 2_000, fakeMax: 98_000, fakeStep: 1_000, realTick: 0.1, minPrecision: 1, currency: 'USDT' },
  kr: { fakeMin: 5_000, fakeMax: 300_000, fakeStep: 1_000, realTick: 1, minPrecision: 0, currency: 'KRW' },
  us: { fakeMin: 20, fakeMax: 500, fakeStep: 10, realTick: 0.01, minPrecision: 2, currency: 'USD' },
};
