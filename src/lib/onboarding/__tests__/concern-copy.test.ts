import { describe, expect, it } from "vitest";
import { concernMentionsGoal, concernsForComfortCopy } from "../concern-copy";

describe("concernsForComfortCopy(安心罐归属文案的 concern 子集)", () => {
  const concerns = ["我想能在伦敦靠自己生活下去", "我想买那件hcb，价格是20000", "想留点余地"];

  it("A 实测场景:梦想罐目标「买一件 hcb」对应的 concern 被排除", () => {
    const result = concernsForComfortCopy(concerns, true, "买一件 hcb", "买一件 hcb");
    expect(result).toEqual(["我想能在伦敦靠自己生活下去", "想留点余地"]);
  });

  it("没有目标时全量保留", () => {
    expect(concernsForComfortCopy(concerns, false, "", "梦想罐")).toEqual(concerns);
  });

  it("默认罐名「梦想罐」不参与匹配,不误伤", () => {
    const withDreamWord = ["想给梦想罐多留点"];
    expect(concernsForComfortCopy(withDreamWord, true, "去冰岛", "梦想罐")).toEqual(withDreamWord);
  });

  it("归一化匹配无视空格标点与大小写", () => {
    expect(concernMentionsGoal("我想买那件 HCB!", ["买一件hcb"])).toBe(true);
  });

  it("目标名过短(<2 归一化字符)不匹配,避免单字误杀", () => {
    expect(concernMentionsGoal("想买书", ["书"])).toBe(false);
  });

  it("量词变化(一件/那件)靠公共子串抓住,通用词(想买)不误伤", () => {
    expect(concernMentionsGoal("我想买那件hcb，价格是20000", ["买一件 hcb"])).toBe(true);
    expect(concernMentionsGoal("想买点好吃的", ["买一件 hcb"])).toBe(false);
  });

  it("expressionPrefs 语义不受影响:函数只做过滤不改原数组", () => {
    const input = [...concerns];
    concernsForComfortCopy(input, true, "买一件 hcb", "梦想罐");
    expect(input).toEqual(concerns);
  });
});
