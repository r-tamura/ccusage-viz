#!/usr/bin/env node

/**
 * ccusage-viz — visualize ccusage JSON reports as bar charts in the terminal.
 *
 * Supports daily / weekly / monthly / blocks reports. The report type is
 * auto-detected from the top-level key; every type is normalized into a
 * common ChartRow shape before rendering.
 */

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @typedef {object} ChartRow
 * @property {string} label   - 行ラベル(日付・週・月・ブロック開始時刻)
 * @property {number} cost    - USD コスト
 * @property {number} tokens  - 合計トークン数
 * @property {string} [note]  - 行末の補足(blocks のモデル名短縮表記)
 * @property {boolean} [active] - blocks のアクティブブロック
 */

/**
 * @typedef {object} Projection
 * @property {number} cost
 * @property {number} tokens
 * @property {number} remainingMinutes
 */

/**
 * @typedef {object} NormalizedReport
 * @property {string} kind - "daily" | "weekly" | "monthly" | "blocks"
 * @property {ChartRow[]} rows
 * @property {Projection} [projection] - アクティブブロックの予測(blocks のみ)
 */

/**
 * daily/weekly/monthly のラベルキー。新しめの ccusage は period に統一している
 * ため、種別固有キーが無ければ period にフォールバックする。
 */
const LABEL_KEYS = { daily: "date", weekly: "week", monthly: "month" };

/**
 * Normalize a parsed ccusage JSON report into chart rows.
 *
 * @param {any} report
 * @returns {NormalizedReport}
 */
export function normalizeReport(report) {
  if (Array.isArray(report.blocks)) {
    const rows = report.blocks
      .filter((/** @type {any} */ entry) => entry.isGap !== true)
      .map((/** @type {any} */ entry) => ({
        label: formatBlockLabel(entry.startTime),
        cost: entry.costUSD,
        tokens: entry.totalTokens,
        note: shortenModels(entry.models),
        active: entry.isActive === true,
      }));
    const activeBlock = report.blocks.find(
      (/** @type {any} */ entry) => entry.isActive === true && entry.projection,
    );
    if (activeBlock) {
      return {
        kind: "blocks",
        rows,
        projection: {
          cost: activeBlock.projection.totalCost,
          tokens: activeBlock.projection.totalTokens,
          remainingMinutes: activeBlock.projection.remainingMinutes,
        },
      };
    }
    return { kind: "blocks", rows };
  }
  for (const [kind, labelKey] of Object.entries(LABEL_KEYS)) {
    if (Array.isArray(report[kind])) {
      const rows = report[kind].map((/** @type {any} */ entry) => ({
        label: entry[labelKey] ?? entry.period,
        cost: entry.totalCost,
        tokens: entry.totalTokens,
      }));
      return { kind, rows };
    }
  }
  throw new Error(
    "unsupported report type: expected a top-level daily, weekly, monthly, or blocks key",
  );
}

/**
 * @typedef {object} Summary
 * @property {number} count
 * @property {number} totalCost
 * @property {number} totalTokens
 * @property {number} peakCost
 * @property {number} peakTokens
 * @property {number} avgCost
 * @property {number} avgTokens
 */

/**
 * 正規化済みの行からサマリーを自前集計する。blocks JSON にはトップレベル
 * totals が無いため、全種別ともこの関数で統一的に集計する。
 *
 * @param {ChartRow[]} rows
 * @returns {Summary}
 */
export function summarize(rows) {
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  return {
    count: rows.length,
    totalCost,
    totalTokens,
    peakCost: rows.reduce((max, row) => Math.max(max, row.cost), 0),
    peakTokens: rows.reduce((max, row) => Math.max(max, row.tokens), 0),
    avgCost: rows.length === 0 ? 0 : totalCost / rows.length,
    avgTokens: rows.length === 0 ? 0 : totalTokens / rows.length,
  };
}

/** 端数表現用の 1/8 ブロック文字。index = 1/8 単位の数 (0 は空) */
const EIGHTH_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/**
 * 値を最大値比でスケールした横棒を描画する。端数は 1/8 ブロック文字で表す。
 *
 * @param {number} value
 * @param {number} max - スケール基準の最大値(棒が width いっぱいになる値)
 * @param {number} width - 棒の最大幅(セル数)
 * @returns {string}
 */
export function renderBar(value, max, width) {
  if (max <= 0 || value <= 0) {
    return "";
  }
  const eighths = Math.round((value / max) * width * 8);
  return "█".repeat(Math.floor(eighths / 8)) + EIGHTH_BLOCKS[eighths % 8];
}

/** ANSI カラーコード(依存ゼロ方針のため直書き) */
const ANSI = {
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  reset: "\x1b[39m",
};

/** kind ごとのサマリー/ヘッダ用単位(単数形) */
const UNITS = { daily: "day", weekly: "week", monthly: "month", blocks: "block" };

/**
 * @param {string} text
 * @param {string} colorCode
 * @param {boolean} enabled
 * @returns {string}
 */
function paint(text, colorCode, enabled) {
  if (enabled) {
    return `${colorCode}${text}${ANSI.reset}`;
  } else {
    return text;
  }
}

/** @param {number} value */
function formatCost(value) {
  return `$${value.toFixed(2)}`;
}

/** @param {number} value */
function formatTokens(value) {
  return Math.round(value).toLocaleString("en-US");
}

/**
 * 1 メトリクス分の棒グラフ行を組み立てる。
 *
 * @param {ChartRow[]} rows
 * @param {object} options
 * @param {(row: ChartRow) => number} options.valueOf
 * @param {(value: number) => string} options.format
 * @param {string} options.barColor
 * @param {boolean} options.withNotes - blocks のモデル名注記と ACTIVE 強調を付ける
 * @param {number} options.width
 * @param {boolean} options.color
 * @returns {string[]}
 */
function renderChart(rows, { valueOf, format, barColor, withNotes, width, color }) {
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const values = rows.map((row) => format(valueOf(row)));
  const valueWidth = Math.max(...values.map((value) => value.length));
  const barWidth = Math.max(10, width - labelWidth - valueWidth - 4);
  const maxValue = Math.max(...rows.map(valueOf));
  return rows.map((row, i) => {
    const bar = renderBar(valueOf(row), maxValue, barWidth).padEnd(barWidth);
    let line = `${row.label.padEnd(labelWidth)}  ${paint(bar, barColor, color)}  ${values[i].padStart(valueWidth)}`;
    if (withNotes) {
      if (row.note) {
        line += `  [${row.note}]`;
      }
      if (row.active) {
        line += `  ${paint("⚡ACTIVE", ANSI.yellow, color)}`;
      }
    }
    return line;
  });
}

/**
 * 正規化済みレポートを描画して 1 つの文字列(末尾改行付き)にする。
 *
 * @param {NormalizedReport} normalized
 * @param {{ width: number, color: boolean }} options
 * @returns {string}
 */
export function renderReport(normalized, { width, color }) {
  const { kind, rows, projection } = normalized;
  const unit = UNITS[/** @type {keyof typeof UNITS} */ (kind)];
  const summary = summarize(rows);
  const header = `ccusage ${kind} — ${summary.count} ${unit}${summary.count === 1 ? "" : "s"}`;
  if (rows.length === 0) {
    return `${header}\n\n(no data)\n`;
  }
  const chartOptions = { withNotes: kind === "blocks", width, color };
  const lines = [
    header,
    "",
    "Cost (USD)",
    ...renderChart(rows, {
      valueOf: (row) => row.cost,
      format: formatCost,
      barColor: ANSI.cyan,
      ...chartOptions,
    }),
    "",
    "Tokens",
    ...renderChart(rows, {
      valueOf: (row) => row.tokens,
      format: formatTokens,
      barColor: ANSI.magenta,
      withNotes: false,
      width,
      color,
    }),
    "",
  ];
  if (projection) {
    lines.push(
      `⚡ projection: ${formatCost(projection.cost)} · ${formatTokens(projection.tokens)} tokens (${projection.remainingMinutes} min left)`,
      "",
    );
  }
  lines.push(
    `Total  ${formatCost(summary.totalCost)} · ${formatTokens(summary.totalTokens)} tokens`,
    `Peak   ${formatCost(summary.peakCost)} · ${formatTokens(summary.peakTokens)} tokens`,
    `Avg    ${formatCost(summary.avgCost)} · ${formatTokens(summary.avgTokens)} tokens`,
    "",
  );
  return lines.join("\n");
}

/**
 * blocks の開始時刻をローカル時刻の "MM-DD HH:mm" に整形する。
 *
 * @param {string} isoTime
 * @returns {string}
 */
function formatBlockLabel(isoTime) {
  const time = new Date(isoTime);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

/**
 * モデル ID の冗長な "claude-" プレフィックスを落として行末注記用に短縮する。
 *
 * @param {string[] | undefined} models
 * @returns {string}
 */
function shortenModels(models) {
  if (!Array.isArray(models)) {
    return "";
  }
  return models.map((model) => model.replace(/^claude-/, "")).join(", ");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: ccusage-viz [options] [file]

Visualize ccusage JSON reports (daily/weekly/monthly/blocks) as bar charts.
Reads JSON from a file argument or stdin:

  npx ccusage@latest daily --json | ccusage-viz
  npx ccusage@latest blocks --json > report.json && ccusage-viz report.json

Options:
  --no-color     Disable colored output (also disabled by NO_COLOR / non-TTY)
  -h, --help     Show this help
  -v, --version  Show version
`;

/**
 * @param {string[]} argv
 * @returns {{ help: boolean, version: boolean, noColor: boolean, file?: string }}
 */
function parseArgs(argv) {
  /** @type {{ help: boolean, version: boolean, noColor: boolean, file?: string }} */
  const parsed = { help: false, version: false, noColor: false };
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
    } else if (arg === "-v" || arg === "--version") {
      parsed.version = true;
    } else if (arg === "--no-color") {
      parsed.noColor = true;
    } else if (arg.startsWith("-")) {
      throw new RangeError(`unknown option: ${arg}`);
    } else {
      parsed.file = arg;
    }
  }
  return parsed;
}

/** @returns {Promise<string>} */
async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

async function main() {
  /** @type {ReturnType<typeof parseArgs>} */
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Error: ${/** @type {Error} */ (error).message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.version) {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  let input;
  if (args.file !== undefined) {
    try {
      input = readFileSync(args.file, "utf8");
    } catch (error) {
      process.stderr.write(`Error: ${/** @type {Error} */ (error).message}\n`);
      process.exitCode = 1;
      return;
    }
  } else if (process.stdin.isTTY) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  } else {
    input = await readStdin();
  }
  if (input.trim() === "") {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  let report;
  try {
    report = JSON.parse(input);
  } catch {
    process.stderr.write("Error: failed to parse input as JSON\n");
    process.exitCode = 1;
    return;
  }

  let normalized;
  try {
    normalized = normalizeReport(report);
  } catch (error) {
    process.stderr.write(`Error: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 1;
    return;
  }

  const color =
    !args.noColor && process.env.NO_COLOR === undefined && process.stdout.isTTY === true;
  const width = process.stdout.columns ?? 80;
  process.stdout.write(renderReport(normalized, { width, color }));
}

// テストから import されたときに main が走らないよう、直接実行時のみ起動する。
// npx は bin をシンボリックリンクで配置するため realpath で比較する。
let isMain = false;
try {
  isMain =
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
} catch {
  isMain = false;
}
if (isMain) {
  await main();
}
