import type { AgentReply, MoneyState } from "@/contracts";
import { validatePrincipleCandidate, validateReplyText } from "@/server/safety/validate";
import { detectSafetyRisk, safetyReplyFor } from "@/server/safety/risk";
import { principleContext, principleEligible } from "@/server/domain/principle";
import type { AgentTaskInput, AgentTaskOutput, GeneratePrincipleOutput } from "./types";
import { runMockAgentTask } from "./mock";
import { runAnthropicTask, runCompatTask } from "./providers";

/**
 * Agent 入口。provider 按环境变量选择:
 * ANTHROPIC_API_KEY → Claude 原生 /v1/messages;OPENAI_COMPAT_API_KEY → 国产兼容端点;
 * 都没有或调用失败/超时 → 确定性 Mock(评测「无密钥可跑」要求,也是降级路径)。
 */
/** 输出闸兜底文案(无禁用词、一句话):回应两次校验不过就用它,不让违规文本出门 */
const SAFE_FALLBACK: AgentReply = {
  text: "我在这儿,你说的我记下了。我们慢慢来。",
  requiresConfirmation: false,
};

export type AgentProvider = "anthropic" | "compat" | "mock";

/** 页面安全分流标记(与 safetyEvent 同源派生;字段名是 API→组件契约,受测试锁定) */
export type AgentSafetyFlag = "crisis" | "debt" | "invest" | "offTopic";

const SAFETY_FLAG: Record<string, AgentSafetyFlag> = {
  self_harm: "crisis",
  debt_loan: "debt",
  investment: "invest",
  generic_emotion: "offTopic",
};

export type AgentRunOutput = AgentTaskOutput & {
  provider?: AgentProvider;
  /** 输入闸命中时的页面分流标记(crisis 进 SAFETY_EXIT,offTopic 进想聊聊分支) */
  safetyFlags?: AgentSafetyFlag[];
  /** 输入闸命中时的审计草稿(不含原文);持有 moneyState 的一方用 recordSafetyEvent 写入 */
  safetyEvent?: { riskType: string; triggeredRule: string; responseTaken: string };
  /** 真实 provider 失败降级 Mock 时的原因(不含用户输入),便于排查 */
  degraded?: { from: "anthropic" | "compat"; reason: string };
};

function pickProvider(): AgentProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (
    process.env.OPENAI_COMPAT_API_KEY &&
    process.env.OPENAI_COMPAT_BASE_URL &&
    process.env.OPENAI_COMPAT_MODEL
  ) {
    return "compat";
  }
  return "mock";
}

export interface DegradeInfo {
  from: Exclude<AgentProvider, "mock">;
  /** 错误类名与截断消息,不含用户输入 */
  reason: string;
}

async function runProviderTask(
  input: AgentTaskInput
): Promise<{ out: AgentTaskOutput; provider: AgentProvider; degraded?: DegradeInfo }> {
  const provider = pickProvider();
  if (provider !== "mock") {
    try {
      const out =
        provider === "anthropic" ? await runAnthropicTask(input) : await runCompatTask(input);
      return { out, provider };
    } catch (e) {
      // 超时/限流/解析失败 → 确定性 Mock 降级,体验不断;原因入日志(不含用户输入),不静默
      const reason =
        e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 120);
      console.error(
        JSON.stringify({ event: "provider_degraded", provider, task: input.task, reason })
      );
      return { out: runMockAgentTask(input), provider: "mock", degraded: { from: provider, reason } };
    }
  }
  return { out: runMockAgentTask(input), provider: "mock" };
}

export async function runAgentTask(input: AgentTaskInput): Promise<AgentRunOutput> {
  // 输入闸:自伤/借贷/投资/泛化情绪命中 → 绕过模型,统一以 companion_reply 形态返回安全回应
  const userText =
    input.task === "decompose_wish"
      ? [input.wish, input.nearChoice].filter(Boolean).join(" ")
      : input.task === "companion_reply"
        ? input.userText
        : undefined;
  if (userText) {
    const hit = detectSafetyRisk(userText);
    if (hit) {
      return {
        task: "companion_reply",
        result: safetyReplyFor(hit.riskType),
        safetyFlags: [SAFETY_FLAG[hit.riskType] ?? "offTopic"],
        safetyEvent: { ...hit, responseTaken: "agent_safety_reply" },
      };
    }
  }
  const { out, provider, degraded } = await runProviderTask(input);
  // 输出闸:禁用词/句数不合格 → 重试一次 → 仍不合格用安全兜底,绝不放行违规文本
  if (out.task === "companion_reply" && validateReplyText(out.result.text).length > 0) {
    const retry = await runProviderTask(input);
    if (retry.out.task === "companion_reply" && validateReplyText(retry.out.result.text).length === 0) {
      return { ...retry.out, provider: retry.provider, ...(retry.degraded ? { degraded: retry.degraded } : {}) };
    }
    return { task: "companion_reply", result: SAFE_FALLBACK, provider };
  }
  return { ...out, provider, ...(degraded ? { degraded } : {}) };
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
