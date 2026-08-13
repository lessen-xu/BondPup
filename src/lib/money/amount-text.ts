const UNIT_MULTIPLIER = {
  千: 1_000,
  万: 10_000,
  亿: 100_000_000,
  k: 1_000,
  K: 1_000,
  w: 10_000,
  W: 10_000,
} as const;

type UnitChar = keyof typeof UNIT_MULTIPLIER;

export const MONEY_INPUT_COPY = {
  unreadable: "诶，这个我认不出来〜你写「5000」或者「5万」我就懂啦",
  understood: (amount: string) => `好，我记成 ${amount} 元咯`,
  // 真实用户反馈(2026-08-13):想填「3k 到 5k」这样的范围——先记中间值,明说可改
  understoodRange: (amount: string) => `一个范围呀〜那我先记中间 ${amount} 元，想改随时说`,
} as const;

/** 「大概3000」「3000多」「5万左右」——去掉模糊词后按确定数解析 */
function stripFuzz(part: string): string {
  return part.replace(/^(大概|大约|约|差不多)+/, "").replace(/(左右|上下|出头|多|吧|呢)+$/, "");
}

function parsePart(part: string): { value: number; unit?: UnitChar } | null {
  const match = stripFuzz(part).match(/^(\d+(?:\.\d+)?)(千|万|亿|[kKwW])?$/);
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2] as UnitChar | undefined };
}

function toCents(value: number, unit?: UnitChar): number | null {
  const cents = Math.round(value * (unit ? UNIT_MULTIPLIER[unit] : 1) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export type ParsedYuanText = { cents: number; isRange: boolean };

/**
 * 金额文本解析:阿拉伯数字 + 千/万/亿/k/w 单位 + 模糊词 + 区间。
 * - 区间(「3k到5k」「3000-5000」「3到5万」)取中间值——不预设该多存或少存,回显里明说记的是中间、可改
 * - 「3到5万」前段缺单位时借用后段单位
 * - 中文数字(五百万)与不定量词(几百块)不猜,交还给现有的友好提示
 */
export function parseYuanTextDetailed(input: string): ParsedYuanText | null {
  const normalized = input.replace(/[\s,，元块钱]/g, "");
  if (!normalized) return null;

  const rangeParts = normalized.split(/到|至|[-~〜–—]/);
  if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
    const first = parsePart(rangeParts[0]);
    const second = parsePart(rangeParts[1]);
    if (!first || !second) return null;
    const lo = toCents(first.value, first.unit ?? second.unit);
    const hi = toCents(second.value, second.unit);
    if (lo === null || hi === null) return null;
    return { cents: Math.round((lo + hi) / 2), isRange: true };
  }

  const single = parsePart(normalized);
  if (!single) return null;
  const cents = toCents(single.value, single.unit);
  return cents === null ? null : { cents, isRange: false };
}

export function parseYuanTextToCents(input: string): number | null {
  return parseYuanTextDetailed(input)?.cents ?? null;
}

export function formatYuanFromCents(cents: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(cents / 100);
}
