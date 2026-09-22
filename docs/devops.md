# Deployment, delivery and monitoring

How a commit becomes a running container, and how you find out when it stops.

---

## The pipeline

One workflow, so the whole path is a single graph in the Actions view rather
than something to reconstruct across four files.

```
                    ┌─ verify ─┐
  push to main ─────┤          ├── build ── scan ── deploy-staging ── smoke ── deploy-production
                    └─ e2e ────┘                                                    ▲
                                                                             manual approval
```

| Stage | Where | What it establishes |
|---|---|---|
| `verify` | GitHub-hosted | Types, lint, 102 unit tests, production build |
| `e2e` | GitHub-hosted | 13 Playwright tests against a real Postgres |
| `build` | GitHub-hosted | Image to GHCR, multi-tag, SBOM, provenance attestation |
| `scan` | GitHub-hosted | Trivy → SARIF → the repository's Security tab |
| `deploy-staging` | self-hosted | Pull and roll out, gated on the health endpoint |
| `smoke` | GitHub-hosted | Shell tests against staging, and a revision check |
| `deploy-production` | self-hosted | The same image, after a human approves |

### Decisions behind it

**Production deploys the image staging proved.** The `build` job publishes once
and passes the `sha-` tag downstream. Rebuilding the same commit for production
would produce a different artefact with the same name, which defeats the point
of having tested one.

**The `sha-` tag is the only one ever deployed.** `main` and `latest` exist for
people; a rollback needs a name that cannot move.

**Deploys run on a self-hosted runner.** The server connects out to GitHub, so
nothing has to be reachable from the internet and no private key sits in
repository secrets. The trade is real and worth stating: the runner holds the
Docker socket, so anything that can queue a job on it can control the host.
That is why it is a repository-scoped runner on a machine that does nothing
else.

**The scan only fails on fixable HIGH and CRITICAL findings.** Failing on
unfixable base-image CVEs turns the pipeline permanently red, and a red
pipeline nobody can act on is one nobody reads.

**Deploy jobs are gated on `vars.DEPLOY_ENABLED`.** Without a registered runner
they would queue forever. The switch keeps the pipeline honest on a clone.

---

## Server setup

### 1 · Register the runner

Settings → Actions → Runners → New self-hosted runner, and copy the token.

```bash
cd deploy
REPO_URL=https://github.com/<owner>/notebooklm-clone \
RUNNER_TOKEN=<token> \
  docker compose -f docker-compose.runner.yml up -d
```

The label `notebook` is what makes the deploy jobs land on this machine.

### 2 · Create the environments

One directory per environment, each with its own `.env` and its own port:

```
deploy/staging/.env       APP_PORT=3000
deploy/production/.env    APP_PORT=3001
```

Copy `deploy/.env.example` into each and fill it in. Different database
passwords and a different `SESSION_SECRET` per environment — sharing them means
staging traffic can read production sessions.

### 3 · Configure GitHub

**Environments** (Settings → Environments): `staging`, and `production` with
*Required reviewers* set to yourself. That approval is what makes the pipeline
pause before production, and it is recorded against the commit.

**Variables:**

| Variable | Example |
|---|---|
| `DEPLOY_ENABLED` | `true` |
| `STAGING_URL` | `https://staging.notebook.example.com` |
| `STAGING_HEALTH_URL` | `https://staging.notebook.example.com/api/health` |
| `PRODUCTION_URL` | `https://notebook.example.com` |
| `PRODUCTION_HEALTH_URL` | `https://notebook.example.com/api/health` |

**Secrets:** `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`, for the browser tests.

### 4 · Point the proxy at them

Two proxy hosts, one per environment, forwarding to ports 3000 and 3001. The
settings that matter — forwarded headers, buffering off — are in
[DEPLOY.md](../DEPLOY.md).

---

## Rolling out and rolling back

`deploy/deploy.sh` does the rollout and is safe to run by hand:

```bash
REGISTRY_IMAGE=ghcr.io/<owner>/notebooklm-clone \
HEALTH_URL=http://localhost:3001/api/health \
  ./deploy/deploy.sh production sha-1a2b3c4
```

It pulls the tag, starts the stack, and waits up to 120 seconds for
`/api/health` to report `ok`. If that never happens it prints the last 60 log
lines and rolls back to the tag recorded in `deploy/<env>/last-good-tag`.

It refuses to guess when there is no known-good tag, leaving the new version
running and failing loudly instead — a deliberate choice, because rolling back
to an unknown state is worse than stopping.

**Migrations run when the app boots.** That keeps the schema and the code that
expects it deployed together, and it assumes a single instance. Set
`RUN_MIGRATIONS_ON_BOOT=false` and run them separately the moment that stops
being true.

---

## What is measured

The app exposes Prometheus metrics at `/api/metrics`, behind a bearer token —
the proxy forwards every path on the public hostname, and this endpoint exposes
route names, traffic volumes and spend.

| Metric | Why it is there |
|---|---|
| `notebook_http_requests_total` | Rate and error rate, by route and status |
| `notebook_http_request_duration_seconds` | Latency percentiles |
| `notebook_ai_requests_total` | Model calls by provider, operation and outcome |
| `notebook_ai_tokens_total` | Input, output and cached tokens |
| `notebook_ai_cost_usd_total` | Spend, so it is visible before the invoice |
| `notebook_ingest_duration_seconds` | How long a source takes to become usable |

Route labels are the Next route *pattern*, never the URL. A URL carries
notebook and source ids, so using it directly would mint a series per notebook
and take the metrics store down.

Alongside: `postgres_exporter` for the database, `cAdvisor` for containers,
`node_exporter` for the host, and `blackbox_exporter` probing the public URL
from outside — so a proxy or certificate failure is visible while the container
still reports healthy.

Logs are JSON, one object per line, with a `scope` field.

```bash
docker compose -p notebook-production logs app | jq 'select(.level == "error")'
```

---

## Running the monitoring stack

```bash
cp monitoring/.env.example monitoring/.env
cp monitoring/prometheus/metrics-token.example monitoring/prometheus/metrics-token
# put the same value in each environment's METRICS_TOKEN
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

Grafana on `:3300`, Prometheus on `:9090`, Alertmanager on `:9093`. The
dashboard is provisioned from `monitoring/grafana/dashboards/` — edit the file,
not the UI, or the change is lost when the volume is recreated.

Alertmanager ships with a black-hole webhook so the stack starts cleanly. Point
it at Slack, Discord or ntfy in `monitoring/alertmanager/alertmanager.yml`.

**Neither Prometheus nor Alertmanager expands environment variables in its
configuration.** A `${VAR}` is read literally, and Alertmanager refuses to load
the file at all — it keeps running with no configuration, so alerting is silently
dead while the container looks healthy. Both configs are static for that reason.

Alerts and what to do about them: [runbook.md](runbook.md).
