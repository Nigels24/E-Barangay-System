/**
 * One-time developer sync: fetches Pagadian City's barangay list from
 * PSGC and prints a ready-to-review TypeScript array to stdout.
 *
 * This is the ONLY place in the whole project that calls the live PSGC
 * API. The shipped app never does — it runs entirely offline, reading
 * only from its local SQLite database. Run this on a machine with
 * internet, review the output against decisions.md D29 (trim whitespace,
 * sanity-check names, keep isNameConfirmed honest), and paste the
 * reviewed result into src/db/seed/barangays.ts by hand. Do not pipe this
 * script's output directly into the seed file unreviewed.
 *
 *   npm run sync:barangays
 */
import { getBarangaysByCity, PAGADIAN_CITY_CODE } from "../src/lib/psgc";

/**
 * Repairs the classic "UTF-8 bytes misread as Latin-1" mojibake (e.g. the
 * source API returning "NiÃ±o" for "Niño") by round-tripping through the
 * two encodings. Only applies the fix when it actually removes a mojibake
 * marker and doesn't introduce the U+FFFD replacement character — anything
 * else is left untouched rather than guessed at.
 */
function repairMojibake(name: string): { name: string; wasRepaired: boolean } {
  if (!/[ÃÂ]/.test(name)) return { name, wasRepaired: false };
  const attempt = Buffer.from(name, "latin1").toString("utf8");
  if (attempt.includes("�") || attempt === name) return { name, wasRepaired: false };
  return { name: attempt, wasRepaired: true };
}

async function main() {
  const raw = await getBarangaysByCity(PAGADIAN_CITY_CODE);
  console.log(`Fetched ${raw.length} barangays for city code ${PAGADIAN_CITY_CODE}.\n`);

  const withWhitespace = raw.filter((b) => b.name !== b.name.trim());
  if (withWhitespace.length > 0) {
    console.log(`⚠ ${withWhitespace.length} name(s) have leading/trailing whitespace in the source data:`);
    for (const b of withWhitespace) console.log(`  "${b.name}" (${b.code})`);
  }

  const repairs = raw.map((b) => ({ ...b, repaired: repairMojibake(b.name.trim()) }));
  const withMojibake = repairs.filter((b) => b.repaired.wasRepaired);
  if (withMojibake.length > 0) {
    console.log(`⚠ ${withMojibake.length} name(s) had encoding corruption (repaired below):`);
    for (const b of withMojibake) console.log(`  "${b.name}" -> "${b.repaired.name}" (${b.code})`);
  }
  console.log("\nThe array below has whitespace trimmed and encoding repaired — review still recommended.\n");

  const lines = repairs
    .map((b) => {
      const name = `Barangay ${b.repaired.name}`;
      const isUpperSibatang = b.repaired.name === "Upper Sibatang";
      return `  { code: "${b.code}", name: "${name}"${isUpperSibatang ? ", isNameConfirmed: true" : ""} },`;
    })
    .join("\n");

  console.log("--- paste into SEED_BARANGAYS in src/db/seed/barangays.ts after review ---\n");
  console.log(`[\n${lines}\n]`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exitCode = 1;
});
