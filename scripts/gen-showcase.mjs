#!/usr/bin/env node
/**
 * Generate the static showcase site — "geolint on the real web".
 *
 * Scans a fixed list of well-known sites with the real CLI (one scan each,
 * JSON report persisted), renders a full standalone HTML report per site via
 * the library API, then writes a brand-styled index page with a score card
 * per site. The whole `site/` output directory is gitignored — it is built
 * in CI (.github/workflows/pages.yml) and deployed to GitHub Pages.
 *
 * Output:
 *   site/index.html            card grid, one card per scanned site
 *   site/reports/<slug>.html   full geolint HTML report per site
 *   site/data/<slug>.json      raw JSON report (or an error object when the
 *                              site could not be scanned)
 *
 * Usage:
 *   npm run build && node scripts/gen-showcase.mjs
 *   open site/index.html
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = join(ROOT, 'site');
const DATA_DIR = join(SITE_DIR, 'data');
const REPORTS_DIR = join(SITE_DIR, 'reports');
const CLI = join(ROOT, 'dist', 'cli.js');
const LIB = join(ROOT, 'dist', 'index.js');
const LOGO = join(ROOT, 'media', 'logo.svg');
const REPO_URL = 'https://github.com/iliasabk/geolint';
/** Per-fetch timeout passed to the scanner. */
const SCAN_TIMEOUT_MS = '25000';
/** Hard cap for one whole `check` subprocess so a hang can't stall CI. */
const CHECK_KILL_MS = 120_000;
/** Pause between sites — sequential and polite, never parallel. */
const POLITE_DELAY_MS = 750;

/** {slug, url, label} — slug doubles as the reports/data filename. */
const SITES = [
  { slug: 'github', url: 'https://github.com', label: 'GitHub' },
  { slug: 'anthropic', url: 'https://anthropic.com', label: 'Anthropic' },
  { slug: 'openai', url: 'https://openai.com', label: 'OpenAI' },
  { slug: 'perplexity', url: 'https://perplexity.ai', label: 'Perplexity' },
  { slug: 'stripe', url: 'https://stripe.com', label: 'Stripe' },
  { slug: 'vercel', url: 'https://vercel.com', label: 'Vercel' },
  { slug: 'cloudflare', url: 'https://cloudflare.com', label: 'Cloudflare' },
  { slug: 'wikipedia', url: 'https://wikipedia.org', label: 'Wikipedia' },
  { slug: 'stackoverflow', url: 'https://stackoverflow.com', label: 'Stack Overflow' },
  { slug: 'hackernews', url: 'https://news.ycombinator.com', label: 'Hacker News' },
  { slug: 'huggingface', url: 'https://huggingface.co', label: 'Hugging Face' },
  { slug: 'mozilla', url: 'https://mozilla.org', label: 'Mozilla' },
  { slug: 'wordpress', url: 'https://wordpress.org', label: 'WordPress' },
  { slug: 'shopify', url: 'https://shopify.com', label: 'Shopify' },
  { slug: 'netlify', url: 'https://netlify.com', label: 'Netlify' },
  { slug: 'kagi', url: 'https://kagi.com', label: 'Kagi' },
  { slug: 'duckduckgo', url: 'https://duckduckgo.com', label: 'DuckDuckGo' },
  { slug: 'react', url: 'https://react.dev', label: 'React' },
];

/** Grade → hex, same palette as src/core/badge.ts (GRADE_HEX_COLOR). */
const GRADE_HEX = { A: '#4c1', B: '#97ca00', C: '#dfb317', D: '#fe7d37', F: '#e05d44' };

/** Escape the five HTML special chars for text nodes and attribute values. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * badgeSvg emits the gradient/clipPath ids 's' and 'r' — inlined ten times on
 * one page they'd collide and every badge would clip to the first badge's
 * rect. Suffix them per card.
 */
function uniqueBadgeSvg(svg, slug) {
  return svg
    .replaceAll('id="s"', `id="gs-${slug}"`)
    .replaceAll('id="r"', `id="gr-${slug}"`)
    .replaceAll('url(#s)', `url(#gs-${slug})`)
    .replaceAll('url(#r)', `url(#gr-${slug})`);
}

/** Run `geolint check <url> -f json -o <file>` via the built CLI. */
async function scanSite(site, jsonPath) {
  const args = [CLI, 'check', site.url, '-f', 'json', '-o', jsonPath, '--timeout', SCAN_TIMEOUT_MS];
  await execFileAsync('node', args, {
    cwd: ROOT,
    timeout: CHECK_KILL_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  const raw = await readFile(jsonPath, 'utf8');
  return JSON.parse(raw);
}

function cardHtml(card) {
  const host = esc(card.hostname);
  const date = fmtDate(card.scannedAt);
  if (!card.ok) {
    return `      <article class="card card-down">
        <div class="card-top">
          <div>
            <h2>${esc(card.label)}</h2>
            <span class="host">${host}</span>
          </div>
          <span class="grade grade-down">?</span>
        </div>
        <p class="down-tag">unreachable</p>
        <p class="counts muted">${esc(card.error)}</p>
        <div class="card-foot">
          <a href="data/${esc(card.slug)}.json">view json →</a>
          ${date ? `<time datetime="${esc(card.scannedAt)}">${esc(date)}</time>` : ''}
        </div>
      </article>`;
  }
  const grade = card.grade in GRADE_HEX ? card.grade : 'F';
  const link = card.hasHtml
    ? `<a href="reports/${esc(card.slug)}.html">view full report →</a>`
    : `<a href="data/${esc(card.slug)}.json">view json report →</a>`;
  return `      <article class="card">
        <div class="card-top">
          <div>
            <h2>${esc(card.label)}</h2>
            <a class="host" href="${esc(card.url)}" rel="noopener noreferrer">${host}</a>
          </div>
          <span class="grade" style="background:${GRADE_HEX[grade]}">${esc(grade)}</span>
        </div>
        <div class="badge">${card.badge}</div>
        <p class="counts"><strong class="err">${card.errors} error${card.errors === 1 ? '' : 's'}</strong> · <strong class="warn">${card.warnings} warning${card.warnings === 1 ? '' : 's'}</strong></p>
        <div class="card-foot">
          ${link}
          ${date ? `<time datetime="${esc(card.scannedAt)}">${esc(date)}</time>` : ''}
        </div>
      </article>`;
}

function indexHtml(cards, logoSvg, generatedAt) {
  const reachable = cards.filter((c) => c.ok).length;
  const generated = fmtDate(generatedAt);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>geolint on the real web</title>
<meta name="description" content="Real geolint reports for well-known websites — AI-search readiness scores, generated by CI.">
<meta name="generator" content="geolint">
<link rel="canonical" href="https://iliasabk.github.io/geolint/">
<meta property="og:type" content="website">
<meta property="og:title" content="geolint — ESLint for AI search">
<meta property="og:description" content="Real geolint reports for well-known websites — AI-search readiness scores, generated by CI.">
<meta property="og:url" content="https://iliasabk.github.io/geolint/">
<meta property="og:image" content="https://raw.githubusercontent.com/iliasabk/geolint/main/media/social.png">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root {
    --bg: #0d1117;
    --panel: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent-a: #22d3ee;
    --accent-b: #818cf8;
    --err: #f85149;
    --warn: #d29922;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  a { color: var(--accent-a); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header {
    text-align: center;
    padding: 56px 20px 36px;
    border-bottom: 1px solid var(--border);
    background:
      radial-gradient(600px 200px at 50% -60px, rgba(34, 211, 238, 0.12), transparent),
      radial-gradient(600px 220px at 50% -80px, rgba(129, 140, 248, 0.10), transparent);
  }
  header .logo { display: flex; justify-content: center; }
  header .logo svg { width: 72px; height: 72px; }
  h1 {
    margin: 18px 0 8px;
    font-size: clamp(1.7rem, 4vw, 2.4rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  h1 .grad {
    background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .sub { margin: 0; color: var(--muted); font-size: 0.95rem; }
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 32px 20px 48px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.15s ease;
  }
  .card:hover { border-color: var(--accent-b); }
  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .card h2 { margin: 0; font-size: 1.05rem; font-weight: 600; }
  .host { color: var(--muted); font-size: 0.85rem; word-break: break-all; }
  .grade {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
  }
  .grade-down { background: var(--border); color: var(--muted); text-shadow: none; }
  .badge svg { display: block; height: 20px; width: auto; }
  .counts { margin: 0; font-size: 0.85rem; color: var(--muted); }
  .counts .err { color: var(--err); font-weight: 600; }
  .counts .warn { color: var(--warn); font-weight: 600; }
  .counts.muted { color: var(--muted); }
  .down-tag {
    margin: 0;
    align-self: flex-start;
    padding: 2px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .card-down { opacity: 0.75; }
  .card-foot {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.85rem;
  }
  .card-foot time { color: var(--muted); white-space: nowrap; }
  footer {
    border-top: 1px solid var(--border);
    padding: 24px 20px 40px;
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .cta { display: inline-block; margin-top: 18px; padding: 10px 22px;
    border-radius: 8px; background: #238636; color: #fff; font-weight: 600;
    font-size: 0.95rem; text-decoration: none; }
  .cta:hover { background: #2ea043; }
  footer p { margin: 4px 0; }
</style>
</head>
<body>
  <header>
    <div class="logo">${logoSvg}</div>
    <h1>geolint <span class="grad">on the real web</span></h1>
    <p class="sub">52 rules · AI crawler access · llms.txt · structured data · citability</p>
    <a class="cta" href="${REPO_URL}">&#9733; Star geolint on GitHub</a>
  </header>
  <main>
    <div class="grid">
${cards.map(cardHtml).join('\n')}
    </div>
  </main>
  <footer>
    <p>${reachable} of ${cards.length} sites scanned · generated ${esc(generated)}</p>
    <p>
      <a href="${REPO_URL}">github.com/iliasabk/geolint</a> — regenerated by CI on every push to main
    </p>
  </footer>
</body>
</html>
`;
}

async function main() {
  for (const required of [CLI, LIB]) {
    if (!existsSync(required)) {
      console.error(`error: ${required} not found — run 'npm run build' first`);
      process.exit(1);
    }
  }

  // dist/index.js is plain ESM — import it directly for renderReport/badgeSvg.
  const { renderReport, badgeSvg } = await import(pathToFileURL(LIB).href);
  const logoSvg = (await readFile(LOGO, 'utf8')).trim();

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(REPORTS_DIR, { recursive: true });

  const cards = [];
  let htmlWarned = false;
  for (const site of SITES) {
    const jsonPath = join(DATA_DIR, `${site.slug}.json`);
    const t0 = Date.now();
    process.stdout.write(`→ ${site.label} (${site.url}) … `);
    let report = null;
    let error = '';
    try {
      report = await scanSite(site, jsonPath);
    } catch (err) {
      error = err instanceof Error ? err.message.split('\n')[0] : String(err);
      // Never abort the whole build on one unreachable site — persist an
      // error JSON so the card can still link somewhere.
      await writeFile(
        jsonPath,
        `${JSON.stringify({ url: site.url, scannedAt: new Date().toISOString(), error }, null, 2)}\n`,
        'utf8',
      );
    }

    let hasHtml = false;
    if (report) {
      try {
        // 'html' lands via a parallel work package — render defensively so
        // the script works both before and after the format exists.
        const html = renderReport(report, 'html');
        if (typeof html === 'string' && html.length > 0) {
          await writeFile(join(REPORTS_DIR, `${site.slug}.html`), html, 'utf8');
          hasHtml = true;
        } else if (!htmlWarned) {
          htmlWarned = true;
          console.warn('\nwarning: renderReport has no html format yet — skipping reports/*.html');
        }
      } catch (err) {
        if (!htmlWarned) {
          htmlWarned = true;
          console.warn(
            `\nwarning: html render failed (${err instanceof Error ? err.message : err}) — skipping reports/*.html`,
          );
        }
      }
    }

    if (report && report.page === null) {
      // The CLI still writes a report when the page itself can't be fetched
      // (DNS/TLS/timeout) — and scores it well because most rules can't run.
      // Showing that score on a demo page would be misleading: render an
      // "unreachable" card instead. The real JSON report stays in data/.
      const unreachable = (Array.isArray(report.findings) ? report.findings : []).find(
        (f) => f.ruleId === 'technical/page-unreachable',
      );
      cards.push({
        ...site,
        ok: false,
        hostname: hostnameOf(site.url),
        scannedAt: report.scannedAt || new Date().toISOString(),
        error: unreachable?.detail || unreachable?.message || 'page could not be fetched',
      });
      console.log(
        `unreachable (page could not be fetched) · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    } else if (report) {
      const findings = Array.isArray(report.findings) ? report.findings : [];
      const card = {
        ...site,
        ok: true,
        hostname: hostnameOf(report.finalUrl || site.url),
        score: typeof report.score === 'number' ? report.score : 0,
        grade: typeof report.grade === 'string' ? report.grade : 'F',
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warn').length,
        scannedAt: report.scannedAt,
        hasHtml,
      };
      card.badge = uniqueBadgeSvg(badgeSvg(card.score, card.grade), site.slug);
      cards.push(card);
      console.log(
        `${card.score}/100 ${card.grade} · ${card.errors}e/${card.warnings}w · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    } else {
      cards.push({
        ...site,
        ok: false,
        hostname: hostnameOf(site.url),
        scannedAt: new Date().toISOString(),
        error,
      });
      console.log(`unreachable (${error})`);
    }
    await sleep(POLITE_DELAY_MS);
  }

  // Best score first; unreachable sites sink to the bottom.
  cards.sort((a, b) => (b.ok ? b.score : -1) - (a.ok ? a.score : -1));

  const html = indexHtml(cards, logoSvg, new Date().toISOString());
  await writeFile(join(SITE_DIR, 'index.html'), html, 'utf8');
  await copyFile(join(ROOT, 'llms.txt'), join(SITE_DIR, 'llms.txt'));
  console.log(`\nwrote ${join('site', 'index.html')} (${cards.length} cards)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
