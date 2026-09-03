import type { ReactNode } from "react";
import { BuildingIcon } from "./icons";
import "./AppShell.css";

interface AppShellProps {
  children?: ReactNode;
  wide?: boolean;
  /** The session's current user (T-018/D24) — omitted before one is chosen (bootstrap, first-run, the picker itself). */
  currentUserName?: string;
  onSwitchUser?: () => void;
}

/**
 * Page frame: the branded topbar above a centred content column.
 *
 * `wide` is the prototype's `.wrap-wide`, used by the journal screen and only
 * there — a voucher table carries seven columns and a composer row carries
 * five controls, neither of which fits the 960px column the picker screens use.
 * It was deliberately not ported in T-005 because nothing needed it yet.
 */
export function AppShell({ children, wide = false, currentUserName, onSwitchUser }: AppShellProps) {
  return (
    <div className={wide ? "wrap wrap-wide" : "wrap"}>
      <header className="topbar">
        <div className="logo">
          <BuildingIcon size={20} />
        </div>
        <div className="topbar-title">
          <h1>eBarangay Books</h1>
          <p>City of Pagadian · Municipal Accounting Suite</p>
        </div>
        {currentUserName && onSwitchUser ? (
          <button type="button" className="topbar-user" onClick={onSwitchUser}>
            <span>{currentUserName}</span>
            <span className="topbar-user-switch">Switch user</span>
          </button>
        ) : null}
      </header>
      <main>{children}</main>
    </div>
  );
}
