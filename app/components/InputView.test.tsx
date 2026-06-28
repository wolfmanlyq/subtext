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

test("选中附件总量超过 8MB 时拦截:不调用 onDecode 并提示", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.click(screen.getByRole("button", { name: /历史记录/ }));
  const input = screen.getByLabelText(/上传/) as HTMLInputElement;
  // 三个各 ~3MB 的文本文件:每个 < 4MB 单文件限,合计 ~9MB > 8MB 总量限
  const big = "a".repeat(3 * 1024 * 1024);
  const f1 = new File([big], "a.txt", { type: "text/plain" });
  const f2 = new File([big], "b.txt", { type: "text/plain" });
  const f3 = new File([big], "c.txt", { type: "text/plain" });
  await userEvent.upload(input, [f1, f2, f3]);
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    const card = (await screen.findByTitle(name)).closest(".file-card") as HTMLElement;
    await userEvent.click(card.querySelector("button")!); // “使用此文件”
  }
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode).not.toHaveBeenCalled();
  expect(document.querySelector(".error-note")?.textContent).toMatch(/总量超过 8MB/);
});

test("总量超限提示在抽屉关闭后仍可见(主输入卡)", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.click(screen.getByRole("button", { name: /历史记录/ }));
  const input = screen.getByLabelText(/上传/) as HTMLInputElement;
  const big = "a".repeat(3 * 1024 * 1024);
  const files = ["a.txt", "b.txt", "c.txt"].map((n) => new File([big], n, { type: "text/plain" }));
  await userEvent.upload(input, files);
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    const card = (await screen.findByTitle(name)).closest(".file-card") as HTMLElement;
    await userEvent.click(card.querySelector("button")!);
  }
  // 关闭抽屉
  await userEvent.click(screen.getAllByRole("button", { name: "关闭" })[0]);
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode).not.toHaveBeenCalled();
  // 主卡片上应能看到错误提示(抽屉已关)
  expect(screen.getByText(/总量超过 8MB/)).toBeInTheDocument();
});
