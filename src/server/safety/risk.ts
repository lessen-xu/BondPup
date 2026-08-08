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
    pattern:
      /不想活|活不下去|活不了|自杀|自残|伤害自己|结束生命|结束自己|轻生|想死|去死|活着没(?:什么|啥|有)?意思|没有活下去|消失掉算了|生无可恋/,
  },
  {
    riskType: "debt_loan",
    rule: "debt_loan_keywords",
    pattern:
      /网贷|借贷|借钱|借款|贷款|分期|还不上|还不起|欠款|欠了|欠债|负债|花呗|借呗|白条|信用卡逾期|催收|以贷养贷|套现|周转不开/,
  },
  {
    riskType: "investment",
    rule: "investment_keywords",
    pattern:
      /炒股|股票|基金|理财产品|虚拟币|比特币|加密货币|买币|投资|杠杆|期货|合约|翻倍|抄底|梭哈|财富自由/,
  },
  {
    riskType: "generic_emotion",
    rule: "generic_emotion_keywords",
    pattern:
      /想哭|大哭|哭了好久|好难过|难过得|难受得|崩溃|焦虑|抑郁|失眠|睡不着|压力好大|压力很大|压力太大|心情很差|心情特别差|好累啊|太累了|撑不住|扛不住/,
  },
];

export interface SafetyHit {
  riskType: SafetyRiskType;
  triggeredRule: string;
}

/** NFKC 归一化 + 去空白与标点:「不 想,活」与全角变体都能命中 */
function normalizeForMatching(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function detectSafetyRisk(text: string): SafetyHit | null {
  const t = normalizeForMatching(text);
  for (const r of RULES) {
    if (r.pattern.test(t)) return { riskType: r.riskType, triggeredRule: r.rule };
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
      // 泛化情绪:听一句、不追问细节,只问是否影响当前金钱安排(v7.4 §14)
      return {
        text: "听起来这件事压在心里一阵了,先陪你待一会儿。它有影响到这个月钱的安排吗?想聊哪边都可以。",
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
