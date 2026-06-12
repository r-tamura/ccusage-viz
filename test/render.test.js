import { expect, test } from "vitest";
import { renderBar, renderReport } from "../bin/ccusage-viz.js";

test("renders the max value as a full-width bar", () => {
  expect(renderBar(10, 10, 4)).toBe("████");
});

test("renders a half value as a half-width bar", () => {
  expect(renderBar(5, 10, 4)).toBe("██");
});

test("renders sub-cell remainders with 1/8 block characters", () => {
  // 1/16 of width 4 = 0.25 cells = 2 eighths
  expect(renderBar(1, 16, 4)).toBe("▎");
});

test("renders zero as an empty bar", () => {
  expect(renderBar(0, 10, 4)).toBe("");
});

test("renders nothing when the max itself is zero", () => {
  expect(renderBar(0, 0, 4)).toBe("");
});

test("renders a daily report with charts and summary", () => {
  const normalized = {
    kind: "daily",
    rows: [
      { label: "2026-06-10", cost: 1.25, tokens: 5000 },
      { label: "2026-06-11", cost: 2.5, tokens: 8000 },
    ],
  };
  expect(renderReport(normalized, { width: 30, color: false })).toBe(
    [
      "ccusage daily — 2 days",
      "",
      "Cost (USD)",
      "2026-06-10  █████▌       $1.25",
      "2026-06-11  ███████████  $2.50",
      "",
      "Tokens",
      "2026-06-10  ██████▉      5,000",
      "2026-06-11  ███████████  8,000",
      "",
      "Total  $3.75 · 13,000 tokens",
      "Peak   $2.50 · 8,000 tokens",
      "Avg    $1.88 · 6,500 tokens",
      "",
    ].join("\n"),
  );
});

test("renders a blocks report with notes, ACTIVE marker, and projection", () => {
  const normalized = {
    kind: "blocks",
    rows: [
      {
        label: "06-12 10:00",
        cost: 1.5,
        tokens: 6000,
        note: "opus-4-7",
        active: false,
      },
      {
        label: "06-12 15:00",
        cost: 3,
        tokens: 12000,
        note: "opus-4-7",
        active: true,
      },
    ],
    projection: { cost: 4.5, tokens: 18000, remainingMinutes: 120 },
  };
  expect(renderReport(normalized, { width: 32, color: false })).toBe(
    [
      "ccusage blocks — 2 blocks",
      "",
      "Cost (USD)",
      "06-12 10:00  ██████        $1.50  [opus-4-7]",
      "06-12 15:00  ████████████  $3.00  [opus-4-7]  ⚡ACTIVE",
      "",
      "Tokens",
      "06-12 10:00  █████▌        6,000",
      "06-12 15:00  ███████████  12,000",
      "",
      "⚡ projection: $4.50 · 18,000 tokens (120 min left)",
      "",
      "Total  $4.50 · 18,000 tokens",
      "Peak   $3.00 · 12,000 tokens",
      "Avg    $2.25 · 9,000 tokens",
      "",
    ].join("\n"),
  );
});

test("uses singular units for a single row", () => {
  const normalized = {
    kind: "daily",
    rows: [{ label: "2026-06-10", cost: 1, tokens: 100 }],
  };
  expect(renderReport(normalized, { width: 30, color: false })).toContain(
    "ccusage daily — 1 day\n",
  );
});

test("colors cost bars cyan, token bars magenta, and active rows yellow", () => {
  const normalized = {
    kind: "blocks",
    rows: [
      {
        label: "06-12 15:00",
        cost: 3,
        tokens: 12000,
        note: "opus-4-7",
        active: true,
      },
    ],
  };
  const out = renderReport(normalized, { width: 32, color: true });
  expect(out).toContain("\x1b[36m"); // cyan cost bar
  expect(out).toContain("\x1b[35m"); // magenta tokens bar
  expect(out).toContain("\x1b[33m"); // yellow ACTIVE marker
  const plain = renderReport(normalized, { width: 32, color: false });
  expect(plain).not.toContain("\x1b[");
});

test("renders an empty report without charts", () => {
  expect(renderReport({ kind: "daily", rows: [] }, { width: 30, color: false })).toBe(
    "ccusage daily — 0 days\n\n(no data)\n",
  );
});

test("marks limit-hit rows with ⚠LIMIT and paints them red", () => {
  const normalized = {
    kind: "blocks",
    rows: [
      {
        label: "06-12 10:00",
        cost: 1.5,
        tokens: 6000,
        note: "opus-4-7",
        active: false,
        limitHit: true,
      },
      {
        label: "06-12 15:00",
        cost: 3,
        tokens: 12000,
        note: "opus-4-7",
        active: true,
        limitHit: true,
      },
    ],
  };
  const plain = renderReport(normalized, { width: 32, color: false });
  expect(plain).toContain("$1.50  [opus-4-7]  ⚠LIMIT");
  expect(plain).toContain("$3.00  [opus-4-7]  ⚡ACTIVE  ⚠LIMIT");
  const colored = renderReport(normalized, { width: 32, color: true });
  expect(colored).toContain("\x1b[31m"); // red bars and marker
});
