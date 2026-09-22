# Notebook

[![Pipeline](https://github.com/alaeschaik/notebooklm-clone/actions/workflows/pipeline.yml/badge.svg)](https://github.com/alaeschaik/notebooklm-clone/actions/workflows/pipeline.yml)

A NotebookLM clone: upload sources, ask questions, and get answers where every
claim links back to the exact sentence that supports it.

Built as a take-home exercise. The interesting part is not the feature list —
it is that the citations are real coordinates into the source text rather than
footnote-shaped decoration.

---

## What it does

- **Sources** — PDF (page-labelled), web articles, YouTube transcripts, pasted
  text. Each shows real ingestion state, and a failure says what went wrong.
- **Grounded chat** — streamed answers, scoped to the sources you tick. Every
  claim carries a citation; clicking one opens the source at the exact sentence.
- **Studio** — briefing doc, study guide, FAQ and timeline, all cited and
  downloadable as Markdown; an interactive mind map; and notes, which keep the
  citations of the answer they were saved from.
- **Audio Overview** — a two-host podcast generated from the sources, with a
  synced transcript.
- **German and English** — the interface and the generated output both follow
  the language you pick.
- **Read-only share links** — send a notebook to someone with no account.

---

## The core idea

NotebookLM's whole value is *grounded answers you can check*. Most clones
approximate this by asking the model to emit `[1]` markers and hoping they line
up with something.

This uses Anthropic's [Citations API](https://platform.claude.com/docs/en/build-with-claude/citations)
instead. Claude returns, per claim, the quoted text plus character offsets into
the specific document that supports it. Those offsets are translated back into
absolute positions in the source's canonical text, so clicking a citation opens
the source and highlights the precise passage.

That property is asserted in the tests:

```
fullText.slice(citation.startChar, citation.endChar) === citation.quote
```

Everything else in the design follows from protecting that invariant.

---

## How it works

**Ingestion.** PDFs are read page by page (merging first would discard the page
numbers citations report). Web pages go through Readability, so notebooks fill
with article text rather than cookie banners. Each source is normalised once
into a canonical `fullText`, with labelled segments — pages, transcript
timestamps, article sections — recorded as offsets into it.

**Chunking.** Chunks are *ranges over* that text, not copies of it, so
`slice(start, end)` always reproduces the chunk. Overlap widens a chunk's range
backwards instead of prepending copied text, which preserves the same property
at the seams.

**Retrieval — adaptive.** If the selected sources fit in the context window
(~180k tokens) they are sent whole and retrieval is skipped entirely, because
retrieval can only lose information. The final document block is cache-marked,
so follow-up questions re-read those sources cheaply. Above that threshold,
hybrid search takes over: semantic and lexical rankings fused with reciprocal
rank fusion. Neither arm works alone — embeddings miss exact identifiers like a
part number, full-text misses paraphrase.

**Citations.** Claude's offsets are *verified* against the quoted text rather
than trusted. When they disagree, the quote is searched for directly, with a
whitespace-insensitive fallback. Trusting them blindly is how a highlight lands
on a neighbouring sentence with the reader none the wiser.

**Audio Overview.** Claude writes a two-host dialogue; Gemini's multi-speaker
TTS renders both voices in a single request, which is what makes it sound like a
conversation rather than two clips interleaved. Segments are concatenated as raw
PCM and given one WAV header at the end — joining finished WAV files would bury
a 44-byte header inside the audio, which decodes as noise.

---

## Stack

| | |
|---|---|
| Next.js 16 (App Router), TypeScript | one deployable; SSE for streaming answers |
| Postgres + pgvector, Drizzle | vectors and relational data in one place |
| Claude Opus 5 | grounded chat, studio documents, mind maps, audio scripts |
| Gemini | embeddings (`gemini-embedding-001`) and multi-speaker TTS |
| Tailwind v4 | token-based design system, light and dark |
| Docker Compose | two containers, self-hosted, no managed services |
| GitHub Actions → GHCR | build, scan, deploy to staging, approve, deploy to production |
| Prometheus + Grafana | metrics, provisioned dashboards, ten alert rules |

Two provider decisions worth noting. Citations and structured outputs are
mutually exclusive in the API, which partitions the work cleanly: prose output
keeps citations, JSON output (podcast script, mind map) reads its sources as
plain text. And embeddings use Gemini rather than OpenAI because a Gemini key is
already required for audio — that removes a third provider from setup, and its
embedding endpoint is on the free tier.

---

## Running it

The whole thing is two containers:

```bash
cp .env.example .env           # add ANTHROPIC_API_KEY, GEMINI_API_KEY, SESSION_SECRET
docker compose up -d --build
```

That is the complete setup — <http://localhost:3000>. The app applies its own
database migrations on boot, so there is no separate migration step and no
managed service to sign up for. See [DEPLOY.md](DEPLOY.md) for backups,
upgrades and running behind a reverse proxy.

For development against the source:

```bash
docker compose up -d postgres  # just the database
npm install && npm run db:migrate && npm run dev
```

```bash
npm test        # unit tests
npm run e2e     # browser tests (needs a running app)
npm run lint
npm run typecheck
```

---

## Running it in anger

Beyond `docker compose up`, the repository carries what it takes to operate
this on a server:

- **Delivery** — one pipeline from commit to production: verify, browser tests,
  image to GHCR with an SBOM and a provenance attestation, a Trivy scan into the
  Security tab, deploy to staging, smoke test, then production behind a required
  approval. Production deploys *the image staging proved*, by immutable `sha-`
  tag.
- **Deployment** — `deploy/deploy.sh` rolls out, waits on the health endpoint,
  and rolls back to the last tag that passed it. Runs on a self-hosted runner,
  so the server connects out to GitHub and needs no inbound port.
- **Monitoring** — request rate, errors and latency, plus model tokens and
  estimated spend; Postgres, container and host exporters; a blackbox probe of
  the public URL; and alerts that each carry a runbook link.
- **Hardening** — the runtime container is read-only with all capabilities
  dropped, runs as a non-root user, and is memory- and CPU-limited.

[docs/devops.md](docs/devops.md) covers setup and the reasoning.
[docs/runbook.md](docs/runbook.md) is what to do when something pages you.

---

## What the tests cover

The pure, breakable logic — not the API calls:

- **Citation offsets** resolve to the exact quoted substring, in both
  retrieval and full-context modes, including through multi-byte umlauts and
  emoji, where byte-versus-character arithmetic would break.
- **Chunk offsets** round-trip against the source text.
- **WAV assembly** — header fields and PCM concatenation. A wrong length field
  is the classic cause of audio that plays truncated or not at all.
- **Script segmentation** never splits a speaker turn.
- **Session cookies** reject a swapped visitor id carrying a valid signature.
- **Marker weaving** keeps every citation marker at its own offset — inserting
  front-to-back would shift each later one by the width of those already placed.

Browser tests (Playwright) cover what unit tests structurally cannot: a
server-rendering crash, a hydration mismatch, and layout that fails to fill the
viewport. Each of those shipped here at least once, and each now has a test.

---

## Known limitations

Stated plainly, because they are real:

- **YouTube transcripts usually fail.** YouTube now gates its timedtext
  endpoint behind session binding and answers `200` with an empty body to
  unauthenticated clients — including from a residential IP. Captions are
  detected and the error says so honestly, but treat it as best-effort. PDFs,
  web pages and pasted text are the reliable paths.
- **Audio needs Gemini billing enabled.** The free tier allows *ten* TTS
  requests per day. One overview is two or three, so a couple of attempts
  exhaust the day's allowance.
- **Server-side error messages are English only.** The interface is fully
  translated; messages raised during ingestion and generation are not.
- **Anonymous sessions.** A notebook belongs to a browser cookie. Clearing
  cookies loses access — deliberate, so a reviewer can open the app and start
  working with no signup.
- **Single instance assumed.** Migrations run on boot, which is right for one
  container and wrong for several starting at once. `RUN_MIGRATIONS_ON_BOOT=false`
  exists for that case.
