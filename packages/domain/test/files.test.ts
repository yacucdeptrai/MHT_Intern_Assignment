import { describe, expect, it } from "vitest";

import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  detectAttachmentMimeType,
  sanitizeFileName,
  validateAttachmentContentType,
} from "../src";

describe("Attachment file validation (FR-18)", () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
  ]);
  const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // PK\x03\x04
  const plainText = new TextEncoder().encode("Hello, this is a plain text file.\nLine 2.");
  const csvText = new TextEncoder().encode("id,name,role\n1,Alice,ADMIN\n2,Bob,MEMBER\n");
  const htmlSpoof = new TextEncoder().encode("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
  const binaryGarbage = new Uint8Array([0x00, 0x01, 0x02, 0x1f, 0x7f, 0x80, 0xff]);

  it("detects standard binary signatures correctly", () => {
    expect(detectAttachmentMimeType(pngHeader)).toBe("image/png");
    expect(detectAttachmentMimeType(jpegHeader)).toBe("image/jpeg");
    expect(detectAttachmentMimeType(webpHeader)).toBe("image/webp");
    expect(detectAttachmentMimeType(pdfHeader)).toBe("application/pdf");
    expect(detectAttachmentMimeType(zipHeader)).toBe("application/zip");
  });

  it("validates declared MIME type against actual leading bytes", () => {
    expect(validateAttachmentContentType(pngHeader, "image/png")).toBe("image/png");
    expect(validateAttachmentContentType(jpegHeader, "image/jpeg")).toBe("image/jpeg");
    expect(validateAttachmentContentType(webpHeader, "image/webp")).toBe("image/webp");
    expect(validateAttachmentContentType(pdfHeader, "application/pdf")).toBe("application/pdf");
    expect(validateAttachmentContentType(zipHeader, "application/zip")).toBe("application/zip");
    expect(
      validateAttachmentContentType(
        zipHeader,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(
      validateAttachmentContentType(zipHeader, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(validateAttachmentContentType(plainText, "text/plain")).toBe("text/plain");
    expect(validateAttachmentContentType(csvText, "text/csv")).toBe("text/csv");
  });

  it("rejects disguised files declared with incorrect or spoofed MIME types", () => {
    // HTML declared as image/png
    expect(validateAttachmentContentType(htmlSpoof, "image/png")).toBeNull();
    // HTML declared as application/pdf
    expect(validateAttachmentContentType(htmlSpoof, "application/pdf")).toBeNull();
    // Binary garbage declared as text/plain
    expect(validateAttachmentContentType(binaryGarbage, "text/plain")).toBeNull();
    // PNG declared as application/pdf
    expect(validateAttachmentContentType(pngHeader, "application/pdf")).toBeNull();
    // Executable/HTML declared as application/zip
    expect(validateAttachmentContentType(htmlSpoof, "application/zip")).toBeNull();
  });

  it("rejects unsupported MIME types", () => {
    expect(validateAttachmentContentType(htmlSpoof, "text/html")).toBeNull();
    expect(validateAttachmentContentType(binaryGarbage, "application/x-msdownload")).toBeNull();
    expect(ALLOWED_ATTACHMENT_MIME_TYPES).not.toContain("text/html");
    expect(ALLOWED_ATTACHMENT_MIME_TYPES).not.toContain("application/x-msdownload");
  });

  describe("sanitizeFileName", () => {
    it("strips directory traversal and path separators", () => {
      expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
      expect(sanitizeFileName("C:\\Windows\\System32\\calc.exe")).toBe("calc.exe");
      expect(sanitizeFileName("docs/spec.pdf")).toBe("spec.pdf");
    });

    it("strips null bytes and control characters", () => {
      expect(sanitizeFileName("test\0file\x1f.txt")).toBe("testfile.txt");
    });

    it("falls back to attachment if filename is empty or only special chars", () => {
      expect(sanitizeFileName("")).toBe("attachment");
      expect(sanitizeFileName("   ")).toBe("attachment");
      expect(sanitizeFileName("../..")).toBe("attachment");
    });

    it("truncates names longer than 255 characters while preserving extension", () => {
      const longBase = "a".repeat(300);
      const sanitized = sanitizeFileName(`${longBase}.pdf`);
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized.endsWith(".pdf")).toBe(true);
    });
  });
});
