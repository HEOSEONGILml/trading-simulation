// 차트 퀴즈 만들기: 무작위 과거 시점의 15분봉을 가리고, 일정 시간 뒤 가격 방향을 정답으로 둔다

import { EARLIEST_TIME, MINUTE, fetchCandles, type Candle } from '../binance.ts';
import { createDisguise, randomInt } from '../disguise.ts';
import { quizPng } from './chart.ts';

const BAR = 15 * MINUTE;
const HISTORY_BARS = 96; // 24시간
const FUTURE_BARS = 16; // 4시간
/** 너무 작은 움직임은 정답이 애매해서 다시 고른다 */
const MIN_MOVE_PCT = 0.5;
const MAX_TRIES = 10;

export interface Quiz {
  number: number;
  png: Buffer;
  /** 마지막으로 보여준 봉의 실제 마감 시각 */
  realTime: number;
  realPrice: number;
  realFuturePrice: number;
  changePct: number;
}

function kstDateTime(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function usd(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export const HORIZON_LABEL = '4시간 뒤';

export async function makeQuiz(number: number): Promise<Quiz> {
  const latestStart = Date.now() - 2 * 24 * 60 * MINUTE - (HISTORY_BARS + FUTURE_BARS) * BAR;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const start = Math.floor(randomInt(EARLIEST_TIME, latestStart) / BAR) * BAR;
    const candles = await fetchCandles(start, HISTORY_BARS + FUTURE_BARS, undefined, '15m');
    if (candles.length < HISTORY_BARS + FUTURE_BARS) continue;
    const shown = candles.slice(0, HISTORY_BARS);
    const realPrice = shown[shown.length - 1][4];
    const realFuturePrice = candles[candles.length - 1][4];
    const changePct = ((realFuturePrice - realPrice) / realPrice) * 100;
    if (Math.abs(changePct) < MIN_MOVE_PCT) continue;

    const disguise = createDisguise(start, shown[0][1], true, true);
    const f = disguise.priceFactor;
    const fake: Candle[] = shown.map((c) => [c[0] + disguise.dateOffset, c[1] * f, c[2] * f, c[3] * f, c[4] * f, c[5]]);
    const png = quizPng({
      number,
      candles: fake,
      futureBars: FUTURE_BARS,
      pricePrecision: fake[fake.length - 1][4] >= 1000 ? 0 : 1,
      intervalLabel: '15분봉',
      horizonLabel: HORIZON_LABEL,
    });
    return { number, png, realTime: shown[shown.length - 1][0] + BAR, realPrice, realFuturePrice, changePct };
  }
  throw new Error('조건에 맞는 퀴즈 구간을 찾지 못했습니다.');
}

/** 정답 한 줄. 스레드에서는 이 부분만 가림 처리한다 */
export function answerText(q: Quiz) {
  const dir = q.changePct >= 0 ? '▲ 상승' : '▼ 하락';
  const sign = q.changePct >= 0 ? '+' : '';
  return `${dir} ${sign}${q.changePct.toFixed(2)}% (실제 ${kstDateTime(q.realTime)} KST, ${usd(q.realPrice)} → ${usd(q.realFuturePrice)} USDT)`;
}

export function threadsText(q: Quiz) {
  const head =
    `BlindCandle 차트 퀴즈 #${q.number}\n\n` +
    `날짜와 가격을 가린 실제 BTC 선물 15분봉입니다.\n` +
    `마지막 캔들에서 ${HORIZON_LABEL}, 가격은 올랐을까요 내렸을까요?\n` +
    `▲ 상승 / ▼ 하락 댓글로 골라 보세요.\n\n` +
    `정답: `;
  const answer = answerText(q);
  const tail = `\n\n가린 차트로 직접 매매 연습: blindcandle.com`;
  return { text: head + answer + tail, spoiler: { offset: head.length, length: answer.length } };
}

/** X는 한글이 2자로 계산되어 280자 한도가 빠듯하므로 짧게 쓴다. 링크 글은 API 요금이 비싸서 링크는 프로필에만 둔다 */
export function xTexts(q: Quiz) {
  return {
    post:
      `BlindCandle 차트 퀴즈 #${q.number}\n` +
      `날짜와 가격을 가린 실제 BTC 선물 15분봉.\n` +
      `${HORIZON_LABEL} 가격은? ▲ 상승 / ▼ 하락\n` +
      `정답은 답글에`,
    reply: `정답: ${answerText(q)}`,
  };
}
