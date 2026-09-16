# Metrics — geolint dogfooding itself

[`metrics/`](../metrics) is geolint run against the real web: every night the
CLI audits a fixed list of well-known sites and the results are committed
back into this repo. It's a living showcase of AI-search readiness scores —
see [metrics/README.md](../metrics/README.md) for the current table.

## How the pipeline works

[`.github/workflows/dogfood.yml`](../.github/workflows/dogfood.yml) runs on a
schedule (daily ~05:17 UTC) and on manual dispatch:

1. `npm ci` → `npm run build` — the scan uses the *built* CLI, so the metrics
   exercise exactly what users install.
2. `node scripts/dogfood.mjs` — for each site it runs
   `node dist/cli.js check <url> -f json -o metrics/<slug>.json --timeout 20000`
   via `execFile` (args array, no shell), sequentially, with a 25s hard kill
   per site so a hanging site can never stall the workflow.
3. From each JSON report it writes a self-contained score badge
   (`<slug>.svg`) and a shields.io endpoint file (`<slug>.endpoint.json`),
   appends the score to `metrics/history.json` (rolling, last 90 runs per
   site) and renders a sparkline (`<slug>-trend.svg`) plus a combined
   chart (`trends.svg`), then regenerates `metrics/README.md` sorted by
   score.
4. A plain `git` step commits `metrics/` — only when something changed —
   with `chore(metrics): nightly geolint scan [skip ci]` (the tag keeps the
   push from retriggering CI).

Failures are tolerated by design: a site that can't be scanned gets a
`{ "error": "…" }` JSON, a grey *unreachable* badge, and a footnote in the
index — it never aborts the run.

## Files per site

| File                          | Content                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `metrics/<slug>.json`         | Raw `geolint check -f json` report, or `{ "error": "…" }`.      |
| `metrics/<slug>.svg`          | Self-contained score badge (no external service needed).       |
| `metrics/<slug>.endpoint.json`| shields.io [endpoint schema](https://shields.io/endpoint) JSON.|
| `metrics/<slug>-trend.svg`    | Score-over-time sparkline (rendered from `history.json`).      |
| `metrics/history.json`        | Rolling score history — `{ <slug>: [{ date, score }] }`, last 90 runs per site. |
| `metrics/trends.svg`          | Combined score-over-time chart for all sites.                  |
| `metrics/README.md`           | Generated index — do not edit by hand.                         |

## Referencing the badges externally

Because the files are committed, anything that can fetch a raw GitHub URL
can render them — and they stay current since they're rewritten nightly.

Committed SVG, embedded directly:

```markdown
<img src="https://raw.githubusercontent.com/iliasabk/geolint/main/metrics/github-com.svg" alt="geolint score">
```

Live badge through shields.io, pointing at the endpoint JSON:

```markdown
[![geolint](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/iliasabk/geolint/main/metrics/github-com.endpoint.json)](https://github.com/iliasabk/geolint)
```

shields.io caches endpoint responses for a few minutes — the badge tracks
the nightly scan, not every commit. See [badges.md](badges.md) for the badge
patterns in general.

## Adding or removing sites

Edit the `SITES` array at the top of
[`scripts/dogfood.mjs`](../scripts/dogfood.mjs):

```js
{ slug: 'example-com', url: 'https://example.com', label: 'example.com' },
```

- `slug` — file prefix for `metrics/<slug>.*`; unique, lowercase,
  kebab-case.
- `url` — the exact URL passed to `geolint check`.
- `label` — display name in the index table.

Then either run `npm run build && node scripts/dogfood.mjs` once locally and
commit the new `metrics/` files, or just merge — the next nightly run
regenerates everything. Files of *removed* sites are not deleted
automatically; `git rm metrics/<old-slug>.*` by hand.

## Running it locally

```bash
npm run build && node scripts/dogfood.mjs
```

Requires `dist/` to be built first (the script shells out to
`dist/cli.js`, never imports `src/`). Expect ~10–25s per site.
