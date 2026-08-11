/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
import { leftoverTier } from "@/lib/leftover-tier";

type LeftoverProps = { amount: number; onOpen: () => void };

/** 三档大小按 leftoverTier 显示约定,不做线性放大 */
export const LEFTOVER_TIER_IMAGES = {
  small: "/assets/gems-tier-thin.png?v=3",
  medium: "/assets/gems-tier-half.png",
  large: "/assets/gems-tier-full.png",
} as const;

export function Leftover({ amount, onOpen }: LeftoverProps) {
  const tier = leftoverTier(amount);
  return (
    <button className="leftover" type="button" onClick={onOpen} aria-label="查看结余">
      <img className="leftover-picnic" src="/assets/picnic-mat-ui.png" alt="" aria-hidden="true" />
      {tier && <img className="leftover-gem-pile" src={LEFTOVER_TIER_IMAGES[tier]} alt="" aria-hidden="true" />}
    </button>
  );
}
