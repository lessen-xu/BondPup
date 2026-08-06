import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小狗慢慢 · BondPup",
  description: "不替你决定、但会记住你如何做决定的钱包陪伴 Agent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
