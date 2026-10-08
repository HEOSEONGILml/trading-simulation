import { useState } from 'react';
import type { RoundSettings } from '../api.ts';
import { MARKETS, MARKET_INFO, type Market } from '../market.ts';
import { SPEEDS, fitSetup, type SetupSettings } from '../settings.ts';

interface Props {
  initial: SetupSettings;
  speed: number;
  /** 지금 라운드를 열 수 있는 시장. 나머지는 "준비 중" */
  available: Market[];
  loading: boolean;
  canClose: boolean;
  onClose: () => void;
  onStart: (setup: SetupSettings, round: RoundSettings, speed: number) => void;
}

/** YYYY-MM-DD를 로컬 자정 기준 시각으로 */
const toTime = (date: string, endOfDay = false) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + (endOfDay ? 1 : 0)).getTime() - (endOfDay ? 1 : 0);
};

export function SetupDialog({ initial, speed: initialSpeed, available, loading, canClose, onClose, onStart }: Props) {
  const [setup, setSetup] = useState(() => fitSetup(available.includes(initial.market) ? initial : { ...initial, market: 'coin' }));
  const [speed, setSpeed] = useState(initialSpeed);
  const info = MARKET_INFO[setup.market];
  const today = new Date().toISOString().slice(0, 10);
  const valid = available.includes(setup.market) && setup.rangeStart && setup.rangeEnd && setup.rangeStart <= setup.rangeEnd;

  const submit = () => {
    if (!valid) return;
    onStart(
      setup,
      {
        market: setup.market,
        rangeStart: toTime(setup.rangeStart),
        rangeEnd: toTime(setup.rangeEnd, true),
        historyMinutes: setup.historyMinutes,
        hideDate: setup.hideDate,
        hidePrice: setup.hidePrice,
      },
      speed,
    );
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <span>새 라운드</span>
          {canClose && (
            <button className="icon-btn" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>섹션</label>
            <div className="chips market-chips">
              {MARKETS.map((m) => {
                const ready = available.includes(m);
                return (
                  <button
                    key={m}
                    className={`chip ${setup.market === m ? 'active' : ''}`}
                    disabled={!ready}
                    onClick={() => setSetup(fitSetup({ ...setup, market: m }))}
                  >
                    {MARKET_INFO[m].label}
                    {!ready && <span className="chip-note"> 준비 중</span>}
                  </button>
                );
              })}
            </div>
            <p className="hint">{info.description}</p>
          </div>

          <div className="form-row">
            <label>시작 시점 범위</label>
            <div className="date-range">
              <input
                type="date"
                min={info.earliestDate}
                max={today}
                value={setup.rangeStart}
                onChange={(e) => setSetup({ ...setup, rangeStart: e.target.value })}
              />
              <span>~</span>
              <input
                type="date"
                min={info.earliestDate}
                max={today}
                value={setup.rangeEnd}
                onChange={(e) => setSetup({ ...setup, rangeEnd: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <label>시작 전 보여줄 과거 구간{info.futures ? '' : ' (정규장 기준)'}</label>
            <div className="chips">
              {info.historyOptions.map((o) => (
                <button
                  key={o.minutes}
                  className={`chip ${setup.historyMinutes === o.minutes ? 'active' : ''}`}
                  onClick={() => setSetup({ ...setup, historyMinutes: o.minutes })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label>배속 (진행 중에도 변경 가능)</label>
            <div className="chips">
              {SPEEDS.map((s) => (
                <button key={s} className={`chip ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>
                  {s}x
                </button>
              ))}
            </div>
            <p className="hint">1배속은 실제처럼 1분마다 1분봉 하나, 60배속은 1초마다 하나가 추가됩니다.</p>
          </div>

          <div className="form-row">
            <label className="check">
              <input type="checkbox" checked={setup.hideDate} onChange={(e) => setSetup({ ...setup, hideDate: e.target.checked })} />
              날짜 가리기
            </label>
            <p className="hint">연월일을 더미 날짜로 바꿉니다. 요일과 시각은 그대로 유지됩니다.</p>
            <label className="check">
              <input
                type="checkbox"
                checked={setup.hidePrice}
                onChange={(e) => setSetup({ ...setup, hidePrice: e.target.checked })}
              />
              가격 가리기
            </label>
            <p className="hint">시작가를 무작위의 깔끔한 값으로 바꾸고 모든 가격에 같은 비율을 적용합니다. 변동률은 그대로입니다.</p>
          </div>

          {!valid && <p className="hint warn">기간을 올바르게 선택해주세요.</p>}
          <button className="btn btn-primary btn-block" disabled={!valid || loading} onClick={submit}>
            {loading ? '차트 불러오는 중…' : '차트 불러오기'}
          </button>
        </div>
      </div>
    </div>
  );
}
