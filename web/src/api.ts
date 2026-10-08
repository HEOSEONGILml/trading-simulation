import type { Candle } from './engine/types.ts';
import { API_BASE, MINIAPP } from './env.ts';
import type { Market } from './market.ts';

type RawCandle = [number, number, number, number, number, number];

const toCandle = (r: RawCandle): Candle => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] });

let unauthorizedHandler: (() => void) | null = null;

/** 세션이 만료되어 401을 받으면 호출된다 */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

// 토스 미니앱은 쿠키 대신 Bearer 토큰을 쓴다 (iOS 웹뷰에서 서드파티 쿠키가 막힘)
const TOKEN_KEY = 'blindcandle.token';

function readToken(): string | null {
  try {
    return MINIAPP ? localStorage.getItem(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 저장소를 못 쓰면 이 실행 동안만 유지한다
  }
  memoryToken = token;
}

let memoryToken: string | null | undefined;
const currentToken = () => (memoryToken !== undefined ? memoryToken : readToken());

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  const token = currentToken();
  if (MINIAPP && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) unauthorizedHandler?.();
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body as T;
}

export interface User {
  id: string;
  username: string;
  nickname: string | null;
  /** 토스 익명 키로 만든 회원 (비밀번호 없음) */
  toss?: boolean;
}

export type RankingSort = 'compound' | 'average' | 'winrate';

export interface RankingEntry {
  rank: number;
  nickname: string;
  roundCount: number;
  compoundReturnPct: number;
  avgReturnPct: number;
  profitableRoundPct: number;
  tradeWinRatePct: number;
  bestReturnPct: number;
  isMe: boolean;
}

export interface RoundSettings {
  market: Market;
  rangeStart: number;
  rangeEnd: number;
  historyMinutes: number;
  hideDate: boolean;
  hidePrice: boolean;
}

export interface RoundStart {
  roundId: string;
  market: Market;
  pricePrecision: number;
  startTime: number;
  history: Candle[];
}

export interface RoundResult {
  candleCount: number;
  startEquity: number;
  endEquity: number;
  realizedPnl: number;
  fees: number;
  tradeCount: number;
  winCount: number;
  maxDrawdownPct: number;
  liquidationCount: number;
  profitMinutes: number;
  lossMinutes: number;
  trades: unknown[];
}

export interface RoundRecord extends Omit<RoundResult, 'trades' | 'profitMinutes' | 'lossMinutes'> {
  /** 집계 기능 이전의 기록은 null */
  profitMinutes: number | null;
  lossMinutes: number | null;
  id: string;
  playedAt: number;
  realStartTime: number;
  realEndTime: number;
  hideDate: boolean;
  hidePrice: boolean;
  returnPct: number;
  dateOffset: number;
  priceFactor: number;
  market: Market;
  symbol: string;
  /** 라운드를 끝낸 직후 응답에만 있다 */
  symbolName?: string;
}

export interface HistorySummary {
  roundCount: number;
  profitableRounds: number;
  avgReturnPct: number;
  compoundReturnPct: number;
  bestReturnPct: number;
  worstReturnPct: number;
  avgMaxDrawdownPct: number;
  tradeCount: number;
  winCount: number;
  tradeWinRatePct: number;
  totalFees: number;
  liquidationCount: number;
  totalMinutes: number;
  totalProfitMinutes: number;
  totalLossMinutes: number;
}

const post = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  /** 지금 라운드를 열 수 있는 시장 */
  markets: () => request<{ markets: Market[] }>('/api/markets'),
  signUp: (username: string, password: string) => request<{ user: User }>('/api/auth/signup', post({ username, password })),
  logIn: (username: string, password: string) => request<{ user: User }>('/api/auth/login', post({ username, password })),
  /** 토스 미니앱: 익명 사용자 키로 회원 자동 생성·로그인 */
  async tossLogin(anonymousKey: string) {
    const res = await request<{ user: User; token: string }>('/api/auth/toss', post({ anonymousKey }));
    setToken(res.token);
    return res.user;
  },
  async logOut() {
    const res = await request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
    setToken(null);
    return res;
  },
  deleteAccount: (password: string) => request<{ ok: true }>('/api/auth/account', post({ password }, 'DELETE')),
  setNickname: (nickname: string) => request<{ user: User }>('/api/auth/nickname', post({ nickname }, 'PUT')),
  ranking: (sort: RankingSort, market: Market) =>
    request<{ sort: RankingSort; minRounds: number; entries: RankingEntry[] }>(`/api/ranking?sort=${sort}&market=${market}`),

  async createRound(settings: RoundSettings): Promise<RoundStart> {
    const res = await request<Omit<RoundStart, 'history'> & { history: RawCandle[] }>('/api/rounds', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    return { ...res, history: res.history.map(toCandle) };
  },

  async futureCandles(roundId: string, from: number, count: number) {
    const res = await request<{ candles: RawCandle[]; ended: boolean }>(
      `/api/rounds/${roundId}/candles?from=${from}&count=${count}`,
    );
    return { candles: res.candles.map(toCandle), ended: res.ended };
  },

  finishRound: (roundId: string, result: RoundResult) =>
    request<{ saved: boolean; record: RoundRecord }>(`/api/rounds/${roundId}/finish`, {
      method: 'POST',
      body: JSON.stringify(result),
    }),

  /** 이전 세션에서 끝내지 않은 라운드 (state는 마지막으로 저장한 진행 상태) */
  async activeRound(): Promise<(RoundStart & { settings: RoundSettings; state: unknown }) | null> {
    const res = await request<{
      round: (Omit<RoundStart, 'history'> & { history: RawCandle[]; settings: RoundSettings; state: unknown }) | null;
    }>('/api/rounds/active');
    return res.round && { ...res.round, history: res.round.history.map(toCandle) };
  },

  /** keepalive는 페이지를 떠나는 중에도 요청을 끝까지 보낸다 (본문 64KB 제한) */
  saveRoundState(roundId: string, state: unknown, keepalive = false) {
    const body = JSON.stringify({ state });
    return request<{ ok: true }>(`/api/rounds/${roundId}/state`, {
      method: 'PUT',
      body,
      keepalive: keepalive && body.length < 60_000,
    });
  },

  settings: () => request<{ settings: unknown }>('/api/settings'),
  saveSettings: (settings: unknown) => request<{ ok: true }>('/api/settings', post({ settings }, 'PUT')),

  history: (market: Market) => request<{ summary: HistorySummary; rounds: RoundRecord[] }>(`/api/history?market=${market}`),

  deleteHistory: (id: string) => request<{ ok: true }>(`/api/history/${id}`, { method: 'DELETE' }),
};
