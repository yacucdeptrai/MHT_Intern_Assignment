import type { AllowedAvatarMimeType } from "./constants";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

function startsWithAt(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[offset + index] === value);
}

/**
 * Detects the image type from the file's leading bytes instead of the client-supplied MIME type.
 * Returns null when the bytes are not a PNG, JPEG, or WebP image.
 */
export function detectImageMimeType(bytes: Uint8Array): AllowedAvatarMimeType | null {
  if (startsWithAt(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWithAt(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (startsWithAt(bytes, RIFF_SIGNATURE) && startsWithAt(bytes, WEBP_SIGNATURE, 8)) {
    return "image/webp";
  }
  return null;
}
