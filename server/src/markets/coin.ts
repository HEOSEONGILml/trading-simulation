// 코인: 바이낸스 BTCUSDT 무기한 선물 1분봉

import { EARLIEST_TIME, MINUTE, fetchCandles } from '../binance.ts';
import type { MarketSource } from './types.ts';

export const COIN_SYMBOL = 'BTCUSDT';

export const coinSource: MarketSource = {
  market: 'coin',
  earliest: EARLIEST_TIME,
  history: (_symbol, before, count) => fetchCandles(before - count * MINUTE, count, before - 1),
  future: (_symbol, from, count) => fetchCandles(from, count),
};
