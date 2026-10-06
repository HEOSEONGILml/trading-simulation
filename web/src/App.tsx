import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, onUnauthorized, type RoundSettings, type User } from './api.ts';
import { ChartView } from './chart/ChartView.tsx';
import { BottomPanel } from './components/BottomPanel.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { Header, type Page } from './components/Header.tsx';
import { NicknameDialog } from './components/NicknameDialog.tsx';
import { RankingPage } from './components/RankingPage.tsx';
import { MobileHeader } from './components/mobile/MobileHeader.tsx';
import { MobileTrade } from './components/mobile/MobileTrade.tsx';
import { HistoryPage } from './components/HistoryPage.tsx';
import { OrderPanel } from './components/OrderPanel.tsx';
import { ResultDialog } from './components/ResultDialog.tsx';
import { SetupDialog } from './components/SetupDialog.tsx';
import { Game } from './game/game.ts';
import { useIsMobile } from './useIsMobile.ts';
import { loadSetup, loadView, saveSetup, saveView, type SetupSettings, type ViewSettings } from './settings.ts';

/** 로그인 확인 → 닉네임 설정 → 트레이딩 화면 */
export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [editingNickname, setEditingNickname] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null));
    onUnauthorized(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="auth-page muted">불러오는 중…</div>;
  if (user === null) return <AuthScreen onLogin={setUser} />;
  if (!user.nickname) return <NicknameDialog user={user} onSaved={setUser} />;

  const logout = async () => {
    // 진행 중인 라운드는 기록되지 않으므로 다시 시작하도록 화면을 새로 고친다
    await api.logOut().catch(() => {});
    window.location.reload();
  };

  return (
    <>
      <Trainer user={user} onChangeNickname={() => setEditingNickname(true)} onLogout={logout} />
      {editingNickname && (
        <NicknameDialog
          user={user}
          onClose={() => setEditingNickname(false)}
          onSaved={(next) => {
            setUser(next);
            setEditingNickname(false);
          }}
        />
      )}
    </>
  );
}

interface TrainerProps {
  user: User;
  onChangeNickname: () => void;
  onLogout: () => void;
}

function Trainer({ user, onChangeNickname, onLogout }: TrainerProps) {
  const [view, setView] = useState<ViewSettings>(loadView);
  const [setup, setSetup] = useState<SetupSettings>(loadSetup);
  const [game] = useState(() => new Game(view.speed));
  const version = useSyncExternalStore(game.subscribe, game.getVersion);
  const [page, setPage] = useState<Page>('trade');
  const [resultOpen, setResultOpen] = useState(false);
  const mobile = useIsMobile();

  useEffect(() => () => game.dispose(), [game]);

  useEffect(() => {
    if (game.phase === 'finished') setResultOpen(true);
  }, [game.phase, game]);

  // 스페이스바로 재생/일시정지
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.code !== 'Space' || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      e.preventDefault();
      game.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const updateView = (next: ViewSettings) => {
    setView(next);
    saveView(next);
  };

  const changeSpeed = (speed: number) => {
    game.setSpeed(speed);
    updateView({ ...view, speed });
  };

  const startRound = (nextSetup: SetupSettings, round: RoundSettings, speed: number) => {
    setSetup(nextSetup);
    saveSetup(nextSetup);
    changeSpeed(speed);
    setResultOpen(false);
    void game.createRound(round);
  };

  const nextRound = () => {
    setResultOpen(false);
    if (game.settings) void game.createRound(game.settings);
    else game.openSetup();
  };

  const showSetup = game.phase === 'setup' || game.phase === 'loading';
  const headerProps = {
    game,
    user,
    page,
    onChangeNickname,
    onLogout: () => {
      const playing = game.phase === 'running' || game.phase === 'paused';
      if (playing && !confirm('진행 중인 라운드는 기록되지 않습니다. 로그아웃할까요?')) return;
      onLogout();
    },
    onPageChange: setPage,
    onSpeedChange: changeSpeed,
    onNewRound: () => {
      setResultOpen(false);
      game.openSetup();
    },
    onShowResult: () => setResultOpen(true),
  };

  return (
    <div className={`app ${mobile ? 'mobile' : 'desktop'}`}>
      {mobile ? <MobileHeader {...headerProps} /> : <Header {...headerProps} />}

      {mobile ? (
        <div className={page === 'trade' ? 'm-page' : 'hidden'}>
          <MobileTrade game={game} version={version} view={view} onViewChange={updateView} />
        </div>
      ) : (
        <main className={`trade-layout ${page === 'trade' ? '' : 'hidden'}`}>
          <ChartView game={game} version={version} view={view} onViewChange={updateView} />
          <OrderPanel game={game} />
          <BottomPanel game={game} />
        </main>
      )}
      {page === 'history' && <HistoryPage mobile={mobile} />}
      {page === 'ranking' && <RankingPage mobile={mobile} />}

      {page === 'trade' && showSetup && (
        <SetupDialog
          initial={setup}
          speed={view.speed}
          loading={game.phase === 'loading'}
          canClose={game.round !== null && game.phase !== 'loading'}
          onClose={() => game.closeSetup()}
          onStart={startRound}
        />
      )}
      {page === 'trade' && resultOpen && game.result && (
        <ResultDialog
          game={game}
          onClose={() => setResultOpen(false)}
          onNext={nextRound}
          onChangeSettings={() => {
            setResultOpen(false);
            game.openSetup();
          }}
          onHistory={() => {
            setResultOpen(false);
            setPage('history');
          }}
        />
      )}

      <div className="toasts">
        {game.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
