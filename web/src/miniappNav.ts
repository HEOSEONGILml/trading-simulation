// 토스 미니앱 화면 이동 규칙 (앱인토스 비게임 출시 가이드 > 네비게이션 바)
// - 자체 헤더·자체 뒤로가기 버튼을 두지 않는다. 뒤로가기는 토스 내비게이션 바(와 안드로이드 백버튼)에 맡긴다.
// - 화면 이동은 하단 플로팅 탭바(2~5개)로 한다.
// - 최초 화면(트레이딩)에서 뒤로가기를 누르면 미니앱이 종료된다 → 이때는 뒤로가기를 가로채지 않는다.

import type { Page } from './components/Header.tsx';

export const MINIAPP_TABS: { page: Page; label: string }[] = [
  { page: 'trade', label: '트레이딩' },
  { page: 'history', label: '기록' },
  { page: 'ranking', label: '랭킹' },
  { page: 'account', label: '내 정보' },
];

/** 최초 화면 */
export const HOME_PAGE: Page = 'trade';

/**
 * 토스 뒤로가기를 눌렀을 때 갈 화면. null 이면 가로채지 않는다(토스 기본 동작 = 미니앱 종료).
 * backEvent 리스너를 등록하면 토스 기본 뒤로가기가 막히므로, 최초 화면에서는 리스너를 두지 않아야 한다.
 */
export function backTarget(page: Page): Page | null {
  return page === HOME_PAGE ? null : HOME_PAGE;
}
