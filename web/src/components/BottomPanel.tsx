import { useState } from 'react';
import { REASON_LABEL } from '../engine/exchange.ts';
import type { Game } from '../game/game.ts';
import { formatDateTime, formatNumber, formatSigned, pnlClass } from '../format.ts';
import { parseNumber as parse } from './OrderPanel.tsx';

type Tab = 'position' | 'orders' | 'fills' | 'trades';

export function TpSlDialog({ game, onClose }: { game: Game; onClose: () => void }) {
  const ex = game.exchange!;
  const info = game.info;
  const p = ex.position!;
  const precision = game.round?.pricePrecision ?? 1;
  const [tp, setTp] = useState(p.takeProfit?.toFixed(precision) ?? '');
  const [sl, setSl] = useState(p.stopLoss?.toFixed(precision) ?? '');
  const dir = p.side === 'long' ? 1 : -1;
  const estimate = (value: string) => {
    const price = parse(value);
    return price === null ? null : (price - p.entryPrice) * p.qty * dir;
  };
  const tpPnl = estimate(tp);
  const slPnl = estimate(sl);

  const save = () => {
    if (game.setPositionTpSl(parse(tp), parse(sl))) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>포지션 익절/손절</span>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="kv">
            <span>진입가</span>
            <span className="mono">{formatNumber(p.entryPrice, precision)}</span>
          </div>
          <div className="kv">
            <span>현재가</span>
            <span className="mono">{formatNumber(ex.lastPrice, precision)}</span>
          </div>
          {info.futures && (
            <div className="kv">
              <span>청산가</span>
              <span className="mono">{formatNumber(ex.liquidationPrice() ?? 0, precision)}</span>
            </div>
          )}
          <div className="field">
            <span className="field-label">익절가</span>
            <input className="mono" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="없음" />
          </div>
          {tpPnl !== null && (
            <p className="hint">
              예상 손익{' '}
              <span className={`mono ${pnlClass(tpPnl)}`}>
                {formatSigned(tpPnl, info.moneyDigits)} {info.currency}
              </span>
            </p>
          )}
          <div className="field">
            <span className="field-label">손절가</span>
            <input className="mono" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="없음" />
          </div>
          {slPnl !== null && (
            <p className="hint">
              예상 손익{' '}
              <span className={`mono ${pnlClass(slPnl)}`}>
                {formatSigned(slPnl, info.moneyDigits)} {info.currency}
              </span>
            </p>
          )}
          <p className="hint">비워두면 해당 주문이 해제됩니다. 체결은 시장가(테이커 수수료)로 처리됩니다.</p>
          <button className="btn btn-primary btn-block" onClick={save}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

export function BottomPanel({ game }: { game: Game }) {
  const [tab, setTab] = useState<Tab>('position');
  const [tpslOpen, setTpslOpen] = useState(false);
  const [closePrice, setClosePrice] = useState('');
  const ex = game.exchange;
  const info = game.info;
  const money = (v: number) => `${formatNumber(v, info.moneyDigits)} ${info.currency}`;
  const qty = (v: number) => formatNumber(v, info.qtyDigits);
  const precision = game.round?.pricePrecision ?? 1;
  if (!ex) return <section className="bottom-panel" />;

  const p = ex.position;
  const closedTrades = ex.trades.filter((t) => t.closeTime !== null).reverse();
  const fills = [...ex.fills].reverse();

  const limitClose = () => {
    const price = parse(closePrice);
    if (!p || price === null) return game.toast('error', '청산할 지정가를 입력해주세요.');
    game.limitOrder(p.side === 'long' ? 'sell' : 'buy', price, p.qty, { reduceOnly: true });
  };

  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        <button className={tab === 'position' ? 'active' : ''} onClick={() => setTab('position')}>
          {info.futures ? '포지션' : '보유'}({p ? 1 : 0})
        </button>
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>
          미체결 주문({ex.orders.length})
        </button>
        <button className={tab === 'fills' ? 'active' : ''} onClick={() => setTab('fills')}>
          체결 내역
        </button>
        <button className={tab === 'trades' ? 'active' : ''} onClick={() => setTab('trades')}>
          거래 기록({closedTrades.length})
        </button>
      </div>

      <div className="bottom-content">
        {tab === 'position' &&
          (p ? (
            <table className="table">
              <thead>
                <tr>
                  <th>심볼</th>
                  <th>수량</th>
                  <th>진입가</th>
                  <th>현재가</th>
                  {info.futures && <th>청산가</th>}
                  <th>{info.futures ? '증거금' : '매입 금액'}</th>
                  <th>{info.futures ? '미실현 손익(ROE)' : '평가 손익'}</th>
                  <th>익절/손절</th>
                  <th>포지션 청산</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className={`side-bar ${p.side === 'long' ? 'up-bg' : 'down-bg'}`} />
                    <b>{info.symbol}</b> <span className="muted">{info.product}</span>
                    {info.futures && (
                      <div className={`small ${p.side === 'long' ? 'up' : 'down'}`}>
                        {p.side === 'long' ? '롱' : '숏'} · 격리 {p.leverage}x
                      </div>
                    )}
                  </td>
                  <td className={`mono ${p.side === 'long' ? 'up' : 'down'}`}>
                    {qty(p.qty)} {info.qtyUnit}
                  </td>
                  <td className="mono">{formatNumber(p.entryPrice, precision)}</td>
                  <td className="mono">{formatNumber(ex.lastPrice, precision)}</td>
                  {info.futures && <td className="mono liq">{formatNumber(ex.liquidationPrice() ?? 0, precision)}</td>}
                  <td className="mono">{money(p.margin)}</td>
                  <td className={`mono ${pnlClass(ex.unrealizedPnl())}`}>
                    {formatSigned(ex.unrealizedPnl(), info.moneyDigits)} {info.currency}
                    <div className="small">({formatSigned((ex.unrealizedPnl() / p.margin) * 100)}%)</div>
                  </td>
                  <td className="mono">
                    <span className="up">{p.takeProfit !== null ? formatNumber(p.takeProfit, precision) : '--'}</span>
                    {' / '}
                    <span className="down">{p.stopLoss !== null ? formatNumber(p.stopLoss, precision) : '--'}</span>
                    <button className="link-btn" onClick={() => setTpslOpen(true)}>
                      ✎
                    </button>
                  </td>
                  <td>
                    <div className="close-actions">
                      <button className="link-btn" onClick={() => game.closePosition()}>
                        시장가
                      </button>
                      <button className="link-btn" onClick={() => game.closePosition(0.5)}>
                        50%
                      </button>
                      <input
                        className="mini-input mono"
                        value={closePrice}
                        placeholder="가격"
                        onChange={(e) => setClosePrice(e.target.value)}
                      />
                      <button className="link-btn" onClick={limitClose}>
                        지정가
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="empty">보유 중인 포지션이 없습니다.</div>
          ))}

        {tab === 'orders' &&
          (ex.orders.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>유형</th>
                  <th>방향</th>
                  <th>가격</th>
                  <th>수량</th>
                  <th>규모</th>
                  <th>감소 전용</th>
                  <th>익절/손절</th>
                  <th>
                    <button className="link-btn" onClick={() => game.cancelAllOrders()}>
                      전체 취소
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ex.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{formatDateTime(o.createdAt)}</td>
                    <td>지정가</td>
                    <td className={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? '매수' : '매도'}</td>
                    <td className="mono">{formatNumber(o.price, precision)}</td>
                    <td className="mono">{qty(o.qty)}</td>
                    <td className="mono">{money(o.qty * o.price)}</td>
                    <td>{o.reduceOnly ? '예' : '아니오'}</td>
                    <td className="mono">
                      {o.takeProfit !== null ? formatNumber(o.takeProfit, precision) : '--'} /{' '}
                      {o.stopLoss !== null ? formatNumber(o.stopLoss, precision) : '--'}
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => game.cancelOrder(o.id)}>
                        취소
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">미체결 주문이 없습니다.</div>
          ))}

        {tab === 'fills' &&
          (fills.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>구분</th>
                  <th>방향</th>
                  <th>가격</th>
                  <th>수량</th>
                  <th>수수료</th>
                  <th>실현 손익</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{formatDateTime(f.time)}</td>
                    <td>{REASON_LABEL[f.reason]}</td>
                    <td className={f.side === 'buy' ? 'up' : 'down'}>{f.side === 'buy' ? '매수' : '매도'}</td>
                    <td className="mono">{formatNumber(f.price, precision)}</td>
                    <td className="mono">{qty(f.qty)}</td>
                    <td className="mono">{formatNumber(f.fee, info.futures ? 4 : info.moneyDigits)}</td>
                    <td className={`mono ${pnlClass(f.realizedPnl)}`}>{formatSigned(f.realizedPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">체결 내역이 없습니다.</div>
          ))}

        {tab === 'trades' &&
          (closedTrades.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>방향</th>
                  <th>진입 시각</th>
                  <th>종료 시각</th>
                  <th>평균 진입가</th>
                  <th>{info.futures ? '평균 청산가' : '평균 매도가'}</th>
                  <th>최대 수량</th>
                  <th>수수료</th>
                  <th>순손익</th>
                  <th>종료 사유</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((t) => {
                  const net = t.pnl - t.fees;
                  return (
                    <tr key={t.id}>
                      <td className={t.side === 'long' ? 'up' : 'down'}>{info.futures ? (t.side === 'long' ? '롱' : '숏') : '매수'}</td>
                      <td className="mono">{formatDateTime(t.openTime)}</td>
                      <td className="mono">{formatDateTime(t.closeTime!)}</td>
                      <td className="mono">{formatNumber(t.entryPrice, precision)}</td>
                      <td className="mono">{formatNumber(t.exitPrice, precision)}</td>
                      <td className="mono">{qty(t.maxQty)}</td>
                      <td className="mono">{formatNumber(t.fees, info.futures ? 4 : info.moneyDigits)}</td>
                      <td className={`mono ${pnlClass(net)}`}>
                        {formatSigned(net, info.moneyDigits)} {info.currency}
                      </td>
                      <td>{t.closeReason ? REASON_LABEL[t.closeReason] : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">완료된 거래가 없습니다.</div>
          ))}
      </div>
      {tpslOpen && p && <TpSlDialog game={game} onClose={() => setTpslOpen(false)} />}
    </section>
  );
}
