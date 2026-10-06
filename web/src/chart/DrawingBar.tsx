// 차트 왼쪽 그리기 도구 (TradingView/바이낸스 스타일)

import type { ReactNode } from 'react';

export interface DrawingTool {
  name: string;
  label: string;
  icon: ReactNode;
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    {children}
  </svg>
);
const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="1.8" fill="currentColor" stroke="none" />;

export const DRAWING_TOOLS: DrawingTool[] = [
  { name: 'segment', label: '추세선', icon: svg(<><path d="M5 19 19 5" />{dot(5, 19)}{dot(19, 5)}</>) },
  { name: 'rayLine', label: '레이', icon: svg(<><path d="M5 19 22 2" />{dot(5, 19)}{dot(13, 11)}</>) },
  { name: 'straightLine', label: '연장선', icon: svg(<><path d="M2 22 22 2" />{dot(9, 15)}{dot(15, 9)}</>) },
  { name: 'horizontalStraightLine', label: '수평선', icon: svg(<><path d="M2 12h20" />{dot(12, 12)}</>) },
  { name: 'horizontalRayLine', label: '수평 레이', icon: svg(<><path d="M6 12h16" />{dot(6, 12)}</>) },
  { name: 'horizontalSegment', label: '수평 구간', icon: svg(<><path d="M5 12h14" />{dot(5, 12)}{dot(19, 12)}</>) },
  { name: 'verticalStraightLine', label: '수직선', icon: svg(<><path d="M12 2v20" />{dot(12, 12)}</>) },
  { name: 'priceLine', label: '가격선', icon: svg(<><path d="M5 14h17" />{dot(5, 14)}<path d="M5 9h7" strokeWidth="1.2" /></>) },
  { name: 'parallelStraightLine', label: '평행 채널', icon: svg(<><path d="M3 17 17 3M7 21 21 7" />{dot(10, 10)}</>) },
  { name: 'priceChannelLine', label: '가격 채널', icon: svg(<><path d="M3 15 15 3M3 21 21 9" strokeDasharray="0" />{dot(3, 15)}{dot(15, 3)}</>) },
  {
    name: 'fibonacciLine',
    label: '피보나치 되돌림',
    icon: svg(<><path d="M3 5h18M3 10h18M3 14h18M3 19h18" />{dot(6, 19)}{dot(18, 5)}</>),
  },
  { name: 'simpleAnnotation', label: '메모', icon: svg(<><path d="M5 5h14v10H9l-4 4z" /></>) },
  { name: 'brush', label: '브러시', icon: svg(<><path d="M4 18c3-1 3-6 6-6s2 5 5 4 3-8 5-9" /></>) },
];

export const ICONS = {
  magnet: svg(<><path d="M6 4v8a6 6 0 0 0 12 0V4" /><path d="M6 7h3M15 7h3" /></>),
  eye: svg(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: svg(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><path d="M3 3l18 18" /></>),
  trash: svg(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  cursor: svg(<><path d="M12 3v18M3 12h18" /></>),
};

interface Props {
  horizontal?: boolean;
  active: string | null;
  magnet: boolean;
  hidden: boolean;
  onSelect: (name: string) => void;
  onToggleMagnet: () => void;
  onToggleHidden: () => void;
  onClear: () => void;
}

export function DrawingBar({ horizontal = false, active, magnet, hidden, onSelect, onToggleMagnet, onToggleHidden, onClear }: Props) {
  return (
    <div className={`drawing-bar ${horizontal ? 'horizontal' : ''}`}>
      {DRAWING_TOOLS.map((tool) => (
        <button
          key={tool.name}
          className={`tool-btn ${active === tool.name ? 'active' : ''}`}
          title={tool.label}
          onClick={() => onSelect(tool.name)}
        >
          {tool.icon}
        </button>
      ))}
      <div className="tool-sep" />
      <button className={`tool-btn ${magnet ? 'active' : ''}`} title="자석 모드" onClick={onToggleMagnet}>
        {ICONS.magnet}
      </button>
      <button className={`tool-btn ${hidden ? 'active' : ''}`} title="그리기 숨기기" onClick={onToggleHidden}>
        {hidden ? ICONS.eyeOff : ICONS.eye}
      </button>
      <button className="tool-btn" title="그리기 모두 삭제" onClick={onClear}>
        {ICONS.trash}
      </button>
    </div>
  );
}
