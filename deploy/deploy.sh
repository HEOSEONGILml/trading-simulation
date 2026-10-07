#!/usr/bin/env bash
# 로컬의 커밋된 코드를 운영 서버에 올리고 다시 빌드한다
# 사용: deploy/deploy.sh   (deploy/.env 에 HOST, DOMAIN 지정)
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.env
KEY="${SSH_KEY:-$HOME/.ssh/trading_sim_deploy}"

if grep -rl '{{' web/public >/dev/null; then
  echo "web/public 에 채우지 않은 자리표시자({{...}})가 있습니다:" >&2
  grep -rn '{{' web/public >&2
  exit 1
fi

git archive --format=tar HEAD | ssh -i "$KEY" "$HOST" 'mkdir -p ~/app && tar -x -C ~/app'
ssh -i "$KEY" "$HOST" "cd ~/app && DOMAIN=$DOMAIN docker compose -f docker-compose.prod.yml up -d --build && docker image prune -f"
echo "배포 완료: https://$DOMAIN"
