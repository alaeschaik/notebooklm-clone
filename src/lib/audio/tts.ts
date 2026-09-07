import { GoogleGenAI } from "@google/genai";

import type { DialogueTurn } from "@/lib/db/schema";

import { HOSTS, segmentPrompt } from "./script";
import { DEFAULT_PCM, type PcmFormat } from "./wav";

/**
 * Gemini's multi-speaker mode renders both hosts in a single request, which is
 * what makes the result sound like a conversation. Rendering each speaker
 * separately and interleaving the clips produces recognisably robotic
 * turn-taking, because neither voice hears the other's delivery.
 *
 * This uses `generateContent` rather than the newer Interactions API: the TTS
 * preview models reject every audio MIME type Interactions offers, and only
 * speak through the classic endpoint, which returns raw PCM.
 */
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";

/** Free-tier TTS is rate limited per minute, and a podcast is several calls. */
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = 20_000;

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new TtsError(
        "GEMINI_API_KEY is not set, so the audio overview cannot be rendered.",
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class TtsError extends Error {
  /** Rate limits pass; a malformed request does not. */
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, options);
    this.name = "TtsError";
    this.retryable = options?.retryable ?? false;
  }
}

export type RenderedSegment = { pcm: Uint8Array; format: PcmFormat };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the sample rate out of `audio/L16;codec=pcm;rate=24000`. */
function parseFormat(mimeType: string | undefined): PcmFormat {
  const rate = /rate=(\d+)/.exec(mimeType ?? "")?.[1];
  return {
    ...DEFAULT_PCM,
    sampleRate: rate ? Number(rate) : DEFAULT_PCM.sampleRate,
  };
}

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /quota|rate limit/i.test(message);
}

/**
 * A per-day quota does not clear within the life of a request, so retrying
 * against it only burns the remaining attempts and delays an error the user
 * needs to see. Per-minute limits do clear, and are worth waiting out.
 */
function isDailyQuota(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /PerDay|per day|free_tier_requests/i.test(message);
}

/** Renders one run of dialogue turns to raw PCM samples. */
export async function renderSegment(
  turns: DialogueTurn[],
): Promise<RenderedSegment> {
  if (turns.length === 0) {
    throw new TtsError("Cannot render an empty dialogue segment.");
  }

  const request = {
    model: TTS_MODEL,
    contents: [{ parts: [{ text: segmentPrompt(turns) }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: HOSTS.map((host) => ({
            speaker: host.name,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: host.voice } },
          })),
        },
      },
    },
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await getClient().models.generateContent(request);
      const part = response.candidates?.[0]?.content?.parts?.[0];
      const data = part?.inlineData?.data;

      if (!data) throw new TtsError("The speech service returned no audio.");

      return {
        pcm: new Uint8Array(Buffer.from(data, "base64")),
        // Trust the response over the documented default: a format change
        // would otherwise silently produce audio at the wrong speed.
        format: parseFormat(part.inlineData?.mimeType),
      };
    } catch (error) {
      lastError = error;
      // Only transient rate limits are worth retrying; a rejected request, or
      // an exhausted daily allowance, will fail again just as fast.
      const worthRetrying = isRateLimit(error) && !isDailyQuota(error);
      if (!worthRetrying || attempt === MAX_ATTEMPTS) break;
      await sleep(BACKOFF_MS * attempt);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  if (isDailyQuota(lastError)) {
    throw new TtsError(
      "Gemini's free tier allows only 10 text-to-speech requests per day, and that allowance is used up. Enable billing on the Gemini API, or try again tomorrow.",
      { cause: lastError, retryable: false },
    );
  }

  const rateLimited = isRateLimit(lastError);
  throw new TtsError(
    rateLimited
      ? "Gemini's speech quota is temporarily exhausted — it allows only a few requests per minute."
      : `The speech service could not render this segment: ${detail}`,
    { cause: lastError, retryable: rateLimited },
  );
}
