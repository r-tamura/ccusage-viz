import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const BIN = fileURLToPath(new URL("../bin/ccusage-viz.js", import.meta.url));
const fixture = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

// blocks のラベルがローカル時刻依存のため TZ を固定する。
// stdout はパイプ(非 TTY)なので色は自動オフ、幅はデフォルトの 80 になる。
function run(/** @type {string[]} */ args, /** @type {string} */ input = "") {
  return spawnSync(process.execPath, [BIN, ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
}

// 幅 80・--no-color 時の daily fixture の期待出力(完全一致用)。
const DAILY_EXPECTED = [
  "ccusage daily — 2 days",
  "",
  "Cost (USD)",
  `2026-06-10  ${"█".repeat(30)}▌${" ".repeat(30)}  $1.25`,
  `2026-06-11  ${"█".repeat(61)}  $2.50`,
  "",
  "Tokens",
  `2026-06-10  ${"█".repeat(38)}▏${" ".repeat(22)}  5,000`,
  `2026-06-11  ${"█".repeat(61)}  8,000`,
  "",
  "Total  $3.75 · 13,000 tokens",
  "Peak   $2.50 · 8,000 tokens",
  "Avg    $1.88 · 6,500 tokens",
  "",
].join("\n");

test("renders a daily report from a file argument", () => {
  const result = run([fixture("daily.json")]);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe(DAILY_EXPECTED);
  expect(result.status).toBe(0);
});

test("renders a daily report piped through stdin", () => {
  const result = run([], fs.readFileSync(fixture("daily.json"), "utf8"));
  expect(result.stdout).toBe(DAILY_EXPECTED);
  expect(result.status).toBe(0);
});

test("renders a blocks report: skips gaps, marks ACTIVE, shows projection", () => {
  const result = run([fixture("blocks.json")]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("ccusage blocks — 2 blocks");
  expect(result.stdout).toContain("06-12 05:00");
  expect(result.stdout).toContain("06-12 15:00");
  expect(result.stdout).not.toContain("06-12 10:00"); // gap block
  expect(result.stdout).toContain("[opus-4-7, haiku-4-5-20251001]");
  expect(result.stdout).toContain("⚡ACTIVE");
  expect(result.stdout).toContain("⚡ projection: $4.50 · 18,000 tokens (120 min left)");
});

test("auto-detects weekly and monthly reports", () => {
  expect(run([fixture("weekly.json")]).stdout).toContain("ccusage weekly — 2 weeks");
  expect(run([fixture("monthly.json")]).stdout).toContain("ccusage monthly — 2 months");
});

test("accepts --no-color (no-op when stdout is already a pipe)", () => {
  const result = run(["--no-color", fixture("daily.json")]);
  expect(result.stdout).toBe(DAILY_EXPECTED);
  expect(result.status).toBe(0);
});

test("--help prints usage and exits 0", () => {
  const result = run(["--help"]);
  expect(result.stdout).toMatch(/^Usage: ccusage-viz/);
  expect(result.status).toBe(0);
});

test("--version prints the package version and exits 0", () => {
  const pkg = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );
  const result = run(["--version"]);
  expect(result.stdout).toBe(`${pkg.version}\n`);
  expect(result.status).toBe(0);
});

test("empty input prints usage to stderr and exits 2", () => {
  const result = run([], "");
  expect(result.stderr).toContain("Usage: ccusage-viz");
  expect(result.status).toBe(2);
});

test("invalid JSON exits 1 with an error on stderr", () => {
  const result = run([], "not json");
  expect(result.stderr).toContain("Error: failed to parse input as JSON");
  expect(result.status).toBe(1);
});

test("unknown report type exits 1 with an error on stderr", () => {
  const result = run([], '{"sessions": []}');
  expect(result.stderr).toContain("unsupported report type");
  expect(result.status).toBe(1);
});

test("unreadable file exits 1 with an error on stderr", () => {
  const result = run(["no-such-file.json"]);
  expect(result.stderr).toContain("Error:");
  expect(result.status).toBe(1);
});

test("unknown option prints usage to stderr and exits 2", () => {
  const result = run(["--frobnicate"]);
  expect(result.stderr).toContain("Usage: ccusage-viz");
  expect(result.status).toBe(2);
});
