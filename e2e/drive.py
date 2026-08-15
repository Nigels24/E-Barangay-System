#!/usr/bin/env python3
"""
Drives the real desktop window over the W3C WebDriver protocol.

### Why this exists

`vitest` proves the engine, the queries and the display rules. It cannot prove
that a button is wired to the screen it claims to open, or that a computed
figure survives the trip into a table cell. That gap is what this covers.

### Why it is a script and not a test framework

The obvious route, `@wdio/tauri-service`, wants a second Rust plugin plus
`withGlobalTauri: true` and a test-only `import "@wdio/tauri-plugin"` in
`src/main.tsx` — that is, changes to the *shipped* app so a test can drive it.
On a government ledger that trade is not worth making, and 490 npm packages
came with it. The embedded WebDriver server speaks plain W3C over HTTP, so
this talks to it directly with nothing but the standard library.

### The one thing to keep true

`tauri-plugin-wdio-webdriver` is registered in `src-tauri/src/lib.rs` under
`#[cfg(debug_assertions)]` only. A release build has no WebDriver server and
cannot be driven from outside. Keep it that way — a remote-control surface in
a shipped accounting binary is a security defect, not a testing convenience.

### Running it

    cd src-tauri && cargo build          # debug build, with the server
    npm run dev &                        # the debug binary loads from :5173
    ./src-tauri/target/debug/ebarangay-books &
    python3 e2e/drive.py

Reports are read-only by design, and this never posts, never voids, and never
touches the composer. **One click here is not read-only on its own:**
`click("Proceed")` on the period picker reaches `openPeriodSummary()` →
`ensurePeriod()` (`src/lib/engine/period.ts:21-42`), which `INSERT`s a new
`accounting_period` row when none exists yet for the chosen
barangay/year/month. That is a write path, and clicking it blind would
violate D33's "read-only against real books" condition.

What actually keeps this harness read-only is `open_books()` below: before it
ever clicks Proceed, it queries `accounting_period` directly (via
`db_select`, the same read command the app itself uses — see
`src/db/appDb.ts` and `src-tauri/src/db_bridge.rs`) to confirm a row for
`BARANGAY`/`YEAR`/`MONTH` already exists, and refuses to click and aborts
loudly if it does not. Today that check always passes, because the fixture
period was opened once by hand and never deleted — so the click lands on
`ensurePeriod`'s existing-row branch and reads, it does not insert. If the
fixture period is ever deleted, this harness stops rather than silently
creating a new one.
"""
import calendar
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:4445"
DB_URL = "sqlite:ebarangay.db"  # must match src/db/appDb.ts's APP_DB_URL

# The figures below are the ones on disk when this was written: Barangay
# Balintawak, January 2026, one posted voucher (2026-01-001) — Cash in Bank
# debit 500.00, Cash in Local Treasury credit 500.00. Re-point these if the
# database changes; a mismatch here is a stale fixture, not a code defect.
BARANGAY = "Barangay Balintawak"
YEAR = "2026"
MONTH = "January"
MONTH_NUMBER = list(calendar.month_name).index(MONTH)
# An asset holding a CREDIT balance — the abnormal case the Dr/Cr rule exists
# for. It must read "500.00 Cr", never "-500.00".
ABNORMAL_ACCOUNT = "1-01-01-010"
UNUSED_ACCOUNT = "1-07-04-010"

session_id = None
failures = []


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{BASE}/session/{session_id}{path}" if session_id else f"{BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode())


def js(script, *args):
    return req("POST", "/execute/sync", {"script": script, "args": list(args)})["value"]


def screen_text():
    return js("return document.body.innerText")


def choose(index, label):
    """
    Sets a native <select> the way React sees it.

    Assigning `.value` alone does not reach React — it tracks the previous
    value on the DOM node and skips the synthetic event. Going through the
    prototype's setter and then dispatching `change` is what makes the app
    register the choice, exactly as a real click would.
    """
    return js(
        """
        const i = arguments[0], label = arguments[1];
        const sel = document.querySelectorAll('select')[i];
        if (!sel) return 'no select at ' + i;
        const opt = [...sel.options].find(o => o.textContent.trim().includes(label));
        if (!opt) return 'no option matching ' + label;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
        """,
        index,
        label,
    )


def click(text):
    return js(
        """
        const needle = arguments[0];
        const el = [...document.querySelectorAll('button')]
          .find(e => e.innerText.trim().includes(needle));
        if (!el) return 'not found: ' + needle;
        if (el.disabled) return 'disabled: ' + needle;
        el.click();
        return 'ok';
        """,
        text,
    )


def check(label, condition):
    print(("  PASS  " if condition else "  FAIL  ") + label)
    if not condition:
        failures.append(label)


def db_select(sql, params):
    """
    Runs a read-only query through the app's own `db_select` Tauri command —
    the same read path `src/db/appDb.ts` uses, reached via
    `window.__TAURI_INTERNALS__.invoke`, which the webview always injects for
    `@tauri-apps/api` regardless of the `withGlobalTauri` config. `execute/sync`
    cannot await a promise, so this fires the call, stashes the settled result
    on `window`, and polls for it.
    """
    js(
        """
        const [sql, params] = arguments;
        window.__driveDbResult = { pending: true };
        window.__TAURI_INTERNALS__.invoke('db_select', { db: arguments[2], sql, params })
          .then(r => { window.__driveDbResult = { pending: false, ok: true, value: r }; })
          .catch(e => { window.__driveDbResult = { pending: false, ok: false, error: String(e) }; });
        """,
        sql,
        params,
        DB_URL,
    )
    for _ in range(50):
        result = js("return window.__driveDbResult")
        if result and not result.get("pending"):
            if not result["ok"]:
                raise RuntimeError(f"db_select failed: {result['error']}")
            return result["value"]["rows"]
        time.sleep(0.1)
    raise RuntimeError("db_select timed out waiting for a settled result")


def period_exists(barangay_name, year, month):
    rows = db_select(
        "SELECT ap.id FROM accounting_period ap "
        "JOIN barangay b ON b.id = ap.barangay_id "
        "WHERE b.name = ? AND ap.year = ? AND ap.month = ?",
        [barangay_name, int(year), int(month)],
    )
    return len(rows) > 0


def open_books():
    """
    Picker → period card. Back always lands here with the pickers cleared.

    Clicking Proceed reaches `ensurePeriod()` (`period.ts:21-42`), which
    INSERTs a new `accounting_period` row when none exists yet — a write
    path, not a read. This harness is read-only by construction, not by luck:
    it confirms the target period already exists on disk before ever
    clicking, and aborts loudly rather than risk creating one.
    """
    choose(0, BARANGAY)
    choose(1, YEAR)
    choose(2, MONTH)
    time.sleep(0.4)
    if not period_exists(BARANGAY, YEAR, MONTH_NUMBER):
        raise RuntimeError(
            f"refusing to click Proceed: no accounting_period row exists yet for "
            f"{BARANGAY} {MONTH} {YEAR}. Clicking Proceed would INSERT one via "
            f"ensurePeriod() (period.ts:21-42) — this harness must never write to "
            f"the real database (D33). Open this period by hand first if the "
            f"fixture was deleted."
        )
    click("Proceed")
    time.sleep(2.5)


def main():
    global session_id
    session_id = req("POST", "/session", {"capabilities": {"alwaysMatch": {}}})["value"]["sessionId"]

    print("\nTrial Balance, reached from the period card")
    open_books()
    click("View reports")
    time.sleep(2.5)
    tb = screen_text()
    check("as-of date is stated", "As of January 31, 2026" in tb)
    check("barangay is named", BARANGAY in tb)
    check("Cash in Local Treasury row", "Cash in Local Treasury" in tb)
    check("Cash in Bank row", "Cash in Bank" in tb)
    check("figures rendered", "500.00" in tb)
    check("totals row", "Total" in tb)
    check("signature block, no invented name", "Prepared by" in tb and "Certified by" in tb)

    print("\nGeneral Ledger — an abnormal balance must read Cr, not a minus sign")
    click("General Ledger")
    time.sleep(1.5)
    choose(0, ABNORMAL_ACCOUNT)
    time.sleep(2.5)
    gl = screen_text()
    check("shows 500.00 Cr", "500.00 Cr" in gl)
    check("no bare -500.00", "-500.00" not in gl)
    check("no -P500.00", "-₱500.00" not in gl)
    check("closing balance restated", "CLOSING BALANCE" in gl.upper())

    print("\nGeneral Ledger — an account with nothing posted")
    choose(0, UNUSED_ACCOUNT)
    time.sleep(2.5)
    check("says so plainly", "No posted activity" in screen_text())

    print("\nThe voucher screen's own way in, and back out again")
    click("Back")
    time.sleep(1.5)
    open_books()
    click("Open the books")
    time.sleep(3)
    check("voucher screen reached", "New voucher" in screen_text())
    click("View reports")
    time.sleep(2.5)
    check("reports reached from the voucher", "As of January 31, 2026" in screen_text())
    click("Back")
    time.sleep(2.5)
    check("back returns to the voucher, not the picker", "New voucher" in screen_text())

    print("\nThe app's own chrome must not print")
    rule = js(
        """
        for (const sheet of document.styleSheets) {
          let rules; try { rules = sheet.cssRules } catch (e) { continue }
          for (const r of rules) {
            if (r.type === CSSRule.MEDIA_RULE && r.conditionText.includes('print')) {
              return r.cssText.replace(/\\s+/g, ' ');
            }
          }
        }
        return '';
        """
    )
    check("@media print hides the topbar", "topbar" in rule and "none" in rule)

    print()
    if failures:
        print(f"{len(failures)} FAILED: " + "; ".join(failures))
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        if session_id:
            try:
                req("DELETE", "")
            except Exception:
                pass
