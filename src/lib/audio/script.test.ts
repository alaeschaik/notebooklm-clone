import { describe, expect, it } from "vitest";

import type { DialogueTurn } from "@/lib/db/schema";

import { HOSTS, normaliseSpeaker, segmentPrompt, segmentScript } from "./script";

const turn = (i: number, text = "x".repeat(200)): DialogueTurn => ({
  speaker: HOSTS[i % 2]!.name,
  text,
});

describe("segmentScript", () => {
  it("returns nothing for an empty script", () => {
    expect(segmentScript([])).toEqual([]);
  });

  it("keeps a short script in one segment", () => {
    const segments = segmentScript([turn(0), turn(1)], 1500);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ idx: 0, turnStart: 0, turnEnd: 2 });
  });

  it("covers every turn exactly once, with no gaps or overlaps", () => {
    const turns = Array.from({ length: 40 }, (_, i) => turn(i));
    const segments = segmentScript(turns, 600);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]!.turnStart).toBe(0);
    expect(segments.at(-1)!.turnEnd).toBe(turns.length);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.turnStart).toBe(segments[i - 1]!.turnEnd);
    }
  });

  it("never splits a single turn across segments", () => {
    // A seam between speakers is inaudible; a seam mid-sentence is not.
    const segments = segmentScript(
      Array.from({ length: 20 }, (_, i) => turn(i)),
      600,
    );
    for (const segment of segments) {
      expect(segment.turnEnd).toBeGreaterThan(segment.turnStart);
    }
  });

  it("gives an oversized turn its own segment rather than dropping it", () => {
    const turns = [turn(0, "a".repeat(50)), turn(1, "b".repeat(5000)), turn(2, "c".repeat(50))];
    const segments = segmentScript(turns, 1000);
    expect(segments.at(-1)!.turnEnd).toBe(3);
    const covered = segments.flatMap((s) =>
      Array.from({ length: s.turnEnd - s.turnStart }, (_, i) => s.turnStart + i),
    );
    expect(covered).toEqual([0, 1, 2]);
  });

  it("numbers segments consecutively from zero", () => {
    const segments = segmentScript(
      Array.from({ length: 30 }, (_, i) => turn(i)),
      500,
    );
    expect(segments.map((s) => s.idx)).toEqual(segments.map((_, i) => i));
  });
});

describe("segmentPrompt", () => {
  it("labels every line with a speaker name Gemini is configured for", () => {
    const prompt = segmentPrompt([
      { speaker: "Nora", text: "First point." },
      { speaker: "Leo", text: "Second point." },
    ]);
    expect(prompt).toContain("Nora: First point.");
    expect(prompt).toContain("Leo: Second point.");
    expect(prompt).toContain("between Nora and Leo");
  });

  it("maps an unexpected speaker onto a configured voice", () => {
    // A voice name with no matching speakerVoiceConfig is silently dropped by
    // the API, so an off-script name must not reach it.
    expect(normaliseSpeaker("Narrator")).toBe(HOSTS[0].name);
    expect(normaliseSpeaker("  leo ")).toBe("Leo");
    expect(segmentPrompt([{ speaker: "Host", text: "Hello." }])).toContain(
      "Nora: Hello.",
    );
  });
});
