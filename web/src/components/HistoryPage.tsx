import { useEffect, useState } from 'react';
import { api, type HistorySummary, type RoundRecord } from '../api.ts';
import { formatDateTime, formatDuration, formatNumber, formatSigned, pnlClass } from '../format.ts';

/** 미실현 수익/손실 시간. 집계 기능 이전의 기록은 '-' */
function PnlTime({ profit, loss }: { profit: number | null; loss: number | null }) {
  if (profit === null || loss === null) return <span className="muted">-</span>;
  return (
    <>
      <span className="up">{formatDuration(profit * 60_000)}</span> / <span className="down">{formatDuration(loss * 60_000)}</span>
    </>
  );
}

export function HistoryPage({ mobile = false }: { mobile?: boolean }) {
  const [data, setData] = useState<{ summary: HistorySummary; rounds: RoundRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .history()
      .then(setData)
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm('이 라운드 기록을 삭제할까요?')) return;
    await api.deleteHistory(id).catch((err: Error) => setError(err.message));
    void load();
  };

  if (error) return <div className="history-page empty">{error}</div>;
  if (!data) return <div className="history-page empty">불러오는 중…</div>;
  const s = data.summary;

  return (
    <div className="history-page">
      <h2>누적 통계</h2>
      <div className="stat-grid wide">
        <div className="stat-card">
          <span>라운드</span>
          <b className="mono">{s.roundCount}</b>
        </div>
        <div className="stat-card">
          <span>수익 라운드 비율</span>
          <b className="mono">{s.roundCount ? `${formatNumber((s.profitableRounds / s.roundCount) * 100, 1)}%` : '-'}</b>
        </div>
        <div className="stat-card">
          <span>평균 수익률</span>
          <b className={`mono ${pnlClass(s.avgReturnPct)}`}>{formatSigned(s.avgReturnPct)}%</b>
        </div>
        <div className="stat-card">
          <span>누적 복리 수익률</span>
          <b className={`mono ${pnlClass(s.compoundReturnPct)}`}>{formatSigned(s.compoundReturnPct)}%</b>
        </div>
        <div className="stat-card">
          <span>최고 / 최저</span>
          <b className="mono">
            <span className={pnlClass(s.bestReturnPct)}>{formatSigned(s.bestReturnPct)}%</span> /{' '}
            <span className={pnlClass(s.worstReturnPct)}>{formatSigned(s.worstReturnPct)}%</span>
          </b>
        </div>
        <div className="stat-card">
          <span>평균 최대 낙폭</span>
          <b className="mono down">{formatNumber(s.avgMaxDrawdownPct)}%</b>
        </div>
        <div className="stat-card">
          <span>총 거래 / 승률</span>
          <b className="mono">
            {s.tradeCount} / {s.tradeCount ? `${formatNumber(s.tradeWinRatePct, 1)}%` : '-'}
          </b>
        </div>
        <div className="stat-card">
          <span>강제 청산</span>
          <b className={`mono ${s.liquidationCount ? 'down' : ''}`}>{s.liquidationCount}</b>
        </div>
        <div className="stat-card">
          <span>총 수수료</span>
          <b className="mono">{formatNumber(s.totalFees)} USDT</b>
        </div>
        <div className="stat-card">
          <span>총 훈련 구간</span>
          <b className="mono">{formatDuration(s.totalMinutes * 60_000)}</b>
        </div>
        <div className="stat-card">
          <span>미실현 수익 / 손실 시간</span>
          <b className="mono">
            <PnlTime profit={s.totalProfitMinutes} loss={s.totalLossMinutes} />
          </b>
        </div>
      </div>

      <h2>라운드 기록</h2>
      {data.rounds.length === 0 ? (
        <div className="empty">아직 완료한 라운드가 없습니다.</div>
      ) : mobile ? (
        data.rounds.map((r) => (
          <div key={r.id} className="m-card">
            <div className="m-card-head">
              <b className={`mono ${pnlClass(r.returnPct)}`}>{formatSigned(r.returnPct)}%</b>
              <span className={`mono small ${pnlClass(r.endEquity - r.startEquity)}`}>
                {formatSigned(r.endEquity - r.startEquity)} USDT
              </span>
              <div className="header-spacer" />
              <button className="link-btn" onClick={() => remove(r.id)}>
                삭제
              </button>
            </div>
            <div className="m-grid">
              <div className="m-cell">
                <span>거래 / 승률</span>
                <b className="mono">
                  {r.tradeCount} / {r.tradeCount ? `${formatNumber((r.winCount / r.tradeCount) * 100, 0)}%` : '-'}
                </b>
              </div>
              <div className="m-cell">
                <span>최대 낙폭</span>
                <b className="mono">{formatNumber(r.maxDrawdownPct)}%</b>
              </div>
              <div className="m-cell">
                <span>진행</span>
                <b>{formatDuration(r.candleCount * 60_000)}</b>
              </div>
              <div className="m-cell">
                <span>강제 청산</span>
                <b className="mono">{r.liquidationCount}</b>
              </div>
              <div className="m-cell wide">
                <span>미실현 수익 / 손실</span>
                <b>
                  <PnlTime profit={r.profitMinutes} loss={r.lossMinutes} />
                </b>
              </div>
            </div>
            <div className="muted small mono">
              실제 {formatDateTime(r.realStartTime)} ~ {formatDateTime(r.realEndTime)}
            </div>
          </div>
        ))
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>플레이 시각</th>
                <th>실제 차트 기간</th>
                <th>진행</th>
                <th>수익률</th>
                <th>손익</th>
                <th>거래 / 승률</th>
                <th>미실현 수익 / 손실</th>
                <th>최대 낙폭</th>
                <th>강제 청산</th>
                <th>가리기</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rounds.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{formatDateTime(r.playedAt)}</td>
                  <td className="mono">
                    {formatDateTime(r.realStartTime)} ~ {formatDateTime(r.realEndTime)}
                  </td>
                  <td>{formatDuration(r.candleCount * 60_000)}</td>
                  <td className={`mono ${pnlClass(r.returnPct)}`}>{formatSigned(r.returnPct)}%</td>
                  <td className={`mono ${pnlClass(r.endEquity - r.startEquity)}`}>{formatSigned(r.endEquity - r.startEquity)}</td>
                  <td className="mono">
                    {r.tradeCount} / {r.tradeCount ? `${formatNumber((r.winCount / r.tradeCount) * 100, 0)}%` : '-'}
                  </td>
                  <td>
                    <PnlTime profit={r.profitMinutes} loss={r.lossMinutes} />
                  </td>
                  <td className="mono">{formatNumber(r.maxDrawdownPct)}%</td>
                  <td className="mono">{r.liquidationCount}</td>
                  <td className="muted">{[r.hideDate && '날짜', r.hidePrice && '가격'].filter(Boolean).join(', ') || '-'}</td>
                  <td>
                    <button className="link-btn" onClick={() => remove(r.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
