export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "bondpup",
    // 多平台部署(Vercel / Zeabur 香港备用):谁提供了 commit 就报谁,用于确认两边同版本
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.ZEABUR_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      "local",
    platform: process.env.VERCEL ? "vercel" : process.env.ZEABUR_SERVICE_ID ? "zeabur" : "self",
    time: new Date().toISOString(),
  });
}
