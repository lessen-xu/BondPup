import { describe, expect, it } from "vitest";
import { MoneyState } from "@/contracts";
import { DomainError } from "@/contracts/errors";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { commitJarDebit } from "../debit";
import { computeCycleLeftover, moveLeftover } from "../leftover";

function stateWithLeftover(amount: number): MoneyState {
  const s = applyJarPlan({
    disposable: 650000,
    livingPlanned: 220000,
    dreamGoal: { name: "去看海", amount: 960000, saved: 0, monthsRemaining: 12 },
  }).state;
  return MoneyState.parse({
    ...s,
    leftover: { amount, history: [{ cycle: "2026-07", amount, fromJar: "comfort" }] },
  });
}

describe("computeCycleLeftover", () => {
  it("逐罐正余数;花掉的部分不算;future 不参与", () => {
    let s = stateWithLeftover(0);
    s = commitJarDebit(s, {
      jarKind: "comfort",
      amount: 300000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "d1",
    }).state;
    const lo = computeCycleLeftover(s);
    // living 2200 全剩 + comfort 3500−3000=500 剩 + dream 800 未放全剩
    expect(lo.total).toBe(220000 + 50000 + 80000);
    expect(lo.entries.map((e) => e.fromJar).sort()).toEqual(["comfort", "dream", "living"]);
  });
});

describe("moveLeftover", () => {
  it("部分挪入安心罐:金额守恒(碎钻减多少,罐子加多少),明细留作来源", () => {
    const s = stateWithLeftover(30000);
    const before = s.jars.find((j) => j.kind === "comfort")!.planned;
    const r = moveLeftover(s, {
      toKind: "comfort",
      amount: 10000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "m1",
    });
    expect(r.state.leftover.amount).toBe(20000);
    expect(r.state.jars.find((j) => j.kind === "comfort")!.planned).toBe(before + 10000);
    expect(r.state.leftover.history).toHaveLength(1);
    expect(r.movedNote).toContain("松一点");
  });

  it("挪入后四罐恒等式保持:Σplanned === cycle.disposable(曾实测 66 万≠65 万)", () => {
    const s = stateWithLeftover(30000);
    const r = moveLeftover(s, {
      toKind: "comfort",
      amount: 10000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "m-id",
    });
    const sumPlanned = r.state.jars.reduce((sum, j) => sum + j.planned, 0);
    expect(sumPlanned).toBe(r.state.cycle!.disposable);
    expect(r.state.cycle!.disposable).toBe(650000 + 10000);
  });

  it("挪入梦想罐走 actual:planned 与 disposable 都不变", () => {
    const s = stateWithLeftover(30000);
    const r = moveLeftover(s, {
      toKind: "dream",
      amount: 10000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "m-dream-id",
    });
    expect(r.state.cycle!.disposable).toBe(650000);
    const sumPlanned = r.state.jars.reduce((sum, j) => sum + j.planned, 0);
    expect(sumPlanned).toBe(650000);
  });

  it("挪入未来罐:planned 增加(用户主动,不是系统自动转;四罐契约下罐必已存在)", () => {
    const s = stateWithLeftover(30000);
    expect(s.jars.find((j) => j.kind === "future")!.planned).toBe(0);
    const r = moveLeftover(s, {
      toKind: "future",
      amount: 30000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "m1",
    });
    const future = r.state.jars.find((j) => j.kind === "future")!;
    expect(future.planned).toBe(30000);
    expect(r.state.leftover.amount).toBe(0);
  });

  it("挪入梦想罐:计入本期已放(actual),不动 planned", () => {
    const s = stateWithLeftover(30000);
    const r = moveLeftover(s, {
      toKind: "dream",
      amount: 20000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "m1",
    });
    const dream = r.state.jars.find((j) => j.kind === "dream")!;
    expect(dream.actual).toBe(20000);
    expect(dream.planned).toBe(80000);
  });

  it("超过碎钻总额 → state_conflict;重放幂等", () => {
    const s = stateWithLeftover(10000);
    try {
      moveLeftover(s, {
        toKind: "comfort",
        amount: 20000,
        expectedStateVersion: s.stateVersion,
        idempotencyKey: "m1",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("state_conflict");
    }
    const ok = moveLeftover(s, {
      toKind: "comfort",
      amount: 10000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "m2",
    });
    const replay = moveLeftover(ok.state, {
      toKind: "comfort",
      amount: 10000,
      expectedStateVersion: 999,
      idempotencyKey: "m2",
    });
    expect(replay.idempotent).toBe(true);
    expect(replay.state.leftover.amount).toBe(0);
  });
});
