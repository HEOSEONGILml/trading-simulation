import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ miniapp: false }));
const sdk = vi.hoisted(() => ({ loaded: 0, log: vi.fn() }));

vi.mock('./env.ts', () => ({
  get MINIAPP() {
    return state.miniapp;
  },
  API_BASE: '',
}));

vi.mock('@apps-in-toss/web-framework', () => {
  sdk.loaded++;
  return { Analytics: { log: sdk.log } };
});

const { ALLOWED_PARAM_KEYS, logEvent, roundOutcome, sanitizeParams } = await import('./analytics.ts');

/** 동적 import 와 then 이 끝날 때까지 기다린다 */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  sdk.log.mockReset();
  sdk.log.mockResolvedValue(undefined);
});

describe('앱인토스 이벤트 기록 logEvent', () => {
  it('일반 웹(MINIAPP 거짓)에서는 SDK를 불러오지도 호출하지도 않는다', async () => {
    state.miniapp = false;
    logEvent('round_start', { leverage: 5 });
    logEvent('round_finish', { leverage: 5, outcome: 'profit', trade_count: 2 });
    await flush();
    expect(sdk.loaded).toBe(0);
    expect(sdk.log).not.toHaveBeenCalled();
  });

  it('미니앱에서는 기다리지 않고(반환값 없음) Analytics.log 를 event 타입으로 부른다', async () => {
    state.miniapp = true;
    const ret = logEvent('round_finish', { leverage: 10, outcome: 'liquidated', trade_count: 3 });
    expect(ret).toBeUndefined();
    await flush();
    expect(sdk.log).toHaveBeenCalledWith({
      log_name: 'round_finish',
      log_type: 'event',
      params: { leverage: 10, outcome: 'liquidated', trade_count: 3 },
    });
  });

  it('SDK 호출이 실패해도 예외가 밖으로 나오지 않는다', async () => {
    state.miniapp = true;
    sdk.log.mockRejectedValue(new Error('미지원'));
    expect(() => logEvent('round_start', { leverage: 1 })).not.toThrow();
    await flush();
    expect(sdk.log).toHaveBeenCalledTimes(1);
  });

  it('허용 목록 밖의 키(종목·가격·시각·회원·손익 금액)는 보내기 전에 버린다', async () => {
    state.miniapp = true;
    const leaky = { leverage: 2, outcome: 'loss', trade_count: 1, symbol: 'BTCUSDT', market: 'coin', price: 61234.5, time: 1700000000000, userId: 7, toss_key: 'x', realizedPnl: -12 };
    logEvent('round_finish', leaky as never);
    await flush();
    const params = sdk.log.mock.calls[0][0].params;
    expect(Object.keys(params).sort()).toEqual(['leverage', 'outcome', 'trade_count']);
    for (const key of Object.keys(params)) expect(ALLOWED_PARAM_KEYS).toContain(key);
  });

  it('sanitizeParams 는 숫자가 아닌 값(NaN·객체)을 버린다', () => {
    expect(sanitizeParams({ leverage: Number.NaN, outcome: { a: 1 }, trade_count: 4 })).toEqual({ trade_count: 4 });
  });
});

describe('roundOutcome', () => {
  it('청산 > 수익 > 손실 > 변동 없음 순으로 나눈다', () => {
    expect(roundOutcome({ startEquity: 100, endEquity: 150, liquidationCount: 1 })).toBe('liquidated');
    expect(roundOutcome({ startEquity: 100, endEquity: 101, liquidationCount: 0 })).toBe('profit');
    expect(roundOutcome({ startEquity: 100, endEquity: 99, liquidationCount: 0 })).toBe('loss');
    expect(roundOutcome({ startEquity: 100, endEquity: 100, liquidationCount: 0 })).toBe('flat');
  });
});
