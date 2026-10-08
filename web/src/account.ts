import { api, setToken } from './api.ts';
import { MINIAPP } from './env.ts';

/** 회원 탈퇴: 확인 → (웹) 비밀번호 입력 → 삭제 후 첫 화면으로. 미니앱 회원은 비밀번호가 없어 확인만 한다 */
export async function deleteAccount() {
  if (!window.confirm('탈퇴하면 계정과 모든 기록이 즉시 삭제되며 복구할 수 없습니다. 계속할까요?')) return;
  const password = MINIAPP ? '' : window.prompt('비밀번호를 입력하세요.');
  if (password === null || (!MINIAPP && !password)) return;
  try {
    await api.deleteAccount(password);
    setToken(null);
    window.location.reload();
  } catch (err) {
    window.alert((err as Error).message);
  }
}
