export const MINUTE = 60_000;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PositionSide = 'long' | 'short';
export type OrderSide = 'buy' | 'sell';

export interface Position {
  side: PositionSide;
  qty: number;
  entryPrice: number;
  /** 격리 증거금 */
  margin: number;
  leverage: number;
  takeProfit: number | null;
  stopLoss: number | null;
  openedAt: number;
}

export interface Order {
  id: number;
  side: OrderSide;
  price: number;
  qty: number;
  reduceOnly: boolean;
  /** 주문에 묶인 증거금 + 예상 수수료 */
  reserved: number;
  takeProfit: number | null;
  stopLoss: number | null;
  createdAt: number;
}

export type FillReason = 'market' | 'limit' | 'take_profit' | 'stop_loss' | 'liquidation' | 'round_end';

export interface Fill {
  id: number;
  time: number;
  side: OrderSide;
  price: number;
  qty: number;
  fee: number;
  realizedPnl: number;
  reason: FillReason;
}

export interface Trade {
  id: number;
  side: PositionSide;
  openTime: number;
  closeTime: number | null;
  entryPrice: number;
  exitPrice: number;
  maxQty: number;
  /** 수수료 제외 실현 손익 */
  pnl: number;
  fees: number;
  liquidated: boolean;
  closeReason: FillReason | null;
  /** 내부 계산용 */
  openedQty: number;
  closedQty: number;
  closedValue: number;
}

export interface ExchangeEvent {
  type: 'fill' | 'cancel';
  message: string;
  reason?: FillReason;
}
