export function parseAmountCents(text: string): number | null {
  const match = text.replaceAll(",", "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const [whole, fraction = ""] = match[1].split(".");
  return Number.isSafeInteger(Number(whole)) ? Number(whole) * 100 + Number(fraction.padEnd(2, "0")) : null;
}

export function formatYuan(cents: number) {
  return new Intl.NumberFormat("zh-CN").format(cents / 100);
}
