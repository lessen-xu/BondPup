export type AgentIssue = "offline" | "timeout" | "validation";

export type AgentRequestResult =
  | { ok: true; payload: unknown }
  | { ok: false; issue: AgentIssue };

/** 排查用调用痕迹:只记 provider/source/scene/耗时,不记任何用户文本。
 *  实测时在 DevTools 里看 localStorage["bondpup.agentTrace.v1"] 即可分辨
 *  哪次回复是真模型(source:"ai")、哪次是确定性兜底(source:"rule")。 */
const TRACE_KEY = "bondpup.agentTrace.v1";
const TRACE_LIMIT = 30;

function recordTrace(entry: Record<string, unknown>): void {
  try {
    const raw = window.localStorage.getItem(TRACE_KEY);
    const list: unknown[] = raw ? JSON.parse(raw) : [];
    const next = [...(Array.isArray(list) ? list : []), entry].slice(-TRACE_LIMIT);
    window.localStorage.setItem(TRACE_KEY, JSON.stringify(next));
  } catch {
    // 痕迹写不进去(隐私模式配额等)不影响主流程
  }
}

/** 与服务端任务级总预算 9s 对齐(>9s):所有模型尝试共享一个 deadline,网页放弃时服务端必已结束 */
const DEFAULT_TIMEOUT_MS = 10000;

export async function requestAgent(
  input: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<AgentRequestResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, issue: "offline" };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const startedAt = Date.now();
  const scene = typeof input === "object" && input !== null
    ? `${(input as Record<string, unknown>).task ?? ""}/${(input as Record<string, unknown>).scene ?? ""}`
    : "";

  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      recordTrace({ t: new Date().toISOString(), scene, ms: Date.now() - startedAt, http: response.status });
      return { ok: false, issue: response.status >= 400 && response.status < 500 ? "validation" : "offline" };
    }

    const payload = await response.json();
    const p = payload as Record<string, unknown>;
    recordTrace({
      t: new Date().toISOString(),
      scene,
      ms: Date.now() - startedAt,
      provider: p.provider ?? null,
      source: p.source ?? null,
      degraded: p.degraded ?? null,
    });
    return { ok: true, payload };
  } catch {
    recordTrace({ t: new Date().toISOString(), scene, ms: Date.now() - startedAt, error: timedOut ? "timeout" : "offline" });
    if (timedOut) return { ok: false, issue: "timeout" };
    return { ok: false, issue: "offline" };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
