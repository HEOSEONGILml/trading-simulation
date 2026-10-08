// 빌드 모드. 일반 웹은 둘 다 기본값, 토스 미니앱 번들은 `npm run build:miniapp` (.env.miniapp)
// - VITE_MINIAPP=1: 가입·로그인 화면 없이 토스 익명 사용자 키로 시작, 라이트 테마, 토큰 세션, 외부 링크 없음
// - VITE_API_BASE: API 서버 주소 (미니앱은 화면이 토스 도메인에 올라가므로 https://blindcandle.com)

export const MINIAPP = import.meta.env.VITE_MINIAPP === '1';
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';
