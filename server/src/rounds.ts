// 진행 중인 라운드(메모리 보관). 실제 시점과 가격은 라운드가 끝날 때까지 클라이언트에 보내지 않는다.

import { randomUUID } from 'node:crypto';
import { EARLIEST_TIME, MINUTE, fetchCandles, type Candle } from './binance.ts';
import { createDisguise, randomInt, type Disguise } from './disguise.ts';

export interface RoundSettings {
  rangeStart: number;
  rangeEnd: number;
  historyMinutes: number;
  hideDate: boolean;
  hidePrice: boolean;
}

interface Round {
  id: string;
  userId: string;
  settings: RoundSettings;
  realStartTime: number;
  disguise: Disguise;
  future: Candle[];
  futureEnded: boolean;
  fetching: Promise<void> | null;
  lastAccess: number;
}

const FUTURE_CHUNK = 1000;
const ROUND_TTL = 24 * 60 * MINUTE;
const MAX_HISTORY_MINUTES = 60 * 24 * 30;

const rounds = new Map<string, Round>();

export class RoundError extends Error {}

function disguiseCandle(c: Candle, d: Disguise): Candle {
  const f = d.priceFactor;
  return [c[0] + d.dateOffset, c[1] * f, c[2] * f, c[3] * f, c[4] * f, c[5]];
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, round] of rounds) {
    if (now - round.lastAccess > ROUND_TTL) rounds.delete(id);
  }
}

export async function createRound(userId: string, settings: RoundSettings) {
  purgeExpired();
  const historyMinutes = Math.floor(settings.historyMinutes);
  if (!(historyMinutes >= 60 && historyMinutes <= MAX_HISTORY_MINUTES)) {
    throw new RoundError(`과거 구간 길이는 60분 ~ ${MAX_HISTORY_MINUTES}분이어야 합니다.`);
  }
  // 시작 시점 이후 최소 하루치 데이터가 있어야 한다
  const latest = Date.now() - 24 * 60 * MINUTE;
  const earliest = EARLIEST_TIME + historyMinutes * MINUTE;
  const from = Math.max(settings.rangeStart, earliest);
  const to = Math.min(settings.rangeEnd, latest);
  if (!(from < to)) throw new RoundError('시작 시점을 뽑을 수 있는 범위가 없습니다. 기간을 넓혀주세요.');

  const realStartTime = Math.floor(randomInt(from, to) / MINUTE) * MINUTE;
  const history = await fetchCandles(realStartTime - historyMinutes * MINUTE, historyMinutes, realStartTime - 1);
  if (history.length === 0) throw new RoundError('과거 데이터를 가져오지 못했습니다.');

  const lastClose = history[history.length - 1][4];
  const disguise = createDisguise(realStartTime, lastClose, settings.hideDate, settings.hidePrice);
  const round: Round = {
    id: randomUUID(),
    userId,
    settings,
    realStartTime,
    disguise,
    future: [],
    futureEnded: false,
    fetching: null,
    lastAccess: Date.now(),
  };
  rounds.set(round.id, round);
  void ensureFuture(round, FUTURE_CHUNK).catch(() => {});

  return {
    roundId: round.id,
    pricePrecision: disguise.pricePrecision,
    startTime: realStartTime + disguise.dateOffset,
    history: history.map((c) => disguiseCandle(c, disguise)),
  };
}

function getRound(userId: string, id: string): Round {
  const round = rounds.get(id);
  if (!round || round.userId !== userId) throw new RoundError('라운드를 찾을 수 없습니다. 새 라운드를 시작해주세요.');
  round.lastAccess = Date.now();
  return round;
}

async function ensureFuture(round: Round, needed: number) {
  while (round.future.length < needed && !round.futureEnded) {
    if (!round.fetching) {
      const last = round.future[round.future.length - 1];
      const start = last ? last[0] + MINUTE : round.realStartTime;
      round.fetching = fetchCandles(start, FUTURE_CHUNK)
        .then((candles) => {
          round.future.push(...candles);
          if (candles.length < FUTURE_CHUNK) round.futureEnded = true;
        })
        .finally(() => {
          round.fetching = null;
        });
    }
    await round.fetching;
  }
}

/** 라운드 시작 이후의 from번째부터 count개의 1분봉 */
export async function getFutureCandles(userId: string, id: string, from: number, count: number) {
  const round = getRound(userId, id);
  await ensureFuture(round, from + count);
  const candles = round.future.slice(from, from + count).map((c) => disguiseCandle(c, round.disguise));
  const ended = round.futureEnded && from + count >= round.future.length;
  return { candles, ended };
}

/** 라운드를 끝내고 실제 시점과 가격 변환 정보를 공개한다 */
export function finishRound(userId: string, id: string) {
  const round = getRound(userId, id);
  rounds.delete(id);
  return {
    settings: round.settings,
    realStartTime: round.realStartTime,
    dateOffset: round.disguise.dateOffset,
    priceFactor: round.disguise.priceFactor,
  };
}
