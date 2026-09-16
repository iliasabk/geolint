#!/usr/bin/env node
/**
 * Dogfood metrics pipeline — geolint scanning itself on the real web.
 *
 * Runs the built CLI (dist/cli.js) against every site in SITES below and
 * writes the results into metrics/, which is committed to the repo:
 *
 *   metrics/<slug>.json           raw `check -f json` report
 *                                 ({ "error": "…" } when the scan failed)
 *   metrics/<slug>.svg            self-contained score badge
 *                                 (grey 'unreachable' when the scan failed)
 *   metrics/<slug>.endpoint.json  shields.io endpoint JSON for live badges
 *   metrics/<slug>-trend.svg      sparkline of the site's score over time
 *   metrics/history.json          rolling score history (last ~90 runs/site)
 *   metrics/trends.svg            combined multi-site score chart
 *   metrics/README.md             index table — regenerated on every run
 *
 * Executed nightly by .github/workflows/dogfood.yml. Run it locally with:
 *
 *   npm run build && node scripts/dogfood.mjs
 *
 * This script deliberately does NOT import from src/ — it runs on plain
 * node and shells out to the built CLI, so the workflow builds dist/ first.
 * The badge helpers below mirror src/core/badge.ts (~40 lines duplicated on
 * purpose); keep the two copies in sync.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const METRICS_DIR = join(ROOT, 'metrics');
const CLI = join(ROOT, 'dist', 'cli.js');

/** Per-request fetch timeout handed to `geolint check --timeout`. */
const FETCH_TIMEOUT_MS = 20_000;
/** Hard cap per `check` subprocess — a hung scan can never stall the run. */
const SITE_KILL_MS = 60_000;

/**
 * Sites audited every night — edit this list to add or remove sites.
 * `slug` is the metrics/<slug>.* file prefix (unique, lowercase,
 * kebab-case); `label` is the display name in the generated index.
 */
const SITES = [
  { slug: 'github-com', url: 'https://github.com', label: 'github.com' },
  { slug: 'anthropic-com', url: 'https://www.anthropic.com', label: 'anthropic.com' },
  { slug: 'openai-com', url: 'https://openai.com', label: 'openai.com' },
  { slug: 'stripe-com', url: 'https://stripe.com', label: 'stripe.com' },
  { slug: 'vercel-com', url: 'https://vercel.com', label: 'vercel.com' },
  {
    slug: 'news-ycombinator-com',
    url: 'https://news.ycombinator.com',
    label: 'news.ycombinator.com',
  },
  { slug: 'example-com', url: 'https://example.com', label: 'example.com' },
  { slug: 'perplexity-ai', url: 'https://www.perplexity.ai', label: 'perplexity.ai' },
];

// ---------------------------------------------------------------------------
// Badge helpers — mirrored from src/core/badge.ts (see header comment). The
// only generalization: svgBadge()/endpointJson() take an explicit message and
// color so failed scans can emit a grey 'unreachable' badge through the same
// code path.
// ---------------------------------------------------------------------------

/** Grade → shields.io named color. Same ladder as the terminal reporter. */
const GRADE_NAMED_COLOR = {
  A: 'brightgreen',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  F: 'red',
};

/** Hex equivalents of GRADE_NAMED_COLOR for the self-contained SVG. */
const GRADE_HEX_COLOR = {
  A: '#4c1',
  B: '#97ca00',
  C: '#dfb317',
  D: '#fe7d37',
  F: '#e05d44',
};

/** Dark grey used for the label segment, same as shields' default. */
const LABEL_BG = '#555';
const DEFAULT_LABEL = 'geolint';
/** shields 'lightgrey' — used for the unreachable badge on failed scans. */
const UNREACHABLE_HEX = '#9f9f9f';
const UNREACHABLE_NAMED = 'lightgrey';
const UNREACHABLE_MESSAGE = 'unreachable';

/** Escape the five XML special chars for use in text nodes and attributes. */
function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The value-segment text shared by the SVG and the endpoint JSON. */
function badgeMessage(score, grade) {
  return `${Math.round(score)}/100 · ${grade}`;
}

/** Rough Verdana-11px width estimate, same heuristic shields uses. */
function segmentWidth(text) {
  return Math.round(text.length * 6.5) + 10;
}

/** Flat shields.io-style SVG: dark label segment, colored value segment. */
function svgBadge(label, message, colorHex) {
  const left = escapeXml(label);
  const right = escapeXml(message);
  const leftWidth = segmentWidth(label);
  const rightWidth = segmentWidth(message);
  const width = leftWidth + rightWidth;
  const leftCenter = Math.round((leftWidth / 2) * 10);
  const rightCenter = Math.round((leftWidth + rightWidth / 2) * 10);
  const leftTextLength = (leftWidth - 10) * 10;
  const rightTextLength = (rightWidth - 10) * 10;
  const title = `${left}: ${right}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    '<linearGradient id="s" x2="0" y2="100%">',
    '<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>',
    '<stop offset="1" stop-opacity=".1"/>',
    '</linearGradient>',
    '<clipPath id="r">',
    `<rect width="${width}" height="20" rx="3" fill="#fff"/>`,
    '</clipPath>',
    '<g clip-path="url(#r)">',
    `<rect width="${leftWidth}" height="20" fill="${LABEL_BG}"/>`,
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${colorHex}"/>`,
    `<rect width="${width}" height="20" fill="url(#s)"/>`,
    '</g>',
    '<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">',
    `<text aria-hidden="true" x="${leftCenter}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${leftTextLength}">${left}</text>`,
    `<text x="${leftCenter}" y="140" transform="scale(.1)" fill="#fff" textLength="${leftTextLength}">${left}</text>`,
    `<text aria-hidden="true" x="${rightCenter}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${rightTextLength}">${right}</text>`,
    `<text x="${rightCenter}" y="140" transform="scale(.1)" fill="#fff" textLength="${rightTextLength}">${right}</text>`,
    '</g>',
    '</svg>',
  ].join('');
}

/** Score badge — same output as badgeSvg() in src/core/badge.ts. */
function badgeSvg(score, grade, label = DEFAULT_LABEL) {
  return svgBadge(label, badgeMessage(score, grade), GRADE_HEX_COLOR[grade]);
}

/** shields.io endpoint-schema JSON string. */
function endpointJson(message, color) {
  const endpoint = { schemaVersion: 1, label: DEFAULT_LABEL, message, color };
  return `${JSON.stringify(endpoint, null, 2)}\n`;
}

/** Score endpoint JSON — same output as shieldsEndpointJson() in src/core/badge.ts. */
function shieldsEndpointJson(score, grade) {
  return endpointJson(badgeMessage(score, grade), GRADE_NAMED_COLOR[grade]);
}

// ---------------------------------------------------------------------------
// Trend charts — score-over-time SVGs generated from metrics/history.json.
// Zero-dependency hand-rolled SVG, same approach as the badge helpers.
// ---------------------------------------------------------------------------

const HISTORY_PATH = join(METRICS_DIR, 'history.json');
/** Keep roughly three months of nightly runs per site. */
const HISTORY_LIMIT = 90;

/** Per-site line colors for the combined chart (colorblind-safe-ish mix). */
const TREND_PALETTE = [
  '#1f6feb',
  '#e05d44',
  '#4c1',
  '#a371f7',
  '#39c5cf',
  '#fe7d37',
  '#f778ba',
  '#dfb317',
];

const TREND_TEXT = '#8b949e';
const TREND_GRID = '#30363d';
const TREND_BG = '#0d1117';

/**
 * Load metrics/history.json, append today's scores and persist it again.
 * Returns the updated `{ <slug>: [{ date, score }, …] }` map. Sites that
 * failed this run keep their history unchanged — a missing point is more
 * honest than a fake 0.
 */
async function updateHistory(results, runDate) {
  /** @type {Record<string, {date: string, score: number}[]>} */
  let history = {};
  try {
    const parsed = JSON.parse(await readFile(HISTORY_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      history = parsed;
    }
  } catch {
    // First run or corrupt file — start a fresh history.
  }
  for (const { site, report } of results) {
    if (!report) {
      continue;
    }
    const entries = (Array.isArray(history[site.slug]) ? history[site.slug] : []).filter(
      (e) => e && typeof e.date === 'string' && typeof e.score === 'number',
    );
    history[site.slug] = [
      ...entries.filter((e) => e.date !== runDate),
      { date: runDate, score: Math.round(report.score) },
    ].slice(-HISTORY_LIMIT);
  }
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  return history;
}

/** Map entries onto SVG x/y coordinates inside a padded plot box. */
function trendPoints(entries, x0, y0, w, h) {
  const n = entries.length;
  return entries.map((e, i) => {
    const x = x0 + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const y = y0 + h - (Math.min(100, Math.max(0, e.score)) / 100) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
}

/**
 * Per-site sparkline: a 168×32 polyline with the latest score at the end.
 * Renders a single dot (not an empty image) when only one point exists.
 */
function sparklineSvg(label, entries) {
  const w = 168;
  const h = 32;
  const pad = 4;
  const title = `${escapeXml(label)} score over time`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<rect width="${w}" height="${h}" rx="4" fill="${TREND_BG}"/>`,
  ];
  if (entries.length === 0) {
    parts.push(
      `<text x="${w / 2}" y="${h / 2 + 3}" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="10" fill="${TREND_TEXT}">no data</text>`,
    );
  } else {
    const pts = trendPoints(entries, pad, pad, w - pad * 2 - 34, h - pad * 2);
    if (pts.length > 1) {
      parts.push(
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${TREND_PALETTE[0]}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
    const [lx, ly] = pts[pts.length - 1].split(',');
    parts.push(`<circle cx="${lx}" cy="${ly}" r="2" fill="${TREND_PALETTE[0]}"/>`);
    parts.push(
      `<text x="${w - pad}" y="${h / 2 + 4}" text-anchor="end" font-family="Verdana,Geneva,sans-serif" font-size="11" fill="${TREND_TEXT}">${entries[entries.length - 1].score}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Combined chart: every site's history on shared 0–100 axes (560×260),
 * with a legend on the right. Written to metrics/trends.svg and embedded
 * in metrics/README.md.
 */
function trendsSvg(sites, history) {
  const w = 560;
  const h = 260;
  const x0 = 36;
  const y0 = 12;
  const pw = 380;
  const ph = 224;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="geolint scores over time">`,
    '<title>geolint scores over time</title>',
    `<rect width="${w}" height="${h}" rx="6" fill="${TREND_BG}"/>`,
  ];
  for (const v of [0, 25, 50, 75, 100]) {
    const y = (y0 + ph - (v / 100) * ph).toFixed(1);
    parts.push(
      `<line x1="${x0}" y1="${y}" x2="${x0 + pw}" y2="${y}" stroke="${TREND_GRID}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${x0 - 5}" y="${Number(y) + 3}" text-anchor="end" font-family="Verdana,Geneva,sans-serif" font-size="9" fill="${TREND_TEXT}">${v}</text>`,
    );
  }
  let legendY = y0 + 8;
  sites.forEach((site, i) => {
    const entries = history[site.slug] ?? [];
    const color = TREND_PALETTE[i % TREND_PALETTE.length];
    if (entries.length === 1) {
      const [cx, cy] = trendPoints(entries, x0, y0, pw, ph)[0].split(',');
      parts.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`);
    } else if (entries.length > 1) {
      parts.push(
        `<polyline points="${trendPoints(entries, x0, y0, pw, ph).join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
      const [lx, ly] = trendPoints(entries, x0, y0, pw, ph).pop().split(',');
      parts.push(`<circle cx="${lx}" cy="${ly}" r="2.5" fill="${color}"/>`);
    }
    parts.push(
      `<circle cx="${x0 + pw + 16}" cy="${legendY - 3}" r="3.5" fill="${color}"/>`,
      `<text x="${x0 + pw + 26}" y="${legendY}" font-family="Verdana,Geneva,sans-serif" font-size="10" fill="${TREND_TEXT}">${escapeXml(site.label)}</text>`,
    );
    legendY += 18;
  });
  if (sites.every((s) => (history[s.slug] ?? []).length === 0)) {
    parts.push(
      `<text x="${x0 + pw / 2}" y="${y0 + ph / 2}" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11" fill="${TREND_TEXT}">no history yet</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Short human-readable reason for a failed `check` subprocess — keeps the
 * full stderr out of metrics/*.json and the generated index.
 */
function scanErrorMessage(err) {
  if (err.killed || err.signal === 'SIGTERM') {
    return `scan exceeded ${Math.round(SITE_KILL_MS / 1000)}s and was killed`;
  }
  const detail = String(err.stderr || err.message || err)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' — ');
  return detail || `check exited with code ${err.code ?? 'unknown'}`;
}

/**
 * Run `node dist/cli.js check <url> -f json -o <jsonPath> --timeout 20000`
 * and return the parsed report. Rejects with a short Error when the scan
 * failed — the caller persists an {error} file instead of a report.
 */
async function scanSite(site, jsonPath) {
  const args = [
    CLI,
    'check',
    site.url,
    '-f',
    'json',
    '-o',
    jsonPath,
    '--timeout',
    String(FETCH_TIMEOUT_MS),
  ];
  try {
    await execFileAsync(process.execPath, args, {
      cwd: ROOT,
      timeout: SITE_KILL_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(scanErrorMessage(err));
  }
  let report;
  try {
    report = JSON.parse(await readFile(jsonPath, 'utf8'));
  } catch {
    throw new Error('check exited cleanly but produced no readable JSON report');
  }
  if (typeof report?.score !== 'number' || typeof report?.grade !== 'string') {
    throw new Error('report JSON has no score/grade — unexpected shape');
  }
  return report;
}

/** Error/warn finding counts for the index table. */
function countFindings(report) {
  let errors = 0;
  let warnings = 0;
  for (const finding of report.findings ?? []) {
    if (finding.severity === 'error') {
      errors += 1;
    }
    if (finding.severity === 'warn') {
      warnings += 1;
    }
  }
  return { errors, warnings };
}

/** Make free-form error text safe for a single markdown table cell/line. */
function mdInline(text) {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 160);
}

// ---------------------------------------------------------------------------
// Index generation
// ---------------------------------------------------------------------------

/**
 * Regenerate metrics/README.md: a badge table of all sites, scored sites
 * first sorted by score desc, unreachable sites last (in SITES order).
 * `history` is the updated metrics/history.json map — used for the trend
 * sparkline column and the combined trends.svg chart above the table.
 */
async function writeIndex(results, runDate, history) {
  const sorted = [...results].sort((a, b) => (b.report?.score ?? -1) - (a.report?.score ?? -1));
  const version = sorted.find((r) => r.report)?.report?.tool?.version;

  const rows = [];
  for (const { site, report, error } of sorted) {
    const trend = `<img src="${site.slug}-trend.svg" alt="${escapeXml(site.label)} score over time">`;
    if (!report) {
      const alt = `${DEFAULT_LABEL}: ${UNREACHABLE_MESSAGE}`;
      rows.push(
        `| [${site.label}](${site.url}) | <img src="${site.slug}.svg" alt="${alt}"> ` +
          `${UNREACHABLE_MESSAGE} | — | — | — | ${trend} | ${runDate} |`,
      );
      continue;
    }
    const { errors, warnings } = countFindings(report);
    const date = String(report.scannedAt ?? runDate).slice(0, 10);
    const alt = `${DEFAULT_LABEL}: ${badgeMessage(report.score, report.grade)}`;
    rows.push(
      `| [${site.label}](${site.url}) | <img src="${site.slug}.svg" alt="${alt}"> ` +
        `${Math.round(report.score)}/100 | ${report.grade} | ${errors} | ${warnings} | ${trend} | ${date} |`,
    );
  }

  const failures = sorted.filter((r) => !r.report);
  const failureLines =
    failures.length === 0
      ? ''
      : `\n### Unreachable in this run\n\n${failures
          .map((r) => `- **[${r.site.label}](${r.site.url})** — ${mdInline(r.error)}`)
          .join('\n')}\n`;

  const markdown = `<!-- Generated by scripts/dogfood.mjs — do not edit by hand. -->
# geolint metrics — the tool on the real web

Every night [geolint](https://github.com/iliasabk/geolint) audits a fixed
list of well-known sites and commits the results back into this repo: a
living showcase of AI-search readiness scores. Pipeline:
[\`.github/workflows/dogfood.yml\`](../.github/workflows/dogfood.yml) →
[\`scripts/dogfood.mjs\`](../scripts/dogfood.mjs) → this directory.
How it works and how to change the site list:
[docs/metrics.md](../docs/metrics.md).

Last run: **${runDate}** (UTC)${version ? ` · geolint v${version}` : ''}

<img src="trends.svg" alt="geolint scores over time">

| Site | Score | Grade | Errors | Warnings | Trend | Last scan (UTC) |
| ---- | ----- | ----- | -----: | -------: | ----- | --------------- |
${rows.join('\n')}
${failureLines}
Each site has five files: \`<slug>.json\` (the raw
\`geolint check -f json\` report, or an \`{ "error": "…" }\` object when the
site was unreachable), \`<slug>.svg\` (the badge shown above),
\`<slug>.endpoint.json\` (a shields.io endpoint file for live external
badges), \`<slug>-trend.svg\` (the score sparkline) and the shared
\`history.json\` (rolling score history, last ${HISTORY_LIMIT} runs per site).
`;

  await writeFile(join(METRICS_DIR, 'README.md'), markdown, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * The committed JSON reports must satisfy `npm run lint:ci` — biome's JSON
 * formatter collapses short arrays where the CLI's JSON.stringify expands
 * them. Re-format metrics/ with the repo's own biome (devDependency, present
 * after `npm ci`). Best-effort: if biome is unavailable the files are still
 * valid JSON, only the style differs.
 */
async function formatMetrics() {
  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['--no-install', 'biome', 'format', '--write', METRICS_DIR],
      { cwd: ROOT, timeout: 60_000 },
    );
    if (stdout.trim()) {
      console.log(stdout.trim());
    }
  } catch (err) {
    console.warn(
      `note: could not run biome format on metrics/ (${err.message}) — run 'npm run lint' if lint:ci complains`,
    );
  }
}

async function main() {
  await mkdir(METRICS_DIR, { recursive: true });
  const runDate = new Date().toISOString().slice(0, 10);

  /** @type {{site: object, report: object|null, error: string|null}[]} */
  const results = [];
  for (const site of SITES) {
    const jsonPath = join(METRICS_DIR, `${site.slug}.json`);
    const svgPath = join(METRICS_DIR, `${site.slug}.svg`);
    const endpointPath = join(METRICS_DIR, `${site.slug}.endpoint.json`);

    let report = null;
    let error = null;
    try {
      report = await scanSite(site, jsonPath);
      await writeFile(svgPath, `${badgeSvg(report.score, report.grade)}\n`, 'utf8');
      await writeFile(endpointPath, shieldsEndpointJson(report.score, report.grade), 'utf8');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      await writeFile(
        jsonPath,
        `${JSON.stringify({ error, url: site.url, scannedAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8',
      );
      // Grey 'unreachable' badge: keeps externally-referenced badges honest
      // instead of silently showing the last good score.
      await writeFile(
        svgPath,
        `${svgBadge(DEFAULT_LABEL, UNREACHABLE_MESSAGE, UNREACHABLE_HEX)}\n`,
        'utf8',
      );
      await writeFile(endpointPath, endpointJson(UNREACHABLE_MESSAGE, UNREACHABLE_NAMED), 'utf8');
    }

    results.push({ site, report, error });
    if (report) {
      const { errors, warnings } = countFindings(report);
      console.log(
        `✓ ${site.label.padEnd(22)} ${badgeMessage(report.score, report.grade)} ` +
          `(${errors} errors, ${warnings} warnings)`,
      );
    } else {
      console.log(`✗ ${site.label.padEnd(22)} ${UNREACHABLE_MESSAGE} — ${error}`);
    }
  }

  const history = await updateHistory(results, runDate);
  for (const site of SITES) {
    await writeFile(
      join(METRICS_DIR, `${site.slug}-trend.svg`),
      `${sparklineSvg(site.label, history[site.slug] ?? [])}\n`,
      'utf8',
    );
  }
  await writeFile(join(METRICS_DIR, 'trends.svg'), `${trendsSvg(SITES, history)}\n`, 'utf8');
  await writeIndex(results, runDate, history);
  await formatMetrics();

  const ok = results.filter((r) => r.report).length;
  console.log(
    `\nmetrics: ${ok}/${results.length} sites scanned · ` +
      `wrote ${SITES.length * 4 + 3} files under metrics/`,
  );
  if (ok < results.length) {
    console.log('unreachable sites are listed in metrics/README.md — the run still succeeded');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
