import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputView } from "./InputView";

test("默认填入示例反馈且单选/多选 chip 工作,解码回调携带映射后的输入", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);

  expect((screen.getByLabelText("客户反馈") as HTMLTextAreaElement).value).toContain("白桃");

  // 单选:切项目类型
  await userEvent.click(screen.getByRole("button", { name: "品牌海报" }));
  // 多选:取消一个默认目标、加一个
  await userEvent.click(screen.getByRole("button", { name: "整理需求" })); // 取消
  await userEvent.click(screen.getByRole("button", { name: "方向小样" })); // 新增

  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  expect(onDecode).toHaveBeenCalledTimes(1);
  const arg = onDecode.mock.calls[0][0];
  expect(arg.projectType).toBe("品牌海报");
  expect(arg.stage).toBe("初稿反馈");
  expect(arg.audience).toContain("行动建议");
  expect(arg.audience).toContain("方向小样");
  expect(arg.audience).not.toContain("整理需求");
});

test("Back 触发 onBack", async () => {
  const onBack = vi.fn();
  render(<InputView loading={false} onBack={onBack} onDecode={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalled();
});
