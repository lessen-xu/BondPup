import { describe, expect, it } from "vitest";
import { runAgentTask } from "@/server/agent";
import { applyJarPlan } from "@/lib/plan/apply-jar-plan";
import { findForbiddenWords, validateReplyText } from "../validate";
import { detectSafetyRisk, recordSafetyEvent, safetyReplyFor } from "../risk";

describe("detectSafetyRisk 输入闸", () => {
  it("自伤 / 借贷 / 投资分别命中,普通消费不命中", () => {
    expect(detectSafetyRisk("最近觉得活着没意思,不想活了")?.riskType).toBe("self_harm");
    expect(detectSafetyRisk("我想开个网贷把这个月撑过去")?.riskType).toBe("debt_loan");
    expect(detectSafetyRisk("要不要拿工资去炒股翻倍")?.riskType).toBe("investment");
    expect(detectSafetyRisk("同事约我出去玩花了 400,有点后悔")).toBeNull();
  });
});

describe("safetyReplyFor 安全回应", () => {
  it("四类回应全部通过语气校验(无禁用词、≤3 句)", () => {
    for (const t of ["self_harm", "debt_loan", "investment", "generic_emotion"] as const) {
      const reply = safetyReplyFor(t);
      expect(validateReplyText(reply.text)).toEqual([]);
      expect(findForbiddenWords(reply.text)).toEqual([]);
      expect(reply.safety?.flagged).toBe(true);
    }
  });
  it("只有自伤进入 SAFETY_EXIT", () => {
    expect(safetyReplyFor("self_harm").safety?.exit).toBe(true);
    expect(safetyReplyFor("debt_loan").safety?.exit).toBe(false);
    expect(safetyReplyFor("investment").safety?.exit).toBe(false);
  });
});

describe("recordSafetyEvent 审计", () => {
  it("事件入链、版本 +1、不含用户原文字段", () => {
    const s = applyJarPlan({ disposable: 650000, livingPlanned: 220000 }).state;
    const audited = recordSafetyEvent(
      s,
      { riskType: "debt_loan", triggeredRule: "debt_loan_keywords" },
      "safety_reply"
    );
    expect(audited.safetyEvents).toHaveLength(1);
    expect(audited.stateVersion).toBe(s.stateVersion + 1);
    const keys = Object.keys(audited.safetyEvents[0]);
    expect(keys.sort()).toEqual(["createdAt", "id", "responseTaken", "riskType", "triggeredRule"]);
  });
});

describe("runAgentTask 两道闸", () => {
  it("companion_reply 带风险文本 → 安全回应,不给购买建议", async () => {
    const out = await runAgentTask({
      task: "companion_reply",
      scene: "decision",
      userText: "还不上花呗了,要不要再借点",
      stateSummary: { comfortAvailable: 350000 },
    });
    expect(out.task).toBe("companion_reply");
    if (out.task === "companion_reply") {
      expect(out.result.safety?.flagged).toBe(true);
      expect(out.result.text).not.toContain("安心罐还有");
    }
  });

  it("decompose_wish 带自伤文本 → 以 companion_reply 形态返回 SAFETY_EXIT", async () => {
    const out = await runAgentTask({
      task: "decompose_wish",
      wish: "感觉活不下去了,钱怎么安排都无所谓",
    });
    expect(out.task).toBe("companion_reply");
    if (out.task === "companion_reply") {
      expect(out.result.safety?.exit).toBe(true);
    }
  });

  it("正常输入照常走任务;Mock 输出全部通过输出闸", async () => {
    const wish = await runAgentTask({ task: "decompose_wish", wish: "想存点钱也想过得舒服" });
    expect(wish.task).toBe("decompose_wish");
    for (const scene of ["greet", "decision", "note"] as const) {
      const out = await runAgentTask({
        task: "companion_reply",
        scene,
        stateSummary: { comfortAvailable: 350000 },
      });
      if (out.task === "companion_reply") {
        expect(validateReplyText(out.result.text)).toEqual([]);
      }
    }
  });
});
