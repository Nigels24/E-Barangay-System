import type { ReactNode } from "react";
import { BuildingIcon } from "./icons";
import "./AppShell.css";

/**
 * Page frame: the branded topbar above a centred content column.
 *
 * `wide` is the prototype's `.wrap-wide`, used by the journal screen and only
 * there — a voucher table carries seven columns and a composer row carries
 * five controls, neither of which fits the 960px column the picker screens use.
 * It was deliberately not ported in T-005 because nothing needed it yet.
 */
export function AppShell({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "wrap wrap-wide" : "wrap"}>
      <header className="topbar">
        <div className="logo">
          <BuildingIcon size={20} />
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
