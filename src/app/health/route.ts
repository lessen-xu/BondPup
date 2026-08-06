export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "bondpup",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    time: new Date().toISOString(),
  });
}
