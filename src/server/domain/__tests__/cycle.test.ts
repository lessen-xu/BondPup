import { describe, expect, it } from "vitest";
import { DomainError } from "@/contracts/errors";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { commitJarDebit } from "../debit";
import { buildCycleReviewProposal, confirmCycleReview, isNewCycle } from "../cycle";

const AUG = new Date("2026-08-15T00:00:00Z");
const SEP = new Date("2026-09-05T00:00:00Z");

/** 2026-08 定的计划:6500 可安排,生活 2200,目标 9600/12 月(月供 800),已放 putIn */
function augustState(putInDream: number) {
  let s = applyJarPlan({
    disposable: 650000,
    livingPlanned: 220000,
    dreamGoal: { name: "去看海", amount: 960000, saved: 0, monthsRemaining: 12 },
    confirmed: true,
    now: AUG,
  }).state;
  if (putInDream > 0) {
    s = commitJarDebit(s, {
      jarKind: "dream",
      amount: putInDream,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "put-dream",
    }).state;
  }
  return s;
}

describe("buildCycleReviewProposal:月供自摊平(提案 §8 三例,单位分)", () => {
  it("还在当前周期 → state_conflict;进入 9 月 → isNewCycle", () => {
    const s = augustState(0);
    expect(isNewCycle(s, AUG)).toBe(false);
    expect(isNewCycle(s, SEP)).toBe(true);
    try {
      buildCycleReviewProposal(s, AUG);
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("state_conflict");
    }
  });

  it("上月放足 800 → 月供持平 800", () => {
    const p = buildCycleReviewProposal(augustState(80000), SEP);
    expect(p.monthsRemaining).toBe(11);
    expect(p.dreamSavedAfterFold).toBe(80000);
    expect(p.dreamMonthly).toBe(80000);
    expect(p.monthlyDirection).toBe("same");
  });

  it("只放了 300 → 845.45(84545 分),方向 up", () => {
    const p = buildCycleReviewProposal(augustState(30000), SEP);
    expect(p.dreamMonthly).toBe(84545);
    expect(p.monthlyDirection).toBe("up");
  });

  it("多放了 1500 → 736.36(73636 分),方向 down", () => {
    const p = buildCycleReviewProposal(augustState(150000), SEP);
    expect(p.dreamMonthly).toBe(73636);
    expect(p.monthlyDirection).toBe("down");
  });

  it("沿用数字与上期结余明细正确", () => {
    const p = buildCycleReviewProposal(augustState(80000), SEP);
    expect(p.livingPlanned).toBe(220000);
    expect(p.comfortPrevious).toBe(350000);
    // 结余:living 2200 全剩 + comfort 3500 全剩 + dream 800−800=0
    expect(p.leftover.total).toBe(220000 + 350000);
  });
});

describe("confirmCycleReview", () => {
  it("确认后:恒等式成立、saved 已折算、actual 清零、结余并入碎钻、周期为 2026-09", () => {
    const s = augustState(80000);
    const r = confirmCycleReview(s, {
      disposable: 650000,
      livingPlanned: 220000,
      dreamMonthly: 80000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "cycle-1",
      now: SEP,
    });
    const st = r.state;
    expect(st.cycle?.cycle).toBe("2026-09");
    expect(st.cycle?.confirmedAt).toBeDefined();
    const sum = st.jars.reduce((acc, j) => acc + j.planned, 0);
    expect(sum).toBe(650000);
    const dream = st.jars.find((j) => j.kind === "dream")!;
    expect(dream.goal?.saved).toBe(80000);
    expect(dream.planned).toBe(80000);
    expect(st.jars.every((j) => j.actual === 0)).toBe(true);
    expect(st.leftover.amount).toBe(220000 + 350000);
    expect(st.leftover.history.map((h) => h.fromJar).sort()).toEqual(["comfort", "living"]);
  });

  it("用户改月供为 0(这个月一分不想放)完全合法,余数进安心罐", () => {
    const s = augustState(30000);
    const r = confirmCycleReview(s, {
      disposable: 650000,
      livingPlanned: 220000,
      dreamMonthly: 0,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "cycle-1",
      now: SEP,
    });
    const dream = r.state.jars.find((j) => j.kind === "dream")!;
    expect(dream.planned).toBe(0);
    expect(dream.goal?.saved).toBe(30000);
    expect(r.state.jars.find((j) => j.kind === "comfort")!.planned).toBe(650000 - 220000);
  });

  it("幂等重放不重复执行", () => {
    const s = augustState(0);
    const r1 = confirmCycleReview(s, {
      disposable: 650000,
      livingPlanned: 220000,
      dreamMonthly: 80000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "cycle-1",
      now: SEP,
    });
    const r2 = confirmCycleReview(r1.state, {
      disposable: 650000,
      livingPlanned: 220000,
      expectedStateVersion: 999,
      idempotencyKey: "cycle-1",
      now: SEP,
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.state.stateVersion).toBe(r1.state.stateVersion);
  });
});
