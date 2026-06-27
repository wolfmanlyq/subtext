import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputPanel } from "./InputPanel";

test("点击示例填充后文本框含白桃", async () => {
  render(<InputPanel onSubmit={vi.fn()} loading={false} />);
  await userEvent.click(screen.getByRole("button", { name: /示例/ }));
  expect((screen.getByLabelText(/客户反馈/) as HTMLTextAreaElement).value).toContain("白桃");
});

test("提交时回调携带 feedback", async () => {
  const onSubmit = vi.fn();
  render(<InputPanel onSubmit={onSubmit} loading={false} />);
  await userEvent.type(screen.getByLabelText(/客户反馈/), "再高级一点");
  await userEvent.click(screen.getByRole("button", { name: /生成行动卡/ }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ feedback: "再高级一点" }),
  );
});
