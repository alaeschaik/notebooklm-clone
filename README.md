# Notebook

A NotebookLM clone: upload sources, ask questions, and get answers where every
claim links back to the exact sentence that supports it.

Built as a take-home exercise. The interesting part is not the feature list —
it is that the citations are real coordinates into the source text rather than
footnote-shaped decoration.

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

Two provider decisions worth noting. Citations and structured outputs are
mutually exclusive in the API, which partitions the work cleanly: prose output
keeps citations, JSON output (podcast script, mind map) reads its sources as
plain text. And embeddings use Gemini rather than OpenAI because a Gemini key is
already required for audio — that removes a third provider from setup, and its
embedding endpoint is on the free tier.

---

## Running it

```bash
cp .env.example .env.local     # add ANTHROPIC_API_KEY and GEMINI_API_KEY
docker compose up -d           # Postgres with pgvector on :5433
npm install
npm run db:migrate
npm run dev
```

No Neon account is needed locally. The driver is chosen from `DATABASE_URL`:
Neon's HTTP driver for `*.neon.tech` (right for serverless — a pooled TCP
connection would cost more than it saves), node-postgres otherwise.

```bash
npm test        # unit tests
npm run lint
npm run typecheck
```

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
