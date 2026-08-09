import { ERROR_HTTP_STATUS, DomainError } from "@/contracts/errors";
import { runAgentTask } from "@/server/agent";
import { AgentTaskInput } from "@/server/agent/types";
import { guardError, MAX_BODY_BYTES, originAllowed, rateLimited } from "@/server/http/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return guardError(403, "validation_error", "来源不允许");
  }
  if (rateLimited(request, "agent", 30)) {
    return guardError(429, "rate_limited", "请求太频繁,慢慢来");
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return guardError(413, "validation_error", "请求体过大");
    }
    body = JSON.parse(raw);
  } catch {
    return guardError(400, "validation_error", "请求体必须是 JSON"); // copy-ok 开发者错误,非慢慢文案
  }
  const parsed = AgentTaskInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { code: "validation_error", message: "任务参数不合法", details: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const result = await runAgentTask(parsed.data);
    return Response.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return Response.json(e.toApiError(), { status: ERROR_HTTP_STATUS[e.code] });
    }
    return Response.json(
      { code: "internal_error", message: "服务暂时不可用,稍后再试" },
      { status: 500 }
    );
  }
}
