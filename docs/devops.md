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
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -fsSL https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz | tar xz
./config.sh --url https://github.com/<owner>/notebooklm-clone \
            --token <token> --labels notebook --unattended
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
```

The label `notebook` is what makes the deploy jobs land on this machine, and
`svc.sh` is what makes the runner survive a reboot. The account running it must
be in the `docker` group.

### 2 · Create the state directories

The last-good tag and the decryption key have to outlive a job, and
`actions/checkout` cleans the workspace on every run — so they cannot live next
to the code:

```bash
sudo mkdir -p /opt/notebook/{staging,production,keys}
sudo chown -R "$USER":"$USER" /opt/notebook
chmod 700 /opt/notebook/keys
```

### 3 · Set up secret decryption

Secrets are committed to the repository encrypted (see **Secrets**, below). The
server needs the identity that decrypts them:

```bash
age-keygen -o /opt/notebook/keys/age.key
chmod 400 /opt/notebook/keys/age.key
age-keygen -y /opt/notebook/keys/age.key      # the public key, for .sops.yaml
```

Put that public key in `.sops.yaml`, then create the two secret files — they
are written encrypted, there is never a plain-text version:

```bash
sops deploy/staging/secrets.env
sops deploy/production/secrets.env
```

`deploy/secrets.env.example` lists what belongs in them. Use a different
`POSTGRES_PASSWORD` and `SESSION_SECRET` per environment — sharing them means
staging traffic can read production sessions.

Non-secret settings (ports, log level, resource limits) sit beside them in
`deploy/<env>/env` as plain text, so a change to them is a reviewable diff.

### 4 · Configure GitHub

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

Use the public hostnames rather than `localhost`: the health check then proves
the reverse proxy is routing correctly, not just that a port is open.

**Secrets:** `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` — these are for the
browser tests on GitHub-hosted runners only. The keys the deployed application
uses live in the encrypted files and never pass through GitHub.

### 5 · Point the proxy at them

Two proxy hosts, one per environment, forwarding to the ports set in
`deploy/<env>/env` — 3010 for staging, 3011 for production. The settings that
matter — forwarded headers, buffering off, websockets on — are in
[DEPLOY.md](../DEPLOY.md).

---

## Rolling out and rolling back

`deploy/deploy.sh` does the rollout and is safe to run by hand:

```bash
REGISTRY_IMAGE=ghcr.io/<owner>/notebooklm-clone \
HEALTH_URL=http://localhost:3011/api/health \
  ./deploy/deploy.sh production sha-1a2b3c4
```

It decrypts that environment's secrets into its own process environment, pulls
the tag, starts the stack, and waits up to 120 seconds for `/api/health` to
report `ok`. If that never happens it prints the last 60 log lines and rolls
back to the tag recorded in `/opt/notebook/<env>/last-good-tag`.

It refuses to guess when there is no known-good tag, leaving the new version
running and failing loudly instead — a deliberate choice, because rolling back
to an unknown state is worse than stopping.

**Migrations run when the app boots.** That keeps the schema and the code that
expects it deployed together, and it assumes a single instance. Set
`RUN_MIGRATIONS_ON_BOOT=false` and run them separately the moment that stops
being true.

---

## Secrets

Configuration splits in two, and the split is the whole design:

| | Where | Readable by |
|---|---|---|
| Ports, log level, limits | `deploy/<env>/env`, plain text in git | anyone with the repo |
| Passwords, API keys, tokens | `deploy/<env>/secrets.env`, **SOPS-encrypted** in git | whoever holds the age key |

Encryption is [SOPS](https://github.com/getsops/sops) with an
[age](https://github.com/FiloSottile/age) identity. SOPS encrypts *values* and
leaves *keys* in the clear, so a diff shows that `SESSION_SECRET` changed
without showing what it changed to.

The private key exists in exactly two places: `/opt/notebook/keys/age.key` on
the server, mode `400`, and the operator's own machine. It is never in git,
never in a GitHub secret, and never in a container image.

**Nothing is written to disk in plain text.** `deploy.sh` decrypts into its own
process environment and Compose interpolates from there. There is no `.env`
file on the server to leak, back up by accident, or leave world-readable.

**Rotating a secret is a commit:**

```bash
sops deploy/production/secrets.env      # edit in place, still encrypted
git commit -am "Rotate the production session secret"
git push                                 # pipeline redeploys with the new value
```

Git then carries an audit trail of every rotation — who, when, which
environment — with none of the values.

**Two things deliberately stay in GitHub secrets:** `ANTHROPIC_API_KEY` and
`GEMINI_API_KEY` for the browser tests, because those run on GitHub-hosted
runners that must not hold the age key. They should be separate, lower-quota
keys from the ones the deployed app uses — a CI key leaking must not be a
production incident.

**What this does not defend against.** Anyone with root on the server, or with
the runner's account, can read the decrypted values out of a running process.
SOPS protects secrets at rest and in git; it does not protect them from a
compromised host. Reducing that exposure is what the runner's dedicated
account and the hardened containers are for.

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
