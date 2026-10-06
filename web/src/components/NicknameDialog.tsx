import { useState, type FormEvent } from 'react';
import { api, type User } from '../api.ts';

interface Props {
  user: User;
  /** 닉네임이 없을 때는 닫을 수 없다 */
  onClose?: () => void;
  onSaved: (user: User) => void;
}

export function NicknameDialog({ user, onClose, onSaved }: Props) {
  const [nickname, setNickname] = useState(user.nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.setNickname(nickname.trim());
      onSaved(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal modal-sm" onSubmit={submit}>
        <div className="modal-header">
          <span>{user.nickname ? '닉네임 변경' : '닉네임 설정'}</span>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">
          {!user.nickname && <p className="hint">랭킹에 표시될 닉네임을 정해주세요. 나중에 바꿀 수 있습니다.</p>}
          <label className="auth-field">
            <span>닉네임</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="한글, 영문, 숫자, _ 2~12자"
              maxLength={12}
              autoFocus
              required
            />
          </label>
          {error && <p className="hint warn">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
