import { expect, test } from "vitest";
import { normalizeReport } from "../bin/ccusage-viz.js";

// blocks のラベルはローカル時刻に整形されるため、テストでは TZ を固定する。
// Node は process.env.TZ の動的変更を Date に反映する。
process.env.TZ = "UTC";

const block = (/** @type {object} */ overrides) => ({
  id: "2026-06-12T10:00:00.000Z",
  startTime: "2026-06-12T10:00:00.000Z",
  endTime: "2026-06-12T15:00:00.000Z",
  isActive: false,
  isGap: false,
  costUSD: 1.5,
  totalTokens: 6000,
  models: ["claude-opus-4-7"],
  ...overrides,
});

test("normalizes blocks: local-time label, shortened model note", () => {
  const report = { blocks: [block({})] };
  expect(normalizeReport(report)).toEqual({
    kind: "blocks",
    rows: [
      {
        label: "06-12 10:00",
        cost: 1.5,
        tokens: 6000,
        note: "opus-4-7",
        active: false,
      },
    ],
  });
});

test("skips gap blocks", () => {
  const report = {
    blocks: [
      block({}),
      block({ id: "gap-1", isGap: true, costUSD: 0, totalTokens: 0 }),
    ],
  };
  expect(normalizeReport(report).rows).toHaveLength(1);
});

test("marks the active block and joins multiple models", () => {
  const report = {
    blocks: [
      block({
        isActive: true,
        models: ["claude-opus-4-7", "claude-haiku-4-5-20251001"],
      }),
    ],
  };
  expect(normalizeReport(report).rows[0]).toMatchObject({
    active: true,
    note: "opus-4-7, haiku-4-5-20251001",
  });
});
