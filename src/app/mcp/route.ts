import { mcpHandler } from "@/server/mcp/server";
import { guardError, MAX_MCP_BODY_BYTES, originAllowed, rateLimited } from "@/server/http/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 浏览器跨域拦截(DNS rebinding 防护);评测系统与 Inspector 等服务端客户端不带 Origin,不受影响
const guarded = async (req: Request): Promise<Response> => {
  if (!originAllowed(req)) {
    return guardError(403, "validation_error", "来源不允许");
  }
  if (rateLimited(req, "mcp", 120)) {
    return guardError(429, "rate_limited", "请求太频繁,慢慢来");
  }
  if (req.method !== "POST") {
    return mcpHandler(req);
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_MCP_BODY_BYTES) {
    return guardError(413, "validation_error", "请求体过大");
  }
  return mcpHandler(new Request(req.url, { method: req.method, headers: req.headers, body: raw }));
};

export const GET = guarded;
export const POST = guarded;
