import { z } from "zod";
import { AgentReply } from "@/contracts";

/**
 * Agent 任务面(模型只做这些;金额永远不经过模型):
 * - decompose_wish:起点第③步,把模糊愿望拆成 3-4 条可修改的「在意的事」
 * - companion_reply:点小狗/决策/说一笔时的短回应(≤3 句,先情绪后数字)
 * - generate_principle:基于 ≥3 条已回看故事生成一条候选原则(证据必须可追溯)
 */
export const DecomposeWishInput = z.object({
  task: z.literal("decompose_wish"),
  wish: z.string().min(1).max(500),
  nearChoice: z.string().max(100).optional(),
});

export const CompanionReplyInput = z.object({
  task: z.literal("companion_reply"),
  scene: z.enum(["greet", "decision", "note"]),
  userText: z.string().max(500).optional(),
  /** 只传最小摘要,不传完整倾诉原文 */
  stateSummary: z
    .object({
      comfortAvailable: z.number().int().optional(),
      hasCycle: z.boolean().optional(),
      updatedAt: z.string().optional(),
    })
    .optional(),
});

export const GeneratePrincipleInput = z.object({
  task: z.literal("generate_principle"),
  /** 已回看故事的最小摘要(不传完整倾诉原文) */
  stories: z
    .array(
      z.object({
        id: z.string(),
        intent: z.string(),
        action: z.string(),
        happened: z.boolean().optional(),
        feelingNote: z.string().optional(),
      })
    )
    .min(3),
  /** 已确认原则(防重复;冲突时并列不覆盖,由用户选) */
  existingStatements: z.array(z.string()).default([]),
  /** 重试轮次(校验失败重试一次时 +1,让生成结果变化) */
  attempt: z.number().int().min(0).default(0),
});

export const AgentTaskInput = z.discriminatedUnion("task", [
  DecomposeWishInput,
  CompanionReplyInput,
  GeneratePrincipleInput,
]);
export type AgentTaskInput = z.infer<typeof AgentTaskInput>;

export const DecomposeWishOutput = z.object({
  concerns: z.array(z.string().min(1)).min(3).max(4),
});
export type DecomposeWishOutput = z.infer<typeof DecomposeWishOutput>;

export const GeneratePrincipleOutput = z.object({
  /** 第一人称、描述倾向、带暂时语气、≤25 字(校验在 safety 层强制) */
  statement: z.string().min(1),
  evidenceIds: z.array(z.string()).min(2).max(3),
});
export type GeneratePrincipleOutput = z.infer<typeof GeneratePrincipleOutput>;

export type AgentTaskOutput =
  | { task: "decompose_wish"; result: DecomposeWishOutput }
  | { task: "companion_reply"; result: AgentReply }
  | { task: "generate_principle"; result: GeneratePrincipleOutput };
