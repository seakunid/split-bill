export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MIME_BY_TYPE: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

export class ImageUploadError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(message: string, status: 400 | 413 | 415) {
    super(message);
    this.name = "ImageUploadError";
    this.status = status;
  }
}

export async function readBillImage(value: unknown, maxBytes = MAX_IMAGE_BYTES): Promise<{ mimeType: string; bytes: Uint8Array }> {
  if (Array.isArray(value)) {
    throw new ImageUploadError("Upload a single image", 400);
  }
  if (typeof File === "undefined" || !(value instanceof File)) {
    throw new ImageUploadError("Image file is required", 400);
  }
  if (value.size > maxBytes) {
    throw new ImageUploadError("Image exceeds the 8 MB limit", 413);
  }
  const mimeType = MIME_BY_TYPE[value.type] ?? mimeFromName(value.name);
  if (!mimeType) {
    throw new ImageUploadError("Image must be JPEG, PNG, WebP, or GIF", 415);
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new ImageUploadError("Image exceeds the 8 MB limit", 413);
  }
  return { mimeType, bytes };
}

function mimeFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}
