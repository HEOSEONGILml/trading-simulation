# 요청 목록

Claude가 혼자 할 수 없는 일(결제, 계정 가입, 본인 명의 신고, 본인 이름으로 하는 게시 등)을 여기에 적습니다.
처리한 뒤 `상태`를 `완료`로 바꾸고, 결과(발급된 키, 주소, 답변 등)를 `결과`에 적어 주세요.
R6, R8은 서로 상관없으니 되는 것부터 처리하면 됩니다. 합쳐서 30분 정도, 비용은 없습니다.

## 진행 중

### R6. 스레드 계정 만들고 퀴즈 자동 게시 연결 (20분, 비용 없음)
- 요청일: 2026-10-08
- 이유: 매일 21시에 "블라인드 차트 퀴즈"(가린 차트 이미지 + 정답 문구와 정답 차트 링크는 가림 처리)를 자동으로 올려 첫 사용자를 모읍니다. 게시 프로그램은 서버에 준비되어 있고 계정 연결만 남았습니다.
- 할 일:
  1. 스레드에서 서비스용 계정을 새로 만듭니다 (인스타그램 계정이 필요하면 서비스용으로 하나 만듭니다)
     - 이름 `BlindCandle`, 아이디 `blindcandle` (안 되면 `blindcandle.chart`)
     - 소개: `날짜와 가격을 가린 실제 BTC 선물 차트로 매매 연습 · 매일 21시 차트 퀴즈`
     - 링크: `https://blindcandle.com`
  2. https://developers.facebook.com 에 사용자님 페이스북 계정으로 로그인 → **My Apps** → **Create App**
     - 앱 이름 `BlindCandle Quiz`, 사용 사례(Use case)에서 **Access the Threads API** 선택 → 만들기
  3. 만든 앱 → **Use cases** → Threads API의 **Customize**
     - **Permissions**: `threads_basic`, `threads_content_publish` 추가
     - **Settings**: **Redirect Callback URLs**에 `https://blindcandle.com/auth/threads/callback` 입력 후 저장
  4. 앱 → **App roles** → **Roles** → **Add People** → **Threads Tester** → 1번에서 만든 스레드 아이디 입력
  5. 스레드(웹 또는 앱)에 그 계정으로 로그인 → **설정** → **계정** → **웹사이트 권한**(Website permissions) → **초대**에서 수락
  6. 3번 화면의 **Threads app ID**와 **Threads app secret**을 `deploy/secrets.env`에 넣습니다
     - `deploy/secrets.env.example`을 `deploy/secrets.env`로 복사한 뒤 `THREADS_APP_ID=`, `THREADS_APP_SECRET=` 뒤에 붙여 넣기 (이 파일은 git에 올라가지 않습니다)
  7. 여기까지 하고 `상태`를 `완료`로 바꿔 주세요. Claude가 서버에 올린 뒤 **연결 주소**를 결과에 적어 드립니다. 스레드 계정으로 로그인된 브라우저에서 그 주소를 열고 **허용**만 누르면 끝납니다
- 상태: 대기
- 결과: (만든 스레드 아이디)

### R8. 검색 등록 (10분, 비용 없음)
- 요청일: 2026-10-08
- 이유: "비트코인 선물 모의투자", "선물 연습" 같은 검색으로 들어오게 합니다. 효과는 몇 주 뒤부터 나지만 한 번만 하면 됩니다.
- 할 일:
  1. https://searchadvisor.naver.com → 로그인 → **웹마스터 도구** → 사이트 등록에 `https://blindcandle.com` 입력 → 소유 확인 방법 **HTML 태그** 선택 → 나오는 `<meta name="naver-site-verification" ... />` 한 줄을 결과에 붙여 넣기
  2. https://search.google.com/search-console → **URL 접두어**에 `https://blindcandle.com` → 확인 방법 **HTML 태그** → 나오는 `<meta name="google-site-verification" ... />` 한 줄을 결과에 붙여 넣기
  3. Claude가 태그를 사이트에 넣고 배포했다고 알려 드리면, 두 사이트에서 **확인**을 누르고 사이트맵 `https://blindcandle.com/sitemap.xml`을 제출합니다
- 상태: 대기
- 결과: (네이버 태그 / 구글 태그)

## 완료

### R5. 커뮤니티에 피드백 요청 글 올리기
- 요청일: 2026-10-08
- 진행 기록: 2026-10-08 코인판 자유게시판에 올렸다가 영구 정지됨. 코인판 규칙이 운영진 사전 동의 없는 홍보를 금지하는데, Claude가 규칙을 확인하지 않고 목록에 넣은 탓. 디시 비트코인 갤러리도 광고를 삭제, 차단한다고 확인되어 목록에서 뺐습니다.
- 상태: 중단 (2026-10-08)
- 결과: 오픈채팅도 홍보 글은 퇴장 처리되는 곳이 많아 사용자 판단으로 중단. 스레드 차트 퀴즈(R6)로 경로 변경

### R4. 도메인 구매와 연결
- 상태: 완료 (2026-10-08)
- 결과: blindcandle.com (Lightsail에서 구매, 2027-10-08 만료, 자동 갱신). A 기록 연결과 HTTPS 확인. www와 http는 https://blindcandle.com 으로 이동. 계정은 유료 플랜

### R3. 운영 서버 만들기
- 상태: 완료 (2026-10-08)
- 결과: 고정 IP 43.201.119.112. Docker 설치와 배포 완료

### R1. 웹 검색 허용
- 상태: 완료 (2026-10-07)
- 결과: 허용. 조사 후 사용자 결정으로 데이터는 바이낸스 API를 그대로 쓰기로 함

### R2. 서비스 전용 이메일
- 상태: 완료 (2026-10-07)
- 결과: blindcandlesimulator@gmail.com (약관, 개인정보처리방침에 반영)
