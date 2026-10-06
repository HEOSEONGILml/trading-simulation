// 모의 선물 거래소: 격리 증거금, 단방향 포지션, 시장가/지정가, 손절/익절, 강제 청산

import { bracketFor, maxNotionalFor, MAX_LEVERAGE } from './brackets.ts';
import {
  MINUTE,
  type Candle,
  type ExchangeEvent,
  type Fill,
  type FillReason,
  type Order,
  type OrderSide,
  type Position,
  type PositionSide,
  type Trade,
} from './types.ts';

export const INITIAL_BALANCE = 10_000;
export const TAKER_FEE = 0.0005;
export const MAKER_FEE = 0.0002;
const EPSILON = 1e-9;

export class ExchangeError extends Error {}

export interface OrderOptions {
  reduceOnly?: boolean;
  takeProfit?: number | null;
  stopLoss?: number | null;
}

const sideOf = (orderSide: OrderSide): PositionSide => (orderSide === 'buy' ? 'long' : 'short');
const dirOf = (side: PositionSide) => (side === 'long' ? 1 : -1);

export const REASON_LABEL: Record<FillReason, string> = {
  market: '시장가',
  limit: '지정가',
  take_profit: '익절',
  stop_loss: '손절',
  liquidation: '강제 청산',
  round_end: '라운드 종료',
};

export class Exchange {
  /** 주문 가능 잔고 (격리 증거금과 주문 예약분 제외) */
  balance = INITIAL_BALANCE;
  leverage = 20;
  position: Position | null = null;
  orders: Order[] = [];
  fills: Fill[] = [];
  trades: Trade[] = [];
  lastPrice: number;
  /** 현재 시뮬레이션 시각 (마지막 캔들 마감 시각) */
  time: number;
  candleCount = 0;
  peakEquity = INITIAL_BALANCE;
  maxDrawdownPct = 0;
  private nextId = 1;

  constructor(lastPrice: number, time: number) {
    this.lastPrice = lastPrice;
    this.time = time;
  }

  // ---------- 조회 ----------

  get reservedMargin(): number {
    return this.orders.reduce((sum, o) => sum + o.reserved, 0);
  }

  unrealizedPnl(price = this.lastPrice): number {
    const p = this.position;
    return p ? (price - p.entryPrice) * p.qty * dirOf(p.side) : 0;
  }

  /** 지갑 잔고 = 가용 잔고 + 격리 증거금 + 주문 예약분 */
  walletBalance(): number {
    return this.balance + (this.position?.margin ?? 0) + this.reservedMargin;
  }

  equity(price = this.lastPrice): number {
    return this.walletBalance() + this.unrealizedPnl(price);
  }

  liquidationPrice(position = this.position): number | null {
    if (!position) return null;
    const { qty, entryPrice, margin } = position;
    const { maintenanceRate, maintenanceAmount } = bracketFor(qty * entryPrice);
    const price =
      position.side === 'long'
        ? (qty * entryPrice - margin - maintenanceAmount) / (qty * (1 - maintenanceRate))
        : (qty * entryPrice + margin + maintenanceAmount) / (qty * (1 + maintenanceRate));
    return Math.max(0, price);
  }

  /** 새로 열 수 있는 최대 명목가치 (해당 방향 기준) */
  maxOpenNotional(side: OrderSide, price = this.lastPrice): number {
    const p = this.position;
    const closable = p && p.side !== sideOf(side) ? p.qty * price : 0;
    const proceeds = p && closable > 0 ? p.margin + this.unrealizedPnl(price) - closable * TAKER_FEE : 0;
    const byBalance = ((this.balance + Math.max(0, proceeds)) * this.leverage) / (1 + this.leverage * TAKER_FEE);
    const held = p && p.side === sideOf(side) ? p.qty * p.entryPrice : 0;
    const byBracket = Math.max(0, maxNotionalFor(this.leverage) - held);
    return closable + Math.min(byBalance, byBracket);
  }

  // ---------- 설정 ----------

  setLeverage(leverage: number) {
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > MAX_LEVERAGE) {
      throw new ExchangeError(`레버리지는 1~${MAX_LEVERAGE}배 정수여야 합니다.`);
    }
    if (this.position || this.orders.some((o) => !o.reduceOnly)) {
      throw new ExchangeError('포지션이나 미체결 주문이 있으면 레버리지를 바꿀 수 없습니다.');
    }
    this.leverage = leverage;
  }

  // ---------- 주문 ----------

  marketOrder(side: OrderSide, qty: number, options: OrderOptions = {}): Fill {
    this.validateQty(qty);
    const price = this.lastPrice;
    const execQty = this.resolveQty(side, qty, !!options.reduceOnly);
    this.validateTpSl(sideOf(side), price, options.takeProfit ?? null, options.stopLoss ?? null);
    this.validateOpen(side, execQty, price, TAKER_FEE, this.balance);
    return this.executeFill(side, execQty, price, TAKER_FEE, 'market', this.time, options);
  }

  limitOrder(side: OrderSide, price: number, qty: number, options: OrderOptions = {}): Order | Fill {
    this.validateQty(qty);
    if (!(price > 0)) throw new ExchangeError('가격을 확인해주세요.');
    const reduceOnly = !!options.reduceOnly;
    const takeProfit = options.takeProfit ?? null;
    const stopLoss = options.stopLoss ?? null;
    this.validateTpSl(sideOf(side), price, takeProfit, stopLoss);

    // 현재가보다 유리한 지정가는 즉시 체결 (테이커)
    const marketable = side === 'buy' ? price >= this.lastPrice : price <= this.lastPrice;
    if (marketable) return this.marketOrder(side, qty, options);

    if (reduceOnly) {
      const p = this.position;
      if (!p || p.side === sideOf(side)) throw new ExchangeError('줄일 포지션이 없습니다.');
    }
    const reserved = reduceOnly ? 0 : qty * price * (1 / this.leverage + MAKER_FEE);
    if (!reduceOnly) {
      if (reserved > this.balance + EPSILON) throw new ExchangeError('잔고가 부족합니다.');
      const held = this.position?.side === sideOf(side) ? this.position.qty * this.position.entryPrice : 0;
      const pending = this.orders
        .filter((o) => o.side === side && !o.reduceOnly)
        .reduce((sum, o) => sum + o.qty * o.price, 0);
      if (held + pending + qty * price > maxNotionalFor(this.leverage) + EPSILON) {
        throw new ExchangeError(`${this.leverage}배에서 허용되는 최대 포지션 규모를 넘습니다.`);
      }
    }
    const order: Order = {
      id: this.nextId++,
      side,
      price,
      qty,
      reduceOnly,
      reserved,
      takeProfit,
      stopLoss,
      createdAt: this.time,
    };
    this.balance -= reserved;
    this.orders.push(order);
    return order;
  }

  cancelOrder(id: number) {
    const order = this.orders.find((o) => o.id === id);
    if (!order) return;
    this.balance += order.reserved;
    this.orders = this.orders.filter((o) => o.id !== id);
  }

  cancelAllOrders() {
    for (const o of [...this.orders]) this.cancelOrder(o.id);
  }

  /** 시장가로 포지션 일부 또는 전체 청산 */
  closePosition(fraction = 1): Fill {
    const p = this.position;
    if (!p) throw new ExchangeError('보유 포지션이 없습니다.');
    const qty = fraction >= 1 ? p.qty : p.qty * fraction;
    return this.marketOrder(p.side === 'long' ? 'sell' : 'buy', qty, { reduceOnly: true });
  }

  setPositionTpSl(takeProfit: number | null, stopLoss: number | null) {
    const p = this.position;
    if (!p) throw new ExchangeError('보유 포지션이 없습니다.');
    this.validateTpSl(p.side, this.lastPrice, takeProfit, stopLoss);
    p.takeProfit = takeProfit;
    p.stopLoss = stopLoss;
  }

  // ---------- 시간 진행 ----------

  /** 새 1분봉이 마감되었을 때 호출. 체결/취소 이벤트를 돌려준다 */
  onCandle(c: Candle): ExchangeEvent[] {
    const events: ExchangeEvent[] = [];
    this.checkPositionExit(c, true, events);

    let limitFilled = false;
    for (const order of [...this.orders]) {
      const touched = order.side === 'buy' ? c.low <= order.price : c.high >= order.price;
      if (!touched || !this.orders.includes(order)) continue;
      this.orders = this.orders.filter((o) => o !== order);
      this.balance += order.reserved;

      let qty = order.qty;
      if (order.reduceOnly) {
        const p = this.position;
        if (!p || p.side === sideOf(order.side)) {
          events.push({ type: 'cancel', message: `감소 전용 주문 취소: 줄일 포지션이 없습니다.` });
          continue;
        }
        qty = Math.min(qty, p.qty);
      }
      try {
        this.validateOpen(order.side, qty, order.price, MAKER_FEE, this.balance);
      } catch (err) {
        events.push({ type: 'cancel', message: `지정가 주문 취소: ${(err as Error).message}` });
        continue;
      }
      const fill = this.executeFill(order.side, qty, order.price, MAKER_FEE, 'limit', c.time, {
        takeProfit: order.takeProfit,
        stopLoss: order.stopLoss,
      });
      events.push(this.fillEvent(fill));
      limitFilled = true;
    }

    // 같은 캔들에서 진입한 포지션은 보수적으로 손절/청산만 다시 확인한다
    if (limitFilled) this.checkPositionExit(c, false, events);

    this.lastPrice = c.close;
    this.time = c.time + MINUTE;
    this.candleCount++;
    this.updateDrawdown();
    return events;
  }

  /** 라운드 종료: 미체결 주문 취소, 포지션 시장가 청산 */
  finish(): ExchangeEvent[] {
    const events: ExchangeEvent[] = [];
    this.cancelAllOrders();
    const p = this.position;
    if (p) {
      const fill = this.executeFill(p.side === 'long' ? 'sell' : 'buy', p.qty, this.lastPrice, TAKER_FEE, 'round_end', this.time, {});
      events.push(this.fillEvent(fill));
    }
    this.updateDrawdown();
    return events;
  }

  summary() {
    const closed = this.trades.filter((t) => t.closeTime !== null);
    return {
      candleCount: this.candleCount,
      startEquity: INITIAL_BALANCE,
      endEquity: this.equity(),
      realizedPnl: this.fills.reduce((s, f) => s + f.realizedPnl, 0),
      fees: this.fills.reduce((s, f) => s + f.fee, 0),
      tradeCount: closed.length,
      winCount: closed.filter((t) => t.pnl - t.fees > 0).length,
      maxDrawdownPct: this.maxDrawdownPct,
      liquidationCount: closed.filter((t) => t.liquidated).length,
    };
  }

  // ---------- 내부 ----------

  private validateQty(qty: number) {
    if (!(qty > 0) || !Number.isFinite(qty)) throw new ExchangeError('수량을 확인해주세요.');
  }

  private resolveQty(side: OrderSide, qty: number, reduceOnly: boolean): number {
    if (!reduceOnly) return qty;
    const p = this.position;
    if (!p || p.side === sideOf(side)) throw new ExchangeError('줄일 포지션이 없습니다.');
    return Math.min(qty, p.qty);
  }

  private validateTpSl(side: PositionSide, refPrice: number, tp: number | null, sl: number | null) {
    const dir = dirOf(side);
    if (tp !== null && !((tp - refPrice) * dir > 0)) {
      throw new ExchangeError(side === 'long' ? '롱 익절가는 기준가보다 높아야 합니다.' : '숏 익절가는 기준가보다 낮아야 합니다.');
    }
    if (sl !== null && !((refPrice - sl) * dir > 0 && sl > 0)) {
      throw new ExchangeError(side === 'long' ? '롱 손절가는 기준가보다 낮아야 합니다.' : '숏 손절가는 기준가보다 높아야 합니다.');
    }
  }

  /** 새로 여는 수량에 대해 잔고와 최대 규모를 확인 */
  private validateOpen(side: OrderSide, qty: number, price: number, feeRate: number, balance: number) {
    const p = this.position;
    let available = balance;
    let openQty = qty;
    if (p && p.side !== sideOf(side)) {
      const closeQty = Math.min(qty, p.qty);
      openQty = qty - closeQty;
      const released = (p.margin * closeQty) / p.qty;
      const pnl = (price - p.entryPrice) * closeQty * dirOf(p.side);
      available += released + pnl - closeQty * price * feeRate;
    }
    if (openQty <= EPSILON) return;
    const required = openQty * price * (1 / this.leverage + feeRate);
    if (required > available + EPSILON) throw new ExchangeError('잔고가 부족합니다.');
    const held = p && p.side === sideOf(side) ? p.qty * p.entryPrice : 0;
    if (held + openQty * price > maxNotionalFor(this.leverage) + EPSILON) {
      throw new ExchangeError(`${this.leverage}배에서 허용되는 최대 포지션 규모를 넘습니다.`);
    }
  }

  private executeFill(
    side: OrderSide,
    qty: number,
    price: number,
    feeRate: number,
    reason: FillReason,
    time: number,
    options: OrderOptions,
  ): Fill {
    let remaining = qty;
    let realizedPnl = 0;
    let fee = 0;
    const p = this.position;

    if (p && p.side !== sideOf(side)) {
      const closeQty = Math.min(remaining, p.qty);
      const released = (p.margin * closeQty) / p.qty;
      const pnl = (price - p.entryPrice) * closeQty * dirOf(p.side);
      const closeFee = closeQty * price * feeRate;
      this.balance += released + pnl - closeFee;
      p.qty -= closeQty;
      p.margin -= released;
      realizedPnl += pnl;
      fee += closeFee;
      remaining -= closeQty;

      const trade = this.openTrade()!;
      trade.pnl += pnl;
      trade.fees += closeFee;
      trade.closedQty += closeQty;
      trade.closedValue += closeQty * price;
      trade.exitPrice = trade.closedValue / trade.closedQty;
      if (p.qty <= EPSILON * Math.max(1, closeQty)) {
        this.balance += p.margin;
        this.position = null;
        trade.closeTime = time;
        trade.closeReason = reason;
        this.cancelReduceOnly();
      }
    }

    if (remaining > EPSILON) {
      const notional = remaining * price;
      const margin = notional / this.leverage;
      const openFee = notional * feeRate;
      this.balance -= margin + openFee;
      fee += openFee;
      const cur = this.position;
      if (cur) {
        const total = cur.qty + remaining;
        cur.entryPrice = (cur.entryPrice * cur.qty + price * remaining) / total;
        cur.qty = total;
        cur.margin += margin;
      } else {
        this.position = {
          side: sideOf(side),
          qty: remaining,
          entryPrice: price,
          margin,
          leverage: this.leverage,
          takeProfit: null,
          stopLoss: null,
          openedAt: time,
        };
        this.trades.push({
          id: this.nextId++,
          side: sideOf(side),
          openTime: time,
          closeTime: null,
          entryPrice: price,
          exitPrice: 0,
          maxQty: 0,
          pnl: 0,
          fees: 0,
          liquidated: false,
          closeReason: null,
          openedQty: 0,
          closedQty: 0,
          closedValue: 0,
        });
      }
      const pos = this.position!;
      if (options.takeProfit != null) pos.takeProfit = options.takeProfit;
      if (options.stopLoss != null) pos.stopLoss = options.stopLoss;
      const trade = this.openTrade()!;
      trade.entryPrice = (trade.entryPrice * trade.openedQty + price * remaining) / (trade.openedQty + remaining);
      trade.openedQty += remaining;
      trade.maxQty = Math.max(trade.maxQty, pos.qty);
      trade.fees += openFee;
    }

    const fill: Fill = { id: this.nextId++, time, side, price, qty, fee, realizedPnl, reason };
    this.fills.push(fill);
    return fill;
  }

  private liquidate(time: number, events: ExchangeEvent[]) {
    const p = this.position!;
    const price = this.liquidationPrice(p)!;
    const fill: Fill = {
      id: this.nextId++,
      time,
      side: p.side === 'long' ? 'sell' : 'buy',
      price,
      qty: p.qty,
      fee: 0,
      // 격리 증거금 전액 손실
      realizedPnl: -p.margin,
      reason: 'liquidation',
    };
    this.fills.push(fill);
    const trade = this.openTrade()!;
    trade.pnl -= p.margin;
    trade.closedQty += p.qty;
    trade.closedValue += p.qty * price;
    trade.exitPrice = trade.closedValue / trade.closedQty;
    trade.closeTime = time;
    trade.closeReason = 'liquidation';
    trade.liquidated = true;
    this.position = null;
    this.cancelReduceOnly();
    events.push(this.fillEvent(fill));
  }

  /**
   * 캔들 범위 안에서 강제 청산, 손절, 익절을 확인한다.
   * 한 캔들 안의 순서를 알 수 없으므로 불리한 쪽(청산/손절)을 먼저 처리한다.
   */
  private checkPositionExit(c: Candle, allowTakeProfit: boolean, events: ExchangeEvent[]) {
    const p = this.position;
    if (!p) return;
    const dir = dirOf(p.side);
    const liq = this.liquidationPrice(p)!;
    const adverse = p.side === 'long' ? c.low : c.high;
    const favorable = p.side === 'long' ? c.high : c.low;
    // 포지션 방향 기준으로 a가 b보다 같거나 불리한 가격인지
    const worse = (a: number, b: number) => a * dir <= b * dir;
    const exitSide: OrderSide = p.side === 'long' ? 'sell' : 'buy';

    if (worse(c.open, liq)) return this.liquidate(c.time, events);
    if (p.stopLoss !== null && worse(adverse, p.stopLoss) && !worse(p.stopLoss, liq)) {
      const price = worse(c.open, p.stopLoss) ? c.open : p.stopLoss;
      const fill = this.executeFill(exitSide, p.qty, price, TAKER_FEE, 'stop_loss', c.time, {});
      events.push(this.fillEvent(fill));
      return;
    }
    if (worse(adverse, liq)) return this.liquidate(c.time, events);
    const reached = (a: number, b: number) => a * dir >= b * dir;
    if (allowTakeProfit && p.takeProfit !== null && reached(favorable, p.takeProfit)) {
      const price = reached(c.open, p.takeProfit) ? c.open : p.takeProfit;
      const fill = this.executeFill(exitSide, p.qty, price, TAKER_FEE, 'take_profit', c.time, {});
      events.push(this.fillEvent(fill));
    }
  }

  private openTrade(): Trade | undefined {
    const last = this.trades[this.trades.length - 1];
    return last && last.closeTime === null ? last : undefined;
  }

  private cancelReduceOnly() {
    this.orders = this.orders.filter((o) => !o.reduceOnly);
  }

  private updateDrawdown() {
    const eq = this.equity();
    this.peakEquity = Math.max(this.peakEquity, eq);
    const dd = this.peakEquity > 0 ? ((this.peakEquity - eq) / this.peakEquity) * 100 : 0;
    this.maxDrawdownPct = Math.max(this.maxDrawdownPct, dd);
  }

  private fillEvent(fill: Fill): ExchangeEvent {
    const action = fill.side === 'buy' ? '매수' : '매도';
    return {
      type: 'fill',
      reason: fill.reason,
      message: `${REASON_LABEL[fill.reason]} ${action} 체결`,
    };
  }
}
