import { describe, expect, it } from "vitest";
import { AppState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { APP_TRANSITIONS, assertTransition, canTransition } from "../machine";

describe("九态转移表", () => {
  it("覆盖全部九态,任何态都能进 SAFETY_EXIT", () => {
    for (const s of AppState.options) {
      expect(APP_TRANSITIONS[s]).toBeDefined();
      if (s !== "SAFETY_EXIT") {
        expect(canTransition(s, "SAFETY_EXIT")).toBe(true);
      }
    }
  });

  it("SAFETY_EXIT 只能回 HOME", () => {
    expect(APP_TRANSITIONS.SAFETY_EXIT).toEqual(["HOME"]);
  });

  it("主闭环路径合法:HOME→DECISION→DEDUCTION_CONFIRM→HOME→FOLLOWUP→REVIEW→PRINCIPLE→HOME", () => {
    const path: AppState[] = [
      "HOME",
      "DECISION",
      "DEDUCTION_CONFIRM",
      "HOME",
      "FOLLOWUP",
      "REVIEW",
      "PRINCIPLE",
      "HOME",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("非法跳转被拒:ONBOARDING → PRINCIPLE", () => {
    try {
      assertTransition("ONBOARDING", "PRINCIPLE");
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("state_conflict");
    }
  });
});
