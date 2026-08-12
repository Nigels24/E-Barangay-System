import type { ReactNode } from "react";
import "./Badge.css";

type BadgeProps = {
  /** Optional leading glyph — an inline `<svg>`, tinted teal by the CSS. */
  icon?: ReactNode;
  children: ReactNode;
};

/** The pill used in the journal header for barangay / year / month. */
export function Badge({ icon, children }: BadgeProps) {
  return (
    <span className="badge">
      {icon}
      <span>{children}</span>
    </span>
  );
}
