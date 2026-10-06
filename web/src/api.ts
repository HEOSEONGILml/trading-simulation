import type { Candle } from './engine/types.ts';

type RawCandle = [number, number, number, number, number, number];

const toCandle = (r: RawCandle): Candle => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] });

let unauthorizedHandler: (() => void) | null = null;

/** 세션이 만료되어 401을 받으면 호출된다 */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) unauthorizedHandler?.();
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body as T;
}

export interface User {
  id: string;
  username: string;
  nickname: string | null;
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
  rangeStart: number;
  rangeEnd: number;
  historyMinutes: number;
  hideDate: boolean;
  hidePrice: boolean;
}

export interface RoundStart {
  roundId: string;
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
  trades: unknown[];
}

export interface RoundRecord extends Omit<RoundResult, 'trades'> {
  id: string;
  playedAt: number;
  realStartTime: number;
  realEndTime: number;
  hideDate: boolean;
  hidePrice: boolean;
  returnPct: number;
  dateOffset: number;
  priceFactor: number;
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
}

const post = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  signUp: (username: string, password: string) => request<{ user: User }>('/api/auth/signup', post({ username, password })),
  logIn: (username: string, password: string) => request<{ user: User }>('/api/auth/login', post({ username, password })),
  logOut: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  setNickname: (nickname: string) => request<{ user: User }>('/api/auth/nickname', post({ nickname }, 'PUT')),
  ranking: (sort: RankingSort) =>
    request<{ sort: RankingSort; minRounds: number; entries: RankingEntry[] }>(`/api/ranking?sort=${sort}`),

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

  history: () => request<{ summary: HistorySummary; rounds: RoundRecord[] }>('/api/history'),

  deleteHistory: (id: string) => request<{ ok: true }>(`/api/history/${id}`, { method: 'DELETE' }),
};
