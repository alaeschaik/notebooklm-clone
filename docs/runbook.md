# Runbook

One entry per alert: what fired, what it usually means, and what to do. Written
to be read at 3am by someone who did not write the code.

Dashboards: Grafana → *Notebook — service overview*.
Alerts: Prometheus `/alerts`, Alertmanager `/#/alerts`.

---

## AppDown

**Fires when** the app has not answered a Prometheus scrape for 2 minutes.

Check in this order — the first two are far more common than the third:

```bash
docker compose -p notebook-production ps          # is the container running?
docker compose -p notebook-production logs --tail 100 app
curl -fsS localhost:3001/api/health                # answers, but what does it say?
```

- **Container restarting** → almost always configuration. A missing
  `SESSION_SECRET` or `ANTHROPIC_API_KEY` stops the process at boot. The logs
  name the variable.
- **Container up, health failing** → the database. Jump to
  [PostgresDown](#postgresdown).
- **Health fine, scrape failing** → Prometheus cannot reach it. Check
  `METRICS_TOKEN` matches `monitoring/prometheus/metrics-token`; a mismatch
  returns 404 and looks exactly like the app being down.

**Roll back** if it started after a deploy:

```bash
REGISTRY_IMAGE=ghcr.io/<owner>/notebooklm-clone \
HEALTH_URL=http://localhost:3001/api/health \
  ./deploy/deploy.sh production "$(cat deploy/production/last-good-tag)"
```

---

## PublicEndpointDown

**Fires when** the blackbox probe cannot reach the public URL, while the
container may be perfectly healthy.

That gap is the whole point of this alert: it means the problem is in front of
the app. Check the reverse proxy first, then the certificate, then DNS.

```bash
curl -I https://notebook.example.com/api/health   # from outside the server
docker logs <nginx-proxy-manager-container> --tail 50
```

If `AppDown` is also firing, ignore this one and work that instead.

---

## CertificateExpiringSoon

**Fires when** the TLS certificate expires within 14 days.

Renewal is normally automatic. If it has not happened, the usual cause is that
the ACME challenge cannot reach the server — check that port 80 is still open
and forwarded, then force a renewal from the proxy's UI.

Not urgent at 3am. It is urgent on day 13.

---

## HighErrorRate

**Fires when** more than 5% of requests return 5xx over 5 minutes.

```
sum by (route) (rate(notebook_http_requests_total{status=~"5.."}[5m]))
```

Run that first — it tells you whether one route is broken or everything is.

- **One route** → a code path. Logs are JSON; filter by scope:
  `docker compose -p notebook-production logs app | jq 'select(.level=="error")'`
- **Everything** → the database or an exhausted connection pool. Check
  `pg_stat_activity_count` against `DATABASE_POOL_MAX`.
- **Only model-backed routes** → see [ModelCallsFailing](#modelcallsfailing).

---

## SlowRequests

**Fires when** the 95th percentile exceeds 10 seconds for 10 minutes.

The threshold is deliberately high: generating a studio document legitimately
takes tens of seconds. Before suspecting the app, check the *Model calls by
operation* panel — if model latency rose at the same time, this is upstream and
there is nothing to fix here.

If model latency is flat and the app is slow, look at the connection pool and
at ingestion: a large PDF holds a request thread for minutes, which is a known
limitation rather than a fault.

---

## ModelCallsFailing

**Fires when** more than 20% of calls to one provider fail over 10 minutes.

Almost always quota or an upstream outage rather than a code change.

- **Gemini, and audio is affected** → the free tier allows ten text-to-speech
  requests per *day*. Check the logs for a `PerDay` quota message; if that is
  it, nothing is broken and it resets tomorrow.
- **Anthropic** → check status.anthropic.com before anything else.
- **Both at once** → the server's outbound connectivity, not the providers.

---

## SpendAboveBudget

**Fires when** estimated spend passes $20 in 24 hours.

It is an estimate derived from token counters, not an invoice — treat it as a
trend signal. Use the *Spend by operation* panel to see which feature is
responsible.

A sudden jump with no traffic increase usually means something is retrying in
a loop. A jump alongside traffic may simply be real usage, in which case raise
the threshold rather than ignoring the alert.

The application has **no rate limiting**, so a public deployment can be driven
up deliberately. If spend climbs with no explanation, take the deployment
private while you investigate.

---

## PostgresDown

**Fires when** the exporter cannot reach the database.

```bash
docker compose -p notebook-production ps postgres
docker compose -p notebook-production logs --tail 100 postgres
```

- **Container down** → start it; check the disk first, since Postgres refuses
  to start with no space.
- **Container up, connections refused** → likely `max_connections`. Check
  `pg_stat_activity_count`; reduce `DATABASE_POOL_MAX` or add PgBouncer.

Data lives in the `pgdata` volume and survives container recreation. Do not
`down -v` while investigating — that deletes it.

---

## DiskFillingUp

**Fires when** less than 15% of the root filesystem remains.

Find it before deleting anything:

```bash
docker system df
du -sh /var/lib/docker/volumes/* | sort -h | tail
```

Usual suspects, in order: old images from previous deploys, generated audio in
the `blobs` volume, Postgres WAL.

```bash
docker image prune -a --filter "until=168h"   # safe: deploys pull by tag
```

Generated audio can be deleted; it regenerates on request. **Never** prune
volumes blindly — `pgdata` is in there.

---

## ContainerRestartLoop

**Fires when** a container has restarted more than three times in 15 minutes.

A crash loop is configuration far more often than load. Read the first error
after a start, not the last line:

```bash
docker compose -p notebook-production logs app | head -50
```

If it began after a deploy, roll back (see [AppDown](#appdown)) and investigate
with production stable rather than with it flapping.

---

## Nothing is firing but something is wrong

Check that alerting itself is alive — a silent monitoring stack looks identical
to a healthy system.

```bash
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job:.labels.job, health}'
curl -s localhost:9093/api/v2/status  | jq .cluster.status
```

Both Prometheus and Alertmanager **fail to load a config containing `${VAR}`** —
neither expands environment variables. Alertmanager in particular keeps running
with no configuration at all, so check its logs for
`Loading configuration file failed` after any config change.
