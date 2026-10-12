import { deleteAccount } from '../../account.ts';
import type { User } from '../../api.ts';

/** 미니앱 '내 정보' 탭: 웹 헤더의 사용자 메뉴(닉네임 변경·회원 탈퇴)를 대신한다. 로그아웃은 미니앱에 없다 */
export function AccountPage({ user, onChangeNickname }: { user: User; onChangeNickname: () => void }) {
  return (
    <div className="history-page account-page">
      <h2>내 정보</h2>
      <div className="m-card">
        <div className="account-row">
          <span className="muted">닉네임</span>
          <b>{user.nickname}</b>
        </div>
        <button className="btn btn-block" onClick={onChangeNickname}>
          닉네임 변경
        </button>
      </div>
      <p className="hint">실제 돈이나 주문은 쓰이지 않는 모의 연습입니다. 기록과 랭킹은 이 토스 계정에 저장됩니다.</p>
      <div className="account-danger">
        <button className="link-btn" onClick={() => void deleteAccount()}>
          회원 탈퇴
        </button>
      </div>
    </div>
  );
}
