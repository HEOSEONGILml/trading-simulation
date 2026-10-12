# 운영 방식

이 서비스(BlindCandle)는 2026-10-08부터 **BusinessFactory**(AI 직원 회사)가 운영한다. 이 폴더는 회사의 작업 공간 `blindcandle`이다. 사용자는 목표를 주고 결재만 한다.

## 문서

| 문서 | 역할 |
|---|---|
| `PLAN.md` | 사업 계획서. 가장 최신 계획. 계획이 바뀌면 고친다. |
| `REQUEST.md` | 2026-10-08 이전에 쓰던 사용자 요청 목록. **이제 새 요청은 여기에 쓰지 않는다.** 남은 항목은 회사 업무로 옮겨 처리하고, 처리 결과만 여기 기록한다. |
| `README.md` | 개발 방법 |

## 사용자에게 요청할 때

- 결재가 필요한 일: `bf approval request`. 예: 배포, git push, 비용, 계정 가입, 사용자 이름으로 하는 게시, 사업자·신고.
- 사용자만 할 수 있는 일이나 정보: `bf task ask`. 예: 콘솔 가입, 외부 문의 발송.
- 요청은 사용자가 그것만 보고 바로 처리할 수 있게 구체적으로 쓴다. 할 일 순서, 걸리는 시간, 비용을 적는다.
- **비밀값(API 키 등)은 채팅이나 업무 이력으로 받지 않는다.** 사용자에게 `deploy/.env`에 직접 넣어 달라고 요청하고, 답변으로는 "넣었음"만 받는다.

## 반드시 지킬 것

- **운영 서버 배포와 `git push`는 매번 결재를 받는다.** 실제 사용자가 쓰는 서비스다.
- `deploy/.env`와 `server/data/`(실제 사용자 데이터)의 내용을 결과물, 이력, 회사 기억에 옮기지 않는다.
- 커뮤니티나 외부 채널에 게시를 제안하기 전에, 그 채널의 규칙을 직접 읽고 홍보가 허용되는 곳만 제안한다. (회사 기억 `community-outreach`)
- `PLAN.md`의 "반드시 지킬 것"을 따른다. 경품 금지, 투자 권유 금지, 시세 원본을 내보내지 않음 등이다.

## 운영 지표 (매주 기록)

- **각 미션 단계를 시작할 때 `bash deploy/metrics.sh` 를 실행**해 운영 지표를 `docs/metrics.md` 끝에 붙이고 커밋한다. 직전 기록 뒤 7일이 넘었으면 다른 일보다 먼저 기록한다.
- **주간 자동 스냅샷 (cron)**: 매주 월요일 10:00 KST(01:00 UTC)에 서버 crontab(`crontab -l` 로 확인)이 `bash deploy/metrics.sh --print` 를 실행해 결과를 `/home/ubuntu/BusinessFactory/company/missions/M002/metrics/<날짜>.md` 에 저장한다. 실패하면 파일 이름이 `<날짜>.FAILED.md` 로 바뀐다(내용은 오류 출력).
  - cron 은 worktree 가 아니라 **원래 작업 공간** `/home/ubuntu/BusinessFactory/workspaces/blindcandle` 의 `deploy/metrics.sh` 와 `deploy/.env` 를 쓴다. 이 경로·브랜치(feature/business)가 바뀌거나 스크립트가 깨지면 조용히 실패할 수 있으니 바꿀 때 crontab 도 함께 고친다.
  - **단계를 시작할 때** 그 폴더에 쌓인 스냅샷(직전 기록 이후 것)을 `docs/metrics.md` '기록' 절 끝에 옮겨 커밋한다. `.FAILED.md` 가 있으면 원인을 확인하고 `bash deploy/metrics.sh` 로 다시 기록한다.
- 기록은 집계값만 남는다(회원 ID·닉네임·토스 키 금지). 정의·제외 기준은 `docs/metrics.md` 정의 절을 따른다.
- 기준 시각 뒤에 생긴 회사 테스트 계정은 `deploy/.env` 의 `METRICS_EXCLUDE_USER_IDS` 에만 넣는다.

## 개발

- `npm test`, `npm run typecheck`가 통과해야 완료다.
- 커밋은 이 폴더의 git에 한다. 브랜치는 `feature/business`.
