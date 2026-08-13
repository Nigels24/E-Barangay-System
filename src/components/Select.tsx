import { useId, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";
import "./Select.css";

export interface SelectOption {
  /** The `<option value>`. Always a string — that is what the DOM gives back. */
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  /** The teal glyph inside the left edge of the control. */
  icon?: ReactNode;
  /** The greyed first option, shown until something is chosen. */
  placeholder: string;
  /** `""` means nothing chosen yet, which is what shows the placeholder. */
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * The prototype's `.field` / `.select-wrap` control: an uppercase label above a
 * native `<select>` with an icon inside its left edge and a chevron inside its
 * right.
 *
 * It stays a native `<select>` on purpose. A custom listbox would need its own
 * keyboard handling, its own scroll behaviour and its own accessibility work —
 * all of which the OS control already has, correctly, and none of which this
 * project has a testing library to verify. 54 barangays in a native dropdown is
 * also simply faster to use than 54 divs.
 *
 * `appearance: none` in the CSS is what lets the chevron be drawn by us rather
 * than by the platform, which is the only reason the prototype's arrow can look
 * the same on every machine.
 */
export function Select({
  label,
  icon,
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: SelectProps) {
  const id = useId();

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={disabled ? "select-wrap is-disabled" : "select-wrap"}>
        {icon ? <span className="ic-left">{icon}</span> : null}
        <select
          id={id}
          className={icon ? "with-icon" : undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="ic-right">
          <ChevronDownIcon />
        </span>
      </div>
    </div>
  );
}
