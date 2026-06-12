import { expect, test } from "vitest";
import { normalizeReport } from "../bin/ccusage-viz.js";

test("normalizes weekly report using the week key", () => {
  const report = {
    weekly: [{ week: "2026-06-08", totalCost: 10, totalTokens: 40000 }],
  };
  expect(normalizeReport(report)).toEqual({
    kind: "weekly",
    rows: [{ label: "2026-06-08", cost: 10, tokens: 40000 }],
  });
});

test("normalizes monthly report using the month key", () => {
  const report = {
    monthly: [{ month: "2026-06", totalCost: 30, totalTokens: 120000 }],
  };
  expect(normalizeReport(report)).toEqual({
    kind: "monthly",
    rows: [{ label: "2026-06", cost: 30, tokens: 120000 }],
  });
});

test("falls back to the period key used by newer ccusage", () => {
  const report = {
    daily: [{ period: "2026-06-10", totalCost: 1, totalTokens: 100 }],
  };
  expect(normalizeReport(report).rows[0].label).toBe("2026-06-10");
});

test("throws on a report without a known top-level key", () => {
  expect(() => normalizeReport({ sessions: [] })).toThrow(
    "unsupported report type",
  );
});

test("normalizes daily report to chart rows", () => {
  const report = {
    daily: [
      { date: "2026-06-10", totalCost: 1.25, totalTokens: 5000 },
      { date: "2026-06-11", totalCost: 2.5, totalTokens: 8000 },
    ],
  };
  expect(normalizeReport(report)).toEqual({
    kind: "daily",
    rows: [
      { label: "2026-06-10", cost: 1.25, tokens: 5000 },
      { label: "2026-06-11", cost: 2.5, tokens: 8000 },
    ],
  });
});
