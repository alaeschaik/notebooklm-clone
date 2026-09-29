#!/usr/bin/env bash
#
# Rolls one environment onto a published image tag, and puts the previous one
# back if the new one does not come up healthy.
#
#   ./deploy/deploy.sh staging sha-1a2b3c4
#
# Run by the pipeline on the self-hosted runner, and safe to run by hand.
#
# Configuration comes from two files per environment, both in the repository:
#
#   deploy/<env>/env           plain text, reviewable in a diff
#   deploy/<env>/secrets.env   encrypted with SOPS, only the server can read it
#
# Secrets are decrypted into this process's environment and never written to
# disk. Compose interpolates them from there.
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
COMPOSE_FILE="$ROOT/docker-compose.prod.yml"
CONFIG_FILE="$ROOT/$ENVIRONMENT/env"
SECRETS_FILE="$ROOT/$ENVIRONMENT/secrets.env"

# State that has to outlive a job: actions/checkout cleans the workspace, so
# the last-good tag cannot live next to the code.
STATE_DIR="${DEPLOY_STATE_DIR:-/opt/notebook/$ENVIRONMENT}"
LAST_GOOD="$STATE_DIR/last-good-tag"

# The age identity that decrypts secrets.env. Present only on this server.
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/opt/notebook/keys/age.key}"

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { echo "$*" >&2; exit 1; }

[ -f "$CONFIG_FILE" ]  || die "missing config: $CONFIG_FILE"
[ -f "$SECRETS_FILE" ] || die "missing secrets: $SECRETS_FILE"
[ -d "$STATE_DIR" ]    || die "missing state directory: $STATE_DIR"
command -v sops >/dev/null || die "sops is not installed"
[ -r "$SOPS_AGE_KEY_FILE" ] || die "cannot read age key: $SOPS_AGE_KEY_FILE"

# Reads KEY=value lines into the environment. Split on the first '=' only, and
# never expand the value — secrets legitimately contain $, spaces and '='.
load_env() {
  local key value
  while IFS='=' read -r key value; do
    case "$key" in ''|'#'*) continue ;; esac
    export "$key=$value"
  done
}

load_env < "$CONFIG_FILE"
load_env < <(sops --decrypt --output-type dotenv "$SECRETS_FILE")

compose() {
  docker compose \
    --project-name "notebook-$ENVIRONMENT" \
    --file "$COMPOSE_FILE" \
    "$@"
}

# Waits for the app to report healthy *and* to be the version we just rolled
# out. Three things have to agree, and each has been wrong in practice:
# the process must accept connections, it must reach Postgres, and it must be
# the new container rather than the old one still answering on the port during
# the swap. Without the revision check a deploy can be declared healthy on the
# strength of the version it was supposed to replace.
await_health() {
  local want="$1" deadline=$((SECONDS + HEALTH_TIMEOUT)) body
  while (( SECONDS < deadline )); do
    body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ "$body" == *'"status":"ok"'* ]]; then
      # Tags are sha-<short>; /api/health reports the full commit.
      if [ -z "$want" ] || [[ "$body" == *"\"revision\":\"$want"* ]]; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

# The commit a tag promises to be running, empty for tags that carry no sha.
revision_of() {
  case "$1" in
    sha-*) printf '%s' "${1#sha-}" ;;
    *)     printf '' ;;
  esac
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

if await_health "$(revision_of "$TAG")"; then
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

if await_health "$(revision_of "$PREVIOUS")"; then
  log "rollback to $PREVIOUS healthy"
else
  log "rollback to $PREVIOUS ALSO unhealthy — environment is down"
fi
exit 1
