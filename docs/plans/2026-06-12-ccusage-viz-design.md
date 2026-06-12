# ccusage-viz 設計ドキュメント

日付: 2026-06-12
ステータス: 承認済み(実装前)

## 目的

[ccusage](https://github.com/ryoppippi/ccusage) の JSON レポートをターミナルで棒グラフ可視化する CLI ツール。
既存の [ccusage-graph](https://github.com/Einere/ccusage-graph) が `blocks`(5時間課金ブロック)
レポートに非対応である点を補う上位互換として実装する。

## 確定済みの意思決定

| 論点           | 決定                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| 名前           | `ccusage-viz`(npm には公開しない)                                                    |
| 配布           | `npx github:r-tamura/ccusage-viz`。タグ `v0.0.1` を切って案内                        |
| 実装形態       | JS 1ファイル(`bin/ccusage-viz.js`、shebang 付き)+ JSDoc 型注釈                       |
| 依存           | ランタイム依存ゼロ。devDeps は typescript / vitest / oxlint / oxfmt(+ @types/node)   |
| ツールチェーン | パッケージ管理は pnpm、テストは vitest、リンターは oxlint、フォーマッタは oxfmt      |
| 入力           | パイプ(stdin)/ファイル引数のみ。ccusage を内部実行しない                             |
| 対応種別       | daily / weekly / monthly / blocks 全部。トップレベルキーで自動判別、サブコマンドなし |
| オプション     | `--help` / `--version` / `--no-color` のみ                                           |
| Node 要件      | >= 18                                                                                |

### TS 1ファイルにしない理由(実証済みの制約)

Node(v26.2.0 で実証)は node_modules 配下の TS の type stripping を
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` で拒否する。
`npx github:...` は `~/.npm/_npx/<hash>/node_modules/` に展開するため必ずこの制約を踏む。
そのため JS + JSDoc 型注釈(`tsc --checkJs --noEmit` で検査)を採用する。

## アーキテクチャ

### 正規化レイヤ

4種別すべてを共通の中間表現に正規化してから描画する。

```js
/**
 * @typedef {object} ChartRow
 * @property {string} label   - 行ラベル(日付・週・月・ブロック開始時刻)
 * @property {number} cost    - USD コスト
 * @property {number} tokens  - 合計トークン数
 * @property {string} [note]  - 行末の補足(blocks のモデル名短縮表記など)
 * @property {boolean} [active] - blocks のアクティブブロック
 */
```

- サマリー(合計/ピーク/平均)は正規化後の `ChartRow[]` から自前集計する。
  blocks JSON にはトップレベル `totals` が無いため。daily 系も同じ集計関数を通し、
  `totals` キーに依存しない。

### 種別判別とラベル

トップレベルキーの存在で判別する: `daily` / `weekly` / `monthly` / `blocks`。
未知のキーのみの場合はエラー(exit 1)。

| 種別    | ラベル元キー                                    |
| ------- | ----------------------------------------------- |
| daily   | `date`(新しめの ccusage では `period`)          |
| weekly  | `week`(同上 `period`)                           |
| monthly | `month`(同上 `period`)                          |
| blocks  | `startTime` をローカル時刻 `MM-DD HH:mm` に整形 |

daily/weekly/monthly の見た目は ccusage-graph 互換を保つ。

### blocks の扱い

- `isGap: true` の要素は表示しない
- `isActive: true` の行は黄色 + `⚡ACTIVE` で強調
- アクティブブロックに `projection` があれば 1 行注記を出す
- 各行の行末に `models[]` の短縮表記を付ける(例 `claude-opus-4-7` → `opus-4-7`)

#### blocks JSON の実スキーマ(`npx ccusage@latest blocks --json` で確認済み)

`blocks[]` 配列。各要素:
`id`, `startTime`, `endTime`, `actualEndTime`, `isActive`, `isGap`, `entries`,
`costUSD`, `totalTokens`,
`tokenCounts{inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens}`,
`burnRate`(非アクティブは null), `projection`(同), `models[]`。
gap 要素は `id` が `gap-...` で `isGap: true`。トップレベル `totals` は無い。

### 描画

- メトリクス: コスト棒グラフ + トークン棒グラフ + サマリー(合計/ピーク/平均)
- 横棒グラフ。最大値を端末幅(`process.stdout.columns`、非 TTY は 80)にスケール
- 端数は 1/8 ブロック文字 `▏▎▍▌▋▊▉█` で表現
- 色は ANSI エスケープ直書きのヘルパ関数(コスト=シアン、トークン=マゼンタ、ACTIVE=黄)
- `--no-color` 指定時、`NO_COLOR` 環境変数あり、または非 TTY のときは色を自動オフ

### エラー処理

メッセージは英語、出力先は stderr。

| 状況                                        | 挙動                    |
| ------------------------------------------- | ----------------------- |
| 入力なし(stdin が TTY かつファイル引数なし) | usage を表示して exit 2 |
| JSON パース失敗                             | exit 1                  |
| 未知のトップレベルキー                      | exit 1                  |

## テスト戦略

- t-wada 流 TDD(Red → Green → Refactor)で実装する
- 4種別の実 JSON の縮小版 fixture を `test/fixtures/` に置く
- CLI を子プロセス実行して stdout 完全一致で検証(色は `--no-color` で固定)
- 正規化・スケーリングは関数単体でも検証する

## CI

GitHub Actions で以下を実行(pnpm でセットアップ):

- `tsc`(checkJs + noEmit)による型検査
- `vitest run`
- `oxlint`
