import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "言外之意 Subtext｜Client Feedback Decoder",
  description: "把广告客户的混乱反馈一键解码为甲方反馈行动卡",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
