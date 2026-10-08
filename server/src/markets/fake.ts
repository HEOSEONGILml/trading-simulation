// 개발용 가짜 주식 1분봉. 토스증권 키 없이 주식 화면을 확인할 때만 쓴다 (STOCKS_FAKE=1, 운영에서는 켜지 않는다)
// 같은 시각이면 항상 같은 값이 나오도록 시각으로 난수를 만든다

import { MINUTE, type Candle } from '../binance.ts';
import { SESSIONS, inSession } from './tossinvest.ts';
import type { MarketSource } from './types.ts';

function noise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function bar(market: 'kr' | 'us', time: number): Candle {
  const base = market === 'kr' ? 60_000 : 180;
  const step = Math.floor(time / MINUTE);
  const wave = Math.sin(step / 600) * 0.08 + Math.sin(step / 97) * 0.02;
  const open = base * (1 + wave + (noise(step) - 0.5) * 0.004);
  const close = open * (1 + (noise(step + 1) - 0.5) * 0.004);
  const high = Math.max(open, close) * (1 + noise(step + 2) * 0.002);
  const low = Math.min(open, close) * (1 - noise(step + 3) * 0.002);
  const round = (v: number) => (market === 'kr' ? Math.round(v) : Math.round(v * 100) / 100);
  return [time, round(open), round(high), round(low), round(close), Math.round(1000 + noise(step + 4) * 5000)];
}

export function fakeStockSource(market: 'kr' | 'us'): MarketSource {
  const session = SESSIONS[market];
  // 실제 데이터처럼 주말에는 봉이 없다 (현지 요일 기준)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: session.timeZone, weekday: 'short' });
  const open = (t: number) => inSession(t, session) && !['Sat', 'Sun'].includes(weekday.format(t));
  return {
    market,
    earliest: session.earliest,
    async history(_symbol, before, count) {
      const out: Candle[] = [];
      for (let t = Math.floor(before / MINUTE) * MINUTE - MINUTE; out.length < count && t > session.earliest; t -= MINUTE) {
        if (open(t)) out.push(bar(market, t));
      }
      return out.reverse();
    },
    async future(_symbol, from, count) {
      const out: Candle[] = [];
      for (let t = Math.ceil(from / MINUTE) * MINUTE; out.length < count && t < Date.now(); t += MINUTE) {
        if (open(t)) out.push(bar(market, t));
      }
      return out;
    },
  };
}
