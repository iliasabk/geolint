<p align="center">
  <img src="media/logo.svg" alt="geolint logo" width="96">
</p>

<h1 align="center">geolint</h1>

<p align="center">
  <strong>ESLint for AI search.</strong> Lint your website for AI-search readiness —
  AI crawler access, llms.txt, structured data and citability.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@iliasabk/geolint"><img src="https://img.shields.io/npm/v/@iliasabk/geolint" alt="npm version"></a>
  <a href="https://github.com/iliasabk/geolint/actions/workflows/ci.yml"><img src="https://github.com/iliasabk/geolint/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/iliasabk/geolint"><img src="https://api.securityscorecards.dev/projects/github.com/iliasabk/geolint/badge" alt="OpenSSF Scorecard"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="node >= 22">
  <a href="https://www.npmjs.com/package/@iliasabk/geolint"><img src="https://img.shields.io/npm/dm/@iliasabk/geolint" alt="npm downloads"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

<p align="center">
  <a href="docs/i18n/README.de.md">🇩🇪 Deutsch</a> ·
  <a href="docs/i18n/README.es.md">🇪🇸 Español</a> ·
  <a href="docs/i18n/README.ja.md">🇯🇵 日本語</a>
</p>

<p align="center">
  <img src="media/demo.gif" alt="geolint terminal demo" width="720">
</p>

## 30-second quickstart

No install, no config:

```bash
npx @iliasabk/geolint check yoursite.com
```

geolint fetches the page, its robots.txt and llms.txt, evaluates **51 known AI
crawler tokens** against your robots.txt, runs **52 audit rules**, and prints a
scored report with a concrete fix for every finding.

## Why

- **AI answers are the new front page.** ChatGPT, Perplexity, Claude, Copilot and
  Google AI Overviews send traffic — or don't — based on whether their crawlers
  can fetch and quote your pages.
- **Most sites accidentally block or confuse AI crawlers.** A stale
  `Disallow: /`, a `noindex` left over from staging, a client-rendered page that
  looks empty to a bot that doesn't run JavaScript.
- **Existing tools are blocklists or score-only web apps.** They tell you to
  block everything, or give you a number with no path to improve it. geolint is
  the *linter*: concrete findings, concrete fixes, runnable in CI on every PR.

## What it checks

52 rules across 5 categories — `geolint rules` lists them all, and
[docs/rules.md](docs/rules.md) documents what each rule checks, why it matters
and how to fix violations.

| Category | Rules | Examples |
| --- | ---: | --- |
| AI Crawler Access | 10 | `ai-crawler/search-bots-blocked`, `ai-crawler/wildcard-block-all`, `ai-crawler/user-fetch-bypass`, `ai-crawler/stale-tokens` |
| llms.txt | 12 | `llms-txt/missing`, `llms-txt/invalid-structure`, `llms-txt/broken-links`, `llms-txt/relative-links` |
| Structured Data | 7 | `schema/no-jsonld`, `schema/invalid-jsonld`, `schema/missing-article-fields` |
| Citability | 12 | `content/thin-content`, `content/no-h1`, `content/missing-dates`, `content/no-question-headings` |
| Technical Foundation | 11 | `technical/client-rendered`, `technical/https`, `technical/slow-response`, `technical/sitemap-missing` |

## What a report looks like

Real output, auditing the bundled demo site (`examples/demo-site`, which
deliberately blocks two bots) — trimmed for width:

```text
$ geolint check localhost:4173 --ignore technical/https

  geolint v0.2.1 — AI-search readiness
  http://localhost:4173/
  200 OK · text/html · TTFB 113ms · robots 200 · llms.txt 404

  ██████████████████████████░░░░  86/100  Grade B

  CATEGORIES
    AI Crawler Access     ███████░░░   70  ✗ 2 errors
    llms.txt              █████████░   92  ⚠ 1 warning · 1 hint
    Structured Data       █████████░   88  ⚠ 1 warning · 3 hints
    Citability            ████████░░   82  ⚠ 2 warnings · 3 hints
    Technical Foundation  ██████████  100  ✓ clean

  AI CRAWLER ACCESS — 49/51 allowed · 2 blocked
    OpenAI
      GPTBot                        ✓  training
      OAI-SearchBot                 ✓  search
      ChatGPT-User                  ✓  user-fetch
    Perplexity
      PerplexityBot                 ✗  search
      Perplexity-User               ✓  user-fetch
    Google
      Googlebot                     ✓  search
      Google-Extended               ✓  training
    … 51 tokens total, grouped by vendor …

  FINDINGS
    AI Crawler Access
      ✗ ai-crawler/search-bots-blocked  PerplexityBot is blocked by robots.txt — Perplexity cannot use your pages as AI answer sources
          fix: Remove the Disallow covering PerplexityBot in robots.txt, or add an explicit "Allow: /" for it.
          evidence: Disallow: / (matched by PerplexityBot)
    llms.txt
      ⚠ llms-txt/missing                No llms.txt found
          fix: Create /llms.txt at the site root: an H1 title, a short blockquote summary, and ## sections linking to your key content.
          evidence: http://localhost:4173/llms.txt → HTTP 404

  ────────────────────────────────────────────────────────────────────
  2 errors · 4 warnings · 7 hints · 32/44 checks passed
```

Every finding carries a rule id, a severity, the evidence geolint matched, and a
fix. Compare two pages or two competitors head-to-head:

```bash
geolint check a.com --compare b.com
```

## Commands

| Command | What it does | Key flags |
| --- | --- | --- |
| `geolint check <url>` | Audit a single URL | `--format`, `--fail-under`, `--only`/`--ignore`/`--category`, `--compare`, `--baseline`, `--badge`, `--verbose` |
| `geolint crawl <url>` | Crawl same-origin pages and audit the whole site | `--max-pages`, `--max-depth`, `--concurrency`, `--fail-under` |
| `geolint init <url>` | Crawl the site and generate a `llms.txt` | `-o`, `--max-pages` |
| `geolint diff <old.json> <new.json>` | Compare two JSON reports: score delta, added/resolved findings | — |
| `geolint rules` | List the 52 audit rules | `--category`, `--format table\|json\|markdown` |
| `geolint bots` | List the 51 known AI crawlers and the impact of blocking each | `--format table\|json` |
| `geolint mcp` | Run an MCP server on stdio for AI assistants | `--timeout` |

Full flag reference: [docs/configuration.md](docs/configuration.md).

## Run it in CI

### GitHub Action

```yaml
- uses: iliasabk/geolint@v1
  id: geolint
  with:
    url: https://example.com
    fail-under: 80

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: ${{ steps.geolint.outputs.sarif-file }}
```

The action produces score/grade step outputs, a SARIF report for GitHub code
scanning, and a markdown report for job summaries and PR comments. Full recipes
— SARIF upload, updating a single PR comment, baseline drift detection — in
[docs/github-action.md](docs/github-action.md).

### Any other CI

```bash
npx @iliasabk/geolint check https://example.com --fail-under 80
```

Exit code is `1` when the score drops below the gate (or findings regress
against `--baseline`), `0` otherwise — works in GitLab CI, CircleCI, npm
scripts, pre-deploy hooks.

### Show your score as a README badge

```bash
npx @iliasabk/geolint check https://example.com --badge
# → writes geolint-badge.svg + prints the markdown snippet to paste
```

Commit the SVG, or regenerate a [shields endpoint JSON](docs/badges.md) in CI
(`--badge-endpoint`) for a badge that never goes stale.

## Output formats

`-f pretty` (default) renders the terminal report above. The machine formats:

- `-f json` — the full `ScanReport`: findings, per-category scores, bot access matrix
- `-f sarif` — SARIF 2.1.0, upload straight to GitHub code scanning
- `-f markdown` — PR-comment/job-summary-ready tables
- `-f html` — a self-contained interactive report (score ring, findings filter,
  bot matrix) you can share or host anywhere

Add `-o report.json` to write to a file; stdout stays clean for piping.

## geolint on the real web

The repo dogfoods itself: a [nightly workflow](metrics/) re-audits eight
well-known sites and commits the scores back, and the [showcase
site](https://iliasabk.github.io/geolint/) publishes the full interactive
reports — github.com, anthropic.com, stripe.com and more, regenerated on every
push to `main`.

## Programmatic API

```ts
import { scan } from '@iliasabk/geolint';

const report = await scan('https://example.com', {
  ignore: ['technical/https'],
  timeout: 10_000,
});

console.log(report.score, report.grade);          // e.g. 86 'B'
for (const f of report.findings) {
  console.log(f.severity, f.ruleId, f.message, f.fix);
}
```

`scan(url, options)` returns a typed `ScanReport`. Also exported: the bot
registry (`AI_BOTS`, `botsByPurpose`), the rule registry (`allRules`,
`ruleById`), robots.txt/llms.txt parsers, badge generators, scorers and all
four reporters.

## Use it from AI assistants (MCP)

`geolint mcp` speaks the [Model Context Protocol](https://modelcontextprotocol.io)
over stdio — Claude Desktop, Cursor, VS Code and Windsurf can audit sites,
generate `llms.txt` and compare URLs as native tools:

```jsonc
// claude_desktop_config.json / ~/.cursor/mcp.json
{
  "mcpServers": {
    "geolint": {
      "command": "npx",
      "args": ["-y", "@iliasabk/geolint", "mcp"]
    }
  }
}
```

Five tools: `audit_url`, `generate_llms_txt`, `compare_urls`, `list_rules`,
`list_ai_bots` — all read-only, with structured output and per-call timeouts.
Setup for every client: [docs/mcp.md](docs/mcp.md).

## The bot registry is the point

`geolint bots` lists 51 AI crawler tokens with a **purpose-aware** impact
assessment — because "should I block this bot?" has a different answer for each:

| Purpose | Examples | If you block it |
| --- | --- | --- |
| `training` | GPTBot, ClaudeBot, CCBot | absent from *future* training data |
| `search` | OAI-SearchBot, PerplexityBot, Claude-SearchBot | invisible in AI answers *now* |
| `user-fetch` | ChatGPT-User, Claude-User | invisible in AI answers *now* |
| `mixed` | Bytespider, Amazonbot, Diffbot | both |

And two nuances other tools miss:

- **Some fetchers ignore robots.txt.** OpenAI, Perplexity and Meta document that
  their user-triggered fetchers (ChatGPT-User, Perplexity-User,
  Meta-ExternalFetcher) may not honor robots.txt. `ai-crawler/user-fetch-bypass`
  tells you when a `Disallow` won't work — enforce at the WAF/auth layer instead.
- **Stale tokens.** `anthropic-ai`, `Claude-Web`, `FacebookBot` are retired.
  `ai-crawler/stale-tokens` flags them and names the replacement token — a
  `User-agent: anthropic-ai` rule does nothing today.

Control-only tokens like `Google-Extended` and `Applebot-Extended` never fetch
at all — they only set a preference — and geolint treats them accordingly.

## What geolint is honest about

- **llms.txt is a proposal, not a standard.** No major AI vendor has committed
  to reading it — so `llms-txt/*` findings are weighted as warnings and hints,
  not errors. geolint still checks it (and `geolint init` generates it) because
  adoption is growing and the cost is one file.
- **Correlation ≠ causation.** The citability rules are grounded in published
  GEO research (quotations/statistics/citations measurably lift share-of-answer;
  AI crawlers other than Googlebot and Applebot don't execute JavaScript), but
  signals like question-shaped headings are hints, not facts — they're `info`
  severity and geolint says so.
- **Every rule shows its reasoning.** [docs/rules.md](docs/rules.md) documents
  why each rule exists; the research sources are in
  [docs/research-notes.md](docs/research-notes.md), including the vendor docs
  behind every bot's robots.txt posture.
- **The bot registry is a standalone reference.**
  [docs/ai-crawlers.md](docs/ai-crawlers.md) lists every tracked token with
  purpose, per-vendor robots.txt posture and vendor docs — the same data
  `geolint bots` and the `list_ai_bots` MCP tool expose.

## Compared to the alternatives

| | Purpose-aware bot registry | Per-vendor robots.txt posture | Runs in CI | Fix per finding | Generates llms.txt | Free / OSS |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| **geolint** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ai.robots.txt-style blocklists | ❌ | ❌ | n/a | ❌ | ❌ | ✅ |
| GEO-optimizer skills / prompt packs | ❌ | ❌ | ❌ | ❌ | ❌ | varies |
| llms.txt validators | ❌ | ❌ | some | partial | some | ✅ |
| Hosted GEO audit web apps | partial | ❌ | ❌ | partial | ❌ | ❌ |

Details and the reasoning behind each column: [docs/comparison.md](docs/comparison.md).
geolint also ships an MCP server, a score badge and regression baselines.

## Roadmap

Planned for v0.4+:

- `geolint watch` — re-audit on deploys/file changes
- Custom rule API for project-specific checks
- Deeper schema coverage (more `@type` validators)
- Homebrew formula
- Report localization beyond English

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). New rules are
the best contribution: each needs a `check(ctx)`, findings with `fix`, a test
and a docs entry.

## License

[MIT](LICENSE) · [changelog](CHANGELOG.md) · [security](SECURITY.md)

---

<p align="center">
  If geolint helped, a ⭐ helps others find it.
</p>
