import { useRef, useState } from 'react';
import { ChartView } from '../../chart/ChartView.tsx';
import { REASON_LABEL } from '../../engine/exchange.ts';
import type { OrderSide } from '../../engine/types.ts';
import type { Game } from '../../game/game.ts';
import { formatDateTime, formatNumber, formatSigned, pnlClass } from '../../format.ts';
import type { ViewSettings } from '../../settings.ts';
import { TpSlDialog } from '../BottomPanel.tsx';
import { AccountSummary, OrderForm, parseNumber, type OrderDraft } from '../OrderPanel.tsx';

type Tab = 'position' | 'orders' | 'fills' | 'trades' | 'account';

function Cell({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="m-cell">
      <span>{label}</span>
      <b className={`mono ${className}`}>{value}</b>
    </div>
  );
}

function PositionCard({ game }: { game: Game }) {
  const ex = game.exchange!;
  const p = ex.position!;
  const precision = game.round?.pricePrecision ?? 1;
  const [tpslOpen, setTpslOpen] = useState(false);
  const [closePrice, setClosePrice] = useState('');
  const pnl = ex.unrealizedPnl();

  const limitClose = () => {
    const price = parseNumber(closePrice);
    if (price === null) return game.toast('error', '청산할 지정가를 입력해주세요.');
    game.limitOrder(p.side === 'long' ? 'sell' : 'buy', price, p.qty, { reduceOnly: true });
  };

  return (
    <div className="m-card">
      <div className="m-card-head">
        <span className={`m-badge ${p.side === 'long' ? 'up-bg' : 'down-bg'}`}>{p.side === 'long' ? '롱' : '숏'}</span>
        <b>BTCUSDT</b>
        <span className="muted small">격리 {p.leverage}x</span>
      </div>
      <div className="m-pnl">
        <div>
          <span className="muted small">미실현 손익 (USDT)</span>
          <b className={`mono ${pnlClass(pnl)}`}>{formatSigned(pnl)}</b>
        </div>
        <div className="right">
          <span className="muted small">ROE</span>
          <b className={`mono ${pnlClass(pnl)}`}>{formatSigned((pnl / p.margin) * 100)}%</b>
        </div>
      </div>
      <div className="m-grid">
        <Cell label="수량 (BTC)" value={formatNumber(p.qty, 4)} />
        <Cell label="증거금" value={formatNumber(p.margin)} />
        <Cell label="진입가" value={formatNumber(p.entryPrice, precision)} />
        <Cell label="현재가" value={formatNumber(ex.lastPrice, precision)} />
        <Cell label="청산가" value={formatNumber(ex.liquidationPrice() ?? 0, precision)} className="liq" />
        <Cell
          label="익절 / 손절"
          value={`${p.takeProfit !== null ? formatNumber(p.takeProfit, precision) : '--'} / ${p.stopLoss !== null ? formatNumber(p.stopLoss, precision) : '--'}`}
        />
      </div>
      <div className="m-actions">
        <button className="btn" onClick={() => setTpslOpen(true)}>
          익절/손절
        </button>
        <button className="btn" onClick={() => game.closePosition(0.5)}>
          50% 청산
        </button>
        <button className="btn" onClick={() => game.closePosition()}>
          시장가 청산
        </button>
      </div>
      <div className="m-actions">
        <input
          className="mini-input mono grow"
          inputMode="decimal"
          value={closePrice}
          placeholder="지정가 청산 가격"
          onChange={(e) => setClosePrice(e.target.value)}
        />
        <button className="btn" onClick={limitClose}>
          지정가 청산
        </button>
      </div>
      {tpslOpen && <TpSlDialog game={game} onClose={() => setTpslOpen(false)} />}
    </div>
  );
}

function MobileLists({ game }: { game: Game }) {
  const [tab, setTab] = useState<Tab>('position');
  const ex = game.exchange!;
  const precision = game.round?.pricePrecision ?? 1;
  const closedTrades = ex.trades.filter((t) => t.closeTime !== null).reverse();
  const fills = [...ex.fills].reverse();

  return (
    <section className="m-lists">
      <div className="m-tabs">
        <button className={tab === 'position' ? 'active' : ''} onClick={() => setTab('position')}>
          포지션({ex.position ? 1 : 0})
        </button>
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>
          주문({ex.orders.length})
        </button>
        <button className={tab === 'fills' ? 'active' : ''} onClick={() => setTab('fills')}>
          체결
        </button>
        <button className={tab === 'trades' ? 'active' : ''} onClick={() => setTab('trades')}>
          거래({closedTrades.length})
        </button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
          자산
        </button>
      </div>

      {tab === 'position' && (ex.position ? <PositionCard game={game} /> : <div className="empty">보유 중인 포지션이 없습니다.</div>)}

      {tab === 'orders' &&
        (ex.orders.length > 0 ? (
          <>
            <div className="m-list-head">
              <button className="link-btn" onClick={() => game.cancelAllOrders()}>
                전체 취소
              </button>
            </div>
            {ex.orders.map((o) => (
              <div key={o.id} className="m-card">
                <div className="m-card-head">
                  <span className={`m-badge ${o.side === 'buy' ? 'up-bg' : 'down-bg'}`}>{o.side === 'buy' ? '매수' : '매도'}</span>
                  <b>지정가</b>
                  {o.reduceOnly && <span className="muted small">감소 전용</span>}
                  <div className="header-spacer" />
                  <button className="btn m-btn" onClick={() => game.cancelOrder(o.id)}>
                    취소
                  </button>
                </div>
                <div className="m-grid">
                  <Cell label="가격" value={formatNumber(o.price, precision)} />
                  <Cell label="수량 (BTC)" value={formatNumber(o.qty, 4)} />
                  <Cell label="규모 (USDT)" value={formatNumber(o.qty * o.price)} />
                  <Cell
                    label="익절 / 손절"
                    value={`${o.takeProfit !== null ? formatNumber(o.takeProfit, precision) : '--'} / ${o.stopLoss !== null ? formatNumber(o.stopLoss, precision) : '--'}`}
                  />
                </div>
                <div className="muted small mono">{formatDateTime(o.createdAt)}</div>
              </div>
            ))}
          </>
        ) : (
          <div className="empty">미체결 주문이 없습니다.</div>
        ))}

      {tab === 'fills' &&
        (fills.length > 0 ? (
          fills.map((f) => (
            <div key={f.id} className="m-row-item">
              <div>
                <span className={f.side === 'buy' ? 'up' : 'down'}>{f.side === 'buy' ? '매수' : '매도'}</span>{' '}
                <span>{REASON_LABEL[f.reason]}</span>
                <div className="muted small mono">{formatDateTime(f.time)}</div>
              </div>
              <div className="right">
                <span className="mono">
                  {formatNumber(f.price, precision)} × {formatNumber(f.qty, 4)}
                </span>
                <div className={`small mono ${pnlClass(f.realizedPnl)}`}>
                  {formatSigned(f.realizedPnl)} <span className="muted">(수수료 {formatNumber(f.fee, 2)})</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">체결 내역이 없습니다.</div>
        ))}

      {tab === 'trades' &&
        (closedTrades.length > 0 ? (
          closedTrades.map((t) => {
            const net = t.pnl - t.fees;
            return (
              <div key={t.id} className="m-row-item">
                <div>
                  <span className={t.side === 'long' ? 'up' : 'down'}>{t.side === 'long' ? '롱' : '숏'}</span>{' '}
                  <span className="muted">{t.closeReason ? REASON_LABEL[t.closeReason] : ''}</span>
                  <div className="muted small mono">
                    {formatDateTime(t.openTime).slice(5)} → {formatDateTime(t.closeTime!).slice(5)}
                  </div>
                </div>
                <div className="right">
                  <span className="mono">
                    {formatNumber(t.entryPrice, precision)} → {formatNumber(t.exitPrice, precision)}
                  </span>
                  <div className={`small mono ${pnlClass(net)}`}>{formatSigned(net)} USDT</div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">완료된 거래가 없습니다.</div>
        ))}

      {tab === 'account' && (
        <div className="m-card">
          <AccountSummary game={game} />
        </div>
      )}
    </section>
  );
}

interface OrderSheetProps {
  game: Game;
  side: OrderSide;
  draft?: OrderDraft;
  onDraftChange: (draft: OrderDraft | undefined) => void;
  onSideChange: (s: OrderSide) => void;
  onClose: () => void;
}

function OrderSheet({ game, side, draft, onDraftChange, onSideChange, onClose }: OrderSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="segmented">
            <button className={side === 'buy' ? 'active buy' : ''} onClick={() => onSideChange('buy')}>
              매수/롱
            </button>
            <button className={side === 'sell' ? 'active sell' : ''} onClick={() => onSideChange('sell')}>
              매도/숏
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <OrderForm
          game={game}
          side={side}
          draft={draft}
          onDraftChange={onDraftChange}
          onSubmitted={() => {
            // 주문이 들어가면 작성 내용을 비운다
            onDraftChange(undefined);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

interface Props {
  game: Game;
  version: number;
  view: ViewSettings;
  onViewChange: (view: ViewSettings) => void;
}

export function MobileTrade({ game, version, view, onViewChange }: Props) {
  const [sheetSide, setSheetSide] = useState<OrderSide | null>(null);
  // 주문 창을 닫았다 열어도 작성하던 내용을 유지한다 (라운드가 바뀌면 초기화)
  const draftRef = useRef<{ roundId: string; draft: OrderDraft } | null>(null);
  const roundId = game.round?.roundId;
  const draft = draftRef.current && draftRef.current.roundId === roundId ? draftRef.current.draft : undefined;
  const setDraft = (next: OrderDraft | undefined) => {
    draftRef.current = next && roundId ? { roundId, draft: next } : null;
  };
  const ex = game.exchange;
  const tradable = game.phase === 'running' || game.phase === 'paused';

  return (
    <main className="m-trade">
      <ChartView game={game} version={version} view={view} onViewChange={onViewChange} mobile />
      {ex && <MobileLists game={game} />}
      {ex && (
        <div className="m-bottom-bar">
          <button className="btn-buy" disabled={!tradable} onClick={() => setSheetSide('buy')}>
            매수/롱
          </button>
          <button className="btn-sell" disabled={!tradable} onClick={() => setSheetSide('sell')}>
            매도/숏
          </button>
        </div>
      )}
      {sheetSide && ex && <OrderSheet game={game} side={sheetSide} draft={draft} onDraftChange={setDraft} onSideChange={setSheetSide} onClose={() => setSheetSide(null)} />}
    </main>
  );
}
