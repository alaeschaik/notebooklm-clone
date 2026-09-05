import type { AudioSegment, DialogueTurn } from "@/lib/db/schema";

/**
 * The two hosts. Names are chosen to read naturally in both German and
 * English, since the script is written in the language of the sources and the
 * speaker labels have to match the names used in the prompt.
 */
export const HOSTS = [
  { name: "Nora", voice: "Kore" },
  { name: "Leo", voice: "Puck" },
] as const;

/**
 * Characters of dialogue rendered per TTS request.
 *
 * Well below the model's input limit on purpose: voice consistency drifts over
 * long single generations, and short requests also keep each call far inside
 * the platform's function timeout so progress survives a slow one.
 */
export const SEGMENT_MAX_CHARS = 1500;

export function normaliseSpeaker(speaker: string): string {
  const match = HOSTS.find(
    (host) => host.name.toLowerCase() === speaker.trim().toLowerCase(),
  );
  return match?.name ?? HOSTS[0].name;
}

/**
 * Groups turns into renderable segments. A turn is never split: cutting a
 * sentence across two TTS requests produces an audible seam mid-word, whereas a
 * seam between speakers is inaudible.
 */
export function segmentScript(
  turns: DialogueTurn[],
  maxChars: number = SEGMENT_MAX_CHARS,
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  let start = 0;
  let length = 0;

  turns.forEach((turn, index) => {
    const size = turn.speaker.length + turn.text.length + 2;

    if (index > start && length + size > maxChars) {
      segments.push({
        idx: segments.length,
        turnStart: start,
        turnEnd: index,
        status: "pending",
      });
      start = index;
      length = 0;
    }
    length += size;
  });

  if (start < turns.length) {
    segments.push({
      idx: segments.length,
      turnStart: start,
      turnEnd: turns.length,
      status: "pending",
    });
  }

  return segments;
}

/**
 * Renders one segment as the transcript Gemini's multi-speaker mode expects:
 * a plain conversation where each line is prefixed with a speaker name that
 * matches the voice configuration sent alongside it.
 */
export function segmentPrompt(turns: DialogueTurn[]): string {
  const lines = turns
    .map((turn) => `${normaliseSpeaker(turn.speaker)}: ${turn.text.trim()}`)
    .join("\n");

  return `TTS the following conversation between ${HOSTS[0].name} and ${HOSTS[1].name}:\n${lines}`;
}

export function scriptDurationEstimateMs(turns: DialogueTurn[]): number {
  const characters = turns.reduce((sum, turn) => sum + turn.text.length, 0);
  // Conversational speech runs at roughly 15 characters per second.
  return Math.round((characters / 15) * 1000);
}
