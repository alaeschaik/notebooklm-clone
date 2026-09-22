#!/usr/bin/env bash
#
# Rolls one environment onto a published image tag, and puts the previous one
# back if the new one does not come up healthy.
#
#   ./deploy/deploy.sh staging sha-1a2b3c4
#
# Run by the pipeline on the self-hosted runner, and safe to run by hand.
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <staging|production> <image-tag>}"
TAG="${2:?usage: deploy.sh <staging|production> <image-tag>}"

REGISTRY_IMAGE="${REGISTRY_IMAGE:?REGISTRY_IMAGE is required}"
HEALTH_URL="${HEALTH_URL:?HEALTH_URL is required}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

case "$ENVIRONMENT" in
  staging|production) ;;
  *) echo "unknown environment: $ENVIRONMENT" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${DEPLOY_STATE_DIR:-$ROOT/$ENVIRONMENT}"
COMPOSE_FILE="$ROOT/docker-compose.prod.yml"
ENV_FILE="$STATE_DIR/.env"
# The tag that was last confirmed healthy — the thing we roll back to.
LAST_GOOD="$STATE_DIR/last-good-tag"

[ -f "$ENV_FILE" ] || { echo "missing env file: $ENV_FILE" >&2; exit 1; }

compose() {
  docker compose \
    --project-name "notebook-$ENVIRONMENT" \
    --file "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    "$@"
}

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# Waits for the app to report healthy. Both the container and the endpoint have
# to agree: a process can accept connections while unable to reach Postgres.
await_health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 "$HEALTH_URL" | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 3
  done
  return 1
}

roll_to() {
  local tag="$1"
  log "starting $ENVIRONMENT on $tag"
  IMAGE="$REGISTRY_IMAGE:$tag" compose pull --quiet app
  IMAGE="$REGISTRY_IMAGE:$tag" compose up -d --remove-orphans
}

log "deploying $ENVIRONMENT → $TAG"
PREVIOUS="$(cat "$LAST_GOOD" 2>/dev/null || true)"

roll_to "$TAG"

if await_health; then
  echo "$TAG" > "$LAST_GOOD"
  log "healthy — recorded $TAG as last known good"
  # Old images accumulate fast on a small server.
  docker image prune --force --filter "until=168h" >/dev/null 2>&1 || true
  exit 0
fi

log "FAILED health check after ${HEALTH_TIMEOUT}s"
compose logs --no-color --tail 60 app || true

if [ -z "$PREVIOUS" ] || [ "$PREVIOUS" = "$TAG" ]; then
  # Nothing known-good to return to — leave it as is rather than guessing, and
  # fail loudly so a human looks.
  log "no previous good tag to roll back to; leaving $TAG running"
  exit 1
fi

log "rolling back to $PREVIOUS"
roll_to "$PREVIOUS"

if await_health; then
  log "rollback to $PREVIOUS healthy"
else
  log "rollback to $PREVIOUS ALSO unhealthy — environment is down"
fi
exit 1
