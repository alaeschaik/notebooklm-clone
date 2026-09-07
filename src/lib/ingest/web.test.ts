import { describe, expect, it } from "vitest";

import { __testing } from "./web";

const { stripReferenceMarkers } = __testing;

describe("stripReferenceMarkers", () => {
  it("removes numeric reference markers", () => {
    // These read as part of the sentence once markup is gone, and then get
    // quoted back inside a citation.
    expect(stripReferenceMarkers("Hydropower supplies 15%.[80] It is large.")).toBe(
      "Hydropower supplies 15%. It is large.",
    );
  });

  it("removes editorial and navigational markers", () => {
    expect(stripReferenceMarkers("History[edit]")).toBe("History");
    expect(stripReferenceMarkers("Claimed[citation needed] here")).toBe(
      "Claimed here",
    );
    expect(stripReferenceMarkers("Note[note 4] and letter[a]")).toBe(
      "Note and letter",
    );
  });

  it("leaves ordinary bracketed text alone", () => {
    expect(stripReferenceMarkers("The array [Meridian] operates")).toBe(
      "The array [Meridian] operates",
    );
    expect(stripReferenceMarkers("Range [2020-2024]")).toBe("Range [2020-2024]");
  });

  it("collapses the double spaces removal leaves behind", () => {
    expect(stripReferenceMarkers("a[1]  b")).toBe("a b");
  });
});
