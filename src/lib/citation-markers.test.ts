import { describe, expect, it } from "vitest";

import { MARKER_PATTERN, weaveMarkers } from "./citation-markers";

const strip = (s: string) => s.replace(new RegExp(MARKER_PATTERN.source, "g"), "");

/**
 * Reads the woven string back into the marker number and the original text
 * preceding it — with any earlier markers removed, so `before` is expressed in
 * the coordinates the caller supplied rather than the woven ones.
 */
function extract(woven: string): { index: number; before: string }[] {
  const found: { index: number; before: string }[] = [];
  const pattern = new RegExp(MARKER_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(woven)) !== null) {
    found.push({
      index: Number(match[1]),
      before: strip(woven.slice(0, match.index)),
    });
  }
  return found;
}

describe("weaveMarkers", () => {
  const text = "Alpha is first. Beta is second. Gamma is third.";

  it("returns the text unchanged when there are no markers", () => {
    expect(weaveMarkers(text, [])).toBe(text);
  });

  it("places a marker at the requested offset", () => {
    const woven = weaveMarkers(text, [{ position: 15, index: 1 }]);
    expect(strip(woven)).toBe(text);
    expect(extract(woven)[0]!.before).toBe("Alpha is first.");
  });

  it("keeps every marker at its own offset when several are applied", () => {
    // The bug this guards against: inserting front-to-back shifts every
    // later offset by the width of the markers already inserted, so the
    // trailing citations drift further and further right.
    const markers = [
      { position: 15, index: 1 },
      { position: 31, index: 2 },
      { position: 47, index: 3 },
    ];
    const woven = weaveMarkers(text, markers);

    expect(strip(woven)).toBe(text);
    expect(extract(woven).map((m) => m.before)).toEqual([
      "Alpha is first.",
      "Alpha is first. Beta is second.",
      "Alpha is first. Beta is second. Gamma is third.",
    ]);
  });

  it("is order-independent", () => {
    const markers = [
      { position: 47, index: 3 },
      { position: 15, index: 1 },
      { position: 31, index: 2 },
    ];
    expect(weaveMarkers(text, markers)).toBe(
      weaveMarkers(text, [...markers].sort((a, b) => a.position - b.position)),
    );
  });

  it("handles repeated markers at the same offset", () => {
    const woven = weaveMarkers(text, [
      { position: 15, index: 1 },
      { position: 15, index: 2 },
    ]);
    expect(strip(woven)).toBe(text);
    expect(extract(woven).map((m) => m.index).sort()).toEqual([1, 2]);
  });

  it("survives multi-byte characters", () => {
    const german = "Die Größe ist wichtig. Die Straße war nass. 🎧 Ende.";
    const position = german.indexOf(" Die Straße");
    const woven = weaveMarkers(german, [{ position, index: 1 }]);
    expect(strip(woven)).toBe(german);
    expect(extract(woven)[0]!.before).toBe("Die Größe ist wichtig.");
  });

  it("accepts markers at the very start and end", () => {
    const woven = weaveMarkers(text, [
      { position: 0, index: 1 },
      { position: text.length, index: 2 },
    ]);
    expect(strip(woven)).toBe(text);
  });
});

describe("punctuation settling", () => {
  it("moves a marker past the full stop that closes its sentence", () => {
    // Claude ends a cited block at the last cited word, leaving the stop to
    // begin the next block — so the raw offset sits in front of it.
    const text = "It measured 61 million tonnes. The forecast was lower.";
    const woven = weaveMarkers(text, [{ position: 29, index: 1 }]);
    expect(strip(woven)).toBe(text);
    expect(extract(woven)[0]!.before).toBe("It measured 61 million tonnes.");
  });

  it("steps over a space before the punctuation", () => {
    const text = "Measured at 61 million tonnes . Next sentence.";
    const woven = weaveMarkers(text, [{ position: 29, index: 1 }]);
    expect(extract(woven)[0]!.before).toBe("Measured at 61 million tonnes .");
  });

  it("leaves a mid-sentence marker alone", () => {
    const text = "The survey measured 61 million tonnes against forecast.";
    const position = "The survey measured 61 million tonnes".length;
    const woven = weaveMarkers(text, [{ position, index: 1 }]);
    expect(extract(woven)[0]!.before).toBe("The survey measured 61 million tonnes");
  });

  it("handles a closing quote followed by a stop", () => {
    const text = 'He said "ineffective". Then he left.';
    const position = 'He said "ineffective'.length;
    const woven = weaveMarkers(text, [{ position, index: 1 }]);
    expect(extract(woven)[0]!.before).toBe('He said "ineffective".');
  });

  it("does not run past the end of the text", () => {
    const text = "Ends here.";
    const woven = weaveMarkers(text, [{ position: text.length, index: 1 }]);
    expect(strip(woven)).toBe(text);
  });
});
