// 진행 중인 라운드. DB에 저장해 세션을 나갔다가 돌아와도 이어서 할 수 있고, 미래 캔들은 메모리에 캐시한다.
// 실제 시점과 가격은 라운드가 끝날 때까지 클라이언트에 보내지 않는다.

import { randomUUID } from 'node:crypto';
import { EARLIEST_TIME, MINUTE, fetchCandles, type Candle } from './binance.ts';
import type { ActiveRound, Store } from './db.ts';
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
const CACHE_TTL = 60 * MINUTE;
const MAX_HISTORY_MINUTES = 60 * 24 * 30;
/** 저장할 진행 상태의 최대 크기 (JSON 문자 수) */
const MAX_STATE_LENGTH = 5_000_000;

export class RoundError extends Error {}

function disguiseCandle(c: Candle, d: Disguise): Candle {
  const f = d.priceFactor;
  return [c[0] + d.dateOffset, c[1] * f, c[2] * f, c[3] * f, c[4] * f, c[5]];
}

export class Rounds {
  private store: Store;
  private cache = new Map<string, Round>();

  constructor(store: Store) {
    this.store = store;
  }

  async create(userId: string, settings: RoundSettings) {
    this.purgeCache();
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
    const history = await this.fetchHistory(realStartTime, historyMinutes);
    const lastClose = history[history.length - 1][4];
    const disguise = createDisguise(realStartTime, lastClose, settings.hideDate, settings.hidePrice);
    const saved: ActiveRound = {
      id: randomUUID(),
      userId,
      settings: { ...settings, historyMinutes },
      realStartTime,
      ...disguise,
      createdAt: Date.now(),
      state: null,
    };
    this.store.saveActiveRound(saved);
    for (const [id, round] of this.cache) {
      if (round.userId === userId) this.cache.delete(id);
    }
    return this.startInfo(this.cacheRound(saved), history);
  }

  /** 회원의 진행 중인 라운드를 저장된 진행 상태와 함께 다시 불러온다 */
  async resume(userId: string) {
    const saved = this.store.getActiveRound(userId);
    if (!saved) return null;
    const round = this.cache.get(saved.id) ?? this.cacheRound(saved);
    round.lastAccess = Date.now();
    const history = await this.fetchHistory(round.realStartTime, round.settings.historyMinutes);
    return { ...this.startInfo(round, history), settings: round.settings, state: saved.state };
  }

  saveState(userId: string, id: string, state: unknown) {
    if (state === null || typeof state !== 'object') throw new RoundError('진행 상태가 올바르지 않습니다.');
    if (JSON.stringify(state).length > MAX_STATE_LENGTH) throw new RoundError('진행 상태가 너무 큽니다.');
    if (!this.store.saveRoundState(userId, id, state)) throw new RoundError('라운드를 찾을 수 없습니다.');
  }

  /** 라운드 시작 이후의 from번째부터 count개의 1분봉 */
  async futureCandles(userId: string, id: string, from: number, count: number) {
    const round = this.get(userId, id);
    await this.ensureFuture(round, from + count);
    const candles = round.future.slice(from, from + count).map((c) => disguiseCandle(c, round.disguise));
    const ended = round.futureEnded && from + count >= round.future.length;
    return { candles, ended };
  }

  /** 라운드를 끝내고 실제 시점과 가격 변환 정보를 공개한다 */
  finish(userId: string, id: string) {
    const round = this.get(userId, id);
    this.cache.delete(id);
    this.store.deleteActiveRound(userId, id);
    return {
      settings: round.settings,
      realStartTime: round.realStartTime,
      dateOffset: round.disguise.dateOffset,
      priceFactor: round.disguise.priceFactor,
    };
  }

  // ---------- 내부 ----------

  private async fetchHistory(realStartTime: number, historyMinutes: number) {
    const history = await fetchCandles(realStartTime - historyMinutes * MINUTE, historyMinutes, realStartTime - 1);
    if (history.length === 0) throw new RoundError('과거 데이터를 가져오지 못했습니다.');
    return history;
  }

  private startInfo(round: Round, history: Candle[]) {
    void this.ensureFuture(round, FUTURE_CHUNK).catch(() => {});
    return {
      roundId: round.id,
      pricePrecision: round.disguise.pricePrecision,
      startTime: round.realStartTime + round.disguise.dateOffset,
      history: history.map((c) => disguiseCandle(c, round.disguise)),
    };
  }

  private cacheRound(saved: ActiveRound): Round {
    const round: Round = {
      id: saved.id,
      userId: saved.userId,
      settings: saved.settings,
      realStartTime: saved.realStartTime,
      disguise: { dateOffset: saved.dateOffset, priceFactor: saved.priceFactor, pricePrecision: saved.pricePrecision },
      future: [],
      futureEnded: false,
      fetching: null,
      lastAccess: Date.now(),
    };
    this.cache.set(round.id, round);
    return round;
  }

  /** 메모리에 없으면(서버 재시작, 캐시 만료) DB에서 다시 불러온다 */
  private get(userId: string, id: string): Round {
    let round = this.cache.get(id);
    if (!round) {
      const saved = this.store.getActiveRound(userId, id);
      if (saved) round = this.cacheRound(saved);
    }
    if (!round || round.userId !== userId) throw new RoundError('라운드를 찾을 수 없습니다. 새 라운드를 시작해주세요.');
    round.lastAccess = Date.now();
    return round;
  }

  private purgeCache() {
    const now = Date.now();
    for (const [id, round] of this.cache) {
      if (now - round.lastAccess > CACHE_TTL) this.cache.delete(id);
    }
  }

  private async ensureFuture(round: Round, needed: number) {
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
}
