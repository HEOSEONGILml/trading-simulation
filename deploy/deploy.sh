#!/usr/bin/env bash
# 로컬의 커밋된 코드를 운영 서버에 올리고 다시 빌드한다
# 사용: deploy/deploy.sh   (deploy/.env 에 HOST, DOMAIN 지정)
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.env
KEY="${SSH_KEY:-$HOME/.ssh/trading_sim_deploy}"

if grep -rlI '{{' web/public >/dev/null; then
  echo "web/public 에 채우지 않은 자리표시자({{...}})가 있습니다:" >&2
  grep -rnI '{{' web/public >&2
  exit 1
fi

# 1GB 서버에서 이미지 빌드(npm ci, vite build) 중 메모리가 부족하지 않도록 스왑 2GB를 한 번만 만든다
ssh -i "$KEY" "$HOST" 'test -f /swapfile || (sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null)'

git archive --format=tar HEAD | ssh -i "$KEY" "$HOST" 'mkdir -p ~/app && tar -x -C ~/app'
# 비밀 값은 저장소에 넣지 않고 따로 올린다
if [ -f deploy/secrets.env ]; then scp -q -i "$KEY" deploy/secrets.env "$HOST:app/secrets.env"; fi
ssh -i "$KEY" "$HOST" "cd ~/app && echo DOMAIN=$DOMAIN > .env && docker compose -f docker-compose.prod.yml up -d --build && docker image prune -f"
echo "배포 완료: https://$DOMAIN"
