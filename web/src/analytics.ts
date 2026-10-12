// 앱인토스 콘솔 지표(활성·전환 지표)용 이벤트 기록. 토스 미니앱 번들에서만 동작한다.
// 일반 웹 빌드에서는 SDK를 불러오지 않고 바로 돌아간다(서버 집계 docs/metrics.md 가 기준).
//
// 지키는 것 (docs/metrics.md '외부 지표'):
// - 이벤트 이름은 snake_case 로 고정한다. 바꾸면 콘솔 지표 등록을 다시 해야 한다.
// - params 는 아래 허용 목록의 키만 보낸다. 종목명·마켓, 가격·시각·캔들 값(시세 원본),
//   닉네임·회원 ID·토스 키, 손익 금액은 보내지 않는다. anonymous_key 는 SDK가 자동으로 붙인다.
// - 게임이 멈추면 안 되므로 기다리지 않고(fire-and-forget), 어떤 오류도 밖으로 던지지 않는다.

import { MINIAPP } from './env.ts';

export type RoundOutcome = 'profit' | 'loss' | 'liquidated' | 'flat';

export interface EventParams {
  round_start: { leverage: number };
  round_finish: { leverage: number; outcome: RoundOutcome; trade_count: number };
}

export type EventName = keyof EventParams;

/** 보낼 수 있는 params 키 전체. 여기에 없는 키는 보내기 전에 버린다 */
export const ALLOWED_PARAM_KEYS = ['leverage', 'outcome', 'trade_count'] as const;

/** 허용 목록의 키만, 문자열·유한한 숫자 값만 남긴다 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of ALLOWED_PARAM_KEYS) {
    const value = params[key];
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
  }
  return out;
}

/** 라운드 결과를 손익 금액 없이 네 가지로만 나눈다 */
export function roundOutcome(summary: { startEquity: number; endEquity: number; liquidationCount: number }): RoundOutcome {
  if (summary.liquidationCount > 0) return 'liquidated';
  if (summary.endEquity > summary.startEquity) return 'profit';
  if (summary.endEquity < summary.startEquity) return 'loss';
  return 'flat';
}

/** 앱인토스 Analytics.log 로 이벤트를 남긴다. 미니앱이 아니면 아무것도 하지 않는다. 결과를 기다리지 않는다 */
export function logEvent<N extends EventName>(name: N, params: EventParams[N]): void {
  if (!MINIAPP) return;
  try {
    const safe = sanitizeParams(params as unknown as Record<string, unknown>);
    void import('@apps-in-toss/web-framework')
      .then(({ Analytics }) => Analytics.log({ log_name: name, log_type: 'event', params: safe }))
      .catch(() => {});
  } catch {
    // 측정 실패는 게임에 영향을 주지 않는다
  }
}
