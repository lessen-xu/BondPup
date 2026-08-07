type HandDrawnUnderlineProps = { className?: string };

export function HandDrawnUnderline({ className }: HandDrawnUnderlineProps) {
  return (
    <svg className={className} viewBox="0 0 100 8" aria-hidden="true" preserveAspectRatio="none">
      <path d="M2 4.8c13-1.6 23 1 34-.2 17-1.9 32 .5 46-1.2 6-.7 11-.2 16-1" />
    </svg>
  );
}
