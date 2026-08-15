import { useId, type ReactNode } from "react";
import "./TextField.css";

interface TextFieldProps {
  label: string;
  /** Keeps the label for a screen reader but not on screen — for a control in a table column that is already headed. */
  hideLabel?: boolean;
  /** `date` for the voucher and check dates; `text` for everything else, including money (see below). */
  type?: "text" | "date";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** A glyph inside the left edge, e.g. the peso sign on an amount. */
  prefix?: ReactNode;
  /** `min`/`max` on a date input, so the picker itself refuses a date outside the period. */
  min?: string;
  max?: string;
  inputMode?: "text" | "decimal" | "numeric";
  /** Renders the value in the ledger's tabular monospace, right-aligned. For amounts. */
  figure?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * The prototype's `.text-input`, in the same `.field` shell as `Select`.
 *
 * **Money is typed into a `type="text"` field, not `type="number"`.** A number
 * input hands back `""` for anything the browser considers malformed — type
 * "1.2.3" and the value the app sees is empty, so the app cannot tell "not
 * filled in yet" from "typed wrong" and cannot say which. It also accepts
 * "1e5" as a number and varies over the decimal separator by locale. Text plus
 * `inputMode="decimal"` keeps the numeric keypad, and leaves `toCentavos` —
 * which is string-based precisely so no float is ever involved — as the single
 * place an amount is judged.
 */
export function TextField({
  label,
  hideLabel = false,
  type = "text",
  value,
  onChange,
  placeholder,
  prefix,
  min,
  max,
  inputMode,
  figure = false,
  disabled = false,
  className,
}: TextFieldProps) {
  const id = useId();

  return (
    <div className={className ? `field ${className}` : "field"}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </label>
      <div className={prefix ? "input-wrap has-prefix" : "input-wrap"}>
        {prefix ? <span className="ic-prefix">{prefix}</span> : null}
        <input
          id={id}
          type={type}
          className={figure ? "text-input figure" : "text-input"}
          value={value}
          placeholder={placeholder}
          min={min}
          max={max}
          inputMode={inputMode}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
