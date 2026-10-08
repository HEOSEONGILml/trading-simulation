// 날짜와 가격을 더미 값으로 바꾸는 규칙

import { MINUTE } from './binance.ts';
import { PRICE_STYLE, type PriceStyle } from './markets/types.ts';

const DAY = 24 * 60 * MINUTE;
const WEEK = 7 * DAY;

// 더미 날짜는 실제 데이터가 존재할 수 없는 구간(2000~2018년)에서 고른다
const FAKE_DATE_MIN = Date.UTC(2000, 0, 1);
const FAKE_DATE_MAX = Date.UTC(2018, 11, 31);

// 더미 시작가는 시장별 범위에서 고른 깔끔한 값 (markets/types.ts PRICE_STYLE). 기본은 코인

export interface Disguise {
  /** 표시 시각 = 실제 시각 + dateOffset. 7일의 배수라 요일과 시각이 유지된다 */
  dateOffset: number;
  /** 표시 가격 = 실제 가격 × priceFactor. 곱셈만 쓰므로 변동률이 유지된다 */
  priceFactor: number;
  pricePrecision: number;
}

export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function createDisguise(
  realStartTime: number,
  realStartPrice: number,
  hideDate: boolean,
  hidePrice: boolean,
  style: PriceStyle = PRICE_STYLE.coin,
): Disguise {
  let dateOffset = 0;
  if (hideDate) {
    const target = randomInt(FAKE_DATE_MIN, FAKE_DATE_MAX);
    dateOffset = Math.round((target - realStartTime) / WEEK) * WEEK;
  }

  let priceFactor = 1;
  if (hidePrice) {
    const steps = (style.fakeMax - style.fakeMin) / style.fakeStep;
    const fakeStartPrice = style.fakeMin + randomInt(0, steps) * style.fakeStep;
    priceFactor = fakeStartPrice / realStartPrice;
  }

  return { dateOffset, priceFactor, pricePrecision: precisionFor(priceFactor, style.realTick, style.minPrecision) };
}

/** 실제 호가 단위가 표시 가격에서 보이도록 필요한 소수 자릿수 */
export function precisionFor(priceFactor: number, realTick = PRICE_STYLE.coin.realTick, minPrecision = PRICE_STYLE.coin.minPrecision): number {
  const tick = realTick * priceFactor;
  return Math.min(4, Math.max(minPrecision, Math.ceil(-Math.log10(tick) - 1e-9)));
}
