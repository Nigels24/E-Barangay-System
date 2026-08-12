/**
 * PSGC (Philippine Standard Geographic Code) lookups.
 *
 * IMPORTANT — this module is NOT called at runtime by the shipped app. This
 * app runs entirely offline on the office PC (that has been the whole point
 * of the SQLite/Tauri architecture since Task 1). This function exists
 * only for the one-time developer sync in scripts/sync-barangays.ts, which
 * fetches the barangay list once, on a machine that has internet, and its
 * reviewed output becomes real seed data in src/db/seed/barangays.ts.
 *
 * City codes are stable, so Pagadian City's is a plain constant rather
 * than something looked up at runtime.
 */

/** Pagadian City's PSGC code, confirmed live against the API on 2026-08-12. */
export const PAGADIAN_CITY_CODE = "0907322000";

export interface PsgcBarangay {
  name: string;
  code: string;
  /** Present in psgc.cloud's response but of unconfirmed meaning (looks like population figures, not a status enum) — not used by this app. */
  status?: string;
}

/**
 * Fetches the barangay list for a city/municipality from the PSGC Cloud
 * API (psgc.cloud — a community-run mirror of PSA's official data, not
 * PSA itself; see docs/decisions.md D29 for the trust reasoning).
 */
export async function getBarangaysByCity(cityCode: string): Promise<PsgcBarangay[]> {
  const url = `https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PSGC lookup failed: ${response.status} ${response.statusText} (${url})`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`PSGC lookup returned an unexpected shape (expected an array) from ${url}`);
  }
  for (const item of data) {
    if (typeof item?.name !== "string" || typeof item?.code !== "string") {
      throw new Error(`PSGC lookup returned a malformed entry: ${JSON.stringify(item)}`);
    }
  }
  return data as PsgcBarangay[];
}
