# Self-hosting

Two containers: the app and Postgres. Nothing else is required, and nothing is
tied to a particular host.

## Quick start

```bash
cp .env.example .env          # add ANTHROPIC_API_KEY, GEMINI_API_KEY, SESSION_SECRET
docker compose up -d --build
```

The app is on <http://localhost:3000>. It applies database migrations itself on
boot, so there is no separate migration step.

```bash
docker compose ps             # both services should report (healthy)
curl localhost:3000/api/health
# {"status":"ok","database":"up"}
```

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Chat with citations, studio documents, mind maps, audio scripts |
| `SESSION_SECRET` | yes | Signs the visitor cookie — `openssl rand -base64 32` |
| `GEMINI_API_KEY` | recommended | Embeddings and the audio overview |
| `APP_PORT` | no | Host port for the app, default `3000` |
| `POSTGRES_PORT` | no | Host port for Postgres, default `5433` |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` | no | Default to `notebook` |
| `DATABASE_POOL_MAX` | no | Connections per app instance, default `10` |
| `RUN_MIGRATIONS_ON_BOOT` | no | Set `false` to manage migrations yourself |
| `STORAGE_DIR` | no | Where generated audio is written, default `/data/blobs` |

`DATABASE_URL` is set by Compose for the app container. It is only needed in
`.env` when running the app directly with `npm run dev`.

Without `GEMINI_API_KEY` the app still works: sources ingest, answers are still
grounded and cited. Retrieval falls back to full-text only, and the audio
overview is unavailable.

**Gemini's free tier allows ten text-to-speech requests per day** across the
whole project. One audio overview is two or three, so enable billing before
relying on it.

## Data

Two named volumes hold everything that matters:

- `pgdata` — notebooks, sources, chunks, embeddings, conversations
- `blobs` — rendered audio

```bash
# Back up the database
docker compose exec -T postgres pg_dump -U notebook notebook | gzip > backup.sql.gz

# Restore
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U notebook -d notebook
```

`docker compose down` keeps both. `docker compose down -v` deletes them.

## Upgrading

```bash
git pull && docker compose up -d --build
```

Migrations run on boot, so a schema change ships with the code that expects it.
If you run more than one instance, set `RUN_MIGRATIONS_ON_BOOT=false` and apply
migrations once before rolling out, so instances cannot race each other.

## Behind a reverse proxy

Two things must be right or the app misbehaves in ways that look like bugs:

- **Forward the original host and scheme.** Share links are built from them, so
  without them the links point at the container instead of your domain.
- **Turn off response buffering.** Answers stream over SSE. With buffering on,
  nothing appears until the whole answer is finished.

Serve it over HTTPS. The session cookie is `Secure` in production, so over plain
HTTP the browser discards it and every request looks like a new visitor.

### Nginx Proxy Manager

**1. Put NPM and the app on the same Docker network.** Then NPM can reach the
container by name and the app needs no published port at all.

Create `docker-compose.override.yml` next to the compose file:

```yaml
services:
  app:
    # Reached as http://notebook-app:3000 from NPM; drop the host port so the
    # app is only reachable through the proxy.
    container_name: notebook-app
    ports: !override []
    networks: [default, npm]

networks:
  npm:
    external: true
    name: <the network your NPM container is on>
```

Find that network with `docker inspect <npm-container> -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'`.

If you would rather not touch networking, leave the published port and point NPM
at your host's LAN IP with port `3000` instead — but then close 3000 at the
firewall so it is not reachable from outside.

**2. Add the Proxy Host** — *Hosts → Proxy Hosts → Add Proxy Host*.

| Field | Value |
|---|---|
| Domain Names | `notebook.example.com` |
| Scheme | `http` — TLS terminates at NPM |
| Forward Hostname / IP | `notebook-app` (or your host IP) |
| Forward Port | `3000` |
| Cache Assets | **off** — Next already sets correct cache headers, and NPM's rules can serve stale hashed assets |
| Block Common Exploits | on |
| Websockets Support | on — harmless, and needed if you ever proxy `next dev` |

**3. SSL tab.** Request a new Let's Encrypt certificate, then enable **Force
SSL** and **HTTP/2**. Without Force SSL the session cookie never sticks.

**4. Advanced tab.** Paste this:

```nginx
# Answers stream over SSE; buffering holds the whole response back.
proxy_buffering off;
proxy_cache off;

# Ingestion and generation take minutes, well past the 60s default.
proxy_read_timeout 300s;
proxy_send_timeout 300s;

# Uploads are capped at 25 MB by the app.
client_max_body_size 32m;
```

Only directives that inherit into the location block belong here. NPM sets its
own `proxy_set_header` lines inside `location /`, and nginx does not merge those
across levels — anything you add here would be ignored. That is fine: NPM
already sends `Host` and `X-Forwarded-Proto`, which is exactly what the app
needs.

### Verifying the proxy

```bash
curl -sI https://notebook.example.com/api/health     # 200
```

Then in the browser: ask a question and watch the answer appear **word by
word**. If it lands all at once, buffering is still on. Create a share link and
check the URL shows your domain rather than an internal address.

## Verifying a deployment

```bash
npx playwright test          # against E2E_BASE_URL, default http://localhost:3000
```

Or by hand: add a PDF and a web URL, ask a question spanning both, and click a
citation — the source should open with the cited sentence highlighted.
