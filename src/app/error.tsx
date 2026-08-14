"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_ERROR } from "@/mock/剧本";
import { HandDrawnUnderline } from "@/components/HandDrawnUnderline";

/**
 * 路由段错误边界。此前全站没有任何 error.tsx/global-error.tsx:
 * 任何未捕获的客户端异常在评委手机上就是 Next 默认的
 * "Application error: a client-side exception has occurred" 裸屏。
 * 状态在 localStorage,渲染崩了数据不丢,所以「再试一次」多数情况真能救回来。
 *
 * 版式刻意自成一套(只借 stage-shell 的纸色背景),不用 decision-dialog 那套:
 * 它是绝对定位、且假定上方有 <Dog>,在这里会把文字整体顶出视口(实拍验证过两版)。
 * 兜底页不该依赖可能正是崩溃来源的版式系统。
 *
 * Next 16 的 props 是 { error, retry }(不是旧版的 reset)。
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error("app_error_boundary", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="stage-shell flow-layout-shell">
      <section
        aria-label={APP_ERROR.line}
        aria-live="assertive"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          padding: "32px 24px",
          textAlign: "center",
          fontFamily: "var(--font-hand)",
          color: "var(--ink)",
        }}
      >
        <p style={{ margin: 0, fontSize: "19px" }}>{APP_ERROR.line}</p>
        <p style={{ margin: 0, fontSize: "16px", color: "var(--muted)" }}>{APP_ERROR.sub}</p>
        <div style={{ display: "flex", gap: "28px", marginTop: "18px", whiteSpace: "nowrap" }}>
          <button className="decision-text-action" type="button" onClick={() => retry()}>
            {APP_ERROR.retry}
            <HandDrawnUnderline />
          </button>
          <button className="decision-text-action" type="button" onClick={() => router.push("/")}>
            {APP_ERROR.home}
            <HandDrawnUnderline />
          </button>
        </div>
      </section>
    </main>
  );
}
