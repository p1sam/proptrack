/**
 * Image type detection from file signatures ("magic bytes"). The client-supplied MIME type and
 * file extension are never trusted: only these four raster formats are accepted, and the stored
 * Content-Type is derived from the bytes. SVG is deliberately excluded (it can carry script).
 */

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export const IMAGE_EXTENSION: Record<ImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // GIF: "GIF87a" / "GIF89a"
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";
  // WebP: "RIFF" <size:4> "WEBP"
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}
