#!/usr/bin/env node
/**
 * 一条命令的本地 MCP 冒烟(verify 的收尾步):
 * 起生产构建(next start,需先 build)→ 等 /health 就绪 → 跑 smoke-mcp 全部断言 → 杀进程。
 * 退出码与 smoke 一致;端口冲突直接失败并提示,不静默换端口。
 */
import { spawn } from "node:child_process";

const PORT = Number(process.env.SMOKE_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  { stdio: ["ignore", "pipe", "pipe"] }
);
let serverLog = "";
server.stdout.on("data", (c) => (serverLog += c));
server.stderr.on("data", (c) => (serverLog += c));

function cleanup() {
  if (!server.killed) server.kill();
}
process.on("exit", cleanup);

async function waitReady(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (server.exitCode !== null) return false; // 端口占用等启动失败
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) return true;
    } catch {
      /* 还没起来,继续等 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (!(await waitReady())) {
  console.error(`✗ ${BASE} 未就绪(是否已 next build?端口 ${PORT} 是否被占用?)`);
  console.error(serverLog.slice(-500));
  cleanup();
  process.exit(1);
}

const smoke = spawn(process.execPath, ["scripts/smoke-mcp.mjs", BASE], { stdio: "inherit" });
smoke.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 1);
});
