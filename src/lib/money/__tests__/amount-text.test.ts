import { describe, expect, it } from "vitest";
import { parseYuanTextToCents } from "../amount-text";

describe("parseYuanTextToCents", () => {
  it.each([
    ["500万", 500_000_000],
    ["5000000", 500_000_000],
    ["5,000,000", 500_000_000],
    ["500 万", 500_000_000],
    ["1.5万", 1_500_000],
    ["5千元", 500_000],
    ["1亿", 10_000_000_000],
  ])("解析 %s", (input, expected) => {
    expect(parseYuanTextToCents(input)).toBe(expected);
  });

  it("不猜中文数字", () => {
    expect(parseYuanTextToCents("五百万")).toBeNull();
  });
});
