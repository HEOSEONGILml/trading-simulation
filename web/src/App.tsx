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
import { loadPrefs, savePrefs, type Prefs, type SetupSettings, type ViewSettings } from './settings.ts';

/** 로그인 확인 → 닉네임 설정 → 회원 설정 불러오기 → 트레이딩 화면 */
export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [editingNickname, setEditingNickname] = useState(false);
  const [prefs, setPrefs] = useState<{ userId: string; prefs: Prefs } | null>(null);
  const playerId = user?.nickname ? user.id : null;

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    void loadPrefs(playerId).then((loaded) => {
      if (!cancelled) setPrefs({ userId: playerId, prefs: loaded });
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

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
  if (prefs?.userId !== user.id) return <div className="auth-page muted">설정 불러오는 중…</div>;

  const logout = async () => {
    // 진행 중인 라운드는 저장된 상태로 남고, 다음 로그인 때 이어서 한다
    await api.logOut().catch(() => {});
    window.location.reload();
  };

  return (
    <>
      <Trainer
        user={user}
        initialPrefs={prefs.prefs}
        onChangeNickname={() => setEditingNickname(true)}
        onLogout={logout}
      />
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
  initialPrefs: Prefs;
  onChangeNickname: () => void;
  onLogout: () => void;
}

function Trainer({ user, initialPrefs, onChangeNickname, onLogout }: TrainerProps) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const { view, setup } = prefs;
  const [game] = useState(() => new Game(initialPrefs.view.speed, initialPrefs.leverage));
  const version = useSyncExternalStore(game.subscribe, game.getVersion);
  const [page, setPage] = useState<Page>('trade');
  const [resultOpen, setResultOpen] = useState(false);
  const mobile = useIsMobile();

  const updatePrefs = (change: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...change };
      savePrefs(user.id, next);
      return next;
    });
  };
  game.onLeverageChange = (leverage) => updatePrefs({ leverage });

  useEffect(() => {
    const stopWatching = game.watchPageLeave();
    void game.resume();
    return () => {
      stopWatching();
      game.dispose();
    };
  }, [game]);

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

  const updateView = (next: ViewSettings) => updatePrefs({ view: next });

  const changeSpeed = (speed: number) => {
    game.setSpeed(speed);
    updateView({ ...view, speed });
  };

  const startRound = (nextSetup: SetupSettings, round: RoundSettings, speed: number) => {
    game.setSpeed(speed);
    updatePrefs({ setup: nextSetup, view: { ...view, speed } });
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
      game.pause();
      void game.saveNow().finally(onLogout);
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
      {page === 'trade' && game.phase === 'resuming' && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-body">
              <p className="hint center">진행하던 라운드를 확인하는 중…</p>
            </div>
          </div>
        </div>
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
