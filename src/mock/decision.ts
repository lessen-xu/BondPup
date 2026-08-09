export { parseYuanTextToCents as parseAmountCents } from "@/lib/money/amount-text";

export function formatYuan(cents: number) {
  return new Intl.NumberFormat("zh-CN").format(cents / 100);
}
