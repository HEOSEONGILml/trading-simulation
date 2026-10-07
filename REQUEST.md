# 요청 목록

Claude가 혼자 할 수 없는 일(결제, 계정 가입, 본인 명의 신고, 본인 이름으로 하는 게시 등)을 여기에 적습니다.
처리한 뒤 `상태`를 `완료`로 바꾸고, 결과(발급된 키, 주소, 답변 등)를 `결과`에 적어 주세요.
위에서부터 순서대로 처리하면 됩니다. 남은 두 건을 합쳐 25분 정도, 비용은 월 $7(서버) + 연 2만원 내외(도메인)입니다.

## 진행 중

### R3. 운영 서버 만들기 (15분, 월 $7)
- 요청일: 2026-10-07
- 이유: 지금은 재시작할 때마다 주소가 바뀌어서 사람들에게 링크를 줄 수 없습니다. 바이낸스 접속이 되는 서울 리전에 서버를 둡니다.
- 할 일:
  1. https://lightsail.aws.amazon.com 에 AWS 계정으로 로그인 (없으면 가입, 카드 등록 필요)
  2. **Create instance** → 리전 **Seoul (ap-northeast-2)** → 플랫폼 **Linux/Unix** → **OS Only** → **Ubuntu 24.04 LTS** → 요금제 **$7 USD (1 GB RAM)** → 이름 `trading-sim` → Create
  3. 만든 인스턴스 → **Networking** 탭 → **Attach static IP** (고정 IP, 인스턴스에 붙어 있으면 무료)
  4. 같은 **Networking** 탭 → IPv4 Firewall → **Add rule** → **HTTPS** 추가 (22, 80은 기본으로 열려 있음)
  5. **Connect using SSH** (브라우저 터미널) 를 눌러서 아래 한 줄을 붙여넣고 엔터:
     ```
     echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEuVzpcViYmCmDc/uwYeFTZhUxfRFpylmui6skHpAYjC trading-sim-deploy' >> ~/.ssh/authorized_keys
     ```
- 상태: 대기
- 결과: (고정 IP 주소)

### R4. 도메인 구매와 연결 (10분, 연 2만원 내외)
- 요청일: 2026-10-07
- 이유: 커뮤니티에 올릴 고정 주소가 필요합니다.
- 할 일:
  1. 가비아(gabia.com) 등에서 아래 후보 중 살 수 있는 첫 번째를 구매 (서비스 이름: **BlindCandle**)
     - `blindcandle.com` → `chartblind.com` → `rektgym.com`
     - 2026-10-07 기준 세 주소 모두 DNS 등록 기록이 없어 구매 가능할 가능성이 높습니다 (blindchart.com, chartdrill.com, chartgym.com 등은 이미 등록되어 있어 제외)
  2. 도메인 DNS 관리에서 A 레코드 2개 추가 (값은 R3의 고정 IP):
     - 호스트 `@` → 고정 IP
     - 호스트 `www` → 고정 IP
- 상태: 대기
- 결과: (구매한 도메인)

## 완료

### R1. 웹 검색 허용
- 상태: 완료 (2026-10-07)
- 결과: 허용. 조사 후 사용자 결정으로 데이터는 바이낸스 API를 그대로 쓰기로 함

### R2. 서비스 전용 이메일
- 상태: 완료 (2026-10-07)
- 결과: blindcandlesimulator@gmail.com (약관, 개인정보처리방침에 반영)
