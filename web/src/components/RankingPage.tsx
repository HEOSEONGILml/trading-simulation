import { useEffect, useState } from 'react';
import { api, type RankingEntry, type RankingSort } from '../api.ts';
import { formatNumber, formatSigned, pnlClass } from '../format.ts';
import { MARKETS, MARKET_INFO, type Market } from '../market.ts';

const SORTS: { key: RankingSort; label: string }[] = [
  { key: 'compound', label: '누적 복리 수익률' },
  { key: 'average', label: '평균 수익률' },
  { key: 'winrate', label: '수익 라운드 비율' },
];

const pct = (v: number) => `${formatNumber(v, 1)}%`;

export function RankingPage({ mobile = false }: { mobile?: boolean }) {
  const [sort, setSort] = useState<RankingSort>('compound');
  const [market, setMarket] = useState<Market>('coin');
  const [data, setData] = useState<{ minRounds: number; entries: RankingEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api
      .ranking(sort, market)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [sort, market]);

  const metric = (e: RankingEntry) =>
    sort === 'compound' ? e.compoundReturnPct : sort === 'average' ? e.avgReturnPct : e.profitableRoundPct;

  return (
    <div className="history-page">
      <h2>랭킹</h2>
      <div className="chips market-chips">
        {MARKETS.map((m) => (
          <button key={m} className={`chip ${market === m ? 'active' : ''}`} onClick={() => setMarket(m)}>
            {MARKET_INFO[m].label}
          </button>
        ))}
      </div>
      <div className="chips">
        {SORTS.map((s) => (
          <button key={s.key} className={`chip ${sort === s.key ? 'active' : ''}`} onClick={() => setSort(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {data && sort !== 'compound' && <p className="hint">라운드를 {data.minRounds}회 이상 완료한 회원만 표시합니다.</p>}

      {error ? (
        <div className="empty">{error}</div>
      ) : !data ? (
        <div className="empty">불러오는 중…</div>
      ) : data.entries.length === 0 ? (
        <div className="empty">아직 랭킹에 오른 회원이 없습니다.</div>
      ) : mobile ? (
        <div className="ranking-list">
          {data.entries.map((e) => (
            <div key={e.rank} className={`ranking-item ${e.isMe ? 'me' : ''}`}>
              <span className={`rank rank-${e.rank}`}>{e.rank}</span>
              <div className="ranking-name">
                <b>{e.nickname}</b>
                <span className="muted small">
                  {e.roundCount}라운드 · 거래 승률 {pct(e.tradeWinRatePct)}
                </span>
              </div>
              <b className={`mono ${sort === 'winrate' ? '' : pnlClass(metric(e))}`}>
                {sort === 'winrate' ? pct(metric(e)) : `${formatSigned(metric(e))}%`}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>순위</th>
                <th>닉네임</th>
                <th>라운드</th>
                <th>누적 복리 수익률</th>
                <th>평균 수익률</th>
                <th>수익 라운드 비율</th>
                <th>거래 승률</th>
                <th>최고 수익률</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.rank} className={e.isMe ? 'me' : ''}>
                  <td>
                    <span className={`rank rank-${e.rank}`}>{e.rank}</span>
                  </td>
                  <td>
                    <b>{e.nickname}</b>
                    {e.isMe && <span className="me-tag">나</span>}
                  </td>
                  <td className="mono">{e.roundCount}</td>
                  <td className={`mono ${pnlClass(e.compoundReturnPct)}`}>{formatSigned(e.compoundReturnPct)}%</td>
                  <td className={`mono ${pnlClass(e.avgReturnPct)}`}>{formatSigned(e.avgReturnPct)}%</td>
                  <td className="mono">{pct(e.profitableRoundPct)}</td>
                  <td className="mono">{pct(e.tradeWinRatePct)}</td>
                  <td className={`mono ${pnlClass(e.bestReturnPct)}`}>{formatSigned(e.bestReturnPct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
