import { useEffect, useState } from 'react';
import type { User } from '../api.ts';
import type { Game } from '../game/game.ts';
import { formatDateTime, formatDuration, formatNumber, weekday } from '../format.ts';
import { SPEEDS } from '../settings.ts';

function SimClock({ game }: { game: Game }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, []);
  const time = game.simTime();
  const elapsed = game.round ? time - game.round.startTime : 0;
  return (
    <>
      <div className="stat">
        <span className="stat-label">현재 시각</span>
        <span className="stat-value mono">
          {formatDateTime(time, true)} ({weekday(time)})
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">라운드 경과</span>
        <span className="stat-value mono">{formatDuration(Math.max(0, elapsed))}</span>
      </div>
    </>
  );
}

export type Page = 'trade' | 'history' | 'ranking';

export interface HeaderProps {
  game: Game;
  user: User;
  page: Page;
  onPageChange: (page: Page) => void;
  onChangeNickname: () => void;
  onLogout: () => void;
  onSpeedChange: (speed: number) => void;
  onNewRound: () => void;
  onShowResult: () => void;
}

function UserMenu({ user, onChangeNickname, onLogout }: Pick<HeaderProps, 'user' | 'onChangeNickname' | 'onLogout'>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dropdown user-menu">
      <button className="nav-btn" onClick={() => setOpen((v) => !v)}>
        {user.nickname} ▾
      </button>
      {open && (
        <div className="dropdown-menu right" onMouseLeave={() => setOpen(false)}>
          <div className="dropdown-title">{user.username}</div>
          <button
            className="dropdown-item"
            onClick={() => {
              setOpen(false);
              onChangeNickname();
            }}
          >
            닉네임 변경
          </button>
          <button className="dropdown-item" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

export function Header(props: HeaderProps) {
  const { game, page, onPageChange, onSpeedChange, onNewRound, onShowResult } = props;
  const { phase, exchange: ex, round } = game;
  const candles = game.candles;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const precision = round?.pricePrecision ?? 1;
  const priceUp = !prev || !last || last.close >= prev.close;
  const inRound = ex && phase !== 'setup' && phase !== 'loading';

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-logo">◆</span>
        <span className="brand-name">매매 훈련</span>
      </div>
      <nav className="nav">
        <button className={`nav-btn ${page === 'trade' ? 'active' : ''}`} onClick={() => onPageChange('trade')}>
          트레이딩
        </button>
        <button className={`nav-btn ${page === 'history' ? 'active' : ''}`} onClick={() => onPageChange('history')}>
          기록
        </button>
        <button className={`nav-btn ${page === 'ranking' ? 'active' : ''}`} onClick={() => onPageChange('ranking')}>
          랭킹
        </button>
      </nav>

      {page === 'trade' && inRound && (
        <>
          <div className="symbol">
            <span className="symbol-name">BTCUSDT</span>
            <span className="symbol-sub">무기한</span>
          </div>
          <div className={`last-price mono ${priceUp ? 'up' : 'down'}`}>{last ? formatNumber(last.close, precision) : '-'}</div>
          <SimClock game={game} />
          <div className="stat">
            <span className="stat-label">경과 캔들</span>
            <span className="stat-value mono">{ex.candleCount.toLocaleString()}개</span>
          </div>
        </>
      )}

      <div className="header-spacer" />

      {page === 'trade' && (
        <div className="controls">
          {game.waiting && <span className="waiting">데이터 수신 중…</span>}
          {inRound && phase !== 'finished' && (
            <select
              className="speed-select"
              value={game.speed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              title="배속 (1배속 = 1분마다 1분봉)"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}배속
                </option>
              ))}
            </select>
          )}
          {phase === 'ready' && (
            <>
              <button className="btn" onClick={onNewRound}>
                다른 시점
              </button>
              <button className="btn btn-primary" onClick={() => game.start()}>
                ▶ 시작
              </button>
            </>
          )}
          {phase === 'running' && (
            <button className="btn" onClick={() => game.pause()} title="스페이스바">
              ❚❚ 일시정지
            </button>
          )}
          {phase === 'paused' && (
            <button className="btn btn-primary" onClick={() => game.start()} disabled={game.dataEnded} title="스페이스바">
              ▶ 재개
            </button>
          )}
          {(phase === 'running' || phase === 'paused') && (
            <button className="btn btn-danger" onClick={() => game.finish()}>
              라운드 종료
            </button>
          )}
          {phase === 'finishing' && <span className="waiting">결과 정리 중…</span>}
          {phase === 'finished' && (
            <>
              <button className="btn" onClick={onShowResult}>
                결과 보기
              </button>
              <button className="btn btn-primary" onClick={onNewRound}>
                새 라운드
              </button>
            </>
          )}
        </div>
      )}
      <UserMenu user={props.user} onChangeNickname={props.onChangeNickname} onLogout={props.onLogout} />
    </header>
  );
}
