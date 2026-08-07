type LeftoverProps = { amount: number; onOpen: () => void };

export function Leftover({ amount, onOpen }: LeftoverProps) {
  return (
    <button className="leftover" type="button" onClick={onOpen} aria-label="查看结余">
      <img className="leftover-picnic" src="/assets/picnic-mat-ui.png" alt="" aria-hidden="true" />
      {amount > 0 && <img className="leftover-gem-pile" src="/assets/gems-tier-thin.png?v=3" alt="" aria-hidden="true" />}
    </button>
  );
}
