import { describe, expect, it } from "vitest";
import { parseYuanTextDetailed, parseYuanTextToCents } from "../amount-text";

describe("parseYuanTextToCents", () => {
  it.each([
    ["500万", 500_000_000],
    ["5000000", 500_000_000],
    ["5,000,000", 500_000_000],
    ["500 万", 500_000_000],
    ["1.5万", 1_500_000],
    ["5千元", 500_000],
    ["1亿", 10_000_000_000],
    // k/w 后缀(真实用户打字习惯)
    ["3k", 300_000],
    ["3K", 300_000],
    ["2w", 2_000_000],
    // 模糊表述:去模糊词后按确定数解析
    ["3000多", 300_000],
    ["大概3000", 300_000],
    ["3000左右", 300_000],
    ["5万上下", 5_000_000],
    ["3000块钱", 300_000],
  ])("解析 %s", (input, expected) => {
    expect(parseYuanTextToCents(input)).toBe(expected);
  });

  it.each([
    // 区间取中间值(用户四反馈:目标金额想填 3k-5k)
    ["3k到5k", 400_000],
    ["3000-5000", 400_000],
    ["2千~3千", 250_000],
    // 前段缺单位借用后段单位:3到5万 = 3万到5万
    ["3到5万", 4_000_000],
  ])("区间 %s 取中间", (input, expected) => {
    const parsed = parseYuanTextDetailed(input);
    expect(parsed).toEqual({ cents: expected, isRange: true });
  });

  it("单值不标记为区间", () => {
    expect(parseYuanTextDetailed("5000")).toEqual({ cents: 500_000, isRange: false });
  });

  it("不猜中文数字", () => {
    expect(parseYuanTextToCents("五百万")).toBeNull();
  });

  it.each([["几百块"], ["几千"], ["3000到"], ["到5000"]])("认不出 %s 时交还友好提示", (input) => {
    expect(parseYuanTextToCents(input)).toBeNull();
  });
});
