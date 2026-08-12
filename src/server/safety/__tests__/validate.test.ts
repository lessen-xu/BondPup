import { describe, expect, it } from "vitest";
import { DecisionStory } from "@/contracts";
import { isVague } from "@/server/agent";
import {
  validateConcernsOutput,
  validateDecisionReply,
  validatePrincipleCandidate,
  validateReplyText,
} from "../validate";

function story(id: string, status: "open" | "reviewed"): DecisionStory {
  return DecisionStory.parse({
    id,
    intent: "一次消费犹豫",
    action: "defer",
    status,
    ...(status === "reviewed"
      ? { outcome: { reviewedAt: "2026-08-06T00:00:00Z", happened: true } }
      : {}),
    createdAt: "2026-08-05T00:00:00Z",
  });
}

describe("validateReplyText", () => {
  it("干净的三句以内回应通过", () => {
    expect(validateReplyText("我在呢。今天想聊聊钱,还是就坐一会儿?")).toEqual([]);
  });
  it("禁用词被拦下", () => {
    const fails = validateReplyText("这个月超支了,你应该少花点,加油!");
    expect(fails.some((f) => f.rule === "forbidden_words")).toBe(true);
  });
  it("「值不值」被拦下(决策三中性动作,不问值不值;真模型线上问过)", () => {
    const fails = validateReplyText("你心里是不是在盘算它值不值得买?");
    expect(fails.some((f) => f.rule === "forbidden_words")).toBe(true);
  });
  it("超过三句被拦下", () => {
    const fails = validateReplyText("第一句。第二句。第三句。第四句。");
    expect(fails.some((f) => f.rule === "max_sentences")).toBe(true);
  });
  it("全角!?也算句号:真模型线上出过 4 句全角标点回复溜过闸", () => {
    const fails = validateReplyText("第一句！第二句？第三句。第四句！");
    expect(fails.some((f) => f.rule === "max_sentences")).toBe(true);
  });
});

describe("validateDecisionReply(决策语义闸:三个中性动作缺一不可)", () => {
  const full =
    "犹豫很正常。我这里记的安心罐还有 3500 元,买了差 500 元。上次那双鞋你放了三天,后来说穿得不多。你可以现在买,也可以放到明天,或者这次先不买。我能想到的就这些了,买不买你定。";

  it("三选项齐全 + 五句以内 → 通过", () => {
    expect(validateDecisionReply(full)).toEqual([]);
  });
  it("只回一句情绪(线上真实案例)→ 缺三选项被拒", () => {
    const fails = validateDecisionReply("听起来你已经想了一会儿了。");
    expect(fails.some((f) => f.rule === "three_actions")).toBe(true);
  });
  it("缺任一选项都被拒", () => {
    const noSkip = full.replace("或者这次先不买。", "");
    expect(validateDecisionReply(noSkip).some((f) => f.rule === "three_actions")).toBe(true);
  });
  it("六句超预算被拒(decision 预算为 5)", () => {
    const six = "一句。两句。三句。四句。五句。你可以现在买,放到明天,或者这次先不买。";
    expect(validateDecisionReply(six).some((f) => f.rule === "max_sentences")).toBe(true);
  });
});

describe("isVague(原则空泛度:对谁都成立=对她没用)", () => {
  const stories = [
    { intent: "想买那双白色的鞋", feelingNote: "还是觉得它好看" },
    { intent: "犹豫一个投影仪" },
  ];
  it("「你还是想买你真正想买的」→ 空泛(虚词蒙混不过去)", () => {
    expect(isVague("我还是想买我真正想买的", stories)).toBe(true);
  });
  it("含证据实义词(白色/投影)→ 具体", () => {
    expect(isVague("对白色的鞋这类,我会先等等", stories)).toBe(false);
    expect(isVague("投影仪这种大件,我想先看看", stories)).toBe(false);
  });
  it("含时间线索 → 具体(Mock 模板「放一晚」天然通过)", () => {
    expect(isVague("我放一晚再决定,好像更踏实", [])).toBe(false);
  });
});

describe("validateConcernsOutput(decompose 输出闸:此前这条路径 5/5 漏过「应该」)", () => {
  it("干净的用户视角条目通过", () => {
    expect(
      validateConcernsOutput(["想给自己攒一笔说走就走的钱", "买东西之前想清楚是不是真的需要"])
    ).toEqual([]);
  });
  it("含禁用词(应该)被拒", () => {
    const fails = validateConcernsOutput(["每个月都应该省着花"]);
    expect(fails.some((f) => f.rule === "forbidden_words")).toBe(true);
  });
  it("对用户说话(你开头)与超长条目被拒", () => {
    const fails = validateConcernsOutput(["你要对自己好一点", "想".repeat(41)]);
    expect(fails.some((f) => f.rule === "first_person")).toBe(true);
    expect(fails.some((f) => f.rule === "max_length")).toBe(true);
  });
  it("硬红线语义(投资)被拒", () => {
    const fails = validateConcernsOutput(["想拿工资去炒股翻倍"]);
    expect(fails.some((f) => f.rule === "risk")).toBe(true);
  });

  describe("数字保真(真实用户回归:目标 30000 元被模型写成「300万日元」)", () => {
    const source = "想存钱去日本 去日本 30000 元 12 个月";

    it("原案例:编造的数字与货币都被拒", () => {
      const fails = validateConcernsOutput(["去日本的这笔钱,12个月攒到300万日元"], source);
      expect(fails.some((f) => f.rule === "amount_fidelity" && f.message.includes("日元"))).toBe(true);
      expect(fails.some((f) => f.rule === "amount_fidelity" && f.message.includes("300万"))).toBe(true);
    });

    it("数字原样引用通过;「3万」与「30000」互认", () => {
      expect(validateConcernsOutput(["12 个月攒到 30000 元去日本"], source)).toEqual([]);
      expect(validateConcernsOutput(["为去日本攒 3万"], source)).toEqual([]);
      expect(validateConcernsOutput(["带逗号的 30,000 也一样"], source)).toEqual([]);
    });

    it("不带数字的条目不受影响;纯中文数字输入没有就拒", () => {
      expect(validateConcernsOutput(["想去日本看看"], source)).toEqual([]);
      const fails = validateConcernsOutput(["攒够三万就出发"], source);
      expect(fails.some((f) => f.rule === "amount_fidelity")).toBe(true);
    });

    it("不传 sourceText 时保持旧行为(数字不校验)", () => {
      expect(validateConcernsOutput(["12个月攒到300万日元"])).toEqual([]);
    });
  });
});

describe("validatePrincipleCandidate", () => {
  const stories = [story("s1", "reviewed"), story("s2", "reviewed"), story("s3", "reviewed")];

  it("合规候选通过", () => {
    expect(
      validatePrincipleCandidate(
        { statement: "我放一晚再决定,好像更踏实", evidenceIds: ["s1", "s2"] },
        stories
      )
    ).toEqual([]);
  });
  it("禁用词 + 第二人称被拒", () => {
    const fails = validatePrincipleCandidate(
      { statement: "你应该先存钱再消费", evidenceIds: ["s1", "s2"] },
      stories
    );
    expect(fails.map((f) => f.rule)).toContain("forbidden_words");
    expect(fails.map((f) => f.rule)).toContain("first_person");
  });
  it("26 个码点被拒(码点计数,不是 UTF-16 单元)", () => {
    const fails = validatePrincipleCandidate(
      { statement: "我" + "想".repeat(25), evidenceIds: ["s1", "s2"] },
      stories
    );
    expect(fails.map((f) => f.rule)).toContain("max_length");
  });
  it("重复 evidenceId 在校验层就被拒(不穿透到写入层变 internal_error;生产复现过)", () => {
    const fails = validatePrincipleCandidate(
      { statement: "我放一晚再决定,好像更踏实", evidenceIds: ["s1", "s1"] },
      stories
    );
    expect(fails.some((f) => f.rule === "evidence" && f.message.includes("不得重复"))).toBe(true);
  });
  it("自伤语义的原则被拒(生产实测真模型把危机笔记提炼成过原则)", () => {
    const fails = validatePrincipleCandidate(
      { statement: "我活着没意思时更要花钱", evidenceIds: ["s1", "s2"] },
      stories
    );
    expect(fails.some((f) => f.rule === "risk")).toBe(true);
  });
  it("证据不足 / 指向未回看故事被拒", () => {
    expect(
      validatePrincipleCandidate({ statement: "我想慢慢来", evidenceIds: ["s1"] }, stories).map(
        (f) => f.rule
      )
    ).toContain("evidence");
    const withOpen = [...stories, story("s4", "open")];
    expect(
      validatePrincipleCandidate(
        { statement: "我想慢慢来", evidenceIds: ["s1", "s4"] },
        withOpen
      ).map((f) => f.rule)
    ).toContain("evidence");
  });
});
