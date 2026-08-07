/**
 * 碎钻三档大小(v7.4:分三档,不做线性放大;为 0 不显示)。
 * 阈值是显示约定的一部分,前端不自行计算:
 *   0 → null(不渲染);< 100 元 → small;< 500 元 → medium;≥ 500 元 → large
 */
export type LeftoverTier = "small" | "medium" | "large";

export function leftoverTier(amountCents: number): LeftoverTier | null {
  if (amountCents <= 0) return null;
  if (amountCents < 10000) return "small";
  if (amountCents < 50000) return "medium";
  return "large";
}
