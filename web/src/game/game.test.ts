import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const mocked = vi.mocked(api);
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
const SETTINGS = { rangeStart: 0, rangeEnd: 1, historyMinutes: 60, hideDate: true, hidePrice: true };
const ROUND = { roundId: 'r1', pricePrecision: 1, startTime: START, history: HISTORY };

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
