import type { ReactNode } from "react";
import "./AppShell.css";

/**
 * The prototype's "building" glyph, inlined rather than fetched from an icon
 * package — this app ships offline and takes no new runtime dependencies.
 */
function BuildingIcon({ size = 20 }: { size?: number }) {
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
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01" />
    </svg>
  );
}

/** Page frame: the branded topbar above a centred content column. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="wrap">
      <header className="topbar">
        <div className="logo">
          <BuildingIcon />
        </div>
        <div>
          <h1>eBarangay Books</h1>
          <p>City of Pagadian · Municipal Accounting Suite</p>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
