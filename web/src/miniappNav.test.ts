import { describe, expect, it } from 'vitest';
import { HOME_PAGE, MINIAPP_TABS, backTarget } from './miniappNav.ts';

describe('미니앱 화면 이동', () => {
  it('최초 화면에서는 뒤로가기를 가로채지 않아 미니앱이 종료된다', () => {
    expect(backTarget(HOME_PAGE)).toBeNull();
  });

  it('다른 탭에서 뒤로가기를 누르면 최초 화면으로 돌아간다', () => {
    for (const page of ['history', 'ranking', 'account'] as const) expect(backTarget(page)).toBe(HOME_PAGE);
  });

  it('탭바는 앱인토스 기준(2~5개)을 지키고 최초 화면이 첫 탭이다', () => {
    expect(MINIAPP_TABS.length).toBeGreaterThanOrEqual(2);
    expect(MINIAPP_TABS.length).toBeLessThanOrEqual(5);
    expect(MINIAPP_TABS[0].page).toBe(HOME_PAGE);
    expect(new Set(MINIAPP_TABS.map((t) => t.page)).size).toBe(MINIAPP_TABS.length);
  });
});
