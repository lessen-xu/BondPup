import { describe, expect, it } from "vitest";
import { DomainError } from "@/contracts/errors";
import { balanceComfortJar, compareJarAllocation, computeComfortCandidate, computeJars } from "../jars";
import { computeLivingJar } from "../living";

describe("computeJars 四罐恒等式", () => {
  it("基准例:6500 = 2200 + 3500 + 800 + 0,余数进安心罐", () => {
    const r = computeJars({ disposable: 650000, livingPlanned: 220000, dreamMonthly: 80000 });
    expect(r).toEqual({ living: 220000, comfort: 350000, dream: 80000, future: 0, shortfall: 0 });
    expect(r.living + r.comfort + r.dream + r.future).toBe(650000);
  });

  it("恒等式在任意合法输入下成立(余数恒为安心罐)", () => {
    const cases = [
      { disposable: 650000, livingPlanned: 0, dreamMonthly: 0, futurePlanned: 0 },
      { disposable: 100000, livingPlanned: 99999, dreamMonthly: 1, futurePlanned: 0 },
      { disposable: 314159, livingPlanned: 120000, dreamMonthly: 45000, futurePlanned: 50000 },
    ];
    for (const c of cases) {
      const r = computeJars(c);
      expect(r.living + r.comfort + r.dream + r.future).toBe(c.disposable);
      expect(r.shortfall).toBe(0);
    }
  });

  it("未来罐默认 0 且不自动接收余数", () => {
    const r = computeJars({ disposable: 650000, livingPlanned: 220000, dreamMonthly: 0 });
    expect(r.future).toBe(0);
    expect(r.comfort).toBe(430000);
  });

  it("缺口:固定项超出可安排金额 → comfort=0、shortfall>0、其他罐不被改动(不级联)", () => {
    const r = computeJars({ disposable: 200000, livingPlanned: 220000, dreamMonthly: 80000 });
    expect(r.comfort).toBe(0);
    expect(r.shortfall).toBe(100000);
    expect(r.living).toBe(220000);
    expect(r.dream).toBe(80000);
    expect(r.living + r.comfort + r.dream + r.future - r.shortfall).toBe(200000);
  });

  it("候选安心罐可显示负余项,但不写入状态", () => {
    expect(computeComfortCandidate({ disposable: 1_500_000, livingPlanned: 220_000, dreamMonthly: 4_166_667 })).toBe(-2_886_667);
  });

  it("非法输入(负数/非整数)→ validation_error", () => {
    expect(() => computeJars({ disposable: -1, livingPlanned: 0 })).toThrowError(DomainError);
    try {
      computeJars({ disposable: 1000.5, livingPlanned: 0 });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("validation_error");
    }
  });
});

describe("四罐候选方案差额", () => {
  it("只在用户候选金额与可安排金额不一致时返回差额", () => {
    expect(compareJarAllocation({ disposable: 650000, living: 220000, comfort: 350000, dream: 80000, future: 0 }))
      .toEqual({ total: 650000, missing: 0, excess: 0 });
    expect(compareJarAllocation({ disposable: 650000, living: 200000, comfort: 350000, dream: 80000, future: 0 }))
      .toEqual({ total: 630000, missing: 20000, excess: 0 });
  });

  it("平账只调整安心罐", () => {
    expect(balanceComfortJar({ disposable: 650000, living: 200000, comfort: 350000, dream: 80000, future: 0 }))
      .toEqual({ comfort: 370000, total: 650000, missing: 0, excess: 0 });
  });
});

describe("computeLivingJar 纯加法清单", () => {
  it("填几项算几项", () => {
    expect(computeLivingJar({ rent: 220000, food: 100000 })).toBe(320000);
  });
  it("全空 = 0(不给参考值,空着就是空着)", () => {
    expect(computeLivingJar({})).toBe(0);
  });
  it("负数 → validation_error", () => {
    expect(() => computeLivingJar({ rent: -1 })).toThrowError(DomainError);
  });
});
