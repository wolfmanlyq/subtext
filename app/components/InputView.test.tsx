import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputView } from "./InputView";

test("默认填入示例反馈;onDecode 第二参数为 attachments 数组", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  expect((screen.getByLabelText("客户反馈") as HTMLTextAreaElement).value).toContain("白桃");
  await userEvent.click(screen.getByRole("button", { name: "活动促销" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode).toHaveBeenCalledTimes(1);
  const [input, attachments] = onDecode.mock.calls[0];
  expect(input.projectType).toBe("活动促销");
  expect(Array.isArray(attachments)).toBe(true);
  expect(attachments).toHaveLength(0);
});

test("上传并选用文本文件后,提交携带该 attachment(含内容)", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.click(screen.getByRole("button", { name: /历史记录/ }));
  const file = new File(["上一版偏冷淡"], "notes.txt", { type: "text/plain" });
  const input = screen.getByLabelText(/上传/) as HTMLInputElement;
  await userEvent.upload(input, file);
  await userEvent.click(await screen.findByRole("button", { name: "使用此文件" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  const attachments = onDecode.mock.calls[0][1];
  expect(attachments).toHaveLength(1);
  expect(attachments[0].name).toBe("notes.txt");
  expect(attachments[0].kind).toBe("text");
  expect(attachments[0].data).toContain("上一版偏冷淡");
});

test("自定义场景:确认后用自定义值", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.click(screen.getByRole("button", { name: "自定义" }));
  await userEvent.type(screen.getByLabelText("自定义场景"), "门店开业");
  await userEvent.click(screen.getByRole("button", { name: "确认" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode.mock.calls[0][0].projectType).toBe("门店开业");
});

test("Back 触发 onBack", async () => {
  const onBack = vi.fn();
  render(<InputView loading={false} onBack={onBack} onDecode={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalled();
});
