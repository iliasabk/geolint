# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-16

### Added
- `llms-txt/links-blocked-by-robots` — warns when llms.txt recommends pages
  that robots.txt disallows for AI answer/fetch bots (#2).
- Score-over-time trends in the dogfood metrics: `metrics/history.json`
  (rolling 90-run history), per-site sparklines and a combined `trends.svg`
  chart in the index (#3).
- Per-page drill-down in `crawl -f html` site reports — every page expands
  into its own mini report (score ring, fetch meta, findings) (#5).
- MCP progress reporting: `audit_url`, `compare_urls` and
  `generate_llms_txt` emit `notifications/progress` when the client sends
  `_meta.progressToken` (#6).


## [0.3.2] - 2026-09-15

### Added
- `server.json` + `mcpName` — official MCP registry manifest; releases now
  auto-publish to registry.modelcontextprotocol.io via GitHub OIDC.
- CI test matrix covers macOS and Windows in addition to Ubuntu (#4).
- Showcase serves the repo `llms.txt` at the site root.

## [0.3.0] - 2026-09-14

### Added

- **HTML report**: `-f html` renders a self-contained interactive report —
  animated score ring, filterable findings, per-category breakdown and the
  full bot matrix, zero external resources (see
  [docs/reports.md](docs/reports.md)).
- **6 new audit rules** (51 total): `technical/sitemap-quality`,
  `schema/required-fields`, `llms-txt/ai-manifest`, `content/answer-first`,
  `content/self-contained-paragraphs`, `content/stale-dates` — see
  [docs/rules.md](docs/rules.md).
- **PR comments in the GitHub Action**: `comment: 'true'` creates/updates a
  single sticky report comment on pull_request events (requires
  `pull-requests: write`) — see [docs/github-action.md](docs/github-action.md).
- **Dogfooding metrics**: `.github/workflows/dogfood.yml` re-audits eight
  well-known sites nightly and commits score badges to
  [`metrics/`](metrics/README.md).
- **Showcase site**: `scripts/gen-showcase.mjs` generates a static
  "geolint on the real web" page with full HTML reports for famous sites,
  deployed to GitHub Pages (see [docs/showcase.md](docs/showcase.md)).
- **Contributor docs**: [docs/architecture.md](docs/architecture.md) and
  [docs/writing-rules.md](docs/writing-rules.md).
- Library exports: `botUa`, `renderReport`/`renderSiteReport` now accept
  `'html'`.

## [0.2.2] - 2026-09-14

### Changed

- Repository moved to `iliasabk/geolint` — docs, badge, SARIF and Action
  references updated.

## [0.2.1] - 2026-09-14

### Fixed

- `--version`, SARIF reports and MCP `serverInfo` reported a stale version:
  `VERSION` is now synced from `package.json` by the `npm version` lifecycle.

## [0.2.0] - 2026-09-14

### Added

- **MCP server**: `geolint mcp` runs a [Model Context
  Protocol](https://modelcontextprotocol.io) server over stdio so Claude
  Desktop, Cursor, VS Code and Windsurf can use geolint natively. Five
  read-only tools — `audit_url`, `generate_llms_txt`, `compare_urls`,
  `list_rules`, `list_ai_bots` — with structured output and per-call
  timeouts (see [docs/mcp.md](docs/mcp.md)). The SDK loads lazily, so
  `check`/`crawl` startup is unaffected.
- **Score badge**: `check --badge [file]` writes a self-contained,
  shields-style SVG badge and prints a paste-ready README snippet;
  `--badge-endpoint <file>` writes a shields.io endpoint JSON for
  CI-regenerated live badges (see [docs/badges.md](docs/badges.md)).
- Library exports: `badgeSvg`, `shieldsEndpointJson`, `badgeMarkdown`.

## [0.1.0] - 2026-09-14

First public release of geolint — lint your website for AI-search readiness.

### Added

- **Commands**: `check` (single-page audit), `crawl` (multi-page site audit
  with `--max-pages`, `--max-depth`, `--concurrency`), `init` (generate
  `llms.txt`), `diff` (compare two reports), `rules` (list audit rules) and
  `bots` (show per-bot AI crawler access).
- **45 audit rules** across five categories: AI crawler access, llms.txt,
  structured data, citability and technical foundation (see
  [docs/rules.md](docs/rules.md)).
- **Reporters**: `pretty` (terminal), `json`, `sarif` (code scanning) and
  `markdown` (PR comments, job summaries) via `--format` / `--output`.
- **Score gate**: `--fail-under <0-100>` plus exit codes `0`/`1`/`2` for CI.
- **Baseline diffing**: `--save-baseline` / `--baseline` to catch regressions
  against a committed baseline.
- **GitHub Action**: composite `action.yml` (`iliasabk/geolint@v1`)
  producing score/grade outputs, a SARIF report and a job summary — see
  [docs/github-action.md](docs/github-action.md).
- Fetch layer with per-request timeout (`--timeout`), redirect handling and a
  bounded same-origin fetch budget for sitemap/llms-full.txt discovery.

[unreleased]: https://github.com/iliasabk/geolint/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/iliasabk/geolint/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/iliasabk/geolint/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/iliasabk/geolint/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/iliasabk/geolint/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/iliasabk/geolint/releases/tag/v0.1.0
