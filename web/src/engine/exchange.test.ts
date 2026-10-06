import { describe, expect, it } from 'vitest';
import { Exchange, INITIAL_BALANCE, MAKER_FEE, TAKER_FEE } from './exchange.ts';
import { MINUTE, type Candle } from './types.ts';

let t = 0;
function candle(open: number, high: number, low: number, close: number): Candle {
  t += MINUTE;
  return { time: t, open, high, low, close, volume: 1 };
}

function setup(price = 100, leverage = 10) {
  const ex = new Exchange(price, 0);
  ex.setLeverage(leverage);
  return ex;
}

describe('Exchange', () => {
  it('시장가 롱 진입 후 청산하면 손익과 수수료가 반영된다', () => {
    const ex = setup();
    ex.marketOrder('buy', 10);
    expect(ex.position?.margin).toBeCloseTo(100);
    expect(ex.balance).toBeCloseTo(INITIAL_BALANCE - 100 - 1000 * TAKER_FEE);
    ex.onCandle(candle(100, 111, 99, 110));
    expect(ex.unrealizedPnl()).toBeCloseTo(100);
    ex.closePosition();
    expect(ex.position).toBeNull();
    expect(ex.balance).toBeCloseTo(INITIAL_BALANCE + 100 - 1000 * TAKER_FEE - 1100 * TAKER_FEE);
    expect(ex.summary()).toMatchObject({ tradeCount: 1, winCount: 1 });
  });

  it('반대 방향 주문은 포지션을 줄이고 남는 수량으로 반대 포지션을 연다', () => {
    const ex = setup();
    ex.marketOrder('buy', 10);
    ex.marketOrder('sell', 15);
    expect(ex.position).toMatchObject({ side: 'short', qty: 5 });
    expect(ex.trades).toHaveLength(2);
    expect(ex.trades[0].closeTime).not.toBeNull();
  });

  it('격리 롱 청산가는 바이낸스 공식과 같다', () => {
    const ex = setup(100, 10);
    ex.marketOrder('buy', 10);
    // (Q*EP - M - cum) / (Q*(1-MMR)) = (1000 - 100) / (10 * 0.996)
    expect(ex.liquidationPrice()).toBeCloseTo(900 / 9.96);
  });

  it('캔들 저가가 청산가에 닿으면 증거금 전액을 잃는다', () => {
    const ex = setup(100, 10);
    ex.marketOrder('buy', 10);
    const before = ex.balance;
    const events = ex.onCandle(candle(100, 100, 90, 95));
    expect(events[0].reason).toBe('liquidation');
    expect(ex.position).toBeNull();
    expect(ex.balance).toBeCloseTo(before);
    expect(ex.summary().liquidationCount).toBe(1);
  });

  it('같은 캔들에서 손절과 익절이 모두 닿으면 손절이 우선한다', () => {
    const ex = setup();
    ex.marketOrder('buy', 10, { takeProfit: 105, stopLoss: 97 });
    const events = ex.onCandle(candle(100, 106, 96, 101));
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('stop_loss');
    expect(ex.fills[ex.fills.length - 1].price).toBe(97);
  });

  it('익절만 닿으면 익절가에 체결된다', () => {
    const ex = setup();
    ex.marketOrder('sell', 10, { takeProfit: 95, stopLoss: 103 });
    ex.onCandle(candle(100, 101, 94, 96));
    const fill = ex.fills[ex.fills.length - 1];
    expect(fill.reason).toBe('take_profit');
    expect(fill.price).toBe(95);
    expect(fill.realizedPnl).toBeCloseTo(50);
  });

  it('시가가 손절가를 넘어 갭이 생기면 시가에 체결된다', () => {
    const ex = setup();
    ex.marketOrder('buy', 10, { stopLoss: 97 });
    ex.onCandle(candle(96, 96.5, 95, 96));
    expect(ex.fills[ex.fills.length - 1]).toMatchObject({ reason: 'stop_loss', price: 96 });
  });

  it('지정가 주문은 증거금을 예약하고 닿으면 메이커 수수료로 체결된다', () => {
    const ex = setup();
    const order = ex.limitOrder('buy', 95, 10);
    expect('reserved' in order).toBe(true);
    expect(ex.balance).toBeCloseTo(INITIAL_BALANCE - 950 * (0.1 + MAKER_FEE));
    ex.onCandle(candle(100, 101, 96, 97));
    expect(ex.orders).toHaveLength(1);
    ex.onCandle(candle(97, 98, 94, 96));
    expect(ex.orders).toHaveLength(0);
    expect(ex.position).toMatchObject({ side: 'long', entryPrice: 95, qty: 10 });
    expect(ex.fills[0].fee).toBeCloseTo(950 * MAKER_FEE);
    expect(ex.equity()).toBeCloseTo(INITIAL_BALANCE - 950 * MAKER_FEE + 10);
  });

  it('주문 취소 시 예약 증거금이 돌아온다', () => {
    const ex = setup();
    const order = ex.limitOrder('sell', 110, 10);
    ex.cancelOrder(order.id);
    expect(ex.balance).toBeCloseTo(INITIAL_BALANCE);
  });

  it('현재가보다 유리한 지정가는 즉시 시장가로 체결된다', () => {
    const ex = setup();
    const result = ex.limitOrder('buy', 105, 1);
    expect('reason' in result && result.reason).toBe('market');
    expect(ex.position?.entryPrice).toBe(100);
  });

  it('같은 캔들에서 지정가로 진입한 포지션은 손절만 다시 확인한다', () => {
    const ex = setup();
    ex.limitOrder('buy', 98, 10, { stopLoss: 96, takeProfit: 99 });
    ex.onCandle(candle(100, 100, 95, 99.5));
    const reasons = ex.fills.map((f) => f.reason);
    expect(reasons).toEqual(['limit', 'stop_loss']);
  });

  it('잔고나 레버리지 한도를 넘는 주문은 거부된다', () => {
    const ex = setup(100, 1);
    expect(() => ex.marketOrder('buy', 200)).toThrow('잔고');
    const high = setup(100, 125);
    expect(() => high.marketOrder('buy', 600)).toThrow('최대 포지션');
    expect(high.maxOpenNotional('buy')).toBeCloseTo(50_000);
  });

  it('잘못된 손절/익절가는 거부된다', () => {
    const ex = setup();
    expect(() => ex.marketOrder('buy', 1, { stopLoss: 101 })).toThrow('손절');
    expect(() => ex.marketOrder('sell', 1, { takeProfit: 101 })).toThrow('익절');
  });

  it('포지션이 있으면 레버리지를 바꿀 수 없다', () => {
    const ex = setup();
    ex.marketOrder('buy', 1);
    expect(() => ex.setLeverage(20)).toThrow();
  });

  it('라운드 종료 시 주문을 취소하고 포지션을 시장가로 청산한다', () => {
    const ex = setup();
    ex.marketOrder('buy', 10);
    ex.limitOrder('buy', 90, 5);
    ex.onCandle(candle(100, 102, 99, 102));
    ex.finish();
    expect(ex.orders).toHaveLength(0);
    expect(ex.position).toBeNull();
    expect(ex.fills[ex.fills.length - 1].reason).toBe('round_end');
    expect(ex.equity()).toBeCloseTo(ex.balance);
    expect(ex.summary().endEquity).toBeCloseTo(INITIAL_BALANCE + 20 - 1000 * TAKER_FEE - 1020 * TAKER_FEE);
  });

  it('최대 낙폭을 기록한다', () => {
    const ex = setup(100, 10);
    ex.marketOrder('buy', 50);
    ex.onCandle(candle(100, 104, 100, 104));
    ex.onCandle(candle(104, 104, 98, 98));
    const peak = ex.peakEquity;
    expect(ex.maxDrawdownPct).toBeCloseTo(((peak - ex.equity()) / peak) * 100);
  });
});
