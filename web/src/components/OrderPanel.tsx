import { useEffect, useState } from 'react';
import { MAX_LEVERAGE, maxNotionalFor } from '../engine/brackets.ts';

import type { OrderSide } from '../engine/types.ts';
import type { Game } from '../game/game.ts';
import { formatNumber, formatSigned, pnlClass } from '../format.ts';

const LEVERAGE_MARKS = [1, 25, 50, 75, 100, 125];
const PCT_MARKS = [0, 25, 50, 75, 100];

export const parseNumber = (value: string) => {
  const n = Number(value.replace(/,/g, ''));
  return value.trim() !== '' && Number.isFinite(n) ? n : null;
};

export function LeverageDialog({ game, onClose }: { game: Game; onClose: () => void }) {
  const [value, setValue] = useState(game.exchange?.leverage ?? 20);
  const apply = () => {
    if (game.setLeverage(value)) onClose();
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>레버리지 조정</span>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="leverage-input">
            <button className="step-btn" onClick={() => setValue((v) => Math.max(1, v - 1))}>
              −
            </button>
            <input
              className="mono"
              inputMode="numeric"
              value={`${value}x`}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setValue(Math.min(MAX_LEVERAGE, Math.max(1, n)));
              }}
            />
            <button className="step-btn" onClick={() => setValue((v) => Math.min(MAX_LEVERAGE, v + 1))}>
              +
            </button>
          </div>
          <input
            type="range"
            className="slider"
            min={1}
            max={MAX_LEVERAGE}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <div className="slider-marks">
            {LEVERAGE_MARKS.map((m) => (
              <button key={m} onClick={() => setValue(m)}>
                {m}x
              </button>
            ))}
          </div>
          <p className="hint">
            현재 레버리지에서 최대 포지션 규모: <b className="mono">{formatNumber(maxNotionalFor(value), 0)} USDT</b>
          </p>
          {value >= 50 && <p className="hint warn">레버리지가 높을수록 강제 청산 위험이 커집니다.</p>}
          <button className="btn btn-primary btn-block" onClick={apply}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

interface OrderFormProps {
  game: Game;
  /** 지정하면 해당 방향 버튼 하나만 보여준다 (모바일 주문 창) */
  side?: OrderSide;
  onSubmitted?: () => void;
  /** 이전에 작성하던 내용 (폼이 다시 열릴 때 복원) */
  draft?: OrderDraft;
  onDraftChange?: (draft: OrderDraft) => void;
}

export interface OrderDraft {
  tab: 'limit' | 'market';
  price: string;
  size: string;
  pct: number;
  tpsl: boolean;
  tp: string;
  sl: string;
  reduceOnly: boolean;
}

export const EMPTY_DRAFT: OrderDraft = {
  tab: 'limit',
  price: '',
  size: '',
  pct: 0,
  tpsl: false,
  tp: '',
  sl: '',
  reduceOnly: false,
};

export function OrderForm({ game, side, onSubmitted, draft = EMPTY_DRAFT, onDraftChange }: OrderFormProps) {
  const ex = game.exchange!;
  const info = game.info;
  const money = (v: number) => formatNumber(v, info.moneyDigits);
  const precision = game.round?.pricePrecision ?? 1;
  const [tab, setTab] = useState(draft.tab);
  const [price, setPrice] = useState(draft.price);
  const [size, setSize] = useState(draft.size);
  const [pct, setPct] = useState(draft.pct);
  const [tpsl, setTpsl] = useState(draft.tpsl);
  const [tp, setTp] = useState(draft.tp);
  const [sl, setSl] = useState(draft.sl);
  const [reduceOnly, setReduceOnly] = useState(draft.reduceOnly);
  const [leverageOpen, setLeverageOpen] = useState(false);

  useEffect(() => {
    onDraftChange?.({ tab, price, size, pct, tpsl, tp, sl, reduceOnly });
  }, [tab, price, size, pct, tpsl, tp, sl, reduceOnly]);

  const lastPrice = ex.lastPrice;
  const refPrice = tab === 'limit' ? (parseNumber(price) ?? lastPrice) : lastPrice;
  const maxBuy = ex.maxOpenNotional('buy', refPrice);
  const maxSell = ex.maxOpenNotional('sell', refPrice);
  const sizeValue = parseNumber(size) ?? 0;
  const feeRate = tab === 'limit' ? ex.rules.makerFee : ex.rules.takerFee;
  // 주식은 1주 단위로 내림한 수량만 주문된다
  const orderQty = ex.roundQty(refPrice > 0 ? sizeValue / refPrice : 0);
  const orderValue = info.futures ? sizeValue : orderQty * refPrice;
  const cost = reduceOnly ? 0 : orderValue / ex.leverage + orderValue * feeRate;
  const tradable = game.phase === 'running' || game.phase === 'paused';

  // 익절/손절가를 증거금 대비 수익률(%)로 환산한다. 방향은 주문 버튼이 하나면 그 방향, 아니면 입력값으로 추정
  const tpValue = parseNumber(tp);
  const slValue = parseNumber(sl);
  const dir =
    side === 'buy' ? 1
    : side === 'sell' ? -1
    : tpValue !== null ? (tpValue >= refPrice ? 1 : -1)
    : slValue !== null ? (slValue <= refPrice ? 1 : -1)
    : 1;
  const roe = (target: number | null) =>
    target === null || !(refPrice > 0) ? null : ((target - refPrice) / refPrice) * dir * ex.leverage * 100;
  const tpRoe = roe(tpValue);
  const slRoe = roe(slValue);

  const onPct = (value: number) => {
    setPct(value);
    const base = side === 'buy' ? maxBuy : side === 'sell' ? maxSell : Math.max(maxBuy, maxSell);
    const digits = info.moneyDigits;
    setSize(value > 0 ? (Math.floor(((base * value) / 100) * 10 ** digits) / 10 ** digits).toFixed(digits) : '');
  };

  const submit = (orderSide: OrderSide) => {
    if (!(sizeValue > 0)) return game.toast('error', `주문 금액(${info.currency})을 입력해주세요.`);
    const options = {
      reduceOnly,
      takeProfit: tpsl && !reduceOnly ? parseNumber(tp) : null,
      stopLoss: tpsl && !reduceOnly ? parseNumber(sl) : null,
    };
    let result;
    if (tab === 'market') {
      result = game.marketOrder(orderSide, sizeValue / lastPrice, options);
    } else {
      const limitPrice = parseNumber(price);
      if (limitPrice === null || limitPrice <= 0) return game.toast('error', '지정가를 입력해주세요.');
      result = game.limitOrder(orderSide, limitPrice, sizeValue / limitPrice, options);
    }
    if (result) onSubmitted?.();
  };

  const sides: OrderSide[] = side ? [side] : ['buy', 'sell'];

  return (
    <div className="order-form">
      {info.futures && (
        <div className="margin-row">
          <button className="pill" disabled title="격리 증거금만 지원">
            격리
          </button>
          <button className="pill" onClick={() => setLeverageOpen(true)}>
            {ex.leverage}x
          </button>
          <button className="pill" disabled title="단방향 포지션만 지원">
            단방향
          </button>
        </div>
      )}

      <div className="order-tabs">
        <button className={tab === 'limit' ? 'active' : ''} onClick={() => setTab('limit')}>
          지정가
        </button>
        <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>
          시장가
        </button>
      </div>

      <div className="avbl">
        <span>가용</span>
        <span className="mono">
          {money(ex.balance)} {info.currency}
        </span>
      </div>

      {tab === 'limit' ? (
        <div className="field">
          <span className="field-label">가격</span>
          <input
            className="mono"
            inputMode="decimal"
            value={price}
            placeholder={formatNumber(lastPrice, precision).replace(/,/g, '')}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button className="field-suffix-btn" onClick={() => setPrice(lastPrice.toFixed(precision))} title="현재가 입력">
            최근
          </button>
          <span className="field-unit">{info.currency}</span>
        </div>
      ) : (
        <div className="field disabled">
          <span className="field-label">가격</span>
          <input value="시장가" disabled />
        </div>
      )}

      <div className="field">
        <span className="field-label">{info.futures ? '규모' : '금액'}</span>
        <input
          className="mono"
          inputMode="decimal"
          value={size}
          placeholder={(0).toFixed(info.moneyDigits)}
          onChange={(e) => {
            setSize(e.target.value);
            setPct(0);
          }}
        />
        <span className="field-unit">{info.currency}</span>
      </div>
      <div className="qty-hint mono">
        ≈ {formatNumber(info.futures ? sizeValue / refPrice : orderQty, info.qtyDigits)} {info.qtyUnit}
      </div>

      <input type="range" className="slider" min={0} max={100} value={pct} onChange={(e) => onPct(Number(e.target.value))} />
      <div className="slider-marks">
        {PCT_MARKS.map((m) => (
          <button key={m} onClick={() => onPct(m)}>
            {m}%
          </button>
        ))}
      </div>

      <label className="check">
        <input type="checkbox" checked={tpsl} disabled={reduceOnly} onChange={(e) => setTpsl(e.target.checked)} />
        익절/손절
      </label>
      {tpsl && !reduceOnly && (
        <>
          <div className="field">
            <span className="field-label">익절가</span>
            <input className="mono" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="선택" />
            <span className="field-unit">{info.currency}</span>
          </div>
          {tpRoe !== null && (
            <div className="qty-hint">
              {info.futures ? (dir > 0 ? '롱 기준 ' : '숏 기준 ') : ''}수익률 <span className={`mono ${pnlClass(tpRoe)}`}>{formatSigned(tpRoe)}%</span>
            </div>
          )}
          <div className="field">
            <span className="field-label">손절가</span>
            <input className="mono" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="선택" />
            <span className="field-unit">{info.currency}</span>
          </div>
          {slRoe !== null && (
            <div className="qty-hint">
              {info.futures ? (dir > 0 ? '롱 기준 ' : '숏 기준 ') : ''}수익률 <span className={`mono ${pnlClass(slRoe)}`}>{formatSigned(slRoe)}%</span>
            </div>
          )}
        </>
      )}
      {info.futures && (
        <label className="check">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          감소 전용 (Reduce-Only)
        </label>
      )}

      <div className={`order-buttons ${side ? 'single' : ''}`}>
        {sides.map((s) => (
          <button key={s} className={s === 'buy' ? 'btn-buy' : 'btn-sell'} disabled={!tradable} onClick={() => submit(s)}>
            {s === 'buy' ? info.buyLabel : info.sellLabel}
          </button>
        ))}
      </div>
      <div className={`order-info ${side ? 'single' : ''}`}>
        {sides.map((s) => (
          <div key={`cost-${s}`}>
            <span>비용</span>
            <span className="mono">
              {money(s === 'sell' && !info.futures ? 0 : cost)} {info.currency}
            </span>
          </div>
        ))}
        {sides.map((s) => (
          <div key={`max-${s}`}>
            <span>최대</span>
            <span className="mono">
              {money(s === 'buy' ? maxBuy : maxSell)} {info.currency}
            </span>
          </div>
        ))}
      </div>
      {!tradable && game.phase === 'ready' && <p className="hint center">▶ 시작을 누르면 주문할 수 있습니다.</p>}

      {leverageOpen && <LeverageDialog game={game} onClose={() => setLeverageOpen(false)} />}
    </div>
  );
}

export function AccountSummary({ game }: { game: Game }) {
  const ex = game.exchange!;
  const info = game.info;
  const money = (v: number) => `${formatNumber(v, info.moneyDigits)} ${info.currency}`;
  const equity = ex.equity();
  const unrealized = ex.unrealizedPnl();
  const roundReturn = (equity / ex.rules.initialBalance - 1) * 100;
  const pct = (rate: number) => `${+(rate * 100).toFixed(3)}%`;
  const fees = info.futures
    ? `메이커 ${pct(ex.rules.makerFee)} / 테이커 ${pct(ex.rules.takerFee)}`
    : `${pct(ex.rules.takerFee)}${ex.rules.sellTax ? ` (매도 시 세금 ${pct(ex.rules.sellTax)} 별도)` : ''}`;
  return (
    <div className="account">
      <div className="account-title">계정</div>
      <div className="account-row">
        <span>{info.futures ? '마진 잔고' : '평가 자산'}</span>
        <span className="mono">{money(equity)}</span>
      </div>
      <div className="account-row">
        <span>{info.futures ? '지갑 잔고' : '현금'}</span>
        <span className="mono">{money(info.futures ? ex.walletBalance() : ex.balance)}</span>
      </div>
      <div className="account-row">
        <span>{info.futures ? '미실현 손익' : '평가 손익'}</span>
        <span className={`mono ${pnlClass(unrealized)}`}>
          {formatSigned(unrealized, info.moneyDigits)} {info.currency}
        </span>
      </div>
      <div className="account-row">
        <span>라운드 수익률</span>
        <span className={`mono ${pnlClass(roundReturn)}`}>{formatSigned(roundReturn)}%</span>
      </div>
      <div className="account-row muted">
        <span>수수료</span>
        <span className="mono">{fees}</span>
      </div>
    </div>
  );
}

export function OrderPanel({ game }: { game: Game }) {
  if (!game.exchange) return <aside className="order-panel" />;
  return (
    <aside className="order-panel">
      <OrderForm game={game} />
      <AccountSummary game={game} />
    </aside>
  );
}
