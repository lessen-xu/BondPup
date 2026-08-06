import { describe, expect, it } from "vitest";
import { DomainError } from "@/contracts/errors";
import { computeMonthlyContribution } from "../monthly";

describe("computeMonthlyContribution 月供公式(单位:分)", () => {
  it("基准:9600 元 / 12 月 → 800 元", () => {
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 0 }, monthsRemaining: 12 })).toBe(80000);
  });

  it("自摊平:第 2 月按上月实际重算", () => {
    // 已放 800 元 → 持平 800
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 80000 }, monthsRemaining: 11 })).toBe(80000);
    // 只放 300 元 → 845.45 元 → round 845.45 元 = 84545 分
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 30000 }, monthsRemaining: 11 })).toBe(84545);
    // 多放 1500 元 → 736.36 元 → 73636 分
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 150000 }, monthsRemaining: 11 })).toBe(73636);
  });

  it("零月份:除数取 1,返回全部差值", () => {
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 100000 }, monthsRemaining: 0 })).toBe(860000);
  });

  it("已存 ≥ 目标:负差额归零", () => {
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 960000 }, monthsRemaining: 6 })).toBe(0);
    expect(computeMonthlyContribution({ goal: { amount: 960000, saved: 1000000 }, monthsRemaining: 6 })).toBe(0);
  });

  it("超能力月供不截断(取舍由 computeJars.shortfall 暴露)", () => {
    expect(computeMonthlyContribution({ goal: { amount: 100000000, saved: 0 }, monthsRemaining: 2 })).toBe(50000000);
  });

  it("非法输入 → validation_error", () => {
    try {
      computeMonthlyContribution({ goal: { amount: -1, saved: 0 }, monthsRemaining: 12 });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("validation_error");
    }
  });
});
