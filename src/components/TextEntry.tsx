import { HandDrawnUnderline } from "./HandDrawnUnderline";

type TextEntryProps = {
  children: string;
  className?: string;
  onClick?: () => void;
};

export function TextEntry({ children, className = "", onClick }: TextEntryProps) {
  return (
    <button className={`text-entry ${className}`} type="button" onClick={onClick}>
      <span>{children}</span>
      <HandDrawnUnderline className="entry-underline" />
    </button>
  );
}
