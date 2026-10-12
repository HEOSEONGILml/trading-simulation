import type { ReactNode } from 'react';
import { MINIAPP_TABS } from '../../miniappNav.ts';
import type { Page } from '../Header.tsx';

// 앱인토스 탭바 가이드: 토스 플로팅 형태(하단에 떠 있는 둥근 막대), 탭 2~5개
const ICONS: Record<Page, ReactNode> = {
  trade: (
    <path d="M5 4v16M5 8h-1.5v8H5M12 3v18M12 6h-1.5v7H12M19 7v12M19 10h-1.5v6H19M5 8h1.5v8H5M12 6h1.5v7H12M19 10h1.5v6H19" />
  ),
  history: <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2zM9 9h6M9 13h6" />,
  ranking: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" />,
  account: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
};

export function MiniappTabBar({ page, onPageChange }: { page: Page; onPageChange: (page: Page) => void }) {
  return (
    <nav className="m-tabbar" aria-label="화면 이동">
      {MINIAPP_TABS.map((t) => (
        <button
          key={t.page}
          className={`m-tab ${page === t.page ? 'active' : ''}`}
          aria-current={page === t.page ? 'page' : undefined}
          onClick={() => onPageChange(t.page)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[t.page]}
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
