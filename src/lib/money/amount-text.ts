const UNIT_MULTIPLIER = {
  千: 1_000,
  万: 10_000,
  亿: 100_000_000,
} as const;

export const MONEY_INPUT_COPY = {
  unreadable: "诶，这个我认不出来〜你写「5000」或者「5万」我就懂啦",
  understood: (amount: string) => `好，我记成 ${amount} 元咯`,
} as const;

export function parseYuanTextToCents(input: string): number | null {
  const normalized = input.replace(/[\s,，元块]/g, "");
  if (!normalized) return null;
  const match = normalized.match(/^(\d+(?:\.\d+)?)(千|万|亿)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] ? UNIT_MULTIPLIER[match[2] as keyof typeof UNIT_MULTIPLIER] : 1;
  const cents = Math.round(amount * multiplier * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatYuanFromCents(cents: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(cents / 100);
}
