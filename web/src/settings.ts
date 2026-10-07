// 회원별 설정. 서버에 저장해 어느 기기에서든 같은 설정으로 시작하고, 브라우저에도 사본을 둔다 (실패해도 기본값으로 동작)

import { api } from './api.ts';

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
  /** 차트에서 숨긴 가격선 (entry, takeProfit, stopLoss, liquidation, orders) */
  hiddenLines: string[];
}

export interface Prefs {
  setup: SetupSettings;
  view: ViewSettings;
  /** 새 라운드의 레버리지 */
  leverage: number;
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
  hiddenLines: [],
};

export const DEFAULT_LEVERAGE = 20;

const SERVER_SAVE_DELAY = 1000;

type SavedPrefs = { setup?: Partial<SetupSettings>; view?: Partial<ViewSettings>; leverage?: unknown };

/** 저장된 값이 일부 빠져 있거나 예전 형식이어도 기본값으로 채운다 */
function withDefaults(saved: SavedPrefs | null | undefined): Prefs {
  const s = saved ?? {};
  return {
    setup: { ...DEFAULT_SETUP, ...s.setup },
    view: { ...DEFAULT_VIEW, ...s.view },
    leverage: typeof s.leverage === 'number' ? s.leverage : DEFAULT_LEVERAGE,
  };
}

function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시
  }
}

const localKey = (userId: string) => `prefs:${userId}`;

/** 회원별 설정 이전에 브라우저에만 저장하던 값 */
function legacyLocal(): SavedPrefs | null {
  const setup = readLocal('setup') as Partial<SetupSettings> | null;
  const view = readLocal('view') as Partial<ViewSettings> | null;
  return setup || view ? { setup: setup ?? {}, view: view ?? {} } : null;
}

/** 서버 설정을 우선하고, 서버에 없으면 브라우저에 있던 설정을 서버로 옮긴다 */
export async function loadPrefs(userId: string): Promise<Prefs> {
  const local = (readLocal(localKey(userId)) as SavedPrefs | null) ?? legacyLocal();
  try {
    const { settings } = await api.settings();
    if (settings) {
      const prefs = withDefaults(settings as SavedPrefs);
      writeLocal(localKey(userId), prefs);
      return prefs;
    }
    const prefs = withDefaults(local);
    if (local) void api.saveSettings(prefs).catch(() => {});
    return prefs;
  } catch {
    return withDefaults(local);
  }
}

let serverTimer: ReturnType<typeof setTimeout> | null = null;

/** 바로 브라우저에 저장하고, 서버에는 연속된 변경을 모아서 저장한다 */
export function savePrefs(userId: string, prefs: Prefs) {
  writeLocal(localKey(userId), prefs);
  if (serverTimer) clearTimeout(serverTimer);
  serverTimer = setTimeout(() => {
    serverTimer = null;
    void api.saveSettings(prefs).catch(() => {});
  }, SERVER_SAVE_DELAY);
}
