import { useState, type FormEvent } from 'react';
import { api, type User } from '../api.ts';

export function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && password !== confirm) return setError('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    setError(null);
    try {
      const { user } = mode === 'login' ? await api.logIn(username, password) : await api.signUp(username, password);
      onLogin(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
    setConfirm('');
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-logo">◆</span> BlindCandle
        </div>
        <p className="hint">날짜와 가격을 가린 BTC 선물 과거 차트로 하는 매매 연습</p>
        <div className="order-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            로그인
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>
            회원가입
          </button>
        </div>
        <label className="auth-field">
          <span>아이디</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={mode === 'signup' ? '영문, 숫자, _ 4~20자' : ''}
            required
          />
        </label>
        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? '8자 이상' : ''}
            required
          />
        </label>
        {mode === 'signup' && (
          <label className="auth-field">
            <span>비밀번호 확인</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}
        {error && <p className="hint warn">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {mode === 'login' ? '로그인' : '가입하기'}
        </button>
        <p className="hint auth-legal">
          {mode === 'signup' && '가입하면 '}
          <a href="/terms.html" target="_blank" rel="noreferrer">
            이용약관
          </a>
          과{' '}
          <a href="/privacy.html" target="_blank" rel="noreferrer">
            개인정보처리방침
          </a>
          {mode === 'signup' ? '에 동의하는 것으로 봅니다.' : ''}
          <br />
          모의 매매 연습 도구이며 투자 권유가 아닙니다.
        </p>
      </form>
    </div>
  );
}
