import type { AgentReply, MoneyState, SafetyRiskType } from "@/contracts";
import { MoneyState as MoneyStateSchema, SafetyEvent } from "@/contracts";

/**
 * 安全红线输入闸(v7.4 §14)。关键词分流,宁可误报不可漏报;
 * 命中即绕过模型,直接返回安全回应。事件审计不保存用户原文。
 */

const RULES: { riskType: SafetyRiskType; rule: string; pattern: RegExp }[] = [
  {
    riskType: "self_harm",
    rule: "self_harm_keywords",
    pattern: /不想活|活不下去|自杀|自残|伤害自己|结束生命|轻生|想死|活着没意思/,
  },
  {
    riskType: "debt_loan",
    rule: "debt_loan_keywords",
    pattern: /网贷|借钱|借款|贷款|分期|还不上|还不起|欠款|欠了|花呗|借呗|白条|信用卡逾期|催收/,
  },
  {
    riskType: "investment",
    rule: "investment_keywords",
    pattern: /炒股|股票|基金|理财产品|虚拟币|比特币|加密货币|投资|杠杆|期货|翻倍|抄底/,
  },
];

export interface SafetyHit {
  riskType: SafetyRiskType;
  triggeredRule: string;
}

export function detectSafetyRisk(text: string): SafetyHit | null {
  for (const r of RULES) {
    if (r.pattern.test(text)) return { riskType: r.riskType, triggeredRule: r.rule };
  }
  return null;
}

/** 各风险类的固定安全回应(不调模型,不含禁用词,≤3 句) */
export function safetyReplyFor(riskType: SafetyRiskType): AgentReply {
  switch (riskType) {
    case "self_harm":
      return {
        text: "先不聊钱了,我有点担心你。这样的感觉一个人扛太重了,可以找信任的人说说,或者联系专业的心理支持(24 小时心理援助热线 12356)。我一直在。",
        requiresConfirmation: false,
        safety: { flagged: true, exit: true },
      };
    case "debt_loan":
      return {
        text: "借贷和还款这件事超出了我能好好帮你的范围,我不想给你不可靠的建议。这类问题找信任的人或专业渠道聊会更稳妥。你的罐子安排我还在,随时可以看。",
        requiresConfirmation: false,
        safety: { flagged: true, exit: false },
      };
    case "investment":
      return {
        text: "投资的事我不懂,也不想假装懂——这超出了我的范围。我能陪你的是把现在的钱安排得清楚一点。",
        requiresConfirmation: false,
        safety: { flagged: true, exit: false },
      };
    default:
      return {
        text: "听起来这件事压在心里一阵了。我先陪你待一会儿,想聊钱的时候随时说。",
        requiresConfirmation: false,
        safety: { flagged: true, exit: false },
      };
  }
}

/** 把安全事件写入审计链(不含原文);id 由调用方的幂等键或时间构造 */
export function recordSafetyEvent(
  state: MoneyState,
  hit: SafetyHit,
  responseTaken: string,
  id?: string
): MoneyState {
  const event = SafetyEvent.parse({
    id: id ?? `safety-${state.stateVersion}-${state.safetyEvents.length + 1}`,
    riskType: hit.riskType,
    triggeredRule: hit.triggeredRule,
    responseTaken,
    createdAt: new Date().toISOString(),
  });
  return MoneyStateSchema.parse({
    ...state,
    stateVersion: state.stateVersion + 1,
    safetyEvents: [...state.safetyEvents.slice(-19), event],
  });
}
