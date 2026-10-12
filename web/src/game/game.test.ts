import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED_PARAM_KEYS, logEvent } from '../analytics.ts';
import { api } from '../api.ts';
import { Exchange } from '../engine/exchange.ts';
import { MINUTE, type Candle } from '../engine/types.ts';
import { Game } from './game.ts';

vi.mock('../api.ts', () => ({
  api: {
    activeRound: vi.fn(),
    createRound: vi.fn(),
    finishRound: vi.fn(),
    futureCandles: vi.fn(),
    saveRoundState: vi.fn(),
  },
}));

vi.mock('../analytics.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analytics.ts')>()),
  logEvent: vi.fn(),
}));

const mocked = vi.mocked(api);
const logged = vi.mocked(logEvent);
const START = 10 * MINUTE;
const candle = (i: number, price = 100): Candle => ({
  time: START + i * MINUTE,
  open: price,
  high: price + 1,
  low: price - 1,
  close: price,
  volume: 1,
});
const HISTORY = [candle(-2), candle(-1)];
const FUTURE = Array.from({ length: 8 }, (_, i) => candle(i, 100 + i));
const SETTINGS = { market: 'coin' as const, rangeStart: 0, rangeEnd: 1, historyMinutes: 60, hideDate: true, hidePrice: true };
const ROUND = { roundId: 'r1', market: 'coin' as const, pricePrecision: 1, startTime: START, history: HISTORY };

/** 진행 중이던 라운드: 3개 캔들이 지났고 롱 포지션 보유 */
function savedExchange() {
  const ex = new Exchange(100, START);
  ex.setLeverage(5);
  ex.marketOrder('buy', 1);
  for (const c of FUTURE.slice(0, 3)) ex.onCandle(c);
  return ex;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' });
  mocked.futureCandles.mockImplementation(async (_id, from, count) => ({
    candles: FUTURE.slice(from, from + count),
    ended: from + count >= FUTURE.length,
  }));
  mocked.saveRoundState.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Game 이어하기', () => {
  it('진행 중인 라운드가 없으면 새 라운드 설정으로 간다', async () => {
    mocked.activeRound.mockResolvedValue(null);
    const game = new Game(10, 20);
    expect(game.phase).toBe('resuming');
    await game.resume();
    expect(game.phase).toBe('setup');
  });

  it('저장된 시점의 차트와 거래소 상태로 일시정지 상태에서 이어받는다', async () => {
    const ex = savedExchange();
    mocked.activeRound.mockResolvedValue({
      ...ROUND,
      settings: SETTINGS,
      state: JSON.parse(JSON.stringify({ version: 1, exchange: ex.snapshot() })),
    });
    const game = new Game(10, 20);
    await game.resume();

    expect(game.phase).toBe('paused');
    expect(game.candles).toEqual([...HISTORY, ...FUTURE.slice(0, 3)]);
    expect(game.exchange!.snapshot()).toEqual(ex.snapshot());
    expect(game.settings).toEqual(SETTINGS);
    expect(game.round).toEqual(ROUND);
  });

  it('시작 전에 나간 라운드는 시작 전 상태로, 회원 레버리지로 이어받는다', async () => {
    mocked.activeRound.mockResolvedValue({ ...ROUND, settings: SETTINGS, state: null });
    const game = new Game(10, 7);
    await game.resume();
    expect(game.phase).toBe('ready');
    expect(game.candles).toEqual(HISTORY);
    expect(game.exchange!.leverage).toBe(7);
  });

  it('주문과 일시정지 때 진행 상태를 저장하고, 종료한 뒤에는 저장하지 않는다', async () => {
    vi.useFakeTimers();
    mocked.activeRound.mockResolvedValue({ ...ROUND, settings: SETTINGS, state: null });
    const game = new Game(10, 20);
    await game.resume();
    game.start();
    game.marketOrder('buy', 1, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(mocked.saveRoundState).toHaveBeenCalledTimes(1);
    const [roundId, state] = mocked.saveRoundState.mock.calls[0];
    expect(roundId).toBe('r1');
    expect(state).toMatchObject({ version: 1, exchange: { position: { side: 'long', qty: 1 } } });

    game.pause();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocked.saveRoundState).toHaveBeenCalledTimes(2);

    mocked.finishRound.mockResolvedValue({ saved: true, record: null as never });
    mocked.saveRoundState.mockClear();
    await game.finish();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocked.saveRoundState).not.toHaveBeenCalled();
  });
});

describe('Game 앱인토스 측정 이벤트', () => {
  const events = (name: string) => logged.mock.calls.filter(([n]) => n === name);

  it('round_start 는 서버가 라운드를 만든 뒤 1회만 남고, 일시정지·재개를 반복해도 늘지 않는다', async () => {
    vi.useFakeTimers();
    mocked.createRound.mockResolvedValue(ROUND);
    const game = new Game(10, 5);
    await game.createRound(SETTINGS);
    expect(events('round_start')).toEqual([['round_start', { leverage: 5 }]]);

    game.start();
    game.pause();
    game.start();
    game.togglePlay();
    game.togglePlay();
    expect(game.phase).toBe('running');
    expect(events('round_start')).toHaveLength(1);
  });

  it('라운드 생성이 실패하면 round_start 를 남기지 않는다', async () => {
    mocked.createRound.mockRejectedValue(new Error('서버 오류'));
    const game = new Game(10, 5);
    await game.createRound(SETTINGS);
    expect(logged).not.toHaveBeenCalled();
  });

  it('이어하기(resuming)로 불러온 라운드는 round_start 를 다시 남기지 않는다', async () => {
    const ex = savedExchange();
    mocked.activeRound.mockResolvedValue({ ...ROUND, settings: SETTINGS, state: JSON.parse(JSON.stringify({ version: 1, exchange: ex.snapshot() })) });
    const game = new Game(10, 20);
    await game.resume();
    game.start();
    game.pause();
    game.start();
    expect(events('round_start')).toHaveLength(0);
  });

  it('round_finish 는 서버 저장 성공(saved=true) 뒤 1회만 남는다', async () => {
    mocked.createRound.mockResolvedValue(ROUND);
    mocked.finishRound.mockResolvedValue({ saved: true, record: null as never });
    const game = new Game(10, 5);
    await game.createRound(SETTINGS);
    game.start();
    await game.finish();
    await game.finish(); // 이미 끝난 판은 다시 보내지 않는다
    expect(events('round_finish')).toEqual([['round_finish', { leverage: 5, outcome: 'flat', trade_count: 0 }]]);
  });

  it('저장되지 않았거나(saved=false) 저장 요청이 실패하면 round_finish 를 남기지 않는다', async () => {
    mocked.createRound.mockResolvedValue(ROUND);
    mocked.finishRound.mockResolvedValueOnce({ saved: false, record: null as never });
    const game = new Game(10, 5);
    await game.createRound(SETTINGS);
    await game.finish();
    expect(game.result?.saved).toBe(false);

    mocked.finishRound.mockRejectedValueOnce(new Error('네트워크 오류'));
    await game.createRound(SETTINGS);
    await game.finish();
    expect(game.result?.error).toBe('네트워크 오류');
    expect(events('round_finish')).toHaveLength(0);
  });

  it('보내는 params 키는 허용 목록 안에만 있고 시세·손익 금액·종목은 없다', async () => {
    mocked.createRound.mockResolvedValue(ROUND);
    mocked.finishRound.mockResolvedValue({ saved: true, record: null as never });
    const game = new Game(10, 5);
    await game.createRound(SETTINGS);
    game.start();
    game.marketOrder('buy', 1, {});
    game.closePosition();
    await game.finish();
    expect(logged.mock.calls.map(([n]) => n)).toEqual(['round_start', 'round_finish']);
    for (const [, params] of logged.mock.calls) {
      for (const key of Object.keys(params)) expect(ALLOWED_PARAM_KEYS).toContain(key);
      for (const value of Object.values(params)) expect(['string', 'number']).toContain(typeof value);
    }
    expect(events('round_finish')[0][1]).toMatchObject({ trade_count: 1, outcome: expect.stringMatching(/^(profit|loss|liquidated|flat)$/) });
  });
});
