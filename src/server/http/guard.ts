/**
 * 公网入口防护:浏览器跨域拦截 + 每实例限流 + 请求体上限。
 * 服务器到服务器的调用(评测系统、Inspector CLI)不带 Origin,一律放行;
 * 带 Origin 的浏览器请求只允许自己的域与本地开发。
 */

const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/bondpup\.vercel\.app$/,
  /^https:\/\/bondpup-[a-z0-9-]+\.vercel\.app$/,
];

export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((r) => r.test(origin));
}

/** /api/agent:普通对话载荷 */
export const MAX_BODY_BYTES = 32 * 1024;
/** /mcp:请求链回完整 moneyState,上限放宽 */
export const MAX_MCP_BODY_BYTES = 128 * 1024;

/** 每实例滑动窗口限流(Vercel 实例间不共享,作为第一道闸;真实 Key 的预算控制在模型账户侧设限) */
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

export function rateLimited(req: Request, bucket: string, maxPerWindow: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const k = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (buckets.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= maxPerWindow) return true;
  recent.push(now);
  buckets.set(k, recent);
  if (buckets.size > 2000) buckets.clear();
  return false;
}

export function guardError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}
