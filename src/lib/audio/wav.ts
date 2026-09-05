/**
 * Gemini returns raw PCM, not a container format. Segments are therefore
 * concatenated as bare samples and wrapped in a single WAV header at the end —
 * joining finished WAV files instead would embed a 44-byte header in the middle
 * of the audio, which players decode as a burst of noise.
 */

export type PcmFormat = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

export const DEFAULT_PCM: PcmFormat = {
  sampleRate: 24_000,
  channels: 1,
  bitsPerSample: 16,
};

const HEADER_BYTES = 44;

export function concatPcm(segments: Uint8Array[]): Uint8Array {
  const total = segments.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);

  let offset = 0;
  for (const part of segments) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

/** Wraps raw PCM samples in a canonical 44-byte WAV header. */
export function pcmToWav(
  pcm: Uint8Array,
  format: PcmFormat = DEFAULT_PCM,
): Uint8Array {
  const { sampleRate, channels, bitsPerSample } = format;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const out = new Uint8Array(HEADER_BYTES + pcm.byteLength);
  const view = new DataView(out.buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  ascii(0, "RIFF");
  // Everything after this field: the remaining header plus the samples.
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");

  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // format 1 = uncompressed PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  out.set(pcm, HEADER_BYTES);
  return out;
}

export function pcmDurationMs(
  byteLength: number,
  format: PcmFormat = DEFAULT_PCM,
): number {
  const bytesPerFrame = format.channels * (format.bitsPerSample / 8);
  if (bytesPerFrame === 0) return 0;
  return Math.round((byteLength / bytesPerFrame / format.sampleRate) * 1000);
}
