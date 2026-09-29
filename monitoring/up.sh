#!/usr/bin/env bash
#
# Starts the monitoring stack with secrets decrypted into this process rather
# than into a file on disk. Same model as deploy/deploy.sh.
#
#   ./monitoring/up.sh [up -d | down | logs -f | ...]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/opt/notebook/keys/age.key}"

command -v sops >/dev/null || { echo "sops is not installed" >&2; exit 1; }

load_env() {
  local key value
  while IFS='=' read -r key value; do
    case "$key" in ''|'#'*) continue ;; esac
    export "$key=$value"
  done
}

load_env < "$ROOT/env"
load_env < <(sops --decrypt --output-type dotenv "$ROOT/secrets.env")

# Prometheus reads the scrape credential from a file, so this one secret has to
# exist on disk. Written 0600 and gitignored; it is the single exception.
umask 077
printf '%s' "$METRICS_TOKEN" > "$ROOT/prometheus/metrics-token"

exec docker compose \
  --project-name notebook-monitoring \
  --file "$ROOT/docker-compose.monitoring.yml" \
  "${@:-up -d}"
