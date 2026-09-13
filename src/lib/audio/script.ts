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
 * Characters per TTS request, balancing two limits: voices drift over long
 * generations, but the free tier allows only ten requests *per day*. At 2500
 * a typical script is two requests.
 */
export const SEGMENT_MAX_CHARS = 2500;

export function normaliseSpeaker(speaker: string): string {
  const match = HOSTS.find(
    (host) => host.name.toLowerCase() === speaker.trim().toLowerCase(),
  );
  return match?.name ?? HOSTS[0].name;
}

/**
 * Groups turns into segments, never splitting one: a seam between speakers is
 * inaudible, a seam mid-sentence is not.
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

/** The transcript shape multi-speaker TTS expects: one speaker-prefixed line each. */
export function segmentPrompt(turns: DialogueTurn[]): string {
  const lines = turns
    .map((turn) => `${normaliseSpeaker(turn.speaker)}: ${turn.text.trim()}`)
    .join("\n");

  return `TTS the following conversation between ${HOSTS[0].name} and ${HOSTS[1].name}:\n${lines}`;
}
