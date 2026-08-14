"use client";

import { APP_ERROR } from "@/mock/剧本";

/**
 * 根布局崩溃时的最后一道兜底(error.tsx 兜不住 layout 自身的错)。
 * Next 16 要求:必须是 Client Component、自带 <html>/<body>,
 * 且这个文件替换掉根布局 —— globals.css 不会加载,所以样式只能内联。
 * 手写风的纸色在这里用字面值,不走 CSS 变量(变量定义在 globals.css 里,拿不到)。
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          background: "#fbfaf7",
          color: "#4a3b2e",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <title>{APP_ERROR.line}</title>
        <p style={{ margin: 0, fontSize: "18px" }}>{APP_ERROR.line}</p>
        <p style={{ margin: 0, fontSize: "15px", color: "#9c8b78" }}>{APP_ERROR.sub}</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: "8px",
            padding: "10px 22px",
            fontSize: "15px",
            color: "#4a3b2e",
            background: "transparent",
            border: "1px solid #c89b5c",
            borderRadius: "999px",
            cursor: "pointer",
          }}
        >
          {APP_ERROR.retry}
        </button>
        <span hidden>{error.digest}</span>
      </body>
    </html>
  );
}
