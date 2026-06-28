import { test, expect } from "vitest";
import {
  AttachmentSchema,
  AttachmentsSchema,
  attachmentsWithinLimit,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
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

test("每个文件均未超单文件限,但总量超过 MAX_TOTAL_BYTES 时为 false", () => {
  const per = Math.floor(MAX_TOTAL_BYTES / 3) + 1024; // 3 个相加 > 总量限,且每个 < 单文件限
  expect(per).toBeLessThanOrEqual(MAX_FILE_BYTES);
  const a = { ...pdf, data: "a".repeat(per) };
  expect(attachmentsWithinLimit([a, { ...a }, { ...a }])).toBe(false);
});

test("总量恰好等于 MAX_TOTAL_BYTES 时通过(边界)", () => {
  const half = MAX_TOTAL_BYTES / 2; // 两个相加 == 总量限
  const a = { ...pdf, data: "a".repeat(half) };
  expect(attachmentsWithinLimit([a, { ...a }])).toBe(true);
});
