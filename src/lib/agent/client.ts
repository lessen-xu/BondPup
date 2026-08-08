export type AgentIssue = "offline" | "timeout" | "validation";

export type AgentRequestResult =
  | { ok: true; payload: unknown }
  | { ok: false; issue: AgentIssue };

/** 与服务端 provider 单次预算 8s 对齐(>8s):网页放弃时服务端也已结束,不产生白计费 */
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

  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, issue: response.status >= 400 && response.status < 500 ? "validation" : "offline" };
    }

    return { ok: true, payload: await response.json() };
  } catch {
    if (timedOut) return { ok: false, issue: "timeout" };
    return { ok: false, issue: "offline" };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
