import { z } from "zod";
import { Cents } from "@/contracts/money";
import { DomainError } from "@/contracts/errors";

/** 起点第④步可选清单「帮我算一下」:六项固定支出,每项可空 */
export const LivingItems = z.object({
  rent: Cents.optional(),
  utilities: Cents.optional(),
  telecom: Cents.optional(),
  transport: Cents.optional(),
  food: Cents.optional(),
  otherFixed: Cents.optional(),
});
export type LivingItems = z.input<typeof LivingItems>;

/** 纯加法,填几项算几项;不调模型,不给任何参考值(空着就是空着) */
export function computeLivingJar(items: LivingItems): number {
  const parsed = LivingItems.safeParse(items);
  if (!parsed.success) {
    throw new DomainError("validation_error", "金额必须是非负整数(单位:分)", parsed.error.issues);  // copy-ok
  }
  return Object.values(parsed.data).reduce<number>((sum, v) => sum + (v ?? 0), 0);
}
