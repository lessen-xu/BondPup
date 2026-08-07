import { describe, expect, it } from "vitest";
import { DomainError } from "@/contracts/errors";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { commitJarDebit, undoJarDebit } from "../debit";

function planState() {
  return applyJarPlan({
    disposable: 650000,
    livingPlanned: 220000,
    dreamGoal: { name: "去看海", amount: 960000, saved: 0, monthsRemaining: 12 },
  }).state;
}

describe("commitJarDebit 扣罐", () => {
  it("正常扣:actual 增加、版本 +1、其他罐不动(不级联)", () => {
    const s = planState();
    const r = commitJarDebit(s, {
      jarKind: "comfort",
      amount: 40000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "op-1",
    });
    const comfort = r.state.jars.find((j) => j.kind === "comfort")!;
    expect(comfort.actual).toBe(40000);
    expect(comfort.planned).toBe(350000);
    expect(r.state.stateVersion).toBe(s.stateVersion + 1);
    expect(r.overPlan).toBe(0);
    expect(r.state.jars.find((j) => j.kind === "living")!.actual).toBe(0);
    expect(r.state.jars.find((j) => j.kind === "dream")!.actual).toBe(0);
  });

  it("幂等重放:同 key 第二次原样返回,不重复扣", () => {
    const s = planState();
    const r1 = commitJarDebit(s, {
      jarKind: "comfort",
      amount: 40000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "op-1",
    });
    const r2 = commitJarDebit(r1.state, {
      jarKind: "comfort",
      amount: 40000,
      expectedStateVersion: 999,
      idempotencyKey: "op-1",
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.state.jars.find((j) => j.kind === "comfort")!.actual).toBe(40000);
    expect(r2.state.stateVersion).toBe(r1.state.stateVersion);
  });

  it("版本冲突 → state_conflict", () => {
    const s = planState();
    try {
      commitJarDebit(s, {
        jarKind: "comfort",
        amount: 100,
        expectedStateVersion: s.stateVersion + 5,
        idempotencyKey: "op-x",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("state_conflict");
    }
  });

  it("罐子不存在 → not_found(未来罐未开启)", () => {
    const s = planState();
    try {
      commitJarDebit(s, {
        jarKind: "future",
        amount: 100,
        expectedStateVersion: s.stateVersion,
        idempotencyKey: "op-x",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("not_found");
    }
  });

  it("允许 actual 超过 planned:不报错,overPlan 报告差值", () => {
    const s = planState();
    const r = commitJarDebit(s, {
      jarKind: "comfort",
      amount: 360000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "op-big",
    });
    expect(r.overPlan).toBe(10000);
  });
});

describe("undoJarDebit 撤销", () => {
  it("扣→撤销:金额守恒、扣罐 key 移除、撤销自身 key 入账、版本 +1", () => {
    const s = planState();
    const r = commitJarDebit(s, {
      jarKind: "comfort",
      amount: 40000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "op-1",
    });
    const u = undoJarDebit(r.state, r.undoToken, {
      expectedStateVersion: r.state.stateVersion,
      idempotencyKey: "undo-1",
    });
    expect(u.undoneKey).toBe("op-1");
    expect(u.state.jars.find((j) => j.kind === "comfort")!.actual).toBe(0);
    expect(u.state.appliedOps).not.toContain("op-1");
    expect(u.state.appliedOps).toContain("undo-1");
    expect(u.state.stateVersion).toBe(r.state.stateVersion + 1);
  });

  it("撤销自身幂等:同 key 重试原样返回;换 key 再撤 → not_found", () => {
    const s = planState();
    const r = commitJarDebit(s, {
      jarKind: "comfort",
      amount: 40000,
      expectedStateVersion: s.stateVersion,
      idempotencyKey: "op-1",
    });
    const u = undoJarDebit(r.state, r.undoToken, {
      expectedStateVersion: r.state.stateVersion,
      idempotencyKey: "undo-1",
    });
    const replay = undoJarDebit(u.state, r.undoToken, {
      expectedStateVersion: 999,
      idempotencyKey: "undo-1",
    });
    expect(replay.idempotent).toBe(true);
    expect(replay.state.stateVersion).toBe(u.state.stateVersion);
    try {
      undoJarDebit(u.state, r.undoToken, {
        expectedStateVersion: u.state.stateVersion,
        idempotencyKey: "undo-2",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("not_found");
    }
  });

  it("伪造/畸形令牌 → validation_error", () => {
    const s = planState();
    for (const bad of ["nonsense", "undo:v1:comfort", "undo:v1:comfort:abc:op-1", "undo:v1:closet:100:op-1"]) {
      try {
        undoJarDebit(s, bad, { expectedStateVersion: s.stateVersion, idempotencyKey: "u" });
        expect.unreachable();
      } catch (e) {
        expect((e as DomainError).code).toBe("validation_error");
      }
    }
  });
});
