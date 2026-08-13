import type { ReactNode } from "react";

/**
 * The prototype's icons, inlined as SVG.
 *
 * No icon package — this app ships to an offline PC and takes no new runtime
 * dependency, and a package would put a network-fetched font or a hundred
 * unused glyphs in the bundle for the four shapes actually used. Each path is
 * copied verbatim from the prototype's `icon()` map so the drawing is the one
 * the client approved.
 *
 * All of them draw in `currentColor`, so colour is set by whatever contains
 * them, and all are `aria-hidden`: every one sits next to a real text label, so
 * announcing it would only make a screen reader repeat itself.
 */

function Glyph({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The app's mark: a barangay hall. Also the topbar logo and the favicon. */
export function BuildingIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01" />
    </Glyph>
  );
}

export function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </Glyph>
  );
}

/** The calendar with a marked day — the prototype uses it for month, plain calendar for year. */
export function CalendarDaysIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function ChevronDownIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <polyline points="6 9 12 15 18 9" />
    </Glyph>
  );
}
