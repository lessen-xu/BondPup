import { describe, expect, it } from "vitest";
import { DecisionStory } from "@/contracts";
import { validatePrincipleCandidate, validateReplyText } from "../validate";

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
  it("超过三句被拦下", () => {
    const fails = validateReplyText("第一句。第二句。第三句。第四句。");
    expect(fails.some((f) => f.rule === "max_sentences")).toBe(true);
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
