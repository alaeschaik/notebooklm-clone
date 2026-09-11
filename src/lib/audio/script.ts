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
 * This trades off two opposing limits. Voice consistency drifts over long
 * single generations, which argues for small segments — but Gemini's free tier
 * allows only ten TTS requests *per day*, so a script split into six segments
 * spends most of a day's quota on one overview. At 2500 characters a typical
 * script is two requests, which stays well inside the model's context window
 * and keeps each generation short enough to hold a voice steady.
 */
export const SEGMENT_MAX_CHARS = 2500;

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
