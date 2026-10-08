import { useEffect, useState } from 'react';
import type { Game } from '../../game/game.ts';
import { formatDateTime, formatDuration, formatNumber, formatSigned, pnlClass, weekday } from '../../format.ts';
import { MINIAPP } from '../../env.ts';
import { SPEEDS } from '../../settings.ts';
import { LegalLinks, type HeaderProps } from '../Header.tsx';

function Clock({ game }: { game: Game }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, []);
  const time = game.simTime();
  // 주식은 장 마감과 주말을 건너뛰므로 진행한 봉 수(정규장 분)로 센다
  const elapsed = !game.round ? 0 : game.info.futures ? Math.max(0, time - game.round.startTime) : (game.exchange?.candleCount ?? 0) * 60_000;
  return (
    <span className="m-clock mono">
      {formatDateTime(time, true).slice(5)} ({weekday(time)}) · {formatDuration(elapsed)}
    </span>
  );
}

function Menu({ user, onPageChange, onChangeNickname, onLogout }: Pick<HeaderProps, 'user' | 'onPageChange' | 'onChangeNickname' | 'onLogout'>) {
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="dropdown">
      <button className="m-link" onClick={() => setOpen((v) => !v)} aria-label="메뉴">
        ☰
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="dropdown-menu right m-menu">
            <div className="dropdown-title">
              {user.nickname} {!MINIAPP && <span className="muted">({user.username})</span>}
            </div>
            <button className="dropdown-item" onClick={pick(() => onPageChange('trade'))}>
              트레이딩
            </button>
            <button className="dropdown-item" onClick={pick(() => onPageChange('history'))}>
              내 기록
            </button>
            <button className="dropdown-item" onClick={pick(() => onPageChange('ranking'))}>
              랭킹
            </button>
            <button className="dropdown-item" onClick={pick(onChangeNickname)}>
              닉네임 변경
            </button>
            {!MINIAPP && (
              <button className="dropdown-item" onClick={pick(onLogout)}>
                로그아웃
              </button>
            )}
            <LegalLinks />
          </div>
        </>
      )}
    </div>
  );
}

export function MobileHeader(props: HeaderProps) {
  const { game, page, onPageChange, onSpeedChange, onNewRound, onShowResult } = props;
  const menu = <Menu user={props.user} onPageChange={onPageChange} onChangeNickname={props.onChangeNickname} onLogout={props.onLogout} />;
  const { phase, exchange: ex, round, candles } = game;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const precision = round?.pricePrecision ?? 1;
  const priceUp = !prev || !last || last.close >= prev.close;
  const inRound = ex && phase !== 'setup' && phase !== 'loading';
  const roundReturn = ex ? (ex.equity() / ex.rules.initialBalance - 1) * 100 : 0;

  if (page !== 'trade') {
    return (
      <header className="m-header">
        <div className="m-row">
          <button className="m-back" onClick={() => onPageChange('trade')}>
            ‹ 트레이딩
          </button>
          <span className="m-title">{page === 'history' ? '내 기록' : '랭킹'}</span>
          <div className="header-spacer" />
          {menu}
        </div>
      </header>
    );
  }

  return (
    <header className="m-header">
      <div className="m-row">
        <div className="m-symbol">
          <span className="symbol-name">{game.info.symbol}</span>
          <span className="symbol-sub">{game.info.product}</span>
        </div>
        {inRound && last && (
          <span className={`m-price mono ${priceUp ? 'up' : 'down'}`}>{formatNumber(last.close, precision)}</span>
        )}
        <div className="header-spacer" />
        {inRound && <span className={`m-return mono ${pnlClass(roundReturn)}`}>{formatSigned(roundReturn)}%</span>}
        {menu}
      </div>
      {inRound && (
        <div className="m-row">
          <Clock game={game} />
          <div className="header-spacer" />
          {game.waiting && <span className="waiting small">수신 중…</span>}
          {phase !== 'finished' && phase !== 'finishing' && (
            <select
              className="speed-select m-speed"
              value={game.speed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          )}
          {phase === 'ready' && (
            <>
              <button className="btn m-btn" onClick={onNewRound}>
                다른 시점
              </button>
              <button className="btn btn-primary m-btn" onClick={() => game.start()}>
                ▶ 시작
              </button>
            </>
          )}
          {phase === 'running' && (
            <button className="btn m-btn" onClick={() => game.pause()} aria-label="일시정지">
              ❚❚
            </button>
          )}
          {phase === 'paused' && (
            <button className="btn btn-primary m-btn" onClick={() => game.start()} disabled={game.dataEnded} aria-label="재개">
              ▶
            </button>
          )}
          {(phase === 'running' || phase === 'paused') && (
            <button className="btn btn-danger m-btn" onClick={() => game.finish()}>
              종료
            </button>
          )}
          {phase === 'finishing' && <span className="waiting small">정리 중…</span>}
          {phase === 'finished' && (
            <>
              <button className="btn m-btn" onClick={onShowResult}>
                결과
              </button>
              <button className="btn btn-primary m-btn" onClick={onNewRound}>
                새 라운드
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
