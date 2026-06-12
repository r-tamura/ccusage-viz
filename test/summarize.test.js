import { expect, test } from "vitest";
import { summarize } from "../bin/ccusage-viz.js";

test("summarizes totals, peaks, and averages from chart rows", () => {
  const rows = [
    { label: "a", cost: 1, tokens: 100 },
    { label: "b", cost: 3, tokens: 500 },
    { label: "c", cost: 2, tokens: 300 },
  ];
  expect(summarize(rows)).toEqual({
    count: 3,
    totalCost: 6,
    totalTokens: 900,
    peakCost: 3,
    peakTokens: 500,
    avgCost: 2,
    avgTokens: 300,
  });
});

test("summarizes an empty row list without dividing by zero", () => {
  expect(summarize([])).toEqual({
    count: 0,
    totalCost: 0,
    totalTokens: 0,
    peakCost: 0,
    peakTokens: 0,
    avgCost: 0,
    avgTokens: 0,
  });
});
