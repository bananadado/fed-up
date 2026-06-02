#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/drp03-backend"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
LOKI_URL="http://localhost:3100/loki/api/v1/push"

log_deployment() {
    local service="$1"
    local status="$2"
    local message="$3"
    local timestamp
    timestamp=$(date +%s%N)

    curl -s -X POST "$LOKI_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"streams\": [{
                \"stream\": {
                    \"job\": \"deploy\",
                    \"service\": \"$service\",
                    \"level\": \"info\"
                },
                \"values\": [
                    [\"$timestamp\", \"deployment $status: $message\"]
                ]
            }]
        }" 2>/dev/null || true
}

cd "$DEPLOY_DIR"

SERVICES=("$@")

if [ ${#SERVICES[@]} -eq 0 ]; then
    echo "No services specified — nothing to deploy."
    exit 0
fi

echo "=== Deploying services: ${SERVICES[*]} ==="

for svc in "${SERVICES[@]}"; do
    echo "--- Rebuilding and restarting: $svc ---"
    log_deployment "$svc" "started" "rebuilding $svc"

    if docker compose -f "$COMPOSE_FILE" up -d --no-deps --build "$svc" 2>&1; then
        log_deployment "$svc" "completed" "$svc restarted successfully"
        echo "  ✓ $svc deployed"
    else
        log_deployment "$svc" "failed" "$svc failed to restart"
        echo "  ✗ $svc failed"
        exit 1
    fi
done

echo ""
echo "=== Deployment complete ==="
docker compose -f "$COMPOSE_FILE" ps
