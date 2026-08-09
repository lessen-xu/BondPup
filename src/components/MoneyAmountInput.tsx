"use client";

import { useEffect, useRef, useState } from "react";
import { formatYuanFromCents, MONEY_INPUT_COPY, parseYuanTextToCents } from "@/lib/money/amount-text";

type MoneyAmountInputProps = {
  value: number | undefined;
  onChange: (cents: number) => void;
  className?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  extraConfirmation?: (cents: number) => string | null;
};

export function MoneyAmountInput({ value = 0, onChange, className = "flow-input", autoFocus = false, ariaLabel, placeholder, extraConfirmation }: MoneyAmountInputProps) {
  const [text, setText] = useState(value > 0 ? formatYuanFromCents(value) : "");
  const [parsed, setParsed] = useState<number | null>(value > 0 ? value : null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setText(value > 0 ? formatYuanFromCents(value) : "");
    setParsed(value > 0 ? value : null);
    lastEmitted.current = value;
  }, [value]);

  function update(raw: string) {
    setText(raw);
    if (!raw.trim()) {
      setParsed(null);
      lastEmitted.current = 0;
      onChange(0);
      return;
    }
    const next = parseYuanTextToCents(raw);
    setParsed(next);
    if (next !== null) {
      lastEmitted.current = next;
      onChange(next);
    }
  }

  const extra = parsed === null ? null : extraConfirmation?.(parsed);

  return <>
    <input autoFocus={autoFocus} className={className} type="text" inputMode="decimal" value={text} onChange={(event) => update(event.target.value)} aria-label={ariaLabel} placeholder={placeholder} />
    {text.trim() && parsed === null && <small className="amount-input-feedback">{MONEY_INPUT_COPY.unreadable}</small>}
    {text.trim() && parsed !== null && <small className="amount-input-feedback">{MONEY_INPUT_COPY.understood(formatYuanFromCents(parsed))}{extra ? ` · ${extra}` : ""}</small>}
  </>;
}
