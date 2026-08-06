import type { MoneyState } from "@/contracts";
import { validatePrincipleCandidate } from "@/server/safety/validate";
import { principleContext, principleEligible } from "@/server/domain/principle";
import type { AgentTaskInput, AgentTaskOutput, GeneratePrincipleOutput } from "./types";
import { runMockAgentTask } from "./mock";

/**
 * Agent 入口。provider 选择:
 * - ANTHROPIC_API_KEY 存在 → Claude 原生 /v1/messages(计划接入:Sonnet 5 + adaptive thinking + effort low)
 * - OPENAI_COMPAT_API_KEY 存在 → 国产模型 OpenAI 兼容端点
 * - 都没有 → 确定性 Mock(评测「无密钥可跑」要求;也是超时/失败的降级路径)
 * 今天(Day-2)只有 Mock;真实适配层接入时此函数签名不变。
 */
export async function runAgentTask(input: AgentTaskInput): Promise<AgentTaskOutput> {
  return runMockAgentTask(input);
}

type PrincipleGenerator = (
  input: Extract<AgentTaskInput, { task: "generate_principle" }>
) => Promise<GeneratePrincipleOutput>;

const defaultGenerator: PrincipleGenerator = async (input) => {
  const out = await runAgentTask(input);
  if (out.task !== "generate_principle") throw new Error("unexpected task output");
  return out.result;
};

/**
 * 候选原则编排:资格检查 → 生成 → safety 校验 → 失败重试一次 → 再失败返回 null(静默不提)。
 * 一条像贴标签的原则,伤害比没有原则大——所以宁缺毋滥。
 * generator 可注入(测试用);接真模型后默认走 runAgentTask,编排不变。
 */
export async function generatePrincipleCandidate(
  state: MoneyState,
  generator: PrincipleGenerator = defaultGenerator
): Promise<GeneratePrincipleOutput | null> {
  if (!principleEligible(state)) return null;
  const { evidence, existingStatements } = principleContext(state);
  const baseInput = {
    task: "generate_principle" as const,
    stories: evidence.map((s) => ({
      id: s.id,
      intent: s.intent,
      action: s.action,
      ...(s.outcome ? { happened: s.outcome.happened } : {}),
      ...(s.outcome?.feelingNote ? { feelingNote: s.outcome.feelingNote } : {}),
    })),
    existingStatements,
    attempt: 0,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const candidate = await generator({ ...baseInput, attempt });
      if (validatePrincipleCandidate(candidate, state.stories).length === 0) {
        return candidate;
      }
    } catch {
      // 生成失败与校验失败同等对待:重试一次,再失败静默
    }
  }
  return null;
}
