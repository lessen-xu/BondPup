import { mcpHandler } from "@/server/mcp/server";
import { guardError, originAllowed } from "@/server/http/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 浏览器跨域拦截(DNS rebinding 防护);评测系统与 Inspector 等服务端客户端不带 Origin,不受影响
const guarded = (req: Request) =>
  originAllowed(req) ? mcpHandler(req) : Promise.resolve(guardError(403, "validation_error", "来源不允许"));

export const GET = guarded;
export const POST = guarded;
