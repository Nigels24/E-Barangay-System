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

/** Back to the previous screen. */
export function ArrowLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </Glyph>
  );
}

/** Add — a voucher line, in this app. */
export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

/**
 * Removes a line from a voucher that has not been posted yet.
 *
 * The prototype used its trash glyph to delete a row from the ledger, which
 * this system does not allow — nothing posted is ever deleted. Here it only
 * ever removes a line from the voucher currently being typed.
 */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </Glyph>
  );
}

/** Money, on the journal's stat cards. */
export function WalletIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Z" />
      <path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <circle cx="16" cy="13" r="1.3" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Confirmation that something landed in the books. */
export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <polyline points="20 6 9 17 4 12" />
    </Glyph>
  );
}
