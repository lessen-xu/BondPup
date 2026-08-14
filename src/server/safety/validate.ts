import type { DecisionStory } from "@/contracts";
import { FORBIDDEN_WORDS } from "./forbidden-words";
import { detectHardRisk } from "./risk";

/**
 * 语气硬校验层。模型输出在这里过闸,不合格的回应/原则宁可不要:
 * 一条像贴标签的原则,伤害比没有原则大得多。
 */

export interface ValidationFailure {
  rule: "forbidden_words" | "max_sentences" | "max_length" | "first_person" | "evidence" | "three_actions" | "vague" | "risk" | "amount_fidelity";
  message: string;
}

export function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter((w) => text.includes(w));
}

/**
 * 每句的码点预算。句数闸只数句号问号叹号,模型用「〜」「…」或换行连写就能把
 * 一大段变成「1 句」蒙混过关(唯一边界是 max_tokens 1000),投到 390px 手机屏上
 * 就是一堵墙。总上限 = 句数预算 × 这个数,跟着已有的预算概念走,不另立常数。
 * 实测现有合法回应最长 72 码点(自伤安全回应),默认预算 3 → 120,留足余量。
 */
const CODEPOINTS_PER_SENTENCE = 40;

/** 对话回应:无禁用词、句数不超预算(默认 3;decision 场景摆情况+三选项+交还决定权,预算 5)、总长不超预算 */
export function validateReplyText(
  text: string,
  opts?: { maxSentences?: number }
): ValidationFailure[] {
  const maxSentences = opts?.maxSentences ?? 3;
  const failures: ValidationFailure[] = [];
  const hits = findForbiddenWords(text);
  if (hits.length > 0) {
    failures.push({ rule: "forbidden_words", message: `包含禁用词:${hits.join("、")}` });
  }
  // ！？ 是全角!?,用转义写死——肉眼分不清全半角,之前就在这里看走眼过。
  // 换行也算句界:模型常用换行分句而不加句号
  const sentences = text.split(/[。!?！？\n]/).filter((s) => s.trim().length > 0);
  if (sentences.length > maxSentences) {
    failures.push({ rule: "max_sentences", message: `超过 ${maxSentences} 句(${sentences.length} 句)` });
  }
  const maxCodepoints = maxSentences * CODEPOINTS_PER_SENTENCE;
  const length = [...text].length; // 中文按码点数,.length 数的是 UTF-16 单元
  if (length > maxCodepoints) {
    failures.push({ rule: "max_length", message: `超过 ${maxCodepoints} 字(${length} 字)` });
  }
  return failures;
}

/**
 * 决策回应的语义闸(冻结规则:三个中性动作,一个都不能少):
 * 必须同时出现「现在买」「放到明天/明天再」「先不买」。
 * 真模型曾只回一句情绪就通过了旧闸——语气合规不等于把三个选项交到她手里。
 */
export function validateDecisionReply(text: string): ValidationFailure[] {
  const failures = validateReplyText(text, { maxSentences: 5 });
  // 容忍常见变体(现在就买/明晚/这次不买):闸门管的是「三个选项都交到她手里」,不是字面背诵
  const missing: string[] = [];
  if (!/现在(就)?买|今天(就)?买/.test(text)) missing.push("现在买");
  if (!/放到明天|明天再|明晚|放一晚|明天(再)?(看|说|定|决定)/.test(text)) missing.push("放到明天");
  if (!/先不买|这次不买|这回不买/.test(text)) missing.push("这次先不买");
  if (missing.length > 0) {
    failures.push({ rule: "three_actions", message: `缺少选项:${missing.join("、")}` });
  }
  return failures;
}

const MAX_STATEMENT_CODEPOINTS = 25;

/** 原则语句本身的规则(候选生成与用户改说法共用):禁用词 / ≤25 码点 / 第一人称 */
export function validatePrincipleStatement(statement: string): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const s = statement.trim();
  const hits = findForbiddenWords(s);
  if (hits.length > 0) {
    failures.push({ rule: "forbidden_words", message: `包含禁用词:${hits.join("、")}` });
  }
  if ([...s].length > MAX_STATEMENT_CODEPOINTS) {
    failures.push({ rule: "max_length", message: `超过 ${MAX_STATEMENT_CODEPOINTS} 字` });
  }
  if (!s.includes("我") || s.startsWith("你")) {
    failures.push({ rule: "first_person", message: "必须是第一人称的表述" });  // copy-ok
  }
  // 生产实测过真模型把自伤笔记提炼成原则(「我感觉活着没意思的时候…」)——
  // 原则会被长期引用,自伤/借贷/投资语义绝不能被固化,不论来自模型还是用户改说法
  if (detectHardRisk(s)) {
    failures.push({ rule: "risk", message: "这句话不适合作为金钱原则记下来" });
  }
  return failures;
}

const FOREIGN_CURRENCY_WORDS = ["日元", "美元", "美金", "欧元", "英镑", "港币", "韩元", "泰铢"];

/** 数字 token:归一化逗号空格后抓「数字(+万/千)」,同时记录原样与展开值(3万 → 3 和 30000) */
function numberTokens(text: string): { raw: Set<string>; expanded: Set<string> } {
  const t = text.replace(/[,，\s]/g, "");
  const raw = new Set<string>();
  const expanded = new Set<string>();
  const re = /(\d+(?:\.\d+)?)([万千])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    raw.add(m[1]);
    const mult = m[2] === "万" ? 10000 : m[2] === "千" ? 1000 : 1;
    expanded.add(String(parseFloat(m[1]) * mult));
  }
  return { raw, expanded };
}

/**
 * decompose_wish 输出闸:拆出来的每条「在意的事」都要过——
 * 无禁用词(不说教)、≤40 字、用户视角(不以「你」开头)、无硬红线语义。
 * 此前这条路径完全没有输出闸,真模型连续 5/5 输出过含「应该」的条目。
 *
 * sourceText 提供时另加数字保真:输出里的每个数字都必须能在输入里找到
 * (「3万」与「30000」互认),外币词输入没有就不许出现。
 * 真实用户实测:目标 30000 元被模型写成「300万日元」——数字与货币都是编的。
 */
export function validateConcernsOutput(concerns: string[], sourceText?: string): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const source = sourceText === undefined ? null : numberTokens(sourceText);
  for (const c of concerns) {
    const s = c.trim();
    const hits = findForbiddenWords(s);
    if (hits.length > 0) {
      failures.push({ rule: "forbidden_words", message: `包含禁用词:${hits.join("、")}` });
    }
    if ([...s].length > 40) {
      failures.push({ rule: "max_length", message: "单条超过 40 字" });
    }
    if (s.startsWith("你")) {
      failures.push({ rule: "first_person", message: "必须是用户视角的表述,不是对用户说话" });  // copy-ok
    }
    if (detectHardRisk(s)) {
      failures.push({ rule: "risk", message: "包含不适合写进在意的事的内容" });
    }
    if (source && sourceText !== undefined) {
      for (const word of FOREIGN_CURRENCY_WORDS) {
        if (s.includes(word) && !sourceText.includes(word)) {
          failures.push({ rule: "amount_fidelity", message: `出现输入里没有的货币:${word}` });
        }
      }
      const t = s.replace(/[,，\s]/g, "");
      const re = /(\d+(?:\.\d+)?)([万千])?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) {
        const mult = m[2] === "万" ? 10000 : m[2] === "千" ? 1000 : 1;
        const expandedValue = String(parseFloat(m[1]) * mult);
        if (!source.raw.has(m[1]) && !source.expanded.has(expandedValue)) {
          failures.push({ rule: "amount_fidelity", message: `出现输入里没有的数字:${m[0]}` });
        }
      }
      // 纯中文数字(三万/五千)不做换算:输入没有原样出现就拒
      const cn = s.match(/[一二两三四五六七八九十]+[万千]/g) ?? [];
      for (const token of cn) {
        if (!sourceText.includes(token)) {
          failures.push({ rule: "amount_fidelity", message: `出现输入里没有的数字:${token}` });
        }
      }
    }
  }
  return failures;
}

/**
 * 候选原则的通用校验:语句规则 + 证据 2-3 条且都在允许的 id 集合内。
 * 持有完整 MoneyState 的调用方用 validatePrincipleCandidate;
 * 只有故事摘要的调用方(/api/agent)直接传摘要里的 id 集合——两条路径同一套规则。
 */
export function validatePrincipleWithIds(
  candidate: { statement: string; evidenceIds: string[] },
  allowedIds: Set<string>
): ValidationFailure[] {
  const failures: ValidationFailure[] = [...validatePrincipleStatement(candidate.statement)];
  if (candidate.evidenceIds.length < 2 || candidate.evidenceIds.length > 3) {
    failures.push({ rule: "evidence", message: "证据必须是 2-3 条故事" });  // copy-ok
    return failures;
  }
  // 与 contracts 层 MoneyPrinciple 的唯一性规则同一道闸:重复 id 在这里就拒,
  // 不让它穿透到写入层变成 internal_error
  if (new Set(candidate.evidenceIds).size !== candidate.evidenceIds.length) {
    failures.push({ rule: "evidence", message: "证据故事不得重复" });
    return failures;
  }
  const missing = candidate.evidenceIds.filter((id) => !allowedIds.has(id));
  if (missing.length > 0) {
    failures.push({ rule: "evidence", message: `证据必须指向已回看的故事(无效:${missing.join("、")})` });  // copy-ok
  }
  return failures;
}

/** 候选原则:语句规则 + 证据 2-3 条且必须是已回看的故事 */
export function validatePrincipleCandidate(
  candidate: { statement: string; evidenceIds: string[] },
  stories: DecisionStory[]
): ValidationFailure[] {
  const reviewed = new Set(stories.filter((st) => st.status === "reviewed").map((st) => st.id));
  return validatePrincipleWithIds(candidate, reviewed);
}
