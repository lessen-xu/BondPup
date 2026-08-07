/* eslint-disable @next/next/no-img-element --
   手绘场景资产使用绝对定位与百分比尺寸,next/image 的容器约束
   会破坏舞台布局。资产已预先压缩,尺寸可控。 */
type LeftoverProps = { amount: number; onOpen: () => void };

export function Leftover({ amount, onOpen }: LeftoverProps) {
  return (
    <button className="leftover" type="button" onClick={onOpen} aria-label="查看结余">
      <img className="leftover-picnic" src="/assets/picnic-mat-ui.png" alt="" aria-hidden="true" />
      {amount > 0 && <img className="leftover-gem-pile" src="/assets/gems-tier-thin.png?v=3" alt="" aria-hidden="true" />}
    </button>
  );
}
