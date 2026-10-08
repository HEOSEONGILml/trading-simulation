// 진행 중인 라운드. DB에 저장해 세션을 나갔다가 돌아와도 이어서 할 수 있고, 미래 캔들은 메모리에 캐시한다.
// 실제 시점, 가격, 종목은 라운드가 끝날 때까지 클라이언트에 보내지 않는다.

import { randomUUID } from 'node:crypto';
import { MINUTE, type Candle } from './binance.ts';
import type { ActiveRound, Store } from './db.ts';
import { createDisguise, randomInt, type Disguise } from './disguise.ts';
import { COIN_SYMBOL } from './markets/coin.ts';
import { STOCKS } from './markets/symbols.ts';
import { MARKETS, PRICE_STYLE, type Market, type MarketSource } from './markets/types.ts';

export interface RoundSettings {
  market: Market;
  rangeStart: number;
  rangeEnd: number;
  /** 시작 전에 보여줄 봉 개수 (주식은 정규장 봉만 센다) */
  historyMinutes: number;
  hideDate: boolean;
  hidePrice: boolean;
}

interface Round {
  id: string;
  userId: string;
  settings: RoundSettings;
  symbol: string;
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
/** 시작 이후 최소 이만큼은 데이터가 있어야 한다 (주식은 주말, 휴장 포함 여유) */
const MIN_FUTURE_SPAN: Record<Market, number> = { coin: 24 * 60 * MINUTE, kr: 5 * 24 * 60 * MINUTE, us: 5 * 24 * 60 * MINUTE };
/** 주식은 고른 시점이 휴장이거나 과거 봉이 모자라면 다시 뽑는다 */
const MAX_PICK_TRIES = 6;

export class RoundError extends Error {}

function disguiseCandle(c: Candle, d: Disguise): Candle {
  const f = d.priceFactor;
  return [c[0] + d.dateOffset, c[1] * f, c[2] * f, c[3] * f, c[4] * f, c[5]];
}

export function symbolName(market: Market, symbol: string) {
  return market === 'coin' ? 'BTCUSDT 무기한' : (STOCKS[market][symbol] ?? symbol);
}

export class Rounds {
  private store: Store;
  private sources: Partial<Record<Market, MarketSource>>;
  private cache = new Map<string, Round>();

  /** sources 에 없는 시장은 라운드를 만들 수 없다 (예: 토스 허락 전의 주식) */
  constructor(store: Store, sources: Partial<Record<Market, MarketSource>>) {
    this.store = store;
    this.sources = sources;
  }

  markets(): Market[] {
    return MARKETS.filter((m) => this.sources[m]);
  }

  async create(userId: string, input: RoundSettings) {
    this.purgeCache();
    const market = input.market ?? 'coin';
    const source = this.sources[market];
    if (!source) throw new RoundError('아직 준비 중인 시장입니다.');
    const historyMinutes = Math.floor(input.historyMinutes);
    if (!(historyMinutes >= 60 && historyMinutes <= MAX_HISTORY_MINUTES)) {
      throw new RoundError(`과거 구간 길이는 60분 ~ ${MAX_HISTORY_MINUTES}분이어야 합니다.`);
    }
    const settings: RoundSettings = { ...input, market, historyMinutes };
    const latest = Date.now() - MIN_FUTURE_SPAN[market];
    // 코인은 24시간 연속이라 과거 구간만큼 뒤에서 시작하면 된다. 주식은 과거 봉 수를 받아 보고 판단한다
    const earliest = source.earliest + (market === 'coin' ? historyMinutes * MINUTE : 0);
    const from = Math.max(settings.rangeStart, earliest);
    const to = Math.min(settings.rangeEnd, latest);
    if (!(from < to)) throw new RoundError('시작 시점을 뽑을 수 있는 범위가 없습니다. 기간을 넓혀주세요.');

    for (let attempt = 0; attempt < MAX_PICK_TRIES; attempt++) {
      const symbol = market === 'coin' ? COIN_SYMBOL : pick(Object.keys(STOCKS[market]));
      const picked = Math.floor(randomInt(from, to) / MINUTE) * MINUTE;
      const history = await source.history(symbol, picked, historyMinutes);
      if (history.length < Math.min(historyMinutes, 60) || (market !== 'coin' && history.length < historyMinutes * 0.9)) continue;
      // 주식은 고른 시각이 장 밖일 수 있으므로 마지막 과거 봉 바로 다음을 시작 시각으로 삼는다
      const realStartTime = market === 'coin' ? picked : history[history.length - 1][0] + MINUTE;
      const disguise = createDisguise(realStartTime, history[history.length - 1][4], settings.hideDate, settings.hidePrice, PRICE_STYLE[market]);
      const saved: ActiveRound = {
        id: randomUUID(),
        userId,
        settings,
        symbol,
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
    throw new RoundError('과거 데이터를 가져오지 못했습니다. 다시 시도해주세요.');
  }

  /** 회원의 진행 중인 라운드를 저장된 진행 상태와 함께 다시 불러온다 */
  async resume(userId: string) {
    const saved = this.store.getActiveRound(userId);
    if (!saved) return null;
    const round = this.cache.get(saved.id) ?? this.cacheRound(saved);
    round.lastAccess = Date.now();
    const history = await this.source(round).history(round.symbol, round.realStartTime, round.settings.historyMinutes);
    if (history.length === 0) throw new RoundError('과거 데이터를 가져오지 못했습니다.');
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

  /** 라운드를 끝내고 실제 시점, 가격 변환 정보, 종목을 공개한다. candleCount 는 진행한 봉 수 */
  finish(userId: string, id: string, candleCount: number) {
    const round = this.get(userId, id);
    // 주식은 장 마감과 주말로 봉 사이가 비므로 실제 마지막 봉 시각으로 끝 시각을 정한다
    const last = round.future[Math.min(candleCount, round.future.length) - 1];
    const realEndTime = last ? last[0] + MINUTE : round.realStartTime + Math.max(0, candleCount) * MINUTE;
    this.cache.delete(id);
    this.store.deleteActiveRound(userId, id);
    return {
      settings: round.settings,
      market: round.settings.market,
      symbol: round.symbol,
      symbolName: symbolName(round.settings.market, round.symbol),
      realStartTime: round.realStartTime,
      realEndTime,
      dateOffset: round.disguise.dateOffset,
      priceFactor: round.disguise.priceFactor,
    };
  }

  // ---------- 내부 ----------

  private source(round: Round) {
    const source = this.sources[round.settings.market];
    if (!source) throw new RoundError('아직 준비 중인 시장입니다.');
    return source;
  }

  private startInfo(round: Round, history: Candle[]) {
    void this.ensureFuture(round, FUTURE_CHUNK).catch(() => {});
    return {
      roundId: round.id,
      market: round.settings.market,
      currency: PRICE_STYLE[round.settings.market].currency,
      pricePrecision: round.disguise.pricePrecision,
      startTime: round.realStartTime + round.disguise.dateOffset,
      history: history.map((c) => disguiseCandle(c, round.disguise)),
    };
  }

  private cacheRound(saved: ActiveRound): Round {
    const round: Round = {
      id: saved.id,
      userId: saved.userId,
      settings: { ...saved.settings, market: saved.settings.market ?? 'coin' },
      symbol: saved.symbol,
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
    const source = this.source(round);
    while (round.future.length < needed && !round.futureEnded) {
      if (!round.fetching) {
        const last = round.future[round.future.length - 1];
        const start = last ? last[0] + MINUTE : round.realStartTime;
        round.fetching = source
          .future(round.symbol, start, FUTURE_CHUNK)
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

function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}
