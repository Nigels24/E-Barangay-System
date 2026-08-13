import type { ReactNode } from "react";
import { BuildingIcon } from "./icons";
import "./AppShell.css";

/** Page frame: the branded topbar above a centred content column. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="wrap">
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
