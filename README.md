# trading-simulation

바이낸스 BTCUSDT 무기한 선물의 과거 1분봉을 무작위 시점부터 재생하며 매매를 연습하는 훈련 앱.
회원별로 기록을 관리하고 랭킹을 제공합니다. PC와 모바일 화면을 각각 지원합니다.

## 배포 (Docker)

```bash
docker compose up -d --build
docker compose logs tunnel | grep trycloudflare.com   # 발급된 접속 주소 확인
```

- `tunnel` 컨테이너(Cloudflare Quick Tunnel)가 시작될 때마다 `https://<임의 이름>.trycloudflare.com` 주소가 새로 발급됩니다. 계정이나 도메인 설정은 필요 없지만, 컨테이너를 다시 시작하면 주소가 바뀝니다.
- 회원과 라운드 기록은 `app-data` 볼륨의 `/data/results.db`에 저장됩니다. `docker compose down -v`를 하면 삭제됩니다.
- 서버 PC에서는 `http://localhost:3001`로도 접속할 수 있습니다.
- 바이낸스는 미국 등 일부 지역에서 API 접속을 차단합니다. 서버는 바이낸스 API에 접속 가능한 지역에서 실행해야 합니다.

환경 변수 (Dockerfile 기본값):

| 이름 | 기본값 | 설명 |
|---|---|---|
| `HOST` | `0.0.0.0` | 서버 바인딩 주소 (로컬 실행 시 기본값 `127.0.0.1`) |
| `PORT` | `3001` | 서버 포트 |
| `DB_PATH` | `/data/results.db` | SQLite 파일 위치 (로컬 실행 시 `server/data/results.db`) |

## 로컬 개발

Node.js 24 이상이 필요합니다 (내장 `node:sqlite`, TypeScript 직접 실행 사용).

```bash
npm install
npm run dev      # 백엔드(3001) + 프론트(5173) 개발 서버 → http://localhost:5173
npm test
npm run typecheck
```

## 구성

| 경로 | 내용 |
|---|---|
| `server/src/auth.ts` | 회원가입/로그인 (scrypt 비밀번호 해시, httpOnly 쿠키 세션, IP별 시도 제한) |
| `server/src/db.ts` | 회원, 세션, 라운드 기록 SQLite 저장과 랭킹 계산 |
| `server/src/binance.ts` | 바이낸스 선물 1분봉 API 조회 |
| `server/src/rounds.ts` | 라운드 생성(무작위 시점), 미래 캔들 제공. 라운드가 끝날 때까지 실제 시점/가격을 클라이언트에 보내지 않음 |
| `server/src/disguise.ts` | 더미 날짜(7일 단위 이동, 요일·시각 유지)와 더미 가격(1,000 단위 시작가, 비율 유지) |
| `web/src/engine/` | 모의 거래소: 격리 증거금, 단방향 포지션, 시장가/지정가, 익절/손절, 강제 청산, 1분봉 묶기 |
| `web/src/game/game.ts` | 재생 타이머, 배속, 데이터 미리 받기, 라운드 종료 |
| `web/src/chart/` | KLineChart 차트, 그리기 도구, 포지션/주문 가격선 |
| `web/src/components/` | PC 화면, 로그인/닉네임, 기록·랭킹 페이지 |
| `web/src/components/mobile/` | 모바일 화면 (폭 820px 이하) |

## 회원과 랭킹

- 아이디: 영문, 숫자, _ 4~20자 / 비밀번호: 8자 이상
- 첫 로그인 시 닉네임(한글, 영문, 숫자, _ 2~12자, 중복 불가)을 정해야 게임을 시작할 수 있고, 이후 메뉴에서 바꿀 수 있습니다.
- 랭킹 기준: 누적 복리 수익률, 평균 수익률, 수익 라운드 비율. 평균 수익률과 수익 라운드 비율은 5라운드 이상 완료한 회원만 표시합니다.

## 매매 규칙

- 시작 자금 10,000 USDT, 수수료 메이커 0.02% / 테이커 0.05%, 펀딩비 없음
- 레버리지 1~125배, 레버리지 구간별 최대 포지션 규모와 유지증거금률은 바이낸스 BTCUSDT 기준
- 시장가는 직전 1분봉 종가에 체결, 지정가는 캔들이 가격에 닿으면 지정가에 체결
- 한 캔들 안의 가격 순서는 알 수 없으므로 강제 청산·손절을 익절보다 먼저 처리 (손절 우선)
- 같은 캔들에서 지정가로 진입한 포지션은 그 캔들의 손절/청산만 다시 확인
- 라운드 종료 시 미체결 주문은 취소, 포지션은 마지막 가격에 시장가 청산
