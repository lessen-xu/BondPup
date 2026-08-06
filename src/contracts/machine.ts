import { z } from "zod";

/** 状态机九态(v7.4 冻结) */
export const AppState = z.enum([
  "ONBOARDING",
  "HOME",
  "DECISION",
  "DEDUCTION_CONFIRM",
  "CYCLE_REVIEW",
  "FOLLOWUP",
  "REVIEW",
  "PRINCIPLE",
  "SAFETY_EXIT",
]);
export type AppState = z.infer<typeof AppState>;

export const AgentProposal = z.object({
  kind: z.enum(["plan_jars", "debit", "principle"]),
  payload: z.unknown(),
});
export type AgentProposal = z.infer<typeof AgentProposal>;

/**
 * Agent 回应契约:金额=代码算,理由=模型写,改变状态必须用户确认。
 * 句数(≤3)与禁用词校验在 safety 层做(8/9),不进 schema。
 */
export const AgentReply = z.object({
  text: z.string(),
  bubbles: z.array(z.string()).max(2).optional(),
  proposal: AgentProposal.optional(),
  requiresConfirmation: z.boolean(),
  safety: z
    .object({
      flagged: z.boolean(),
      exit: z.boolean().optional(),
    })
    .optional(),
});
export type AgentReply = z.infer<typeof AgentReply>;
