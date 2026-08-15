import type { ReactNode } from "react";
import "./Badge.css";

/**
 * `outline` is the prototype's neutral pill (barangay / year / month in the
 * journal header). The other two are **states**, not controls — see below.
 */
export type BadgeTone = "outline" | "open" | "closed" | "draft" | "posted" | "voided" | "provisional";

type BadgeProps = {
  /** Optional leading glyph — an inline `<svg>`, tinted teal by the CSS. */
  icon?: ReactNode;
  tone?: BadgeTone;
  children: ReactNode;
};

/**
 * A small pill: either a neutral label or a status.
 *
 * ### Why the status tones look different from the neutral one
 *
 * The period's open/closed badge used the neutral style — a bordered pill with
 * an icon, sitting flush right on a card, which is exactly where a button
 * belongs. A user clicked it expecting it to do something, and they were right
 * to: everything about it said "control". It is a status.
 *
 * So a status tone carries **no border**, sits on a tinted fill, and is
 * coloured by what it says — teal for open, gold for closed, gold for a draft.
 * Colour is never the only signal (the words differ too), but it means the two
 * states cannot be confused at a glance in a table full of rows.
 */
export function Badge({ icon, tone = "outline", children }: BadgeProps) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
