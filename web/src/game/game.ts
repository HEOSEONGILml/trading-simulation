// 라운드 진행 컨트롤러: 데이터 수신, 재생 타이머, 거래소 연결

import { api, type RoundRecord, type RoundSettings, type RoundStart } from '../api.ts';
import { Exchange, ExchangeError, type OrderOptions } from '../engine/exchange.ts';
import { MINUTE, type Candle, type ExchangeEvent, type OrderSide } from '../engine/types.ts';

export type Phase = 'setup' | 'loading' | 'ready' | 'running' | 'paused' | 'finishing' | 'finished';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

export interface FinishResult {
  saved: boolean;
  record: RoundRecord | null;
  summary: ReturnType<Exchange['summary']>;
  startPrice: number;
  endPrice: number;
  error?: string;
}

const FETCH_CHUNK = 1000;
const TICK_MS = 50;
const TOAST_MS = 3500;

export class Game {
  phase: Phase = 'setup';
  round: RoundStart | null = null;
  settings: RoundSettings | null = null;
  candles: Candle[] = [];
  exchange: Exchange | null = null;
  speed: number;
  waiting = false;
  dataEnded = false;
  result: FinishResult | null = null;
  toasts: Toast[] = [];
  version = 0;

  private phaseBeforeSetup: Phase = 'ready';
  private buffer: Candle[] = [];
  private fetchedCount = 0;
  private fetching: Promise<void> | null = null;
  private retryAt = 0;
  private serverEnded = false;
  private elapsed = 0;
  private lastTick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private candleListeners = new Set<(c: Candle) => void>();
  private resetListeners = new Set<() => void>();
  private nextToastId = 1;
  private loadToken = 0;

  constructor(speed: number) {
    this.speed = speed;
  }

  // ---------- 구독 ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  onCandle(fn: (c: Candle) => void) {
    this.candleListeners.add(fn);
    return () => this.candleListeners.delete(fn);
  }

  /** 새 라운드가 로드되어 차트를 처음부터 다시 그려야 할 때 */
  onReset(fn: () => void) {
    this.resetListeners.add(fn);
    return () => this.resetListeners.delete(fn);
  }

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ---------- 라운드 ----------

  openSetup() {
    if (this.phase === 'running' || this.phase === 'paused' || this.phase === 'finishing') return;
    if (this.phase !== 'setup' && this.phase !== 'loading') this.phaseBeforeSetup = this.phase;
    this.phase = 'setup';
    this.emit();
  }

  /** 설정 창을 닫고 이전 라운드 화면으로 돌아간다 */
  closeSetup() {
    if (this.phase !== 'setup' || !this.round) return;
    this.phase = this.phaseBeforeSetup;
    this.emit();
  }

  async createRound(settings: RoundSettings) {
    this.stopTimer();
    const token = ++this.loadToken;
    this.phase = 'loading';
    this.emit();
    try {
      const round = await api.createRound(settings);
      if (token !== this.loadToken) return;
      const last = round.history[round.history.length - 1];
      this.round = round;
      this.settings = settings;
      this.candles = [...round.history];
      this.exchange = new Exchange(last.close, round.startTime);
      this.buffer = [];
      this.fetchedCount = 0;
      this.fetching = null;
      this.serverEnded = false;
      this.dataEnded = false;
      this.waiting = false;
      this.elapsed = 0;
      this.result = null;
      this.phase = 'ready';
      for (const fn of this.resetListeners) fn();
      void this.prefetch();
      this.emit();
    } catch (err) {
      if (token !== this.loadToken) return;
      this.phase = 'setup';
      this.toast('error', (err as Error).message);
    }
  }

  start() {
    if (this.phase !== 'ready' && this.phase !== 'paused') return;
    if (this.dataEnded) return;
    this.phase = 'running';
    this.lastTick = performance.now();
    this.timer = setInterval(this.tick, TICK_MS);
    this.emit();
  }

  pause() {
    if (this.phase !== 'running') return;
    this.stopTimer();
    this.phase = 'paused';
    this.emit();
  }

  togglePlay() {
    if (this.phase === 'running') this.pause();
    else this.start();
  }

  setSpeed(speed: number) {
    // 남은 시간 비율을 유지한다
    const progress = this.elapsed / this.intervalMs;
    this.speed = speed;
    this.elapsed = progress * this.intervalMs;
    this.emit();
  }

  get intervalMs() {
    return MINUTE / this.speed;
  }

  /** 다음 캔들까지 진행률 (0~1) */
  progress(): number {
    if (this.phase !== 'running') return Math.min(1, this.elapsed / this.intervalMs);
    const live = this.elapsed + (performance.now() - this.lastTick);
    return Math.min(1, live / this.intervalMs);
  }

  /** 시뮬레이션 현재 시각 (캔들 사이에서도 부드럽게 흐름) */
  simTime(): number {
    if (!this.exchange) return 0;
    return this.exchange.time + this.progress() * MINUTE;
  }

  async finish() {
    const ex = this.exchange;
    const round = this.round;
    if (!ex || !round || !['ready', 'running', 'paused'].includes(this.phase)) return;
    this.stopTimer();
    this.phase = 'finishing';
    this.emit();

    this.handleEvents(ex.finish());
    const summary = ex.summary();
    const startPrice = round.history[round.history.length - 1].close;
    const result: FinishResult = { saved: false, record: null, summary, startPrice, endPrice: ex.lastPrice };
    try {
      const trades = ex.trades
        .filter((t) => t.closeTime !== null)
        .map(({ openedQty: _a, closedQty: _b, closedValue: _c, ...t }) => t);
      const res = await api.finishRound(round.roundId, { ...summary, trades });
      result.saved = res.saved;
      result.record = res.record;
    } catch (err) {
      result.error = (err as Error).message;
    }
    this.result = result;
    this.phase = 'finished';
    this.emit();
  }

  // ---------- 매매 ----------

  private trade<T>(action: (ex: Exchange) => T, success?: string): T | undefined {
    const ex = this.exchange;
    if (!ex) return;
    if (this.phase !== 'running' && this.phase !== 'paused') {
      this.toast('error', '라운드를 시작한 뒤 주문할 수 있습니다.');
      return;
    }
    try {
      const result = action(ex);
      if (success) this.toast('success', success);
      this.emit();
      return result;
    } catch (err) {
      if (err instanceof ExchangeError) this.toast('error', err.message);
      else throw err;
    }
  }

  marketOrder(side: OrderSide, qty: number, options: OrderOptions) {
    return this.trade((ex) => ex.marketOrder(side, qty, options), `시장가 ${side === 'buy' ? '매수' : '매도'} 체결`);
  }

  limitOrder(side: OrderSide, price: number, qty: number, options: OrderOptions) {
    return this.trade((ex) => {
      const result = ex.limitOrder(side, price, qty, options);
      const filled = 'reason' in result;
      this.toast('success', filled ? '지정가 주문이 즉시 체결되었습니다.' : '지정가 주문 접수');
      return result;
    });
  }

  cancelOrder(id: number) {
    this.trade((ex) => ex.cancelOrder(id), '주문 취소');
  }

  cancelAllOrders() {
    this.trade((ex) => ex.cancelAllOrders(), '전체 주문 취소');
  }

  closePosition(fraction = 1) {
    this.trade((ex) => ex.closePosition(fraction), '포지션 시장가 청산');
  }

  setPositionTpSl(tp: number | null, sl: number | null): boolean {
    const ok = this.trade((ex) => {
      ex.setPositionTpSl(tp, sl);
      return true;
    }, '익절/손절 설정 완료');
    return ok ?? false;
  }

  setLeverage(leverage: number) {
    const ex = this.exchange;
    if (!ex) return false;
    try {
      ex.setLeverage(leverage);
      this.emit();
      return true;
    } catch (err) {
      this.toast('error', (err as Error).message);
      return false;
    }
  }

  // ---------- 알림 ----------

  toast(kind: Toast['kind'], message: string) {
    const toast = { id: this.nextToastId++, kind, message };
    this.toasts = [...this.toasts, toast].slice(-5);
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== toast.id);
      this.emit();
    }, TOAST_MS);
    this.emit();
  }

  private handleEvents(events: ExchangeEvent[]) {
    for (const e of events) {
      const bad = e.type === 'cancel' || e.reason === 'liquidation' || e.reason === 'stop_loss';
      this.toast(bad ? 'error' : 'success', e.message);
    }
  }

  // ---------- 내부 ----------

  private tick = () => {
    const now = performance.now();
    this.elapsed += now - this.lastTick;
    this.lastTick = now;

    let revealed = false;
    while (this.elapsed >= this.intervalMs) {
      const next = this.buffer.shift();
      if (!next) break;
      this.elapsed -= this.intervalMs;
      this.reveal(next);
      revealed = true;
    }

    const starving = this.buffer.length === 0 && this.elapsed >= this.intervalMs;
    if (starving && this.serverEnded) {
      this.dataEnded = true;
      this.elapsed = 0;
      this.pause();
      this.toast('info', '더 이상 데이터가 없습니다. 라운드를 종료해주세요.');
      return;
    }
    if (starving) this.elapsed = this.intervalMs;
    if (starving !== this.waiting) {
      this.waiting = starving;
      revealed = true;
    }
    if (this.buffer.length < Math.max(300, this.speed * 5)) void this.prefetch();
    if (revealed) this.emit();
  };

  private reveal(candle: Candle) {
    this.candles.push(candle);
    const events = this.exchange!.onCandle(candle);
    for (const fn of this.candleListeners) fn(candle);
    this.handleEvents(events);
  }

  private prefetch(): Promise<void> {
    if (this.fetching || this.serverEnded || !this.round || performance.now() < this.retryAt) {
      return this.fetching ?? Promise.resolve();
    }
    const roundId = this.round.roundId;
    const token = this.loadToken;
    this.fetching = api
      .futureCandles(roundId, this.fetchedCount, FETCH_CHUNK)
      .then(({ candles, ended }) => {
        if (token !== this.loadToken) return;
        this.buffer.push(...candles);
        this.fetchedCount += candles.length;
        this.serverEnded = ended;
      })
      .catch((err) => {
        if (token !== this.loadToken) return;
        this.retryAt = performance.now() + 3000;
        this.toast('error', `데이터 수신 실패, 다시 시도합니다: ${(err as Error).message}`);
      })
      .finally(() => {
        if (token === this.loadToken) this.fetching = null;
      });
    return this.fetching;
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.phase === 'running') {
      this.elapsed += performance.now() - this.lastTick;
    }
  }

  dispose() {
    this.stopTimer();
  }
}
