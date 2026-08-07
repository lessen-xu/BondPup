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

  it("不够买:差额正确,来源不含安心罐、罐子固有顺序、0 可用不列", () => {
    const p = previewDecision(planned(), { amount: 400000 });
    expect(p.remaining).toBe(0);
    expect(p.shortfall).toBe(50000);
    expect(p.sources.map((s) => s.jarKind)).toEqual(["living", "dream"]);
    expect(p.sources[0].amount).toBe(220000);
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
    try {
      previewDecision(planned(), { amount: 0 });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("validation_error");
    }
  });
});
