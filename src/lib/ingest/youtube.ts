import { Innertube } from "youtubei.js";

import { DocumentBuilder, IngestError, cleanTitle, type ExtractedDocument } from "./document";

/** Transcript lines are grouped into spans of about this length. */
const SPAN_SECONDS = 45;

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    // /embed/ID, /shorts/ID, /live/ID, /v/ID
    const match = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname);
    if (match) return match[1]!;
  }

  return null;
}

export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

export type TranscriptLine = { startSeconds: number; text: string };

/**
 * Groups transcript lines into timestamped spans. Individual caption lines are
 * a few words long, which is too fine-grained to embed or cite usefully.
 */
export function groupTranscript(
  lines: TranscriptLine[],
  spanSeconds = SPAN_SECONDS,
): { label: string; startSeconds: number; text: string }[] {
  const spans: { label: string; startSeconds: number; text: string }[] = [];
  let current: { startSeconds: number; parts: string[] } | null = null;

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    if (!current || line.startSeconds - current.startSeconds >= spanSeconds) {
      if (current) {
        spans.push({
          label: formatTimestamp(current.startSeconds),
          startSeconds: current.startSeconds,
          text: current.parts.join(" "),
        });
      }
      current = { startSeconds: line.startSeconds, parts: [text] };
    } else {
      current.parts.push(text);
    }
  }

  if (current) {
    spans.push({
      label: formatTimestamp(current.startSeconds),
      startSeconds: current.startSeconds,
      text: current.parts.join(" "),
    });
  }

  return spans;
}

/** The shape YouTube's timedtext endpoint returns for `fmt=json3`. */
type Json3 = {
  events?: { tStartMs?: number; segs?: { utf8?: string }[] }[];
};

/** Prefers the interface language, then English, then whatever exists. */
function pickTrack<T extends { language_code?: string; base_url?: string }>(
  tracks: T[],
): T | undefined {
  return (
    tracks.find((track) => track.language_code === "en") ??
    tracks.find((track) => track.language_code?.startsWith("en")) ??
    tracks[0]
  );
}

async function fetchCaptionTrack(baseUrl: string): Promise<TranscriptLine[]> {
  const response = await fetch(`${baseUrl}&fmt=json3`, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [];

  const body = await response.text();
  // YouTube answers 200 with an empty body when it declines to serve captions
  // to an unauthenticated client. That is not the same as "no captions", and
  // the two need different advice.
  if (body.trim().length === 0) return [];

  let parsed: Json3;
  try {
    parsed = JSON.parse(body) as Json3;
  } catch {
    return [];
  }

  return (parsed.events ?? []).flatMap((event) => {
    const text = (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("").trim();
    return text ? [{ startSeconds: (event.tStartMs ?? 0) / 1000, text }] : [];
  });
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function extractYouTube(url: string): Promise<ExtractedDocument> {
  const videoId = parseVideoId(url);
  if (!videoId) {
    throw new IngestError("That does not look like a YouTube video URL.");
  }

  const youtube = await Innertube.create().catch((cause) => {
    throw new IngestError(
      "Could not reach YouTube. Please try again in a moment.",
      { cause },
    );
  });

  const info = await youtube.getInfo(videoId).catch((cause) => {
    throw new IngestError(
      "This video could not be loaded. It may be private, age-restricted or removed.",
      { cause },
    );
  });

  const title = cleanTitle(info.basic_info?.title, `YouTube video ${videoId}`);
  const tracks = info.captions?.caption_tracks ?? [];
  let lines: TranscriptLine[] = [];

  // The caption-track endpoint is the more durable of the two: YouTube's
  // get_transcript API changes shape often and is currently answering 400.
  const track = pickTrack(tracks);
  if (track?.base_url) {
    lines = await fetchCaptionTrack(track.base_url).catch(() => []);
  }

  if (lines.length === 0) {
    lines = await fetchViaTranscriptApi(info).catch(() => []);
  }

  if (lines.length === 0) {
    throw new IngestError(
      tracks.length > 0
        ? `YouTube is refusing to release the transcript for "${title}". This is a restriction on their side, not a problem with the video — it has ${tracks.length} caption tracks. Open the transcript on YouTube and paste it in as a text source instead.`
        : "This video has no captions, so there is no transcript to read. Paste the text in directly instead.",
    );
  }

  const builder = new DocumentBuilder();
  for (const span of groupTranscript(lines)) {
    builder.add(span.label, span.text, span.startSeconds);
  }

  return builder.build(title);
}

/** Legacy path, kept because it still works for some videos. */
async function fetchViaTranscriptApi(
  info: Awaited<ReturnType<Innertube["getInfo"]>>,
): Promise<TranscriptLine[]> {
  const transcript = await info.getTranscript();
  const segments = transcript.transcript.content?.body?.initial_segments ?? [];

  return segments.flatMap((segment) => {
    // The list interleaves section headers with the caption segments.
    if (!("snippet" in segment) || !("start_ms" in segment)) return [];
    const text = segment.snippet?.text ?? "";
    return text
      ? [{ startSeconds: Number(segment.start_ms) / 1000, text }]
      : [];
  });
}
