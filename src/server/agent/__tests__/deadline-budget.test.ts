import { afterEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  runAnthropicTask: vi.fn(),
  runCompatTask: vi.fn(),
}));

vi.mock("@/server/agent/providers", () => providerMocks);

import { normalizeDailyModelBudget, runAgentTask } from "@/server/agent";

const validReply = {
  task: "companion_reply" as const,
  result: { text: "我在这里。", requiresConfirmation: false },
};

const invalidDecisionReply = {
  task: "companion_reply" as const,
  result: { text: "现在买。", requiresConfirmation: false },
};

function useCompatProvider(): void {
  vi.stubEnv("OPENAI_COMPAT_API_KEY", "test-key");
  vi.stubEnv("OPENAI_COMPAT_BASE_URL", "https://provider.invalid");
  vi.stubEnv("OPENAI_COMPAT_MODEL", "test-model");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Agent 总 deadline 与每日成本护栏", () => {
  it("每日预算仅接受非负安全整数，空值或误配回落默认 2000", () => {
    expect(normalizeDailyModelBudget(undefined)).toBe(2000);
    expect(normalizeDailyModelBudget("")).toBe(2000);
    expect(normalizeDailyModelBudget("not-a-number")).toBe(2000);
    expect(normalizeDailyModelBudget("-1")).toBe(2000);
    expect(normalizeDailyModelBudget("1.5")).toBe(2000);
    expect(normalizeDailyModelBudget("0")).toBe(0);
    expect(normalizeDailyModelBudget("120")).toBe(120);
  });

  it("MODEL_DAILY_BUDGET 用尽后不再调用 provider，直接降级确定性 Mock", async () => {
    useCompatProvider();
    vi.stubEnv("MODEL_DAILY_BUDGET", "1");
    providerMocks.runCompatTask.mockResolvedValue(validReply);

    const first = await runAgentTask({ task: "companion_reply", scene: "greet" });
    const second = await runAgentTask({ task: "companion_reply", scene: "greet" });

    expect(first.provider).toBe("compat");
    expect(first.source).toBe("ai");
    expect(second.provider).toBe("mock");
    expect(second.source).toBe("rule");
    expect(second.degraded).toEqual({ from: "compat", reason: "daily_budget_exhausted" });
    expect(providerMocks.runCompatTask).toHaveBeenCalledTimes(1);
  });

  it("输出闸重试复用首发剩余预算，而不是重新获得 8 秒", async () => {
    useCompatProvider();
    vi.stubEnv("MODEL_DAILY_BUDGET", "100");
    providerMocks.runCompatTask.mockResolvedValue(invalidDecisionReply);
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000) // 建立 9s deadline
      .mockReturnValueOnce(1_000) // 首发获得 max 8s
      .mockReturnValueOnce(5_000) // 首发后只剩 5s
      .mockReturnValue(5_000);

    await runAgentTask({ task: "companion_reply", scene: "decision", userText: "有点犹豫" });

    expect(providerMocks.runCompatTask).toHaveBeenCalledTimes(2);
    expect(providerMocks.runCompatTask.mock.calls.map((call) => call[1])).toEqual([8_000, 5_000]);
  });

  it("剩余不足 1.2 秒时跳过模型重试并走确定性兜底", async () => {
    useCompatProvider();
    vi.stubEnv("MODEL_DAILY_BUDGET", "100");
    providerMocks.runCompatTask.mockResolvedValue(invalidDecisionReply);
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(8_801) // deadline=10000，仅余 1199ms
      .mockReturnValue(8_801);

    const out = await runAgentTask({
      task: "companion_reply",
      scene: "decision",
      userText: "有点犹豫",
    });

    expect(providerMocks.runCompatTask).toHaveBeenCalledTimes(1);
    expect(out.source).toBe("rule");
  });
});
