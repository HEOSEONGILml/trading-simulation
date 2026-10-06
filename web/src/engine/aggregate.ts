// 1분봉을 더 큰 단위 캔들로 묶는다 (바이낸스와 같이 UTC 기준 정렬)

import { MINUTE, type Candle } from './types.ts';

export interface Timeframe {
  label: string;
  minutes: number;
}

export const TIMEFRAMES: Timeframe[] = [
  { label: '1m', minutes: 1 },
  { label: '3m', minutes: 3 },
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1H', minutes: 60 },
  { label: '2H', minutes: 120 },
  { label: '4H', minutes: 240 },
  { label: '1D', minutes: 1440 },
];

export const bucketStart = (time: number, minutes: number) => Math.floor(time / (minutes * MINUTE)) * minutes * MINUTE;

function merge(target: Candle, c: Candle) {
  target.high = Math.max(target.high, c.high);
  target.low = Math.min(target.low, c.low);
  target.close = c.close;
  target.volume += c.volume;
}

export function aggregate(candles: Candle[], minutes: number): Candle[] {
  if (minutes === 1) return candles.map((c) => ({ ...c }));
  const result: Candle[] = [];
  for (const c of candles) {
    const start = bucketStart(c.time, minutes);
    const last = result[result.length - 1];
    if (last && last.time === start) merge(last, c);
    else result.push({ ...c, time: start });
  }
  return result;
}

/** 마지막 1분봉이 속한 상위 단위 캔들 */
export function lastAggregated(candles: Candle[], minutes: number): Candle | null {
  if (candles.length === 0) return null;
  const start = bucketStart(candles[candles.length - 1].time, minutes);
  let i = candles.length - 1;
  while (i > 0 && candles[i - 1].time >= start) i--;
  const bar: Candle = { ...candles[i], time: start };
  for (let j = i + 1; j < candles.length; j++) merge(bar, candles[j]);
  return bar;
}
