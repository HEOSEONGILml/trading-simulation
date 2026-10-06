// 브라우저에 저장하는 사용자 설정 (실패해도 기본값으로 동작)

export interface SetupSettings {
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string;
  historyMinutes: number;
  hideDate: boolean;
  hidePrice: boolean;
}

export interface ViewSettings {
  timeframe: number;
  speed: number;
  mainIndicators: string[];
  subIndicators: string[];
}

export const SPEEDS = [1, 2, 3, 5, 10, 20, 30, 60, 120, 300, 600];

export const HISTORY_OPTIONS = [
  { label: '6시간', minutes: 360 },
  { label: '12시간', minutes: 720 },
  { label: '1일', minutes: 1440 },
  { label: '3일', minutes: 4320 },
  { label: '7일', minutes: 10080 },
  { label: '14일', minutes: 20160 },
  { label: '30일', minutes: 43200 },
];

const today = () => new Date().toISOString().slice(0, 10);

export const DEFAULT_SETUP: SetupSettings = {
  rangeStart: '2020-01-01',
  rangeEnd: today(),
  historyMinutes: 1440,
  hideDate: true,
  hidePrice: true,
};

export const DEFAULT_VIEW: ViewSettings = {
  timeframe: 1,
  speed: 10,
  mainIndicators: ['MA'],
  subIndicators: ['VOL'],
};

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시
  }
}

export const loadSetup = () => load('setup', DEFAULT_SETUP);
export const saveSetup = (s: SetupSettings) => save('setup', s);
export const loadView = () => load('view', DEFAULT_VIEW);
export const saveView = (v: ViewSettings) => save('view', v);
