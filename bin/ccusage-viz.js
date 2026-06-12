#!/usr/bin/env node

/**
 * ccusage-viz — visualize ccusage JSON reports as bar charts in the terminal.
 *
 * Supports daily / weekly / monthly / blocks reports. The report type is
 * auto-detected from the top-level key; every type is normalized into a
 * common ChartRow shape before rendering.
 */

/**
 * @typedef {object} ChartRow
 * @property {string} label   - 行ラベル(日付・週・月・ブロック開始時刻)
 * @property {number} cost    - USD コスト
 * @property {number} tokens  - 合計トークン数
 * @property {string} [note]  - 行末の補足(blocks のモデル名短縮表記)
 * @property {boolean} [active] - blocks のアクティブブロック
 */

/**
 * @typedef {object} NormalizedReport
 * @property {string} kind - "daily" | "weekly" | "monthly" | "blocks"
 * @property {ChartRow[]} rows
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
      .map(
        (/** @type {any} */ entry) => ({
          label: formatBlockLabel(entry.startTime),
          cost: entry.costUSD,
          tokens: entry.totalTokens,
          note: shortenModels(entry.models),
          active: entry.isActive === true,
        }),
      );
    return { kind: "blocks", rows };
  }
  for (const [kind, labelKey] of Object.entries(LABEL_KEYS)) {
    if (Array.isArray(report[kind])) {
      const rows = report[kind].map(
        (/** @type {any} */ entry) => ({
          label: entry[labelKey] ?? entry.period,
          cost: entry.totalCost,
          tokens: entry.totalTokens,
        }),
      );
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
