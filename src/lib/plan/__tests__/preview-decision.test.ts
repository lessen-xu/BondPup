import { describe, expect, it } from "vitest";
import { DomainError } from "@/contracts/errors";
import { findForbiddenWords } from "@/server/safety/validate";
import { applyJarPlan } from "../apply-jar-plan";
import { previewDecision } from "../preview-decision";

function planned() {
  // 生活 2200 / 安心 3500 / 梦想 800(目标 9600÷12)
  return applyJarPlan({
    disposable: 650000,
    livingPlanned: 220000,
    dreamGoal: { name: "去看海", amount: 960000, saved: 0, monthsRemaining: 12 },
  }).state;
}

describe("previewDecision", () => {
  it("够买:remaining = 安心可用 − 金额,shortfall 0,无来源选项", () => {
    const p = previewDecision(planned(), { amount: 40000 });
    expect(p).toMatchObject({ comfortAvailable: 350000, remaining: 310000, shortfall: 0, sources: [] });
    expect(p.goalImpact).toBeUndefined();
  });

  it("差额正确,来源按梦想罐、生活罐顺序且不含安心罐", () => {
    const p = previewDecision(planned(), { amount: 400000 });
    expect(p.remaining).toBe(0);
    expect(p.shortfall).toBe(50000);
    expect(p.sources.map((s) => s.jarKind)).toEqual(["dream", "living"]);
    expect(p.sources[1].amount).toBe(220000);
    expect(p.canCoverWithCurrentJars).toBe(true);
  });

  it("生活罐可用金额为 0 时仍保留来源,明确显示最多能出 0 元", () => {
    const state = planned();
    const spentLiving = {
      ...state,
      jars: state.jars.map((jar) => jar.kind === "living" ? { ...jar, actual: jar.planned } : jar),
    };
    const p = previewDecision(spentLiving, { amount: 400_000 });
    expect(p.sources.find((source) => source.jarKind === "living")).toMatchObject({ amount: 0 });
  });

  it("未来罐永不作为差额来源(只进不出,即使有余量)", () => {
    const s = applyJarPlan({
      disposable: 650000,
      livingPlanned: 220000,
      futurePlanned: 50000,
    }).state;
    const p = previewDecision(s, { amount: 500000 });
    expect(p.shortfall).toBeGreaterThan(0);
    expect(p.sources.map((x) => x.jarKind)).not.toContain("future");
  });

  it("梦想罐在来源里 → goalImpact 给两个方向且无禁用词", () => {
    const p = previewDecision(planned(), { amount: 400000 });
    expect(p.goalImpact).toContain("去看海");
    expect(p.goalImpact).toContain("往后 1 个月");
    expect(p.goalImpact).toContain("也可以");
    expect(findForbiddenWords(p.goalImpact!)).toEqual([]);
  });

  it("没有任何罐子:全部为 0/差额=金额;金额非法被拒", () => {
    const empty = applyJarPlan({ disposable: 0, livingPlanned: 0 }).state;
    const p = previewDecision(empty, { amount: 10000 });
    expect(p.comfortAvailable).toBe(0);
    expect(p.shortfall).toBe(10000);
    expect(p.canCoverWithCurrentJars).toBe(false);
    try {
      previewDecision(planned(), { amount: 0 });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("validation_error");
    }
  });

  it("未来罐有钱也不进入差额来源,其余三罐合计不足时返回待确认出口", () => {
    const state = planned();
    const withFuture = {
      ...state,
      jars: state.jars.map((jar) => jar.kind === "future" ? { ...jar, planned: 9999999 } : jar),
    };
    const p = previewDecision(withFuture, { amount: 700000 });
    expect(p.sources.map((source) => source.jarKind)).toEqual(["dream", "living"]);
    expect(p.canCoverWithCurrentJars).toBe(false);
  });
});
