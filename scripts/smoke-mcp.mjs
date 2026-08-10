#!/usr/bin/env node
/**
 * MCP 端到端冒烟测试(真断言,失败退出码 1):
 *   node scripts/smoke-mcp.mjs [baseUrl]
 * 串同一个 moneyState 走完整闭环:
 * 建会话 → 预览(状态不动)→ 确认(版本+1、恒等式、confirmedAt)→ 幂等重放 →
 * 说一笔 → 确认扣罐(带 proposal 绑定)→ 撤销 → 3×只说说+回看 → 候选原则 → 确认原则 → 引用可见。
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
let calls = 0;

async function call(name, args) {
  calls++;
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: calls,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "smoke", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  const rpc = await res.json();
  if (rpc.error) throw new Error(`${name} rpc error: ${JSON.stringify(rpc.error)}`);
  const payload = JSON.parse(rpc.result.content[0].text);
  return { payload, structured: rpc.result.structuredContent, isError: rpc.result.isError === true };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

const key = () => `smoke-${calls}-${Math.random().toString(36).slice(2, 8)}`;

// 1. 建会话
const s1 = await call("create_money_session", {});
let ms = s1.payload.moneyState;
assert(ms.stateVersion === 1 && ms.demo === false, "新会话 v1 且 demo:false");
assert(
  s1.structured && s1.structured.sessionId === s1.payload.sessionId,
  "结果带 structuredContent 且与 text 同源(outputSchema 结构化输出)"
);

// 2. 预览不改状态
const planArgs = {
  disposable: 650000,
  livingPlanned: 220000,
  dreamGoal: { name: "去看海", amount: 960000, saved: 0, monthsRemaining: 12 },
};
const p1 = await call("plan_jars", { moneyState: ms, ...planArgs });
assert(p1.payload.preview === true && p1.payload.moneyState.stateVersion === 1, "预览保持 stateVersion=1");

// 3. 确认写入
const k1 = key();
const p2 = await call("plan_jars", {
  moneyState: ms,
  ...planArgs,
  confirm: true,
  expectedStateVersion: 1,
  idempotencyKey: k1,
});
ms = p2.payload.moneyState;
assert(ms.stateVersion === 2 && ms.cycle.confirmedAt, "确认后 v2 且 confirmedAt 存在");
const sum = ms.jars.reduce((a, j) => a + j.planned, 0);
assert(sum === 650000, `四罐恒等式:${sum} === 650000`);
const kinds = ms.jars.map((j) => j.kind).sort().join(",");
assert(kinds === "comfort,dream,future,living", `四罐齐全(0 元也保留):${kinds}`);

// 4. 幂等重放
const p3 = await call("plan_jars", {
  moneyState: ms,
  ...planArgs,
  confirm: true,
  expectedStateVersion: 1,
  idempotencyKey: k1,
});
assert(p3.payload.idempotent === true && p3.payload.moneyState.stateVersion === 2, "幂等重放不重复写入");

// 5. 缺元数据被拒
const bad = await call("plan_jars", { moneyState: ms, ...planArgs, confirm: true });
assert(bad.isError && bad.payload.code === "validation_error", "写操作缺元数据 → validation_error");

// 5b. 短缺计划不能确认(不生成伪计划)
const short = await call("plan_jars", {
  moneyState: ms,
  disposable: 10000,
  livingPlanned: 20000,
  confirm: true,
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
assert(short.isError && short.payload.code === "validation_error", "短缺计划 confirm → validation_error");

// 5c. 未知 sessionId 不静默重置
const ghost = await call("get_money_overview", { sessionId: "ghost-session-000" });
assert(ghost.isError && ghost.payload.code === "not_found", "未知 sessionId → not_found");

// 6. 说一笔 → proposal
const r1 = await call("record_money_moment", { moneyState: ms, description: "同事约出去玩花了 400,有点后悔", amount: 40000 });
const proposal = r1.payload.proposal;
assert(proposal && proposal.stateVersion === 2 && proposal.jarKind === "comfort", "proposal 绑定当前版本,默认安心罐");

// 7. 确认扣罐(绑定 proposal)
const k2 = key();
const c1 = await call("confirm_action", {
  moneyState: ms,
  action: "confirm_debit",
  proposal,
  reviewInDays: 1,
  expectedStateVersion: 2,
  idempotencyKey: k2,
});
ms = c1.payload.moneyState;
assert(ms.jars.find((j) => j.kind === "comfort").actual === 40000, "安心罐 actual=40000");
assert(ms.stories.length === 1 && ms.stories[0].status === "open", "决策故事已创建");

// 7b. 幂等重放可恢复 undoToken/storyId
const c1r = await call("confirm_action", {
  moneyState: ms,
  action: "confirm_debit",
  proposal,
  expectedStateVersion: 2,
  idempotencyKey: k2,
});
assert(
  c1r.payload.idempotent === true && c1r.payload.undoToken === c1.payload.undoToken && c1r.payload.storyId === c1.payload.storyId,
  "confirm_debit 幂等重放返回同一 undoToken/storyId"
);

// 7c. 重放时换罐参数不被采信:undoToken 仍指向首次确认的罐子
const c1x = await call("confirm_action", {
  moneyState: ms,
  action: "confirm_debit",
  proposal,
  chosenJar: "living",
  expectedStateVersion: 2,
  idempotencyKey: k2,
});
assert(c1x.payload.undoToken === c1.payload.undoToken, "重放换罐不改变 undoToken(以故事为准)");

// 7d. 超大请求体被拒
{
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/list",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 999,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "smoke", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": {},
          padding: "x".repeat(200 * 1024),
        },
      },
    }),
  });
  assert(res.status === 413, "超过 128KB 的请求体 → 413");
}

// 8. 过期 proposal 被拒
const c2 = await call("confirm_action", {
  moneyState: ms,
  action: "confirm_debit",
  proposal,
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
assert(c2.isError && c2.payload.code === "state_conflict", "过期 proposal → state_conflict");

// 8b. 伪造/篡改 proposal 被拒(签名校验)
const forged = await call("confirm_action", {
  moneyState: ms,
  action: "confirm_debit",
  proposal: { ...proposal, amount: 9999900, stateVersion: ms.stateVersion },
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
assert(forged.isError && forged.payload.code === "validation_error", "篡改 proposal → 验签失败");

// 8c. 篡改撤销令牌(改金额)被拒:签名覆盖整个令牌
const tampered = c1.payload.undoToken.replace(/:(\d+):/, ":10000:");
const forgedUndo = await call("confirm_action", {
  moneyState: ms,
  action: "undo",
  undoToken: tampered,
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
assert(forgedUndo.isError && forgedUndo.payload.code === "validation_error", "篡改撤销令牌 → 验签失败");

// 9. 撤销(故事一起抹掉)+ 撤销自身幂等
const undoKey = key();
const u1 = await call("confirm_action", {
  moneyState: ms,
  action: "undo",
  undoToken: c1.payload.undoToken,
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: undoKey,
});
ms = u1.payload.moneyState;
assert(ms.jars.find((j) => j.kind === "comfort").actual === 0, "撤销后 actual=0");
assert(!ms.stories.some((s) => s.id === c1.payload.storyId), "撤销后关联故事已抹掉");
const u1r = await call("confirm_action", {
  moneyState: ms,
  action: "undo",
  undoToken: c1.payload.undoToken,
  expectedStateVersion: 999,
  idempotencyKey: undoKey,
});
assert(u1r.payload.idempotent === true, "撤销幂等重放");

// 10. 决定→回看→补记账:log_decision 的故事在回看确认后余额入账
const d1 = await call("confirm_action", {
  moneyState: ms,
  action: "log_decision",
  intent: "犹豫一双鞋,先记决定",
  decisionAction: "buy_now",
  amount: 30000,
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
ms = d1.payload.moneyState;
const rev1 = await call("confirm_action", {
  moneyState: ms,
  action: "complete_review",
  storyId: d1.payload.storyId,
  happened: true,
  actualAmount: 30000,
  chosenJar: "comfort",
  feelingNote: "买了,穿了三次,值",
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
ms = rev1.payload.moneyState;
assert(
  rev1.payload.appliedDebit && ms.jars.find((j) => j.kind === "comfort").actual === 30000,
  "回看确认实际买了 → 安心罐入账 30000"
);

// 10b. 再补 2 条故事 + 回看 → 候选原则
for (let i = 0; i < 2; i++) {
  const n = await call("confirm_action", {
    moneyState: ms,
    action: "note_only",
    intent: `第 ${i + 1} 次消费犹豫,先说说`,
    expectedStateVersion: ms.stateVersion,
    idempotencyKey: key(),
  });
  ms = n.payload.moneyState;
  const rev = await call("confirm_action", {
    moneyState: ms,
    action: "complete_review",
    storyId: n.payload.storyId,
    happened: true,
    feelingNote: "过了一天还是想要",
    expectedStateVersion: ms.stateVersion,
    idempotencyKey: key(),
  });
  ms = rev.payload.moneyState;
}
const o1 = await call("get_money_overview", { moneyState: ms });
const candidate = o1.payload.principleCandidate;
assert(o1.payload.reviewedCount >= 3 && candidate, "≥3 条已回看 → 出现候选原则");

// 11. 确认原则 → 引用可见
const a1 = await call("confirm_action", {
  moneyState: ms,
  action: "adopt_principle",
  candidate: { statement: candidate.statement, evidenceIds: candidate.evidenceIds },
  decision: "like_me",
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
ms = a1.payload.moneyState;
const o2 = await call("get_money_overview", { moneyState: ms });
assert(o2.payload.principles.includes(candidate.statement), "已确认原则可被引用");

// 12. 删除原则(用户拥有=可删):删掉后不再被引用
const delTarget = ms.principles.find((p) => p.statement === candidate.statement);
const del = await call("confirm_action", {
  moneyState: ms,
  action: "delete_principle",
  principleId: delTarget.id,
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
ms = del.payload.moneyState;
const o3 = await call("get_money_overview", { moneyState: ms });
assert(!o3.payload.principles.includes(candidate.statement), "删除原则后不再被引用");

// 13. 跨会话 proposal 拒绝:A 会话签发的 proposal 不能在 B 会话确认
// (签名绑定状态摘要;两个全新状态版本号同为 1,但内容不同,曾被实测互换扣款成功)
const sA = await call("create_money_session", { displayName: "甲" });
const rA = await call("record_money_moment", {
  moneyState: sA.payload.moneyState,
  description: "A 会话的一笔",
  amount: 100000,
});
const sB = await call("create_money_session", { displayName: "乙" });
const cross = await call("confirm_action", {
  moneyState: sB.payload.moneyState,
  action: "confirm_debit",
  proposal: rA.payload.proposal,
  expectedStateVersion: 1,
  idempotencyKey: key(),
});
assert(
  cross.isError && cross.payload.code === "validation_error",
  "别人会话的 proposal(同版本号不同状态)→ 验签拒绝"
);

// 14. 缺 action 专属必填 → 统一 {code,message} 错误(不是 SDK 协议错误文本)
const missing = await call("confirm_action", {
  moneyState: ms,
  action: "note_only",
  expectedStateVersion: ms.stateVersion,
  idempotencyKey: key(),
});
assert(
  missing.isError && missing.payload.code === "validation_error" && missing.payload.message.includes("intent"),
  "缺 action 专属必填 → 统一 validation_error 且点名缺什么"
);

// 15. tools/list 的 confirm_action 公开 schema 含 if-then 条件必填(自动调用器可静态推导)
{
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/list",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1000,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "smoke", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  const rpc = await res.json();
  const tools = rpc.result.tools;
  const confirmTool = tools.find((t) => t.name === "confirm_action");
  const conds = confirmTool?.inputSchema?.allOf ?? [];
  assert(
    conds.some(
      (c) => c.if?.properties?.action?.const === "note_only" && c.then?.required?.includes("intent")
    ) && conds.some((c) => c.if?.properties?.action?.const === "undo" && c.then?.required?.includes("undoToken")),
    "tools/list 公开 schema 含 if-then 条件必填(note_only→intent,undo→undoToken)"
  );
  const plan = tools.find((t) => t.name === "plan_jars")?.outputSchema?.properties?.plan?.properties;
  const proposal = tools.find((t) => t.name === "record_money_moment")?.outputSchema?.properties?.proposal?.properties;
  const confirm = confirmTool?.outputSchema?.properties;
  const overview = tools.find((t) => t.name === "get_money_overview")?.outputSchema?.properties;
  assert(
    plan?.living?.type === "integer" &&
      plan.living.minimum === 0 &&
      proposal?.amount?.type === "integer" &&
      proposal.amount.minimum === 1 &&
      Array.isArray(confirm?.story?.properties?.action?.enum) &&
      Array.isArray(confirm?.principle?.properties?.status?.enum) &&
      confirm?.appliedDebit?.properties?.amount?.minimum === 1 &&
      Array.isArray(overview?.jars?.items?.properties?.kind?.enum) &&
      overview?.leftover?.minimum === 0 &&
      overview?.leftoverHistory?.items?.properties?.fromJar &&
      overview?.cycleReview?.properties?.leftover?.properties?.entries,
    "tools/list 输出 schema 具名有型(plan/story/principle/appliedDebit/overview)"
  );
}

console.log(`\n全部通过(${calls} 次调用)——决定→行动→回看→候选原则→确认→引用→删除 全链路成立。`);
