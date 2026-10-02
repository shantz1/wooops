import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, reportCsv, reportCurrencyTotals } from "../src/lib/reports.ts";

test("report totals preserve exact arithmetic and keep currencies separate", () => {
  const totals = reportCurrencyTotals([
    { currency: "USD", total: "0.10", refunds: [] },
    { currency: "USD", total: "0.20", refunds: [{ total: "-0.05" }] },
    { currency: "JPY", total: "1500", refunds: [] },
  ]);
  assert.deepEqual(totals, [
    { currency: "USD", orders: 2, valid: true, total: "0.30", refunds: "0.05", after_refunds: "0.25" },
    { currency: "JPY", orders: 1, valid: true, total: "1500", refunds: "0", after_refunds: "1500" },
  ]);
  assert.equal(reportCurrencyTotals([{ currency: "USD", total: "broken" }])[0].valid, false);
});

test("CSV quotes multiline cells and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const value of ["=1+1", " +SUM(A1)", "-2+3", "@SUM(A1)", "\tformula", "\rformula"]) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
  assert.equal(csvCell("10.20"), '"10.20"');
  assert.equal(reportCsv([["SKU", "Qty"], ["abc", 5]]), '\uFEFF"SKU","Qty"\r\n"abc","5"');
});
