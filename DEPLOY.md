# Deploying

The app targets Vercel plus any Postgres with pgvector. Neon is the default
because its serverless driver suits the workload; nothing else depends on it.

## 1. Database

Create a Neon project and copy the connection string. The migration enables
pgvector itself, so an empty database is all that is needed.

```bash
DATABASE_URL="postgresql://…@…neon.tech/neondb?sslmode=require" npm run db:migrate
```

## 2. Environment

Set these in the Vercel project (Settings → Environment Variables):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `ANTHROPIC_API_KEY` | yes | chat, studio documents, mind maps, audio scripts |
| `GEMINI_API_KEY` | yes | embeddings and multi-speaker TTS |
| `SESSION_SECRET` | yes | 32+ random bytes — `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | for audio | from a Vercel Blob store |

Without `BLOB_READ_WRITE_TOKEN` the app writes audio to the local filesystem,
which works in development but not on Vercel, where the filesystem is read-only.
Everything except the audio overview works without it.

**Gemini billing matters for audio.** The free tier allows ten text-to-speech
requests per day across the whole project. One overview is two or three, so a
couple of attempts exhaust the day. Enable billing on the Gemini API before
demoing it.

## 3. Deploy

```bash
vercel link
vercel --prod
```

## Function limits

Ingestion and generation routes declare `maxDuration = 300`, which requires
Fluid compute (the default on current Vercel projects). Audio rendering is
deliberately split across requests so no single call approaches that ceiling —
see `src/app/api/notebooks/[id]/audio/render/route.ts`.

## Verifying a deployment

1. Add a PDF and a web URL; both should reach **Ready**.
2. Ask a question spanning both, then click a citation — the source opens and
   the cited sentence is highlighted.
3. Generate a briefing document; its citations should be clickable too.
4. Open the share link in a private window: visible, and read-only.
