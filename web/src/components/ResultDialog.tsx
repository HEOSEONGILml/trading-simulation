import { REASON_LABEL } from '../engine/exchange.ts';
import { MINUTE } from '../engine/types.ts';
import type { Game } from '../game/game.ts';
import { formatDateTime, formatDuration, formatNumber, formatSigned, pnlClass, weekday } from '../format.ts';

interface Props {
  game: Game;
  onClose: () => void;
  onNext: () => void;
  onChangeSettings: () => void;
  onHistory: () => void;
}

export function ResultDialog({ game, onClose, onNext, onChangeSettings, onHistory }: Props) {
  const result = game.result!;
  const { summary, record } = result;
  const ex = game.exchange!;
  const precision = game.round?.pricePrecision ?? 1;
  const returnPct = (summary.endEquity / summary.startEquity - 1) * 100;
  const pnl = summary.endEquity - summary.startEquity;
  const winRate = summary.tradeCount ? (summary.winCount / summary.tradeCount) * 100 : 0;
  const duration = summary.candleCount * MINUTE;
  const trades = ex.trades.filter((t) => t.closeTime !== null);

  const realStart = record?.realStartTime;
  const factor = record?.priceFactor ?? 1;
  const offset = record?.dateOffset ?? 0;
  const info = game.info;
  const realPrice = (p: number) => formatNumber(p / factor, info.futures ? 1 : info.moneyDigits);
  const money = (v: number) => formatNumber(v, info.moneyDigits);
  // 주식은 장 마감과 주말로 봉 사이가 비므로 서버가 알려준 실제 끝 시각을 쓴다
  const realEnd = record ? record.realEndTime : (realStart ?? 0) + duration;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg">
        <div className="modal-header">
          <span>라운드 결과</span>
          <button className="icon-btn" onClick={onClose} title="차트로 돌아가기">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="result-hero">
            <div className={`result-return mono ${pnlClass(returnPct)}`}>{formatSigned(returnPct)}%</div>
            <div className={`mono ${pnlClass(pnl)}`}>
              {formatSigned(pnl, info.moneyDigits)} {info.currency}
            </div>
            <div className="muted small">
              {money(summary.startEquity)} → {money(summary.endEquity)} {info.currency} · 진행 {formatDuration(duration)}
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span>거래 횟수</span>
              <b className="mono">{summary.tradeCount}</b>
            </div>
            <div className="stat-card">
              <span>승률</span>
              <b className="mono">{summary.tradeCount ? `${formatNumber(winRate, 1)}%` : '-'}</b>
            </div>
            <div className="stat-card">
              <span>최대 낙폭</span>
              <b className="mono down">{formatNumber(summary.maxDrawdownPct)}%</b>
            </div>
            <div className="stat-card">
              <span>실현 손익</span>
              <b className={`mono ${pnlClass(summary.realizedPnl)}`}>{formatSigned(summary.realizedPnl, info.moneyDigits)}</b>
            </div>
            <div className="stat-card">
              <span>수수료</span>
              <b className="mono">{money(summary.fees)}</b>
            </div>
            {info.futures && (
              <div className="stat-card">
                <span>강제 청산</span>
                <b className={`mono ${summary.liquidationCount ? 'down' : ''}`}>{summary.liquidationCount}</b>
              </div>
            )}
          </div>

          <div className="reveal">
            <div className="reveal-title">실제 차트 정보</div>
            {realStart !== undefined ? (
              <>
                {record?.symbolName && !info.futures && (
                  <div className="kv">
                    <span>종목</span>
                    <b>
                      {record.symbolName} <span className="muted mono">{record.symbol}</span>
                    </b>
                  </div>
                )}
                <div className="kv">
                  <span>실제 기간</span>
                  <span className="mono">
                    {formatDateTime(realStart)} ({weekday(realStart)}) ~ {formatDateTime(realEnd)}
                  </span>
                </div>
                {offset !== 0 && (
                  <div className="kv muted">
                    <span>표시된 기간</span>
                    <span className="mono">
                      {formatDateTime(realStart + offset)} ~ {formatDateTime(realEnd + offset)}
                    </span>
                  </div>
                )}
                <div className="kv">
                  <span>실제 가격</span>
                  <span className="mono">
                    {realPrice(result.startPrice)} → {realPrice(result.endPrice)} {info.currency}
                  </span>
                </div>
                {factor !== 1 && (
                  <div className="kv muted">
                    <span>표시된 가격</span>
                    <span className="mono">
                      {formatNumber(result.startPrice, precision)} → {formatNumber(result.endPrice, precision)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="hint warn">결과를 서버에 저장하지 못했습니다{result.error ? `: ${result.error}` : ''}.</p>
            )}
            {record && !result.saved && <p className="hint">시간이 흐르지 않은 라운드라 기록에 저장하지 않았습니다.</p>}
          </div>

          {trades.length > 0 && (
            <div className="result-trades">
              <table className="table">
                <thead>
                  <tr>
                    <th>방향</th>
                    <th>진입 시각</th>
                    <th>진입가</th>
                    <th>종료가</th>
                    <th>순손익</th>
                    <th>종료 사유</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const net = t.pnl - t.fees;
                    return (
                      <tr key={t.id}>
                        <td className={t.side === 'long' ? 'up' : 'down'}>{info.futures ? (t.side === 'long' ? '롱' : '숏') : '매수'}</td>
                        <td className="mono">{formatDateTime(t.openTime - offset)}</td>
                        <td className="mono">{realPrice(t.entryPrice)}</td>
                        <td className="mono">{realPrice(t.exitPrice)}</td>
                        <td className={`mono ${pnlClass(net)}`}>{formatSigned(net, info.moneyDigits)}</td>
                        <td>{t.closeReason ? REASON_LABEL[t.closeReason] : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="hint">시각과 가격은 실제 값으로 표시했습니다.</p>
            </div>
          )}

          <div className="result-actions">
            <button className="btn" onClick={onHistory}>
              기록 보기
            </button>
            <button className="btn" onClick={onChangeSettings}>
              설정 바꾸기
            </button>
            <button className="btn btn-primary" onClick={onNext}>
              같은 설정으로 다음 라운드
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
