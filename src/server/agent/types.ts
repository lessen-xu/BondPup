import { z } from "zod";
import { AgentReply } from "@/contracts";

/**
 * Agent 任务面(模型只做这些;金额永远不经过模型):
 * - decompose_wish:起点第③步,把模糊愿望拆成 3-4 条可修改的「在意的事」
 * - companion_reply:点小狗/决策/说一笔时的短回应(≤3 句,先情绪后数字)
 */
export const DecomposeWishInput = z.object({
  task: z.literal("decompose_wish"),
  wish: z.string().min(1),
  nearChoice: z.string().optional(),
});

export const CompanionReplyInput = z.object({
  task: z.literal("companion_reply"),
  scene: z.enum(["greet", "decision", "note"]),
  userText: z.string().optional(),
  /** 只传最小摘要,不传完整倾诉原文 */
  stateSummary: z
    .object({
      comfortAvailable: z.number().int().optional(),
      hasCycle: z.boolean().optional(),
      updatedAt: z.string().optional(),
    })
    .optional(),
});

export const AgentTaskInput = z.discriminatedUnion("task", [
  DecomposeWishInput,
  CompanionReplyInput,
]);
export type AgentTaskInput = z.infer<typeof AgentTaskInput>;

export const DecomposeWishOutput = z.object({
  concerns: z.array(z.string().min(1)).min(3).max(4),
});
export type DecomposeWishOutput = z.infer<typeof DecomposeWishOutput>;

export type AgentTaskOutput =
  | { task: "decompose_wish"; result: DecomposeWishOutput }
  | { task: "companion_reply"; result: AgentReply };
