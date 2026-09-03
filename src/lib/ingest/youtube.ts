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

export async function extractYouTube(url: string): Promise<ExtractedDocument> {
  const videoId = parseVideoId(url);
  if (!videoId) {
    throw new IngestError("That does not look like a YouTube video URL.");
  }

  const youtube = await Innertube.create({ retrieve_player: false }).catch(
    (cause) => {
      throw new IngestError(
        "Could not reach YouTube. Please try again in a moment.",
        { cause },
      );
    },
  );

  const info = await youtube.getInfo(videoId).catch((cause) => {
    throw new IngestError(
      "This video could not be loaded. It may be private, age-restricted or removed.",
      { cause },
    );
  });

  const transcriptInfo = await info.getTranscript().catch((cause) => {
    throw new IngestError(
      "This video has no transcript. YouTube only provides one when captions are enabled.",
      { cause },
    );
  });

  const segments = transcriptInfo.transcript.content?.body?.initial_segments ?? [];
  const lines: TranscriptLine[] = [];

  for (const segment of segments) {
    // The list interleaves section headers with the actual caption segments.
    if (!("snippet" in segment) || !("start_ms" in segment)) continue;
    const text = segment.snippet?.text ?? "";
    if (text) {
      lines.push({
        startSeconds: Number(segment.start_ms) / 1000,
        text,
      });
    }
  }

  if (lines.length === 0) {
    throw new IngestError(
      "This video's transcript is empty. YouTube only provides one when captions are enabled.",
    );
  }

  const builder = new DocumentBuilder();
  for (const span of groupTranscript(lines)) {
    builder.add(span.label, span.text, span.startSeconds);
  }

  const title = cleanTitle(info.basic_info?.title, `YouTube video ${videoId}`);
  return builder.build(title);
}
