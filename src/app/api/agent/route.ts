import { ERROR_HTTP_STATUS, DomainError } from "@/contracts/errors";
import { runAgentTask } from "@/server/agent";
import { AgentTaskInput } from "@/server/agent/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { code: "validation_error", message: "请求体必须是 JSON" },
      { status: 400 }
    );
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
