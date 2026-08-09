import { describe, expect, it } from "vitest";
import { mockMoneyState } from "@/lib/mock/money-state";
import { previewDecision } from "@/lib/plan/preview-decision";

describe("previewDecision", () => {
  it("只用安心罐展示可用金额和购买后的金额", () => {
    const before = structuredClone(mockMoneyState);

    expect(previewDecision(mockMoneyState, { amount: 120_000 })).toEqual({
      comfortAvailable: 350_000,
      remaining: 230_000,
      shortfall: 0,
      sources: [],
      canCoverWithCurrentJars: true,
      goalImpact: undefined,
    });
    expect(mockMoneyState).toEqual(before);
  });

  it("差额来源由后端按梦想罐、生活罐顺序提供", () => {
    const result = previewDecision(mockMoneyState, { amount: 400_000 });

    expect(result).toMatchObject({
      comfortAvailable: 350_000,
      remaining: 0,
      shortfall: 50_000,
      sources: [
        { jarKind: "dream", label: "去看海", amount: 80_000 },
        { jarKind: "living", label: "生活罐", amount: 220_000 },
      ],
    });
    expect(result.goalImpact).toContain("去看海");
  });
});
