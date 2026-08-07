#!/usr/bin/env node
/**
 * 性能记录(可复现):node scripts/perf-mcp.mjs [baseUrl]
 * 输出 tools/list、完整闭环、/api/agent 的 P50/P95,以及当前模型 provider 与降级信息。
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
let id = 0;

async function mcp(name, args, method = "tools/call") {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(method === "tools/call" ? { "Mcp-Name": name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method,
      params: {
        ...(method === "tools/call" ? { name, arguments: args } : {}),
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "perf", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  const rpc = await res.json();
  const ms = performance.now() - t0;
  const payload = rpc.result?.content?.[0]?.text ? JSON.parse(rpc.result.content[0].text) : rpc.result;
  return { ms, payload };
}

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const pick = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, p50: Math.round(pick(0.5)), p95: Math.round(pick(0.95)), max: Math.round(s[s.length - 1]) };
}

const key = () => `perf-${id}-${Math.random().toString(36).slice(2, 8)}`;

// ① tools/list ×20
const listTimes = [];
for (let i = 0; i < 20; i++) listTimes.push((await mcp("", {}, "tools/list")).ms);

// ② 完整闭环 ×5(建会话→确认计划→说一笔→扣罐→概览)
const loopTimes = [];
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  let ms1 = (await mcp("create_money_session", {})).payload.moneyState;
  ms1 = (
    await mcp("plan_jars", {
      moneyState: ms1,
      disposable: 650000,
      livingPlanned: 220000,
      confirm: true,
      expectedStateVersion: ms1.stateVersion,
      idempotencyKey: key(),
    })
  ).payload.moneyState;
  const rec = (await mcp("record_money_moment", { moneyState: ms1, description: "临时聚餐", amount: 20000 })).payload;
  ms1 = (
    await mcp("confirm_action", {
      moneyState: ms1,
      action: "confirm_debit",
      proposal: rec.proposal,
      expectedStateVersion: ms1.stateVersion,
      idempotencyKey: key(),
    })
  ).payload.moneyState;
  await mcp("get_money_overview", { moneyState: ms1 });
  loopTimes.push(performance.now() - t0);
}

// ③ /api/agent greet ×10 + provider
const agentTimes = [];
let provider = "?";
let degraded;
for (let i = 0; i < 10; i++) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "companion_reply", scene: "greet" }),
  });
  const data = await res.json();
  agentTimes.push(performance.now() - t0);
  provider = data.provider ?? provider;
  degraded = data.degraded ?? degraded;
}

const health = await (await fetch(`${BASE}/health`)).json();
console.log(JSON.stringify(
  {
    base: BASE,
    commit: (health.commit ?? "").slice(0, 7),
    measuredAt: health.time,
    toolsList: stats(listTimes),
    fullLoopFiveCalls: stats(loopTimes),
    agentGreet: stats(agentTimes),
    agentProvider: provider,
    ...(degraded ? { degraded } : {}),
    unit: "ms",
  },
  null,
  2
));
