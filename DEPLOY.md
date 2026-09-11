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

The app reads `X-Forwarded-Proto` and `X-Forwarded-Host` to build share links,
so forward both or shared URLs will point at the wrong origin.

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Answers stream over SSE; buffering holds them until the response ends.
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Serve it over HTTPS. The session cookie is `Secure` in production, so over plain
HTTP the browser discards it and every request looks like a new visitor.

## Verifying a deployment

```bash
npx playwright test          # against E2E_BASE_URL, default http://localhost:3000
```

Or by hand: add a PDF and a web URL, ask a question spanning both, and click a
citation — the source should open with the cited sentence highlighted.
