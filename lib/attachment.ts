import { z } from "zod";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AttachmentKind = "text" | "pdf" | "image";

export const AttachmentSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["text", "pdf", "image"]),
  mediaType: z.enum(MEDIA_TYPES),
  data: z.string().min(1),
});

export const AttachmentsSchema = z.array(AttachmentSchema);

export type Attachment = z.infer<typeof AttachmentSchema>;

export function attachmentBytes(a: Attachment): number {
  // 字符串的 UTF-8 字节数(base64 为 ASCII,文本可能含多字节)
  return new TextEncoder().encode(a.data).length;
}

export function attachmentsWithinLimit(list: Attachment[]): boolean {
  let total = 0;
  for (const a of list) {
    const n = attachmentBytes(a);
    if (n > MAX_FILE_BYTES) return false;
    total += n;
  }
  return total <= MAX_TOTAL_BYTES;
}
