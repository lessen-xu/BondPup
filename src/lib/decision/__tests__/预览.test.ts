import { describe, expect, it } from "vitest";
import { mockMoneyState } from "@/lib/mock/money-state";
import { previewDecisionLocal } from "../预览";

describe("previewDecisionLocal", () => {
  it("只用安心罐展示可用金额和购买后的金额", () => {
    const before = structuredClone(mockMoneyState);

    expect(previewDecisionLocal(mockMoneyState, { amount: 120_000 })).toEqual({
      comfortAvailable: 350_000,
      remaining: 230_000,
      shortfall: 0,
      sources: undefined,
      goalImpact: undefined,
    });
    expect(mockMoneyState).toEqual(before);
  });

  it("差额只展示数值,不编造来源和目标影响", () => {
    expect(previewDecisionLocal(mockMoneyState, { amount: 400_000 })).toEqual({
      comfortAvailable: 350_000,
      remaining: 0,
      shortfall: 50_000,
      sources: undefined,
      goalImpact: undefined,
    });
  });
});
