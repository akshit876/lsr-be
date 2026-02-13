/**
 * Analyzes main-data.records.json from Jan 26 onwards for serial number logic issues.
 * Run: node scripts/analyze-serial-records.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDS_PATH =
  process.env.RECORDS_JSON ||
  path.join("c:\\Users\\ADMIN\\Documents", "main-data.records.json");

const CUTOFF = new Date("2026-01-26T00:00:00.000Z");

function parseMarkingData(md) {
  if (!md || typeof md !== "string") return null;
  const match = md.match(/A(\d{2})[A-Z](\d{2})([ABC])(\d+)/i);
  if (!match) return null;
  return {
    dayOfYear: match[1],
    year: match[2],
    shift: match[3].toUpperCase(),
    serialStr: match[4],
    serialNum: parseInt(match[4], 10),
  };
}

function main() {
  console.log("Reading", RECORDS_PATH, "\n");
  let raw;
  try {
    raw = fs.readFileSync(RECORDS_PATH, "utf8");
  } catch (e) {
    console.error("Failed to read file:", e.message);
    process.exit(1);
  }

  let records;
  try {
    records = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON:", e.message);
    process.exit(1);
  }

  const fromCutoff = records.filter((r) => {
    const t = r.Timestamp?.$date ? new Date(r.Timestamp.$date) : null;
    return t && t >= CUTOFF;
  });

  fromCutoff.sort((a, b) => {
    const ta = new Date(a.Timestamp?.$date || 0);
    const tb = new Date(b.Timestamp?.$date || 0);
    return ta - tb;
  });

  console.log("=== Records from 2026-01-26 onwards:", fromCutoff.length, "===\n");

  const issues = [];
  let prev = null;
  let prevDateStr = null;
  let prevBarcodeDay = null;
  let prevSerial = null;
  let prevShift = null;

  for (let i = 0; i < fromCutoff.length; i++) {
    const r = fromCutoff[i];
    const ts = r.Timestamp?.$date ? new Date(r.Timestamp?.$date) : null;
    const dateStr = ts ? ts.toISOString().slice(0, 10) : "";
    const parsed = parseMarkingData(r.MarkingData);
    const serialStr = r.SerialNumber;
    const serialNum = parseInt(serialStr, 10);

    if (!parsed) continue;

    const barcodeDay = parsed.dayOfYear;
    const shift = parsed.shift;

    if (prev !== null) {
      const prevParsed = parseMarkingData(prev.MarkingData);
      if (!prevParsed) {
        prev = r;
        prevDateStr = dateStr;
        prevBarcodeDay = barcodeDay;
        prevSerial = serialNum;
        prevShift = shift;
        continue;
      }

      const sameCalendarDay = dateStr === prevDateStr;
      const sameBarcodeDay = barcodeDay === prevBarcodeDay;
      const shiftChanged = shift !== prevShift;

      // BUG 1: Same calendar day, serial reset to 0001 (and not first record of day)
      if (sameCalendarDay && serialNum === 1 && prevSerial > 1) {
        issues.push({
          type: "SAME_DAY_RESET",
          msg: "Serial reset to 0001 on same calendar day",
          when: ts?.toISOString(),
          prev: prev.MarkingData,
          prevSerial: prevSerial,
          curr: r.MarkingData,
          currSerial: serialStr,
        });
      }

      // BUG 2: Same barcode day, serial reset to 0001 (duplicate "first of day")
      if (sameBarcodeDay && serialNum === 1 && prevSerial > 1) {
        issues.push({
          type: "SAME_BARCODE_DAY_RESET",
          msg: "Serial 0001 again within same barcode day (day " + barcodeDay + ")",
          when: ts?.toISOString(),
          prev: prev.MarkingData,
          prevSerial: prevSerial,
          curr: r.MarkingData,
        });
      }

      // BUG 3: Shift change and serial reset to 0001 (should continue)
      if (shiftChanged && serialNum === 1 && prevSerial > 0) {
        issues.push({
          type: "RESET_ON_SHIFT_CHANGE",
          msg: `Shift changed ${prevShift}→${shift} but serial reset to 0001 (expected next: ${prevSerial + 1})`,
          when: ts?.toISOString(),
          prev: prev.MarkingData,
          prevSerial: prevSerial,
          curr: r.MarkingData,
        });
      }

      // BUG 4: Serial went backwards (same or next day)
      if (sameBarcodeDay && serialNum < prevSerial && serialNum !== 1) {
        issues.push({
          type: "SERIAL_WENT_BACKWARDS",
          msg: `Serial went backwards within same barcode day: ${prevSerial} → ${serialNum}`,
          when: ts?.toISOString(),
          prev: prev.MarkingData,
          curr: r.MarkingData,
        });
      }

      // BUG 5: Serial jumped down to 1 on new barcode day but prev was same barcode day (e.g. 27→27 with 0001)
      if (serialNum === 1 && sameBarcodeDay && prevSerial > 1) {
        // already caught by SAME_BARCODE_DAY_RESET
      }
    }

    prev = r;
    prevDateStr = dateStr;
    prevBarcodeDay = barcodeDay;
    prevSerial = serialNum;
    prevShift = shift;
  }

  // Summary by type
  const byType = {};
  issues.forEach((i) => {
    byType[i.type] = (byType[i.type] || 0) + 1;
  });

  console.log("=== ISSUES FOUND:", issues.length, "===\n");
  console.log("By type:", byType, "\n");

  if (issues.length > 0) {
    console.log("--- Details (first 50) ---\n");
    issues.slice(0, 50).forEach((u, idx) => {
      console.log(`${idx + 1}. [${u.type}] ${u.msg}`);
      console.log(`   When: ${u.when}`);
      console.log(`   Prev: ${u.prev} (serial ${u.prevSerial})`);
      console.log(`   Curr: ${u.curr} (serial ${u.currSerial || ""})`);
      console.log("");
    });
    if (issues.length > 50) {
      console.log(`... and ${issues.length - 50} more.\n`);
    }
  } else {
    console.log("No bad behaviors detected from Jan 26 onwards.");
  }

  // Extra: list all "0001" occurrences with context (date, barcode day, shift)
  const all0001 = fromCutoff.filter((r) => r.SerialNumber === "0001" || r.SerialNumber === "001");
  console.log("\n=== All serial 0001/001 from Jan 26 (count:", all0001.length, ") ===");
  all0001.slice(0, 30).forEach((r, i) => {
    const ts = r.Timestamp?.$date;
    const p = parseMarkingData(r.MarkingData);
    console.log(
      `${i + 1}. ${ts} | ${r.MarkingData} | barcode_day=${p?.dayOfYear} shift=${p?.shift}`
    );
  });
  if (all0001.length > 30) console.log("... and", all0001.length - 30, "more.");
}

main();
