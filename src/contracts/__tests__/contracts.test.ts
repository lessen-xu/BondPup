import { describe, expect, it } from "vitest";
import { DecisionStory, MoneyPrinciple, MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { createInitialMoneyState } from "@/lib/mock/money-state";
import { commitJarDebit } from "@/server/domain/debit";

describe("契约收紧(评估修正)", () => {
  it("evidenceIds 重复被拒:同一条故事不能当两条证据", () => {
    const r = MoneyPrinciple.safeParse({
      id: "p1",
      statement: "我放一晚再决定,好像更踏实",
      evidenceIds: ["s1", "s1"],
      status: "candidate",
      userEdited: false,
      createdAt: "2026-08-06T00:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("intent 超过 120 字被拒(短摘要,不存完整倾诉原文)", () => {
    const r = DecisionStory.safeParse({
      id: "s1",
      intent: "想".repeat(121),
      action: "note_only",
      status: "open",
      createdAt: "2026-08-06T00:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("旧版状态(无 safetyEvents 字段)仍能解析(default 兼容)", () => {
    const s = applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state;
    const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete legacy.safetyEvents;
    const parsed = MoneyState.parse(legacy);
    expect(parsed.safetyEvents).toEqual([]);
  });

  it("真实新会话 demo:false;合成示例才是 true", () => {
    expect(createInitialMoneyState().demo).toBe(false);
    expect(applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state.demo).toBe(false);
  });

  it("短缺计划不能确认写入(预览可见缺口,confirm 拒绝伪计划)", () => {
    expect(
      applyJarPlan({ disposable: 10000, livingPlanned: 20000 }).plan.shortfall
    ).toBe(10000);
    try {
      applyJarPlan({ disposable: 10000, livingPlanned: 20000, confirmed: true });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("validation_error");
    }
  });

  it("已确认周期的四罐恒等式在 schema 层锁死(链回 Σplanned≠disposable 的恶意状态被拒)", () => {
    const s = applyJarPlan({ disposable: 650000, livingPlanned: 220000, confirmed: true }).state;
    const evil = {
      ...s,
      jars: s.jars.map((j) => (j.kind === "living" ? { ...j, planned: j.planned + 1 } : j)),
    };
    const parsed = MoneyState.safeParse(evil);
    expect(parsed.success).toBe(false);
    // 未确认的短缺预览态不受此约束(本来就带缺口,不写库)
    expect(MoneyState.safeParse(applyJarPlan({ disposable: 10000, livingPlanned: 20000 }).state).success).toBe(true);
  });

  it("有周期时四罐必须齐全:缺未来罐被拒,0 元也保留", () => {
    const s = applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state;
    expect(s.jars.map((j) => j.kind).sort()).toEqual(["comfort", "dream", "future", "living"]);
    expect(s.jars.find((j) => j.kind === "dream")!.planned).toBe(0);
    expect(s.jars.find((j) => j.kind === "future")!.planned).toBe(0);
    const missing = { ...s, jars: s.jars.filter((j) => j.kind !== "future") };
    expect(MoneyState.safeParse(missing).success).toBe(false);
    expect(createInitialMoneyState().jars).toEqual([]); // 无周期时空罐合法
  });

  it("重排不静默删梦想目标:base 有 goal、入参没带时保留", () => {
    const withGoal = applyJarPlan({
      disposable: 650000,
      livingPlanned: 220000,
      dreamGoal: { name: "去看海", amount: 960000, saved: 0, monthsRemaining: 12 },
    }).state;
    const replanned = applyJarPlan({ baseState: withGoal, disposable: 650000, livingPlanned: 220000 }).state;
    const dream = replanned.jars.find((j) => j.kind === "dream")!;
    expect(dream.goal?.name).toBe("去看海");
    expect(dream.label).toBe("去看海");
    expect(dream.planned).toBe(0);
  });

  it("扣罐金额 0 被拒(不产生无意义版本更新)", () => {
    const s = applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state;
    try {
      commitJarDebit(s, {
        jarKind: "comfort",
        amount: 0,
        expectedStateVersion: s.stateVersion,
        idempotencyKey: "zero",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("validation_error");
    }
  });
});
