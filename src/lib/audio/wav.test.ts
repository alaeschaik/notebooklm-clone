import { describe, expect, it } from "vitest";

import { DEFAULT_PCM, concatPcm, pcmDurationMs, pcmToWav } from "./wav";

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

describe("concatPcm", () => {
  it("joins segments in order without gaps", () => {
    const merged = concatPcm([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5]),
    ]);
    expect([...merged]).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty input", () => {
    expect(concatPcm([]).byteLength).toBe(0);
    expect(concatPcm([new Uint8Array(0)]).byteLength).toBe(0);
  });
});

describe("pcmToWav", () => {
  const pcm = new Uint8Array(1000).fill(7);
  const wav = pcmToWav(pcm);
  const view = new DataView(wav.buffer);

  it("writes the RIFF/WAVE container markers", () => {
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");
  });

  it("declares sizes that match the payload", () => {
    // A wrong RIFF size is the classic cause of audio that plays truncated or
    // not at all, so both length fields are checked explicitly.
    expect(view.getUint32(4, true)).toBe(36 + pcm.byteLength);
    expect(view.getUint32(40, true)).toBe(pcm.byteLength);
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
  });

  it("describes the PCM format Gemini returns", () => {
    expect(view.getUint16(20, true)).toBe(1); // uncompressed
    expect(view.getUint16(22, true)).toBe(DEFAULT_PCM.channels);
    expect(view.getUint32(24, true)).toBe(DEFAULT_PCM.sampleRate);
    expect(view.getUint16(34, true)).toBe(DEFAULT_PCM.bitsPerSample);
    // byteRate and blockAlign must agree with the other fields or players
    // compute the wrong duration.
    const blockAlign = DEFAULT_PCM.channels * (DEFAULT_PCM.bitsPerSample / 8);
    expect(view.getUint16(32, true)).toBe(blockAlign);
    expect(view.getUint32(28, true)).toBe(DEFAULT_PCM.sampleRate * blockAlign);
  });

  it("copies the samples in unchanged", () => {
    expect([...wav.slice(44, 54)]).toEqual(Array(10).fill(7));
  });

  it("respects a non-default format", () => {
    const stereo = pcmToWav(new Uint8Array(8), {
      sampleRate: 48_000,
      channels: 2,
      bitsPerSample: 16,
    });
    const v = new DataView(stereo.buffer);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48_000);
    expect(v.getUint32(28, true)).toBe(48_000 * 4);
  });
});

describe("pcmDurationMs", () => {
  it("converts byte length to milliseconds", () => {
    // One second of 24 kHz 16-bit mono is 48000 bytes.
    expect(pcmDurationMs(48_000)).toBe(1000);
    expect(pcmDurationMs(24_000)).toBe(500);
    expect(pcmDurationMs(0)).toBe(0);
  });
});
