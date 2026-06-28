import { test, expect } from "vitest";
import {
  AttachmentSchema,
  AttachmentsSchema,
  attachmentsWithinLimit,
  MAX_FILE_BYTES,
} from "./attachment";

const pdf = { name: "a.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };

test("合法附件通过校验", () => {
  expect(AttachmentSchema.safeParse(pdf).success).toBe(true);
});

test("kind 非枚举被拒绝", () => {
  expect(AttachmentSchema.safeParse({ ...pdf, kind: "video" }).success).toBe(false);
});

test("mediaType 不在白名单被拒绝", () => {
  expect(AttachmentSchema.safeParse({ ...pdf, mediaType: "application/zip" }).success).toBe(false);
});

test("空 data 被拒绝", () => {
  expect(AttachmentSchema.safeParse({ ...pdf, data: "" }).success).toBe(false);
});

test("AttachmentsSchema 接受数组", () => {
  expect(AttachmentsSchema.safeParse([pdf]).success).toBe(true);
});

test("单文件超过上限时 attachmentsWithinLimit 为 false", () => {
  const big = { ...pdf, data: "a".repeat(MAX_FILE_BYTES + 1) };
  expect(attachmentsWithinLimit([big])).toBe(false);
});

test("正常大小通过 attachmentsWithinLimit", () => {
  expect(attachmentsWithinLimit([pdf])).toBe(true);
});
