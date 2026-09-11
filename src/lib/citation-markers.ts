import type { CitationMarker } from "@/lib/db/schema";

/**
 * Citation markers are woven into the answer text as sentinels before it is
 * parsed as Markdown, then swapped for interactive chips while rendering.
 *
 * Doing it the other way round is not possible: parsing discards the character
 * offsets the markers are expressed in, so by the time there is a tree to walk,
 * the positions no longer correspond to anything in it.
 *
 * U+2062 (invisible times) is used as the delimiter because it survives
 * Markdown parsing untouched and cannot appear in model output.
 */
const DELIMITER = "⁢";

export const MARKER_PATTERN = new RegExp(`${DELIMITER}(\\d+)${DELIMITER}`, "g");

/**
 * Nudges a marker past the punctuation that closes its sentence.
 *
 * Claude ends a cited text block at the last word it is citing, leaving the
 * full stop to begin the next block — so a marker placed at the raw offset
 * renders as "38 million tonnes [1]." A reader expects "[1]" after the stop,
 * not wedged in front of it.
 *
 * Only advances when punctuation actually follows, so a marker in the middle
 * of a sentence stays exactly where it was put.
 */
function settleAfterPunctuation(text: string, position: number): number {
  const trailing = /^[ \t]*[.,;:!?)\]"'\u201d\u2019]+/.exec(text.slice(position));
  return trailing ? position + trailing[0].length : position;
}

export function weaveMarkers(text: string, markers: CitationMarker[]): string {
  // Applied back to front so each insertion leaves the earlier offsets — which
  // were computed against the original string — still valid.
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
