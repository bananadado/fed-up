#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/drp03-backend"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
LOKI_URL="http://localhost:3100/loki/api/v1/push"
NO_CACHE="${NO_CACHE:-0}"

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

if [ ${#SERVICES[@]} -eq 0 ] || [ "${SERVICES[0]:-}" = "all" ]; then
    echo "=== Redeploying full stack ==="
    log_deployment "stack" "started" "pulling, rebuilding, and recreating all services"

    docker compose -f "$COMPOSE_FILE" config --quiet
    docker compose -f "$COMPOSE_FILE" pull --ignore-buildable || true

    BUILD_ARGS=(--pull)
    if [ "$NO_CACHE" = "1" ]; then
        BUILD_ARGS+=(--no-cache)
    fi

    if docker compose -f "$COMPOSE_FILE" build "${BUILD_ARGS[@]}" && \
       docker compose -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans; then
        log_deployment "stack" "completed" "full stack redeployed successfully"
    else
        log_deployment "stack" "failed" "full stack redeploy failed"
        exit 1
    fi

    echo ""
    echo "=== Deployment complete ==="
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
fi

echo "=== Deploying services: ${SERVICES[*]} ==="

for svc in "${SERVICES[@]}"; do
    echo "--- Rebuilding and restarting: $svc ---"
    log_deployment "$svc" "started" "rebuilding $svc"

    docker compose -f "$COMPOSE_FILE" config --services | grep -qx "$svc" || {
        log_deployment "$svc" "failed" "unknown service"
        echo "  ✗ unknown service: $svc"
        exit 1
    }

    docker compose -f "$COMPOSE_FILE" pull "$svc" || true

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
