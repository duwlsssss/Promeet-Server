#!/bin/bash
# EC2에서 실행되는 블루/그린 배포 스크립트
# 사용법: deploy.sh <ECR 이미지 주소:태그>
set -euo pipefail

IMAGE="$1"
REGION="ap-northeast-2"
PROJECT="promeet"
UPSTREAM_FILE="/etc/nginx/promeet/upstream.inc"
ENV_FILE="/opt/promeet/.env"

# 1) 지금 트래픽을 받는 쪽 확인 -> 반대쪽에 새 버전 배포
if grep -q ":3001" "$UPSTREAM_FILE"; then
  CURRENT="blue";  CURRENT_PORT=3001
  TARGET="green";  TARGET_PORT=3002
else
  CURRENT="green"; CURRENT_PORT=3002
  TARGET="blue";   TARGET_PORT=3001
fi
echo "현재: $CURRENT($CURRENT_PORT) -> 배포 대상: $TARGET($TARGET_PORT)"

# 2) Parameter Store(/promeet/*)에서 환경변수 읽어 .env 생성
aws ssm get-parameters-by-path --region "$REGION" --path "/$PROJECT/" --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text \
  | sed -E "s#^/$PROJECT/([^[:space:]]+)[[:space:]]+#\1=#" > "$ENV_FILE"
echo "PORT=3000" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 3) 새 이미지 받기
REGISTRY="${IMAGE%%/*}"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker pull "$IMAGE"

# 4) 대상 쪽 컨테이너 실행 (외부엔 안 열고 localhost에만 바인딩)
docker rm -f "$PROJECT-$TARGET" 2>/dev/null || true
docker run -d \
  --name "$PROJECT-$TARGET" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:$TARGET_PORT:3000" \
  --memory 400m \
  --log-opt max-size=10m --log-opt max-file=3 \
  "$IMAGE"

# 5) 헬스체크 (최대 60초)
echo "헬스체크 중..."
for i in $(seq 1 30); do
  if curl -fs "http://127.0.0.1:$TARGET_PORT/health" > /dev/null; then
    echo "헬스체크 통과 (${i}회차)"
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ -z "${HEALTHY:-}" ]; then
  echo "❌ 헬스체크 실패 -> 전환하지 않음. 기존 $CURRENT 계속 서비스"
  docker logs --tail 50 "$PROJECT-$TARGET" || true
  docker rm -f "$PROJECT-$TARGET" || true
  exit 1
fi

# 6) Nginx 전환 (reload는 기존 연결을 끊지 않음)
echo "set \$promeet_upstream http://127.0.0.1:$TARGET_PORT;" > "$UPSTREAM_FILE"
nginx -t
systemctl reload nginx
echo "✅ 트래픽 전환: $CURRENT -> $TARGET"

# 7) 처리 중인 요청이 끝나도록 잠깐 기다린 뒤 이전 컨테이너 종료
sleep 10
docker stop "$PROJECT-$CURRENT" 2>/dev/null || true
docker rm "$PROJECT-$CURRENT" 2>/dev/null || true

# 8) 안 쓰는 이미지 정리 (디스크 확보)
docker image prune -af --filter "until=72h" || true
echo "배포 완료: $IMAGE"
