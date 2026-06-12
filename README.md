# ccusage-viz

Visualize [ccusage](https://github.com/ryoppippi/ccusage) JSON reports as bar
charts in your terminal. Unlike similar tools, it supports the `blocks`
(5-hour billing block) report, including the active block and its projection.

```
ccusage blocks — 130 blocks

Cost (USD)
06-12 05:00  ██████████████▌                            $61.47  [opus-4-7]
06-12 10:00  ██████████████████████████████████████████  $178.21  [opus-4-7]
06-12 15:00  ███████████████████▎                       $81.13  [opus-4-7]  ⚡ACTIVE

Tokens
06-12 05:00  ████████████▊                            53,413,302
...

⚡ projection: $188.60 · 104,498,639 tokens (145 min left)

Total  $6295.11 · 6,866,765,761 tokens
Peak   $246.83 · 226,723,621 tokens
Avg    $48.42 · 52,821,275 tokens
```

## Usage

Pipe any ccusage JSON report into it, or pass a file:

```sh
ccusage daily --json | npx github:r-tamura/ccusage-viz
ccusage blocks --json | npx github:r-tamura/ccusage-viz

ccusage monthly --json > report.json
npx github:r-tamura/ccusage-viz report.json
```

All four report types (`daily` / `weekly` / `monthly` / `blocks`) are
auto-detected from the JSON — no subcommands.

Filtering is ccusage's job — use its options to limit the range. For example,
`blocks` can grow to hundreds of rows, so narrow it down on the ccusage side:

```sh
# last 3 days (ccusage built-in)
ccusage blocks --recent --json | npx github:r-tamura/ccusage-viz

# last 7 days (macOS date)
ccusage blocks --since "$(date -v-7d +%Y%m%d)" --json | npx github:r-tamura/ccusage-viz
```

### Options

| Option          | Description                                              |
| --------------- | -------------------------------------------------------- |
| `--no-color`    | Disable colors (also via `NO_COLOR` env or non-TTY pipe) |
| `-h, --help`    | Show help                                                |
| `-v, --version` | Show version                                             |

### Requirements

- Node.js >= 18
- Zero runtime dependencies

## Development

```sh
pnpm install
pnpm test       # vitest
pnpm typecheck  # tsc (checkJs)
pnpm lint       # oxlint
pnpm format     # oxfmt
```

## License

MIT
