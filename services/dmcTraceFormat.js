import { EOL } from "node:os";

/**
 * DMC sidecar file (text.txt): line1 = YYMMDD, line2 = shift + 5-digit serial.
 * Uses OS line endings (CRLF on Windows) so controllers/readers see two real lines.
 */
export function buildDmcTextFileLines({ year, month, day, shift, serialString }) {
  const y = String(year).slice(-2).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const s = String(shift ?? "A").slice(0, 1).toUpperCase();
  const serial = String(serialString).padStart(5, "0").slice(-5);
  return `${y}${m}${d}${EOL}${s}${serial}`;
}
