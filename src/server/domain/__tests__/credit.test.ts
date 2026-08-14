import { describe, expect, it } from "vitest";
import { OPS_WINDOW } from "@/contracts/state";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { commitJarCredit } from "../credit";

describe("commitJarCredit", () => {
  it("进账同时增加收入和用户选中的罐子", () => {
    const initial = applyJarPlan({ disposable: 650_000, livingPlanned: 220_000, confirmed: true }).state;
    const result = commitJarCredit(initial, {
      jarKind: "comfort",
      amount: 100_000,
      expectedStateVersion: initial.stateVersion,
      idempotencyKey: "credit-1",
    });
    expect(result.state.cycle?.disposable).toBe(750_000);
    expect(result.state.jars.find((jar) => jar.kind === "comfort")?.planned).toBe(530_000);
    expect(result.state.jars.reduce((sum, jar) => sum + jar.planned, 0)).toBe(750_000);
  });

  it("进账不塌缩幂等窗口:appliedOps 按 OPS_WINDOW 保留,不退回 20", () => {
    // appliedOps 是全局共享列表,credit 曾用 slice(-19) 自成一套,
    // 一次进账就把扣罐/故事/周期确认的重放保护一起截断到 20 条。
    const initial = applyJarPlan({ disposable: 650_000, livingPlanned: 220_000, confirmed: true }).state;
    const older = Array.from({ length: 50 }, (_, i) => `op-${i}`);
    const result = commitJarCredit(
      { ...initial, appliedOps: older },
      { jarKind: "comfort", amount: 100_000, expectedStateVersion: initial.stateVersion, idempotencyKey: "credit-1" }
    );
    expect(result.state.appliedOps).toHaveLength(older.length + 1);
    expect(result.state.appliedOps).toContain("op-0");
    expect(result.state.appliedOps.at(-1)).toBe("credit-1");
    expect(OPS_WINDOW).toBeGreaterThan(older.length); // 窗口本身没被改小
  });
});
