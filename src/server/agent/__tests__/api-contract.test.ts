import { describe, expect, it } from "vitest";
import { runAgentTask, sanitizeCompanionContext } from "@/server/agent";
import { runMockAgentTask } from "@/server/agent/mock";
import { buildTaskPrompt } from "@/server/agent/prompts";
import {
  validateConcernsOutput,
  validateDecisionReply,
  validatePrincipleWithIds,
  validateReplyText,
} from "@/server/safety/validate";

/**
 * API→组件契约测试:锁定 /api/agent 响应里页面依赖的安全字段。
 * 页面读 safetyFlags 做分流(crisis→SAFETY_EXIT,offTopic→想聊聊分支),
 * 审计写入读 safetyEvent;字段名改动必须先改这里。
 */
describe("/api/agent 安全字段契约(防漂移)", () => {
  it("自伤输入 → safetyFlags=[crisis] + safetyEvent(self_harm),回应过语气闸", async () => {
    const out = await runAgentTask({
      task: "companion_reply",
      scene: "note",
      userText: "最近觉得活着没意思",
    });
    expect(out.task).toBe("companion_reply");
    expect(out.safetyFlags).toEqual(["crisis"]);
    expect(out.source).toBe("rule");
    expect(out.safetyEvent?.riskType).toBe("self_harm");
    if (out.task === "companion_reply") {
      expect(out.result.text.length).toBeGreaterThan(0);
      expect(validateReplyText(out.result.text)).toEqual([]);
    }
  });

  it("借贷 → debt;投资 → invest;泛化情绪 → offTopic", async () => {
    const debt = await runAgentTask({ task: "companion_reply", scene: "note", userText: "花呗还不上了" });
    expect(debt.safetyFlags).toEqual(["debt"]);
    const invest = await runAgentTask({ task: "companion_reply", scene: "note", userText: "想去炒股翻倍" });
    expect(invest.safetyFlags).toEqual(["invest"]);
    const emo = await runAgentTask({ task: "companion_reply", scene: "note", userText: "压力好大想哭" });
    expect(emo.safetyFlags).toEqual(["offTopic"]);
    expect(emo.safetyEvent?.riskType).toBe("generic_emotion");
  });

  it("普通输入无 safetyFlags,带 provider 标记;Mock 产出 source=rule", async () => {
    const out = await runAgentTask({ task: "companion_reply", scene: "greet" });
    expect(out.safetyFlags).toBeUndefined();
    expect(out.safetyEvent).toBeUndefined();
    expect(out.provider).toBe("mock");
    expect(out.source).toBe("rule");
  });

  it("拆解任务同样带 source(前端标识「AI 生成/规则生成」依赖此字段)", async () => {
    const out = await runAgentTask({ task: "decompose_wish", wish: "想攒钱也想过得舒服" });
    expect(out.source).toBe("rule");
    if (out.task === "decompose_wish") {
      expect(out.result.concerns.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("generate_principle 统一编排(网页与 MCP 同一条路径)", () => {
  const stories = [
    { id: "s1", intent: "按摩仪", action: "defer" as const, happened: false },
    { id: "s2", intent: "短途旅行", action: "skip_this_time" as const, happened: false },
    { id: "s3", intent: "白色的鞋", action: "defer" as const, happened: true },
  ];

  it("deterministicFallback=true(演示模式):候选必过 safety 校验,source=rule", async () => {
    const out = await runAgentTask({
      task: "generate_principle",
      stories,
      existingStatements: [],
      concerns: ["想攒钱去看海"],
      deterministicFallback: true,
      attempt: 0,
    });
    expect(out.task).toBe("generate_principle");
    if (out.task !== "generate_principle") return;
    const allowed = new Set(stories.map((s) => s.id));
    expect(validatePrincipleWithIds(out.result, allowed)).toEqual([]);
    // concerns 只是背景:evidence 仍必须全部指向 stories(校验层钉死)
    for (const id of out.result.evidenceIds) {
      expect(allowed.has(id)).toBe(true);
    }
    expect(out.source).toBe("rule"); // 无密钥环境:确定性候选
  });

  it("P0 封口:故事摘要含硬红线(自伤)→ 整个不生成,demo 兜底也不例外(生产复现过自伤原则)", async () => {
    const risky = [
      { id: "s1", intent: "一次消费", action: "defer" as const, feelingNote: "感觉活着没什么意思" },
      stories[1],
      stories[2],
    ];
    await expect(
      runAgentTask({
        task: "generate_principle",
        stories: risky,
        existingStatements: [],
        concerns: [],
        deterministicFallback: true,
        attempt: 0,
      })
    ).rejects.toThrow();
  });

  it("concerns 含硬红线(借贷)同样不生成", async () => {
    await expect(
      runAgentTask({
        task: "generate_principle",
        stories,
        existingStatements: [],
        concerns: ["想借网贷周转一下"],
        deterministicFallback: true,
        attempt: 0,
      })
    ).rejects.toThrow();
  });

  it("默认(宁缺毋滥):证据不足不硬凑,抛 validation_error 而不是兜底", async () => {
    await expect(
      runAgentTask({
        task: "generate_principle",
        stories: [stories[0]],
        existingStatements: [],
        concerns: [],
        deterministicFallback: false,
        attempt: 0,
      })
    ).rejects.toThrow();
  });
});

describe("厚上下文:金额只以文本进 prompt,模型永远见不到裸分值", () => {
  it("decision 场景:payload 含格式化金额与她的上下文,不含原始分值", () => {
    const { payload, instruction } = buildTaskPrompt({
      task: "companion_reply",
      scene: "decision",
      userText: "想买个投影仪",
      stateSummary: { comfortAvailable: 350000, shortfall: 50000 },
      principles: ["我放一晚再决定,好像更踏实"],
      concerns: ["周末能出去走走"],
      recentStories: [{ intent: "想买那双白色的鞋", action: "defer", happened: true, feelingNote: "穿得不多", amount: 39900 }],
      item: { name: "投影仪", amount: 400000 },
    });
    expect(payload).toContain("3500 元");
    expect(payload).toContain("买了差 500 元");
    expect(payload).toContain("399 元");
    expect(payload).toContain("4000 元");
    expect(payload).not.toMatch(/350000|50000|39900|400000/);
    expect(payload).toContain("周末能出去走走");
    expect(instruction).toContain("交还");
  });

  it("Mock 决策回应天然通过三选项语义闸(降级路径安全)", async () => {
    const out = await runAgentTask({
      task: "companion_reply",
      scene: "decision",
      userText: "犹豫要不要买",
      stateSummary: { comfortAvailable: 350000 },
    });
    expect(out.task).toBe("companion_reply");
    if (out.task !== "companion_reply") return;
    expect(validateDecisionReply(out.result.text)).toEqual([]);
    expect(out.source).toBe("rule");
  });
});

describe("厚上下文背景清洗(P0:输入闸覆盖所有入模字符串)", () => {
  it("硬红线条目被剔除,干净条目保留;泛化情绪(想哭)是正常内容不剔", () => {
    const out = sanitizeCompanionContext({
      task: "companion_reply",
      scene: "decision",
      userText: "犹豫要不要买",
      principles: ["我放一晚再决定,好像更踏实", "我想借网贷也要买到手"],
      concerns: ["想去炒股翻倍", "周末能出去走走"],
      recentStories: [
        { intent: "想买那双白色的鞋", action: "defer", feelingNote: "想哭但放下了" },
        { intent: "买比特币", action: "buy_now" },
      ],
      item: { name: "投影仪", amount: 400000 },
    });
    expect(out.principles).toEqual(["我放一晚再决定,好像更踏实"]);
    expect(out.concerns).toEqual(["周末能出去走走"]);
    expect(out.recentStories?.map((s) => s.intent)).toEqual(["想买那双白色的鞋"]);
    expect(out.item?.name).toBe("投影仪");
  });
  it("item 本身命中硬红线 → 整个剔除", () => {
    const out = sanitizeCompanionContext({
      task: "companion_reply",
      scene: "decision",
      userText: "想买这个",
      item: { name: "虚拟币合约课程", amount: 100000 },
    });
    expect(out.item).toBeUndefined();
  });
});

describe("decompose_wish 拆解输入", () => {
  it("Mock 拆解天然通过输出闸(decompose 兜底路径安全)", () => {
    for (const input of [
      { task: "decompose_wish" as const, wish: "想攒钱也想过得舒服" },
      {
        task: "decompose_wish" as const,
        wish: "想攒下来一点",
        nearChoice: "save",
        goal: { name: "去日本旅行", amount: 960000, monthsRemaining: 12 },
      },
    ]) {
      const out = runMockAgentTask(input);
      if (out.task !== "decompose_wish") throw new Error("任务类型不符");
      expect(validateConcernsOutput(out.result.concerns)).toEqual([]);
    }
  });
  it("两组不同输入返回不同 concerns,并带入远期目标", () => {
    const travel = runMockAgentTask({
      task: "decompose_wish",
      wish: "想攒下来一点",
      nearChoice: "save",
      goal: { name: "去日本旅行", amount: 960000, monthsRemaining: 12 },
    });
    const shanghai = runMockAgentTask({
      task: "decompose_wish",
      wish: "我想自己说说; 我想这个月在上海过得还不错",
      nearChoice: "custom",
    });
    if (travel.task !== "decompose_wish" || shanghai.task !== "decompose_wish") throw new Error("任务类型不符");
    expect(travel.result.concerns).toContain("为去日本旅行留出一笔专用的钱");
    expect(shanghai.result.concerns).toContain("在上海把这个月过得舒展一点");
    expect(travel.result.concerns).not.toEqual(shanghai.result.concerns);
  });
});
