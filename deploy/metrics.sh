#!/usr/bin/env bash
# 운영 DB에서 검증 지표(집계값만)를 뽑아 docs/metrics.md 끝에 기록을 붙인다
# 사용: bash deploy/metrics.sh          (기록을 붙인다)
#       bash deploy/metrics.sh --print  (붙이지 않고 출력만)
# - 기준 시각(METRICS_SINCE) 이전 가입자는 뺀다. 기본값은 아래 LAUNCH_SINCE.
# - 기준 시각 뒤에 생긴 회사 테스트 계정은 deploy/.env 의 METRICS_EXCLUDE_USER_IDS(쉼표 구분)에 둔다.
#   이 값은 실행할 때만 컨테이너에 넘기고, 화면·파일에는 제외 인원수만 남는다.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.env
KEY="${SSH_KEY:-$HOME/.ssh/trading_sim_deploy}"

# 측정 기준 시각: visit 기록 보강(T0112) 운영 배포일 2026-10-12 0시(KST). 이전 가입자는 출시 전 내부·테스트 계정으로 본다 (docs/metrics.md 정의)
LAUNCH_SINCE="2026-10-12T00:00:00+09:00"
SINCE="${METRICS_SINCE:-$LAUNCH_SINCE}"
EXCLUDE="${METRICS_EXCLUDE_USER_IDS:-}"
COMMAND="bash deploy/metrics.sh (운영: docker compose exec app node server/src/metrics.ts --markdown --since $SINCE)"

REMOTE="cd ~/app && docker compose -f docker-compose.prod.yml exec -T"
REMOTE+=" -e METRICS_EXCLUDE_USER_IDS=$(printf %q "$EXCLUDE")"
REMOTE+=" -e METRICS_COMMAND=$(printf %q "$COMMAND")"
REMOTE+=" app node server/src/metrics.ts --markdown --since $(printf %q "$SINCE")"

OUT="$(ssh -i "$KEY" "$HOST" "$REMOTE")"

if [[ "${1:-}" == "--print" ]]; then
  printf '%s\n' "$OUT"
  exit 0
fi
printf '\n%s\n' "$OUT" >> docs/metrics.md
echo "docs/metrics.md 에 기록을 붙였습니다. 내용을 확인하고 커밋하세요."
