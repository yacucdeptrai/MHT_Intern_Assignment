import { describe, expect, it } from "vitest";

import { detectImageMimeType } from "../src/files";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50];

describe("detectImageMimeType", () => {
  it("detects PNG, JPEG, and WebP from their signatures", () => {
    expect(detectImageMimeType(new Uint8Array(PNG))).toBe("image/png");
    expect(detectImageMimeType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(detectImageMimeType(new Uint8Array(WEBP))).toBe("image/webp");
  });

  it("returns null for text or markup disguised as an image", () => {
    expect(detectImageMimeType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageMimeType(new TextEncoder().encode("png-content"))).toBeNull();
  });

  it("returns null for truncated signatures and empty input", () => {
    expect(detectImageMimeType(new Uint8Array(PNG.slice(0, 4)))).toBeNull();
    expect(detectImageMimeType(new Uint8Array())).toBeNull();
  });

  it("returns null for a RIFF container that is not WebP", () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    expect(detectImageMimeType(new Uint8Array(wav))).toBeNull();
  });
});
