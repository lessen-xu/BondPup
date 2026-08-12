import { describe, expect, it } from "vitest";
import { mockMoneyState } from "@/lib/mock/money-state";
import { previewDecision } from "@/lib/plan/preview-decision";

/** 夹具是演示数据:安心罐 3500 已花 2000、生活罐 2200 已花 1900、梦想罐月供 800 已放。
 *  可用金额一律 planned - actual;安心罐余 1500,输两三千即可触发差额分支(路演动线)。 */
describe("previewDecision", () => {
  it("只用安心罐展示可用金额和购买后的金额", () => {
    const before = structuredClone(mockMoneyState);

    expect(previewDecision(mockMoneyState, { amount: 120_000 })).toEqual({
      comfortAvailable: 150_000,
      remaining: 30_000,
      shortfall: 0,
      sources: [],
      canCoverWithCurrentJars: true,
      goalImpact: undefined,
    });
    expect(mockMoneyState).toEqual(before);
  });

  it("演示动线:输 2500 触发差额分支,来源含梦想罐(带目标影响)与生活罐", () => {
    const result = previewDecision(mockMoneyState, { amount: 250_000 });

    expect(result).toMatchObject({
      comfortAvailable: 150_000,
      remaining: 0,
      shortfall: 100_000,
      sources: [
        { jarKind: "dream", label: "去看海", amount: 80_000 },
        { jarKind: "living", label: "生活罐", amount: 30_000 },
      ],
      canCoverWithCurrentJars: true,
    });
    expect(result.goalImpact).toContain("去看海");
  });
});
