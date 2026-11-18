import { ALLOWED_ATTACHMENT_MIME_TYPES, type AllowedAttachmentMimeType, type AllowedAvatarMimeType } from "./constants";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // Legacy MS Office

const OPEN_XML_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const LEGACY_OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

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

/**
 * Detects standard binary attachment MIME type from signature bytes.
 */
export function detectAttachmentMimeType(bytes: Uint8Array): AllowedAttachmentMimeType | null {
  const imageType = detectImageMimeType(bytes);
  if (imageType) return imageType;
  if (startsWithAt(bytes, PDF_SIGNATURE)) return "application/pdf";
  if (startsWithAt(bytes, ZIP_SIGNATURE)) return "application/zip";
  if (startsWithAt(bytes, OLE2_SIGNATURE)) return "application/msword";
  return null;
}

function isTextContent(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  // Check the first 1024 bytes for binary control characters or null bytes
  const sampleSize = Math.min(bytes.length, 1024);
  for (let i = 0; i < sampleSize; i++) {
    const b = bytes[i];
    if (b === undefined || b === 0) return false;
    // Disallow control characters except tab (9), lf (10), cr (13)
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
      return false;
    }
  }
  return true;
}

/**
 * Validates declared MIME type against actual leading bytes and allow-list.
 * Returns the validated MIME type or null if invalid, unsupported, or disguised.
 */
export function validateAttachmentContentType(
  bytes: Uint8Array,
  declaredMimeType: string,
): AllowedAttachmentMimeType | null {
  const normalizedMime = declaredMimeType.toLowerCase().trim() as AllowedAttachmentMimeType;
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(normalizedMime)) {
    return null;
  }

  // Reject disguised HTML
  const firstBytes = bytes.subarray(0, Math.min(bytes.length, 128));
  const prefix = new TextDecoder().decode(firstBytes).toLowerCase().trim();
  if (prefix.startsWith("<!doctype html") || prefix.startsWith("<html") || prefix.startsWith("<script")) {
    return null;
  }

  switch (normalizedMime) {
    case "image/png":
      return startsWithAt(bytes, PNG_SIGNATURE) ? "image/png" : null;
    case "image/jpeg":
      return startsWithAt(bytes, JPEG_SIGNATURE) ? "image/jpeg" : null;
    case "image/webp":
      return startsWithAt(bytes, RIFF_SIGNATURE) && startsWithAt(bytes, WEBP_SIGNATURE, 8) ? "image/webp" : null;
    case "application/pdf":
      return startsWithAt(bytes, PDF_SIGNATURE) ? "application/pdf" : null;
    case "application/zip":
      return startsWithAt(bytes, ZIP_SIGNATURE) ? "application/zip" : null;
    case "text/plain":
    case "text/csv":
      return isTextContent(bytes) ? normalizedMime : null;
    default:
      if (OPEN_XML_MIME_TYPES.has(normalizedMime)) {
        return startsWithAt(bytes, ZIP_SIGNATURE) ? normalizedMime : null;
      }
      if (LEGACY_OFFICE_MIME_TYPES.has(normalizedMime)) {
        return startsWithAt(bytes, OLE2_SIGNATURE) || startsWithAt(bytes, ZIP_SIGNATURE) ? normalizedMime : null;
      }
      return null;
  }
}

/**
 * Sanitizes an uploaded file name to 1..255 characters, stripping directory traversal,
 * control characters, and null bytes.
 */
export function sanitizeFileName(name: string): string {
  // Strip path traversal and directory separators
  let base = name.replace(/^.*[\\/]/, "");
  // Strip null bytes and control characters (ASCII 0x00-0x1F and 0x7F)
  base = Array.from(base)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();

  if (!base || /^\.+$/.test(base)) {
    return "attachment";
  }

  if (base.length <= 255) {
    return base;
  }

  // Truncate to 255 while preserving extension
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex > base.length - 20) {
    const ext = base.slice(dotIndex);
    const maxBaseLen = 255 - ext.length;
    return base.slice(0, maxBaseLen) + ext;
  }

  return base.slice(0, 255);
}
