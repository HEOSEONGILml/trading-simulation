// 토스 미니앱(앱인토스) 전용 코드. 일반 웹 빌드에서는 호출되지 않는다.
// SDK는 토스 앱 안에서만 동작하므로 동적 import 로 불러온다.

import { api, type User } from './api.ts';

/** 토스 익명 사용자 키로 회원 자동 생성·로그인. 가입·로그인 화면은 없다 */
export async function miniappLogin(): Promise<User> {
  const { User: TossUser } = await import('@apps-in-toss/web-framework');
  const key = await TossUser.getAnonymousKey();
  if (!key || key.type !== 'HASH' || !key.hash) throw new Error('토스 사용자 정보를 가져오지 못했습니다. 토스 앱을 최신 버전으로 업데이트해주세요.');
  return api.tossLogin(key.hash);
}
