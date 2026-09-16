/**
 * Self-contained HTML report — a single .html file with inline CSS and a tiny
 * inline <script> (findings filter + print helper). Zero external resources:
 * no CDN links, no webfonts, no images beyond an inline SVG logo — so the file
 * renders perfectly offline via file:// and is safe to share or host anywhere.
 *
 * Every dynamic string is HTML-escaped at render time; hrefs only ever point
 * at http(s) URLs. Output is deterministic: the timestamp comes from the
 * report, never the wall clock.
 */
import { AI_BOTS } from '../core/bots.js';
import {
  type BotAccess,
  CATEGORY_LABELS,
  type CategoryScore,
  type Finding,
  type Grade,
  RULE_CATEGORIES,
  type RuleCategory,
  type ScanReport,
  type Severity,
  type SiteReport,
} from '../core/types.js';
import { ruleById } from '../rules/index.js';
import type { RenderOptions } from './index.js';

const REPO_URL = 'https://github.com/iliasabk/geolint';

/** Same grade → hex mapping as the SVG badge / shields colors. */
const GRADE_COLOR: Record<Grade, string> = {
  A: '#4c1',
  B: '#97ca00',
  C: '#dfb317',
  D: '#fe7d37',
  F: '#e05d44',
};

const SEV_COLOR: Record<Severity, string> = {
  error: '#f85149',
  warn: '#d29922',
  info: '#22d3ee',
};
const SEV_GLYPH: Record<Severity, string> = { error: '✕', warn: '⚠', info: 'ℹ' };
const SEV_NAME: Record<Severity, string> = { error: 'error', warn: 'warning', info: 'hint' };

const PURPOSES = ['training', 'search', 'user-fetch', 'mixed'] as const;
type Purpose = (typeof PURPOSES)[number];
const PURPOSE_COLOR: Record<Purpose, string> = {
  training: '#a5b4fc',
  search: '#22d3ee',
  'user-fetch': '#3fb950',
  mixed: '#d29922',
};

/** AiBot registry metadata (retired, controlOnly, robotsTxt posture) by token. */
const BOT_META = new Map(AI_BOTS.map((b) => [b.id, b]));

// ---------------------------------------------------------------------------
// Escaping / primitives
// ---------------------------------------------------------------------------

/** Escape the five HTML special chars — safe for text nodes and quoted attrs. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) URLs may become hrefs — anything else renders as plain text. */
function httpUrl(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

function extLink(url: string, label?: string): string {
  const safe = httpUrl(url);
  const text = esc(label ?? url);
  return safe ? `<a href="${esc(safe)}">${text}</a>` : text;
}

function plural(n: number, singular: string, pluralWord = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

function durationLabel(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Score ladder matching the terminal reporter's scoreStyle thresholds. */
function scoreColor(score: number): string {
  if (score >= 90) {
    return '#4c1';
  }
  if (score >= 75) {
    return '#97ca00';
  }
  if (score >= 60) {
    return '#dfb317';
  }
  if (score >= 40) {
    return '#fe7d37';
  }
  return '#e05d44';
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function categoryOf(ruleId: string): RuleCategory | 'other' {
  const prefix = ruleId.split('/')[0] ?? '';
  return (RULE_CATEGORIES as string[]).includes(prefix) ? (prefix as RuleCategory) : 'other';
}

interface SevTotals {
  errors: number;
  warnings: number;
  infos: number;
}

function severityTotals(findings: Finding[]): SevTotals {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const f of findings) {
    if (f.severity === 'error') {
      errors += 1;
    } else if (f.severity === 'warn') {
      warnings += 1;
    } else {
      infos += 1;
    }
  }
  return { errors, warnings, infos };
}

function passedRuleIds(categories: Record<RuleCategory, CategoryScore>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const cat of RULE_CATEGORIES) {
    for (const id of [...categories[cat].passed].sort()) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  return ordered;
}

function rulesRunCount(categories: Record<RuleCategory, CategoryScore>): number {
  const seen = new Set<string>();
  for (const cat of RULE_CATEGORIES) {
    for (const id of categories[cat].rulesRun) {
      seen.add(id);
    }
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const LOGO = `<svg class="logo" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="24" y2="24"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#818cf8"/></linearGradient></defs><circle cx="12" cy="12" r="4.4" fill="url(#lg)"/><path d="M12 2.6a9.4 9.4 0 0 1 9.4 9.4" stroke="url(#lg)" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M12 21.4A9.4 9.4 0 0 1 2.6 12" stroke="url(#lg)" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".55"/></svg>`;

function brand(sub: string, version: string): string {
  return `<header class="head"><div class="brand-row">${LOGO}<span class="brand">geolint</span><span class="ver">v${esc(version)}</span><span class="tag">${esc(sub)}</span></div></header>`;
}

function metaChips(chips: string[]): string {
  return `<div class="meta">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>`;
}

function scanHeader(report: ScanReport): string {
  const redirected = report.page?.redirected === true || report.finalUrl !== report.url;
  const chips: string[] = [];
  if (report.page) {
    chips.push(esc(`HTTP ${report.page.status}`));
    chips.push(esc(report.page.contentType.split(';')[0]!.trim()));
    chips.push(esc(`TTFB ${durationLabel(report.page.timingMs)}`));
  }
  chips.push(esc(`total ${durationLabel(report.durationMs)}`));
  if (report.robots) {
    chips.push(
      esc(`robots.txt ${report.robots.status === 0 ? 'unreachable' : report.robots.status}`),
    );
  }
  if (report.llmsTxt) {
    chips.push(
      esc(`llms.txt ${report.llmsTxt.status === 0 ? 'unreachable' : report.llmsTxt.status}`),
    );
  }
  chips.push(esc(dateLabel(report.scannedAt)));
  const arrow = redirected ? ` <span class="arr">→</span> ${extLink(report.finalUrl)}` : '';
  return `${brand('AI-search readiness audit', report.tool.version)}
<div class="urls">${extLink(report.url)}${arrow}</div>
${metaChips(chips)}`;
}

function siteHeader(site: SiteReport): string {
  const chips = [
    esc(`${plural(site.stats.pagesScanned, 'page')} scanned`),
    esc(`${site.stats.pagesFailed} failed`),
    esc(`scanned in ${durationLabel(site.durationMs)}`),
    esc(dateLabel(site.scannedAt)),
  ];
  return `${brand('site audit · AI-search readiness', site.tool.version)}
<div class="urls">${extLink(site.url)}</div>
${metaChips(chips)}`;
}

/** SVG score ring + grade + severity totals. */
function hero(
  score: number,
  grade: Grade,
  findings: Finding[],
  categories: Record<RuleCategory, CategoryScore>,
): string {
  const s = clampScore(score);
  const color = GRADE_COLOR[grade] ?? '#8b949e';
  const t = severityTotals(findings);
  const counts = [
    `<span style="color:${SEV_COLOR.error}">${esc(plural(t.errors, 'error'))}</span>`,
    `<span style="color:${SEV_COLOR.warn}">${esc(plural(t.warnings, 'warning'))}</span>`,
    `<span style="color:${SEV_COLOR.info}">${esc(plural(t.infos, 'hint'))}</span>`,
  ].join('<span class="sep">·</span>');
  const run = rulesRunCount(categories);
  const checks =
    run > 0
      ? `<div class="checks">${passedRuleIds(categories).length}/${run} checks passed</div>`
      : '';
  return `<section class="hero">
<div class="ring" role="img" aria-label="Score ${s} out of 100, grade ${esc(grade)}">
<svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true"><circle class="rb" cx="60" cy="60" r="52"/><circle class="rf" cx="60" cy="60" r="52" style="--p:${s};stroke:${color}" transform="rotate(-90 60 60)"/></svg>
<div class="ring-num"><strong>${s}</strong><span>/100</span></div>
</div>
<div class="hero-side">
<div class="grade-line">Grade <strong class="grade" style="color:${color}">${esc(grade)}</strong></div>
<div class="counts">${counts}</div>
${checks}
</div>
</section>`;
}

function issueText(cs: CategoryScore): string {
  if (cs.rulesRun.length === 0) {
    return 'no checks';
  }
  const total = cs.errors + cs.warnings + cs.infos;
  if (total === 0) {
    return '✓ clean';
  }
  const parts: string[] = [];
  if (cs.errors > 0) {
    parts.push(plural(cs.errors, 'error'));
  }
  if (cs.warnings > 0) {
    parts.push(plural(cs.warnings, 'warning'));
  }
  if (cs.infos > 0) {
    parts.push(plural(cs.infos, 'hint'));
  }
  return parts.join(' · ');
}

function categoriesSection(categories: Record<RuleCategory, CategoryScore>): string {
  const cards = RULE_CATEGORIES.map((cat) => {
    const cs = categories[cat];
    const s = clampScore(cs.score);
    const empty = cs.rulesRun.length === 0;
    return `<div class="card">
<div class="cat-name">${esc(CATEGORY_LABELS[cat])}</div>
<div class="cat-score" style="color:${empty ? '#8b949e' : scoreColor(s)}">${empty ? '—' : s}</div>
<div class="bar"><i style="width:${empty ? 0 : s}%;background:${scoreColor(s)}"></i></div>
<div class="cat-issues">${esc(issueText(cs))}</div>
</div>`;
  });
  return `<section class="sec"><h2>Categories</h2><div class="cats">${cards.join('')}</div></section>`;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

interface GroupedFinding {
  finding: Finding;
  /** Site reports: how many pages produced this identical finding. */
  pages: number;
}

function groupFindings(findings: Finding[], dedupe: boolean): GroupedFinding[] {
  if (!dedupe) {
    return findings.map((finding) => ({ finding, pages: 1 }));
  }
  const map = new Map<string, GroupedFinding>();
  for (const finding of findings) {
    const key = `${finding.ruleId}${finding.message}`;
    const entry = map.get(key);
    if (entry) {
      entry.pages += 1;
    } else {
      map.set(key, { finding, pages: 1 });
    }
  }
  return [...map.values()];
}

function findingCard({ finding: f, pages }: GroupedFinding): string {
  const sev: Severity = f.severity === 'error' || f.severity === 'warn' ? f.severity : 'info';
  const rule = ruleById(f.ruleId);
  const cat = categoryOf(f.ruleId);
  const chips = [
    `<span class="sev-tag" style="color:${SEV_COLOR[sev]}">${SEV_GLYPH[sev]} ${SEV_NAME[sev]}</span>`,
    `<code class="rule-id">${esc(f.ruleId)}</code>`,
    `<span class="cat-tag">${esc(cat === 'other' ? 'Other' : CATEGORY_LABELS[cat])}</span>`,
  ];
  if (pages > 1) {
    chips.push(`<span class="pages-chip">×${pages} pages</span>`);
  }
  const parts = [`<article class="finding"><header>${chips.join('')}</header>`];
  if (rule) {
    parts.push(`<div class="finding-title">${esc(rule.title)}</div>`);
  }
  parts.push(`<p class="msg">${esc(f.message)}</p>`);
  if (f.detail) {
    parts.push(`<p class="detail">${esc(f.detail)}</p>`);
  }
  if (f.fix) {
    parts.push(`<p class="fix"><span>Fix</span>${esc(f.fix)}</p>`);
  }
  if (f.evidence) {
    parts.push(`<pre class="evidence">${esc(f.evidence)}</pre>`);
  }
  parts.push('</article>');
  return parts.join('');
}

/**
 * Findings grouped under collapsible <details> per severity. Errors/warnings
 * are expanded; hints are collapsed unless verbose, and omitted entirely when
 * verbose === false (same convention as the other reporters).
 */
function findingsSection(findings: Finding[], opts: RenderOptions, dedupe: boolean): string {
  const entries = groupFindings(
    findings.filter((f) => f.severity !== 'info' || opts.verbose !== false),
    dedupe,
  );
  if (entries.length === 0) {
    const note =
      findings.length > 0 ? 'only hints — hidden (re-run with --verbose)' : '✓ no findings';
    return `<section class="sec"><h2>Findings</h2><div class="clean">${esc(note)}</div></section>`;
  }
  const groups: { sev: Severity; label: string; open: boolean }[] = [
    { sev: 'error', label: 'Errors', open: true },
    { sev: 'warn', label: 'Warnings', open: true },
    { sev: 'info', label: 'Hints', open: opts.verbose === true },
  ];
  const blocks = groups
    .map(({ sev, label, open }) => {
      const list = entries.filter((e) => {
        const s =
          e.finding.severity === 'error' || e.finding.severity === 'warn'
            ? e.finding.severity
            : 'info';
        return s === sev;
      });
      if (list.length === 0) {
        return '';
      }
      return `<details class="sg sev-${sev}"${open ? ' open' : ''}><summary><span class="sg-g">${SEV_GLYPH[sev]}</span>${label} <span class="cnt">${list.length}</span></summary>${list.map(findingCard).join('')}</details>`;
    })
    .filter(Boolean)
    .join('');
  return `<section class="sec"><h2>Findings</h2><input id="fq" class="fsearch" type="search" placeholder="Filter findings…" autocomplete="off">${blocks}</section>`;
}

// ---------------------------------------------------------------------------
// Bot access matrix
// ---------------------------------------------------------------------------

function botRow(bot: BotAccess): string {
  const meta = BOT_META.get(bot.id);
  const purpose: Purpose = PURPOSES.includes(bot.purpose) ? bot.purpose : 'mixed';
  const access =
    bot.allowed === true
      ? '<span class="ok">✓ allowed</span>'
      : bot.allowed === false
        ? '<span class="no">✕ blocked</span>'
        : '<span class="unk">– unknown</span>';
  const chips: string[] = [];
  if (bot.id !== bot.name) {
    chips.push(`<span class="b-id">${esc(bot.id)}</span>`);
  }
  if (meta?.retired === true) {
    chips.push('<span class="mini">retired</span>');
  }
  if (meta?.controlOnly === true) {
    chips.push('<span class="mini">opt-out</span>');
  }
  const posture = meta?.robotsTxt ?? 'unverified';
  const postureLabel =
    posture === 'honored' ? 'honored' : posture === 'bypass' ? 'may bypass' : 'unverified';
  const title = meta?.notes ? ` title="${esc(meta.notes)}"` : '';
  return `<tr class="bot${meta?.retired === true ? ' ret' : ''}"${title}><td class="b-name"><code>${esc(bot.name)}</code>${chips.join('')}</td><td><span class="pb" style="color:${PURPOSE_COLOR[purpose]};border-color:${PURPOSE_COLOR[purpose]}">${purpose}</span></td><td class="posture">${postureLabel}</td><td>${access}</td></tr>`;
}

function botSection(bots: BotAccess[]): string {
  const allowed = bots.filter((b) => b.allowed === true).length;
  const blocked = bots.filter((b) => b.allowed === false).length;
  const unknown = bots.length - allowed - blocked;
  const summary = [`${allowed}/${bots.length} allowed`];
  if (blocked > 0) {
    summary.push(`${blocked} blocked`);
  }
  if (unknown > 0) {
    summary.push(`${unknown} unknown`);
  }

  const byCompany = new Map<string, BotAccess[]>();
  for (const bot of bots) {
    const list = byCompany.get(bot.company) ?? [];
    list.push(bot);
    byCompany.set(bot.company, list);
  }
  const rows: string[] = [];
  for (const [company, companyBots] of byCompany) {
    rows.push(`<tr class="co"><td colspan="4">${esc(company)}</td></tr>`);
    for (const bot of companyBots) {
      rows.push(botRow(bot));
    }
  }
  return `<section class="sec"><h2>AI crawler access <span class="h2-sub">${esc(summary.join(' · '))}</span></h2>
<div class="tablewrap"><table class="bots"><thead><tr><th>Bot</th><th>Purpose</th><th>robots.txt</th><th>Access</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}

// ---------------------------------------------------------------------------
// Site pages table
// ---------------------------------------------------------------------------

function topIssue(t: SevTotals): string {
  if (t.errors > 0) {
    return `<span class="no">✕ ${esc(plural(t.errors, 'error'))}</span>`;
  }
  if (t.warnings > 0) {
    return `<span class="wn">⚠ ${esc(plural(t.warnings, 'warning'))}</span>`;
  }
  if (t.infos > 0) {
    return `<span class="in">ℹ ${esc(plural(t.infos, 'hint'))}</span>`;
  }
  return '<span class="ok">✓ clean</span>';
}

/** Compact score ring for per-page drill-downs (same math as the hero ring). */
function miniRing(score: number, grade: Grade): string {
  const s = clampScore(score);
  const color = GRADE_COLOR[grade] ?? '#8b949e';
  return `<div class="ring-sm" role="img" aria-label="Score ${s} out of 100, grade ${esc(grade)}">
<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><circle class="rb" cx="28" cy="28" r="23"/><circle class="rf-sm" cx="28" cy="28" r="23" style="--p:${s};stroke:${color}" transform="rotate(-90 28 28)"/></svg>
<div class="ring-sm-num"><strong>${s}</strong></div>
</div>`;
}

/**
 * One collapsible <details> per crawled page: summary row (path, score,
 * grade, top issue) expands into that page's own mini report — ring, fetch
 * meta and its findings rendered through the same findingCard component.
 */
function pageDrillDown(p: ScanReport, opts: RenderOptions): string {
  const url = p.finalUrl || p.url;
  const t = severityTotals(p.findings);
  const chips: string[] = [extLink(url, 'open page ↗')];
  if (p.page) {
    chips.push(esc(`HTTP ${p.page.status}`));
    chips.push(esc(`TTFB ${durationLabel(p.page.timingMs)}`));
  }
  const visible = p.findings.filter((f) => f.severity !== 'info' || opts.verbose === true);
  const hidden = p.findings.length - visible.length;
  const body =
    visible.length === 0
      ? `<div class="page-clean">✓ no findings${hidden > 0 ? ` — ${plural(hidden, 'hint')} hidden (re-run with --verbose)` : ''}</div>`
      : visible.map((f) => findingCard({ finding: f, pages: 1 })).join('');
  return `<details class="pg"><summary><span class="p-path">${esc(pagePath(url))}</span><span class="p-score" style="color:${scoreColor(clampScore(p.score))}">${clampScore(p.score)}</span><span class="gc" style="background:${GRADE_COLOR[p.grade] ?? '#8b949e'}">${esc(p.grade)}</span><span class="p-issue">${topIssue(t)}</span></summary>
<div class="page-body"><div class="page-side">${miniRing(p.score, p.grade)}<div class="page-meta">${metaChips(chips)}</div></div>
<div class="page-findings">${body}</div></div></details>`;
}

function pagesSection(site: SiteReport, opts: RenderOptions): string {
  const sorted = [...site.pages].sort(
    (a, b) =>
      a.score - b.score || severityTotals(b.findings).errors - severityTotals(a.findings).errors,
  );
  const rows = sorted.map((p) => pageDrillDown(p, opts)).join('');
  return `<section class="sec"><h2>Pages <span class="h2-sub">worst first · expand a row for that page's own report</span></h2>
<div class="pglist">${rows}</div></section>`;
}

// ---------------------------------------------------------------------------
// Passed checks + footer
// ---------------------------------------------------------------------------

function passedBlock(categories: Record<RuleCategory, CategoryScore>, opts: RenderOptions): string {
  if (opts.verbose !== true) {
    return '';
  }
  const passed = passedRuleIds(categories);
  if (passed.length === 0) {
    return '';
  }
  return `<details class="passed"><summary>${esc(plural(passed.length, 'check'))} passed</summary><div class="passed-ids">${passed.map((id) => `<code>${esc(id)}</code>`).join(' ')}</div></details>`;
}

function footerHtml(version: string): string {
  return `<footer class="foot">generated by geolint v${esc(version)} — <a href="${REPO_URL}">github.com/iliasabk/geolint</a></footer>`;
}

// ---------------------------------------------------------------------------
// Document shell — inline CSS + minimal inline JS, zero external resources
// ---------------------------------------------------------------------------

const CSS = `
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--err:#f85149;--warn:#d29922;--info:#22d3ee;--ok:#3fb950}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:940px;margin:0 auto;padding:26px 18px 56px}
a{color:#22d3ee;text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:.85em}
.hidden{display:none!important}
.head{margin-bottom:16px}
.brand-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.logo{display:block;flex:none}
.brand{font-size:26px;font-weight:800;letter-spacing:-.02em;background:linear-gradient(90deg,#22d3ee,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.ver{color:var(--muted);font-size:12.5px;border:1px solid var(--border);border-radius:999px;padding:1px 9px}
.tag{color:var(--muted);font-size:13.5px}
.urls{margin:9px 0 8px;font-size:15px;word-break:break-all}
.arr{color:var(--muted)}
.chip{display:inline-block;background:#21262d;border:1px solid var(--border);border-radius:999px;padding:1px 10px;margin:2px 5px 2px 0;color:var(--muted);font-size:12.5px}
.hero{display:flex;gap:26px;align-items:center;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px 26px}
.ring{position:relative;width:132px;height:132px;flex:none}
.rb,.rf{fill:none;stroke-width:9;stroke-linecap:round}
.rb{stroke:#21262d}
.rf{stroke-dasharray:326.73px;stroke-dashoffset:calc(326.73px*(1 - var(--p)/100));animation:ringin .9s cubic-bezier(.25,.7,.3,1)}
@keyframes ringin{from{stroke-dashoffset:326.73px}}
.ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring-num strong{font-size:36px;line-height:1}
.ring-num span{color:var(--muted);font-size:12px;margin-top:3px}
.grade-line{color:var(--muted);font-size:14px;display:flex;align-items:baseline;gap:9px}
.grade{font-size:44px;font-weight:800;line-height:1}
.counts{margin-top:9px;font-size:14px}
.counts .sep{color:var(--muted);margin:0 7px}
.checks{margin-top:5px;color:var(--muted);font-size:13px}
.sec{margin-top:28px}
.sec h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:700;margin:0 0 12px}
.h2-sub{text-transform:none;letter-spacing:0;font-weight:400;margin-left:6px}
.cats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:13px 14px}
.cat-name{font-size:12.5px;color:var(--muted);margin-bottom:6px}
.cat-score{font-size:24px;font-weight:800;line-height:1}
.bar{height:6px;background:#21262d;border-radius:3px;margin:9px 0 8px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:3px}
.cat-issues{font-size:12px;color:var(--muted)}
.fsearch{width:100%;padding:9px 12px;background:#0d1117;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:12px}
.fsearch:focus{outline:none;border-color:#22d3ee}
.sg{border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--panel)}
.sg>summary{cursor:pointer;list-style:none;padding:11px 14px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:9px;user-select:none}
.sg>summary::-webkit-details-marker{display:none}
.sg>summary::after{content:'\\25B8';margin-left:auto;color:var(--muted);transition:transform .15s}
.sg[open]>summary::after{transform:rotate(90deg)}
.cnt{background:#21262d;border:1px solid var(--border);border-radius:999px;padding:0 9px;font-size:12px;color:var(--muted);font-weight:400}
.sg-g{width:16px;text-align:center;flex:none}
.sev-error .sg-g{color:var(--err)}
.sev-warn .sg-g{color:var(--warn)}
.sev-info .sg-g{color:var(--info)}
.sg.sev-error{--sc:var(--err)}
.sg.sev-warn{--sc:var(--warn)}
.sg.sev-info{--sc:var(--info)}
.finding{border-top:1px solid #21262d;border-left:3px solid var(--sc,transparent);padding:11px 14px 13px}
.finding header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}
.sev-tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
.rule-id{color:var(--muted);background:#0d1117;border:1px solid var(--border);border-radius:5px;padding:1px 6px}
.cat-tag,.pages-chip{font-size:11px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:0 8px;white-space:nowrap}
.pages-chip{color:#a5b4fc;border-color:#818cf8}
.finding-title{font-weight:650;margin:2px 0}
.msg{margin:4px 0;font-size:14px}
.detail{margin:4px 0;color:var(--muted);font-size:13.5px}
.fix{margin:9px 0 0;font-size:13.5px;background:#0d1117;border:1px solid var(--border);border-radius:7px;padding:7px 11px}
.fix>span{display:inline-block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--ok);margin-right:9px}
.evidence{margin:9px 0 0;padding:8px 11px;background:#0d1117;border:1px solid var(--border);border-radius:7px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:var(--muted);white-space:pre-wrap;word-break:break-word}
.clean{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px;color:var(--ok)}
.tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:10px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:560px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);padding:9px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:7px 12px;border-top:1px solid #21262d;vertical-align:middle}
tr.co td{background:#0d1117;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:5px 12px}
tr.ret td{opacity:.45}
.b-name code{font-size:12.5px}
.b-id{color:var(--muted);margin-left:6px;font-size:11px}
.mini{font-size:10px;border:1px solid var(--border);border-radius:4px;padding:0 4px;margin-left:6px;color:var(--muted);text-transform:uppercase;white-space:nowrap}
.pb{display:inline-block;font-size:11px;font-weight:600;border:1px solid;border-radius:999px;padding:0 8px;white-space:nowrap}
.posture{color:var(--muted);font-size:12px;white-space:nowrap}
.ok{color:var(--ok)}
.no{color:var(--err)}
.unk{color:var(--muted)}
.wn{color:var(--warn)}
.in{color:var(--info)}
.pglist{display:flex;flex-direction:column;gap:8px}
.pg{border:1px solid var(--border);border-radius:10px;background:var(--panel)}
.pg>summary{cursor:pointer;list-style:none;padding:9px 14px;display:flex;align-items:center;gap:12px;font-size:13.5px;user-select:none}
.pg>summary::-webkit-details-marker{display:none}
.pg>summary::after{content:'\\25B8';margin-left:auto;color:var(--muted);transition:transform .15s;flex:none}
.pg[open]>summary{border-bottom:1px solid var(--border)}
.pg[open]>summary::after{transform:rotate(90deg)}
.pg .p-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg .p-issue{white-space:nowrap}
.page-body{padding:14px}
.page-side{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.page-meta{display:flex;flex-wrap:wrap;gap:4px}
.page-meta .chip a{color:var(--info)}
.page-findings .finding{margin-bottom:8px}
.page-clean{color:var(--ok);font-size:13.5px}
.ring-sm{position:relative;width:56px;height:56px;flex:none}
.rf-sm{fill:none;stroke-width:6;stroke-linecap:round;stroke-dasharray:144.51px;stroke-dashoffset:calc(144.51px*(1 - var(--p)/100));animation:ringin .9s cubic-bezier(.25,.7,.3,1)}
.ring-sm .rb{stroke-width:6}
.ring-sm-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.ring-sm-num strong{font-size:16px;line-height:1}
.p-path{word-break:break-all}
.p-score{font-weight:700}
.gc{display:inline-block;min-width:21px;text-align:center;border-radius:5px;color:#0d1117;font-weight:800;font-size:12px;padding:1px 6px}
.passed{margin-top:14px;color:var(--muted);font-size:13px}
.passed summary{cursor:pointer}
.passed-ids{margin-top:8px;line-height:2.1}
.passed-ids code{background:#21262d;border-radius:5px;padding:2px 6px;margin-right:4px;white-space:nowrap}
.foot{margin-top:42px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:12.5px;text-align:center}
@media (max-width:560px){
.hero{flex-direction:column;align-items:flex-start;gap:16px;padding:18px}
.wrap{padding:18px 12px 44px}
}
@media (prefers-reduced-motion:reduce){
.rf{animation:none}
}
@media print{
body{background:#fff;color:#111}
.card,.hero,.sg,.pg,.tablewrap,.clean,.fix,.evidence{background:#fff;border-color:#ccc}
.chip,.cnt,.rule-id,.cat-tag,.mini,.passed-ids code{background:#fff;border-color:#ccc;color:#444}
.fsearch,.passed{display:none}
.brand{background:none;-webkit-text-fill-color:#111;color:#111}
a{color:#0645ad}
tr.co td{background:#f3f3f3;color:#444}
*{ -webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

/** Findings filter + expand-all-on-print. Vanilla JS, no dependencies. */
const JS = `
(function(){
var q=document.getElementById('fq');
var gs=document.querySelectorAll('.sg');
var i;
if(q){
for(i=0;i<gs.length;i++){gs[i].setAttribute('data-o',gs[i].open?'1':'0');}
q.addEventListener('input',function(){
var n=q.value.toLowerCase().trim();
for(var i=0;i<gs.length;i++){
var g=gs[i],fs=g.querySelectorAll('.finding'),shown=0;
for(var j=0;j<fs.length;j++){
var hit=!n||fs[j].textContent.toLowerCase().indexOf(n)>-1;
fs[j].classList.toggle('hidden',!hit);
if(hit){shown++;}
}
g.classList.toggle('hidden',shown===0);
var c=g.querySelector('.cnt');
if(c){c.textContent=String(shown);}
g.open=n.length>0?shown>0:g.getAttribute('data-o')==='1';
}
});
}
window.addEventListener('beforeprint',function(){
var ds=document.querySelectorAll('details');
for(var i=0;i<ds.length;i++){ds[i].open=true;}
});
})();
`;

function page(opts: { title: string; header: string; body: string; version: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(opts.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
${opts.header}
${opts.body}
${footerHtml(opts.version)}
</main>
<script>${JS}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render a single-page audit as one self-contained, offline-ready .html file. */
export function renderHtmlReport(report: ScanReport, opts: RenderOptions = {}): string {
  const body = [
    hero(report.score, report.grade, report.findings, report.categories),
    categoriesSection(report.categories),
    report.bots.length > 0 ? botSection(report.bots) : '',
    findingsSection(report.findings, opts, false),
    passedBlock(report.categories, opts),
  ].join('\n');
  return page({
    title: `geolint · ${hostLabel(report.url)} · ${clampScore(report.score)}/100 (${report.grade})`,
    header: scanHeader(report),
    body,
    version: report.tool.version,
  });
}

/** Render a multi-page (crawl) audit — aggregate score + per-page table. */
export function renderHtmlSiteReport(site: SiteReport, opts: RenderOptions = {}): string {
  const body = [
    hero(site.score, site.grade, site.findings, site.categories),
    site.pages.length > 0 ? pagesSection(site, opts) : '',
    categoriesSection(site.categories),
    findingsSection(site.findings, opts, true),
    passedBlock(site.categories, opts),
  ].join('\n');
  return page({
    title: `geolint · ${hostLabel(site.url)} · site audit · ${clampScore(site.score)}/100 (${site.grade})`,
    header: siteHeader(site),
    body,
    version: site.tool.version,
  });
}
