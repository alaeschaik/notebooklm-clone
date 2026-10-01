#!/usr/bin/env bash
#
# Drives an environment so the dashboards have something to show, and so the
# monitoring chain is exercised rather than assumed.
#
#   ./monitoring/generate-traffic.sh https://notebook-staging.sheikhs.at
#   ./monitoring/generate-traffic.sh https://notebook.sheikhs.at 600 --with-ai
#
#   $1  base URL                  $2  seconds to run (default 300)
#   --with-ai  also send chat requests. These call Anthropic and Gemini and
#              cost real money, so they are off unless asked for.
#
# The traffic is deliberately mixed: reads, writes, and requests that are
# *supposed* to fail. A dashboard whose error panels are always empty cannot
# tell you the difference between "healthy" and "not wired up".
set -uo pipefail

BASE="${1:?usage: generate-traffic.sh <base-url> [seconds] [--with-ai]}"
DURATION="${2:-300}"
WITH_AI=false
for a in "$@"; do [ "$a" = "--with-ai" ] && WITH_AI=true; done

JAR="$(mktemp -t nbtraffic)"
trap 'rm -f "$JAR"' EXIT

ok=0; failed=0; expected_errors=0

# -c and -b on every call: the app issues an anonymous session cookie on first
# contact and scopes notebooks to it, so without the jar every request would
# start a new visitor and see nothing.
req() {
  local method="$1" path="$2" body="${3-}" code
  if [ -n "$body" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -c "$JAR" -b "$JAR" --max-time 60 \
      -H 'Content-Type: application/json' -d "$body" "$BASE$path")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -c "$JAR" -b "$JAR" --max-time 60 "$BASE$path")
  fi
  printf '%s' "$code"
}

# Like req, but returns the body — needed to pick ids out of responses.
req_body() {
  local method="$1" path="$2" body="${3-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" -c "$JAR" -b "$JAR" --max-time 120 \
      -H 'Content-Type: application/json' -d "$body" "$BASE$path"
  else
    curl -s -X "$method" -c "$JAR" -b "$JAR" --max-time 120 "$BASE$path"
  fi
}

json_field() { python3 -c "
import json,sys
try: print(json.load(sys.stdin)$1)
except Exception: print('')
"; }

# The sample text travels through the environment rather than the command line,
# so quotes and newlines in it cannot break the shell.
source_payload() {
  SAMPLE_TEXT="$SAMPLE" python3 -c '
import json, os
print(json.dumps({"kind": "text", "title": "EU AI Act Auszug",
                  "text": os.environ["SAMPLE_TEXT"]}))'
}

tally() {
  local code="$1" want="$2"
  if [ "$code" = "$want" ]; then ok=$((ok+1)); else
    failed=$((failed+1)); echo "  unerwartet: $3 -> $code (erwartet $want)"
  fi
}

echo "Ziel:    $BASE"
echo "Dauer:   ${DURATION}s"
echo "KI-Aufrufe: $([ "$WITH_AI" = true ] && echo "ja (kostet Geld)" || echo "nein")"
echo

# One session, so the notebooks stay visible to each other across the run.
curl -s -o /dev/null -c "$JAR" "$BASE/" || true

SAMPLE='The European Union Artificial Intelligence Act establishes a risk-based framework. Systems posing unacceptable risk are prohibited. High-risk systems must meet requirements for data governance, technical documentation, logging, transparency, human oversight, accuracy and cybersecurity before being placed on the market. Providers carry the primary obligations; deployers carry narrower ones around use and monitoring.'

deadline=$((SECONDS + DURATION))
round=0

while (( SECONDS < deadline )); do
  round=$((round+1))

  # --- reads: the ordinary, boring majority of real traffic ---------------
  tally "$(req GET /api/notebooks)" 200 "GET /api/notebooks"
  tally "$(req GET /api/health)" 200 "GET /api/health"

  # --- a notebook's whole life: create, fill, read, rename, share, delete --
  nb=$(req_body POST /api/notebooks "{\"title\":\"Lasttest $round\",\"emoji\":\"📊\"}" \
       | json_field "['notebook']['id']")

  if [ -n "$nb" ]; then
    tally "$(req GET "/api/notebooks/$nb")" 200 "GET notebook"
    tally "$(req GET "/api/notebooks/$nb/sources")" 200 "GET sources"
    tally "$(req GET "/api/notebooks/$nb/messages")" 200 "GET messages"
    tally "$(req GET "/api/notebooks/$nb/notes")" 200 "GET notes"
    tally "$(req PATCH "/api/notebooks/$nb" '{"title":"Lasttest umbenannt"}')" 200 "PATCH notebook"

    # Ingestion: parses, chunks and embeds. Populates ingest_duration_seconds.
    src=$(req_body POST "/api/notebooks/$nb/sources" "$(source_payload)" \
          | json_field "['source']['id']")
    [ -n "$src" ] && tally "$(req GET "/api/sources/$src")" 200 "GET source"

    tally "$(req POST "/api/notebooks/$nb/notes" '{"content":"Notiz aus dem Lasttest"}')" 201 "POST note"

    slug=$(req_body POST "/api/notebooks/$nb/share" '{}' | json_field "['publicSlug']")
    if [ -n "$slug" ]; then
      # The shared view is reachable without a session, so fetch it with no
      # cookie at all — that is how a recipient would actually see it.
      [ -n "$src" ] && curl -s -o /dev/null --max-time 30 \
        "$BASE/api/shared/$slug/sources/$src" && ok=$((ok+1))
      tally "$(req DELETE "/api/notebooks/$nb/share")" 200 "DELETE share"
    else
      failed=$((failed+1)); echo "  Freigabe lieferte keinen Slug"
    fi

    if [ "$WITH_AI" = true ] && [ -n "$src" ]; then
      # Streams, so the body is drained rather than parsed.
      curl -s -o /dev/null -c "$JAR" -b "$JAR" --max-time 180 \
        -H 'Content-Type: application/json' \
        -d '{"question":"Welche Pflichten treffen Anbieter von Hochrisikosystemen?"}' \
        "$BASE/api/notebooks/$nb/chat" && ok=$((ok+1))
    fi

    tally "$(req DELETE "/api/notebooks/$nb")" 200 "DELETE notebook"
  else
    failed=$((failed+1)); echo "  Notebook konnte nicht erstellt werden"
  fi

  # --- requests that must fail, so the error panels are provably alive ----
  # A dashboard that has never seen a 4xx is a dashboard you cannot trust.
  # A well-formed id that does not exist is a 404; a malformed one is a 400.
  # Both are worth generating, and the 404 must be a real v4 UUID — the nil
  # UUID fails validation and would only ever produce a 400.
  ghost=$(python3 -c 'import uuid; print(uuid.uuid4())')
  for pair in \
    "GET /api/notebooks/$ghost 404" \
    "GET /api/notebooks/not-a-uuid 400" \
    "GET /api/metrics 404"
  do
    set -- $pair
    code=$(req "$1" "$2")
    if [ "$code" = "$3" ]; then expected_errors=$((expected_errors+1));
    else echo "  Gegenprobe $1 $2 -> $code (erwartet $3)"; fi
  done

  remaining=$((deadline - SECONDS))
  printf '\r  Runde %-4s  ok=%-5s unerwartet=%-4s erwartete Fehler=%-5s  noch %ss   ' \
    "$round" "$ok" "$failed" "$expected_errors" "$((remaining > 0 ? remaining : 0))"

  sleep 5
done

echo
echo
echo "Runden:           $round"
echo "erfolgreich:      $ok"
echo "unerwartet:       $failed"
echo "erwartete Fehler: $expected_errors"
[ "$failed" -eq 0 ] || exit 1
