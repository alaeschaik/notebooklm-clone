import { describe, expect, it } from "vitest";

import { formatTimestamp, groupTranscript, parseVideoId } from "./youtube";

describe("parseVideoId", () => {
  it("accepts the URL shapes YouTube actually hands out", () => {
    const id = "dQw4w9WgXcQ";
    for (const url of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
    ]) {
      expect(parseVideoId(url), url).toBe(id);
    }
  });

  it("rejects anything that is not a video", () => {
    for (const url of [
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/results?search_query=cats",
      "https://www.youtube.com/watch?v=tooshort",
      "not a url",
      "",
    ]) {
      expect(parseVideoId(url), url).toBeNull();
    }
  });
});

describe("formatTimestamp", () => {
  it("formats as m:ss below an hour and h:mm:ss above", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(9)).toBe("0:09");
    expect(formatTimestamp(75)).toBe("1:15");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });

  it("clamps negatives", () => {
    expect(formatTimestamp(-5)).toBe("0:00");
  });
});

describe("groupTranscript", () => {
  const lines = Array.from({ length: 20 }, (_, i) => ({
    startSeconds: i * 10,
    text: `line ${i}`,
  }));

  it("groups short caption lines into timestamped spans", () => {
    // Raw caption lines are a few words each — too fine-grained to embed or
    // cite usefully, so they are merged into spans.
    const spans = groupTranscript(lines, 45);
    expect(spans.length).toBeLessThan(lines.length);
    expect(spans[0]!.label).toBe("0:00");
    expect(spans[0]!.text).toContain("line 0");
    expect(spans[0]!.startSeconds).toBe(0);
  });

  it("starts a new span once the window is exceeded", () => {
    const spans = groupTranscript(lines, 45);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.startSeconds - spans[i - 1]!.startSeconds).toBeGreaterThanOrEqual(45);
    }
  });

  it("keeps every line's text", () => {
    const joined = groupTranscript(lines, 45).map((s) => s.text).join(" ");
    for (const line of lines) expect(joined).toContain(line.text);
  });

  it("skips blank captions", () => {
    const spans = groupTranscript(
      [
        { startSeconds: 0, text: "  " },
        { startSeconds: 1, text: "real" },
      ],
      45,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("real");
    expect(spans[0]!.label).toBe("0:01");
  });

  it("returns nothing for an empty transcript", () => {
    expect(groupTranscript([])).toEqual([]);
  });
});
