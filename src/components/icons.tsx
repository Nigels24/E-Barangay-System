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

/** Reports — the Trial Balance and General Ledger nav entry. */
export function BarChartIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </Glyph>
  );
}

/** Physical property — the fixed-asset register nav entry. */
export function BoxIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </Glyph>
  );
}

/** A bank building — the bank reconciliation nav entry. */
export function BankIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 10h18" />
      <path d="M12 2 3 8h18Z" />
      <path d="M5 10v9M10 10v9M14 10v9M19 10v9" />
      <path d="M3 21h18" />
    </Glyph>
  );
}

/** A pen, signing — the signatory register nav entry. */
export function SignatureIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 17.25V21h3.75L18.81 8.94a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0L3 17.25Z" />
      <path d="M13.5 6.5l3 3" />
    </Glyph>
  );
}

/** A list of coded rows — the chart-of-accounts admin nav entry. */
export function ListIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </Glyph>
  );
}

/** Two people — the user-admin nav entry, and the who's-working picker. */
export function UsersIcon({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Glyph>
  );
}
