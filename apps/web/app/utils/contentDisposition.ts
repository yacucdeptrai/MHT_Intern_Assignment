/**
 * Builds an RFC 6266 `Content-Disposition: attachment` header for a user-supplied file name.
 * - `filename` is an ASCII fallback: non-printable and non-ASCII characters become `_`, and `"` and
 *   `\` are escaped so the quoted string cannot be cut short.
 * - `filename*` is RFC 5987: every character outside `attr-char` is percent-encoded, including the
 *   `'`, `(`, `)`, and `*` that `encodeURIComponent` leaves alone.
 */
export function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "\\$&");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
