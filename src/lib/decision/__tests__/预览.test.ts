import { describe, expect, it } from "vitest";
import { mockMoneyState } from "@/lib/mock/money-state";
import { previewDecision } from "@/lib/plan/preview-decision";

/** 夹具是演示数据:安心罐 3500 已花 399(那双鞋)、生活罐 2200 已花 1900、梦想罐月供 800 已放。
 *  可用金额一律 planned - actual。 */
describe("previewDecision", () => {
  it("只用安心罐展示可用金额和购买后的金额", () => {
    const before = structuredClone(mockMoneyState);

    expect(previewDecision(mockMoneyState, { amount: 120_000 })).toEqual({
      comfortAvailable: 310_100,
      remaining: 190_100,
      shortfall: 0,
      sources: [],
      canCoverWithCurrentJars: true,
      goalImpact: undefined,
    });
    expect(mockMoneyState).toEqual(before);
  });

  it("差额来源由后端提供;梦想罐月供已放完时只剩生活罐可选", () => {
    const result = previewDecision(mockMoneyState, { amount: 400_000 });

    expect(result).toMatchObject({
      comfortAvailable: 310_100,
      remaining: 0,
      shortfall: 89_900,
      sources: [{ jarKind: "living", label: "生活罐", amount: 30_000 }],
    });
  });
});
