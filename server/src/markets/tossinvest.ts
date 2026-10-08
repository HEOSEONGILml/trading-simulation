// 주식(한국, 미국): 토스증권 Open API 1분봉 (https://developers.tossinvest.com)
// - 데이터 이용 정책상 제3자 제공은 토스의 허락이 필요하다. 허락 전에는 STOCKS_ENABLED 를 켜지 않는다 (PLAN.md 6장)
// - 응답은 최신순이고 timestamp 는 봉 "종료" 시각이다. 여기서 시작 시각 기준, 오래된 순으로 바꾼다
// - 과거 방향(before)으로만 페이지를 넘길 수 있어서, 미래 봉은 하루 단위 구간을 뒤에서부터 채운다
// - 정규장 봉만 쓴다 (프리마켓, 애프터마켓 제외)

import { MINUTE, type Candle } from '../binance.ts';
import type { MarketSource } from './types.ts';

const API = 'https://openapi.tossinvest.com';
const PAGE = 200;
const DAY = 24 * 60 * MINUTE;
/** 한 번에 넘어갈 수 있는 최대 페이지와 날짜 (연휴 등으로 봉이 없을 때의 안전장치) */
const MAX_PAGES = 80;
const MAX_EMPTY_DAYS = 14;

export interface TossCredentials {
  clientId: string;
  clientSecret: string;
}

type RawCandle = { timestamp: string; openPrice: string; highPrice: string; lowPrice: string; closePrice: string; volume: string };

export class TossInvestClient {
  private token: { value: string; expiresAt: number } | null = null;
  private credentials: TossCredentials;
  private fetchImpl: typeof fetch;

  constructor(credentials: TossCredentials, fetchImpl: typeof fetch = fetch) {
    this.credentials = credentials;
    this.fetchImpl = fetchImpl;
  }

  private async accessToken() {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const res = await this.fetchImpl(`${API}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
      }),
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !json.access_token) throw new Error(`토스증권 토큰 발급 실패: ${json.error ?? res.status}`);
    this.token = { value: json.access_token, expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000 };
    return this.token.value;
  }

  /** before(포함, 봉 종료 시각 기준) 이전의 1분봉 한 페이지. 최신순 */
  async candlePage(symbol: string, before: number): Promise<{ candles: RawCandle[]; nextBefore: string | null }> {
    const params = new URLSearchParams({ symbol, interval: '1m', count: String(PAGE), before: new Date(before).toISOString() });
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.fetchImpl(`${API}/api/v1/candles?${params}`, {
        headers: { authorization: `Bearer ${await this.accessToken()}` },
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 1) * 1000));
        continue;
      }
      if (res.status === 401) this.token = null;
      const json = (await res.json()) as { result?: { candles: RawCandle[]; nextBefore: string | null }; error?: { code: string } };
      if (!res.ok || !json.result) throw new Error(`토스증권 캔들 조회 실패: ${json.error?.code ?? res.status}`);
      return json.result;
    }
    throw new Error('토스증권 캔들 조회 실패: 요청 한도 초과');
  }
}

function toCandle(r: RawCandle): Candle {
  return [Date.parse(r.timestamp) - MINUTE, Number(r.openPrice), Number(r.highPrice), Number(r.lowPrice), Number(r.closePrice), Number(r.volume)];
}

/** 현지 시각의 하루 중 분 (0~1439) */
function localMinute(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return get('hour') * 60 + get('minute');
}

export interface Session {
  timeZone: string;
  /** 정규장 시작, 종료 (현지 시각, 하루 중 분). 봉 시작 시각이 [open, close) 이면 정규장 봉 */
  open: number;
  close: number;
  /** 1분봉 제공 시작 (토스증권 FAQ) */
  earliest: number;
}

export const SESSIONS: Record<'kr' | 'us', Session> = {
  kr: { timeZone: 'Asia/Seoul', open: 9 * 60, close: 15 * 60 + 30, earliest: Date.parse('2022-11-23T00:00:00+09:00') },
  us: { timeZone: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60, earliest: Date.parse('2021-12-01T00:00:00-05:00') },
};

export function inSession(time: number, s: Session) {
  const m = localMinute(time, s.timeZone);
  return m >= s.open && m < s.close;
}

export function tossSource(market: 'kr' | 'us', client: TossInvestClient): MarketSource {
  const session = SESSIONS[market];

  /** end(제외, 봉 시작 시각 기준) 이전의 정규장 봉을 뒤에서부터 모은다. stop 이 true 를 돌려주면 멈춘다 */
  async function collectBackward(symbol: string, end: number, stop: (oldest: number, collected: number) => boolean) {
    const out: Candle[] = [];
    let before: number | null = end; // 봉 종료 시각 <= end 이면 봉 시작 시각 < end
    // 문서 예시의 nextBefore 는 받은 가장 오래된 봉과 같은 시각이라(before 는 포함) 이미 받은 봉은 건너뛴다
    let seenUntil = Infinity;
    for (let page = 0; page < MAX_PAGES && before !== null; page++) {
      const { candles, nextBefore } = await client.candlePage(symbol, before);
      const fresh = candles.map(toCandle).filter((c) => c[0] < seenUntil);
      for (const c of fresh) {
        if (c[0] < end && inSession(c[0], session)) out.push(c);
      }
      if (!fresh.length) break;
      const oldest = fresh[fresh.length - 1][0];
      seenUntil = oldest;
      if (stop(oldest, out.length)) break;
      before = nextBefore ? Date.parse(nextBefore) : null;
    }
    return out.reverse();
  }

  return {
    market,
    earliest: session.earliest,

    async history(symbol, before, count) {
      const out = await collectBackward(symbol, before, (oldest, n) => n >= count || oldest < session.earliest);
      return out.slice(-count);
    },

    async future(symbol, from, count) {
      const out: Candle[] = [];
      let cursor = from;
      let emptyDays = 0;
      while (out.length < count && cursor < Date.now() && emptyDays < MAX_EMPTY_DAYS) {
        const windowEnd = Math.min(cursor + DAY, Date.now());
        const day = (await collectBackward(symbol, windowEnd, (oldest) => oldest < cursor)).filter((c) => c[0] >= cursor);
        out.push(...day);
        emptyDays = day.length ? 0 : emptyDays + 1;
        cursor = windowEnd;
      }
      return out.slice(0, count);
    },
  };
}
