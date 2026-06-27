import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputView } from "./InputView";

test("默认填入示例反馈,单选/多选 chip 与解码回调映射正确", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);

  expect((screen.getByLabelText("客户反馈") as HTMLTextAreaElement).value).toContain("白桃");

  await userEvent.click(screen.getByRole("button", { name: "活动促销" }));
  await userEvent.click(screen.getByRole("button", { name: "整理需求" })); // 取消
  await userEvent.click(screen.getByRole("button", { name: "方向小样" })); // 新增

  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  const arg = onDecode.mock.calls[0][0];
  expect(arg.projectType).toBe("活动促销");
  expect(arg.stage).toBe("初稿反馈");
  expect(arg.audience).toContain("行动建议");
  expect(arg.audience).toContain("方向小样");
  expect(arg.audience).not.toContain("整理需求");
});

test("自定义场景:展开输入并确认后,projectType 用自定义值", async () => {
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
