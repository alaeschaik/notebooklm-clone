import { GoogleGenAI } from "@google/genai";

import type { DialogueTurn } from "@/lib/db/schema";

import { HOSTS, segmentPrompt } from "./script";
import { DEFAULT_PCM, type PcmFormat } from "./wav";

/**
 * Gemini's multi-speaker mode renders both hosts in a single request, which is
 * what makes the result sound like a conversation. Rendering each speaker
 * separately and interleaving the clips produces recognisably robotic
 * turn-taking, because neither voice hears the other's delivery.
 */
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. It is required to render the audio overview.",
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class TtsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TtsError";
  }
}

export type RenderedSegment = { pcm: Uint8Array; format: PcmFormat };

/** Renders one run of dialogue turns to raw PCM samples. */
export async function renderSegment(
  turns: DialogueTurn[],
): Promise<RenderedSegment> {
  if (turns.length === 0) {
    throw new TtsError("Cannot render an empty dialogue segment.");
  }

  const interaction = await getClient()
    .interactions.create({
      model: TTS_MODEL,
      input: segmentPrompt(turns),
      // Raw PCM rather than WAV: segments are concatenated as samples and get
      // a single header at the end, so per-segment headers would be noise.
      response_format: { type: "audio", mime_type: "audio/l16" },
      generation_config: {
        speech_config: HOSTS.map((host) => ({
          speaker: host.name,
          voice: host.voice,
        })),
      },
    })
    .catch((cause) => {
      throw new TtsError(
        "The speech service could not render this segment.",
        { cause },
      );
    });

  const audio = interaction.output_audio;
  if (!audio?.data) {
    throw new TtsError("The speech service returned no audio.");
  }

  return {
    pcm: new Uint8Array(Buffer.from(audio.data, "base64")),
    format: {
      // Trust the response over the documented defaults: a format change would
      // otherwise silently produce audio that plays at the wrong speed.
      sampleRate: audio.sample_rate ?? DEFAULT_PCM.sampleRate,
      channels: audio.channels ?? DEFAULT_PCM.channels,
      bitsPerSample: DEFAULT_PCM.bitsPerSample,
    },
  };
}
