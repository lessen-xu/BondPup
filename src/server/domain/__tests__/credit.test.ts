import { describe, expect, it } from "vitest";
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
});
