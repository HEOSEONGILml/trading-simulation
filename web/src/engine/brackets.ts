// 바이낸스 BTCUSDT 무기한 선물 레버리지/유지증거금 구간 (명목가치 USDT 기준)

export interface Bracket {
  maxNotional: number;
  maxLeverage: number;
  maintenanceRate: number;
  /** 유지증거금 공제액 (maintenance amount) */
  maintenanceAmount: number;
}

export const BRACKETS: Bracket[] = [
  { maxNotional: 50_000, maxLeverage: 125, maintenanceRate: 0.004, maintenanceAmount: 0 },
  { maxNotional: 600_000, maxLeverage: 100, maintenanceRate: 0.005, maintenanceAmount: 50 },
  { maxNotional: 3_000_000, maxLeverage: 75, maintenanceRate: 0.0065, maintenanceAmount: 950 },
  { maxNotional: 12_000_000, maxLeverage: 50, maintenanceRate: 0.01, maintenanceAmount: 11_450 },
  { maxNotional: 70_000_000, maxLeverage: 25, maintenanceRate: 0.02, maintenanceAmount: 131_450 },
  { maxNotional: 100_000_000, maxLeverage: 20, maintenanceRate: 0.025, maintenanceAmount: 481_450 },
  { maxNotional: 230_000_000, maxLeverage: 10, maintenanceRate: 0.05, maintenanceAmount: 2_981_450 },
  { maxNotional: 480_000_000, maxLeverage: 5, maintenanceRate: 0.1, maintenanceAmount: 14_481_450 },
  { maxNotional: 600_000_000, maxLeverage: 4, maintenanceRate: 0.125, maintenanceAmount: 26_481_450 },
  { maxNotional: 800_000_000, maxLeverage: 3, maintenanceRate: 0.15, maintenanceAmount: 41_481_450 },
  { maxNotional: 1_200_000_000, maxLeverage: 2, maintenanceRate: 0.25, maintenanceAmount: 121_481_450 },
  { maxNotional: 1_800_000_000, maxLeverage: 1, maintenanceRate: 0.5, maintenanceAmount: 421_481_450 },
];

export const MAX_LEVERAGE = BRACKETS[0].maxLeverage;

export function bracketFor(notional: number): Bracket {
  return BRACKETS.find((b) => notional <= b.maxNotional) ?? BRACKETS[BRACKETS.length - 1];
}

/** 해당 레버리지로 보유할 수 있는 최대 명목가치 */
export function maxNotionalFor(leverage: number): number {
  let max = 0;
  for (const b of BRACKETS) {
    if (b.maxLeverage >= leverage) max = b.maxNotional;
  }
  return max;
}
