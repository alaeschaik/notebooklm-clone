import type { CitationMarker } from "@/lib/db/schema";

/**
 * Markers are woven in as sentinels before Markdown parsing, then swapped for
 * chips while rendering. The reverse is impossible: parsing discards the
 * character offsets the markers are expressed in.
 *
 * U+2062 survives Markdown untouched and cannot appear in model output.
 */
const DELIMITER = "⁢";

export const MARKER_PATTERN = new RegExp(`${DELIMITER}(\\d+)${DELIMITER}`, "g");

/**
 * Claude ends a cited block at the last cited word, leaving the full stop to
 * open the next one — so the raw offset renders as "61 million tonnes [1]."
 * Only advances when punctuation actually follows.
 */
function settleAfterPunctuation(text: string, position: number): number {
  const trailing = /^[ \t]*[.,;:!?)\]"'\u201d\u2019]+/.exec(text.slice(position));
  return trailing ? position + trailing[0].length : position;
}

export function weaveMarkers(text: string, markers: CitationMarker[]): string {
  // Back to front, so each insertion leaves the earlier offsets valid.
  return [...markers]
    .map((marker) => ({
      ...marker,
      position: settleAfterPunctuation(text, marker.position),
    }))
    .sort((a, b) => b.position - a.position)
    .reduce(
      (acc, marker) =>
        acc.slice(0, marker.position) +
        DELIMITER +
        marker.index +
        DELIMITER +
        acc.slice(marker.position),
      text,
    );
}
