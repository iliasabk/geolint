import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { diffReports } from '../commands/diff.js';
import { runInit } from '../commands/init.js';
import { noopStatus, normalizeUrl } from '../commands/util.js';
import { AI_BOTS } from '../core/bots.js';
import { scan } from '../core/engine.js';
import {
  CATEGORY_LABELS,
  type Finding,
  RULE_CATEGORIES,
  type RuleCategory,
  type ScanStage,
  type Severity,
} from '../core/types.js';
import { allRules, ruleById } from '../rules/index.js';

/** Default wall-clock budget for a single tool call. */
export const DEFAULT_CALL_TIMEOUT_MS = 60_000;

const MAX_FINDINGS_DEFAULT = 20;
const MAX_FINDINGS_LIMIT = 100;
const MAX_PAGES_DEFAULT = 30;
const MAX_PAGES_LIMIT = 100;
const DIFF_LIMIT = 20;
/** How many findings the audit text summary lists before deferring to structuredContent. */
const TEXT_FINDINGS = 5;

export interface CallOpts {
  /** Wall-clock cap for the whole tool call. Default DEFAULT_CALL_TIMEOUT_MS. */
  callTimeoutMs?: number;
  /**
   * Progress sink for long-running calls (wired to notifications/progress
   * when the client sends _meta.progressToken). Values are 0–100.
   */
  reportProgress?: (progress: number, total: number, message?: string) => void;
}

/** Stage → progress fraction for a single-page scan. */
const SCAN_STAGE_PROGRESS: Record<ScanStage, number> = {
  fetch: 10,
  robots: 35,
  'llms-txt': 55,
  rules: 70,
  done: 100,
};

/** Map scan stages onto [offset, offset+span] of a 0–100 progress bar. */
function stageProgress(
  report: NonNullable<CallOpts['reportProgress']> | undefined,
  offset: number,
  span: number,
): ((stage: ScanStage) => void) | undefined {
  if (!report) {
    return undefined;
  }
  return (stage) => {
    report(offset + (SCAN_STAGE_PROGRESS[stage] / 100) * span, 100, stage);
  };
}

export interface AuditUrlArgs {
  url: string;
  timeout?: number;
  category?: RuleCategory[];
  only?: string[];
  ignore?: string[];
  maxFindings?: number;
}

export interface GenerateLlmsTxtArgs {
  url: string;
  maxPages?: number;
  timeout?: number;
}

export interface ListRulesArgs {
  category?: RuleCategory;
}

export interface CompareUrlsArgs {
  urlA: string;
  urlB: string;
  timeout?: number;
}

export function toolError(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Race `work` against a wall-clock deadline so a hung target can't stall the client. */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    timer.unref();
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function clampInt(value: number | undefined, fallback: number, lo: number, hi: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

function summarizeFinding(f: Finding) {
  return {
    ruleId: f.ruleId,
    severity: f.severity,
    title: ruleById(f.ruleId)?.title ?? f.ruleId,
    message: f.message,
    ...(f.detail ? { detail: f.detail } : {}),
  };
}

/** `audit_url` — scan a URL and return score, grade, category scores and capped findings. */
export async function auditUrlTool(
  args: AuditUrlArgs,
  opts: CallOpts = {},
): Promise<CallToolResult> {
  const run = async (): Promise<CallToolResult> => {
    const url = normalizeUrl(args.url);
    const report = await scan(url, {
      timeout: args.timeout,
      categories: args.category,
      only: args.only,
      ignore: args.ignore,
      onStage: stageProgress(opts.reportProgress, 0, 100),
    });
    const findings = report.findings
      .filter((f) => !f.internal)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const max = clampInt(args.maxFindings, MAX_FINDINGS_DEFAULT, 1, MAX_FINDINGS_LIMIT);
    const shown = findings.slice(0, max);
    const counts = { errors: 0, warnings: 0, info: 0 };
    for (const f of findings) {
      if (f.severity === 'error') {
        counts.errors++;
      } else if (f.severity === 'warn') {
        counts.warnings++;
      } else {
        counts.info++;
      }
    }
    const categories = RULE_CATEGORIES.flatMap((cat) => {
      const c = report.categories[cat]!;
      return c.rulesRun.length > 0
        ? [{ category: cat, label: CATEGORY_LABELS[cat], score: c.score, max: 100 }]
        : [];
    });
    const payload = {
      url: report.url,
      finalUrl: report.finalUrl,
      score: report.score,
      grade: report.grade,
      counts,
      categories,
      findings: shown.map(summarizeFinding),
      truncated: findings.length > shown.length,
    };
    const topLines = shown
      .slice(0, TEXT_FINDINGS)
      .map((f) => `  [${f.severity}] ${f.ruleId} — ${f.message}`);
    const text = [
      `geolint audit: ${report.finalUrl}`,
      `score ${report.score}/100 (${report.grade}) — ${counts.errors} errors, ${counts.warnings} warnings, ${counts.info} info`,
      ...(topLines.length > 0 ? ['', 'top findings:', ...topLines] : []),
      ...(payload.truncated
        ? [`… +${findings.length - shown.length} more findings (raise maxFindings to see them)`]
        : []),
    ].join('\n');
    return { content: [{ type: 'text', text }], structuredContent: payload };
  };
  try {
    return await withTimeout(run(), opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS, 'audit_url');
  } catch (err) {
    return toolError(err);
  }
}

/** `generate_llms_txt` — crawl a site and render a spec-conformant llms.txt. */
export async function generateLlmsTxtTool(
  args: GenerateLlmsTxtArgs,
  opts: CallOpts = {},
): Promise<CallToolResult> {
  const run = async (): Promise<CallToolResult> => {
    const maxPages = clampInt(args.maxPages, MAX_PAGES_DEFAULT, 1, MAX_PAGES_LIMIT);
    const result = await runInit(args.url, {
      maxPages,
      timeout: args.timeout,
      status: noopStatus,
      onPage: opts.reportProgress
        ? (fetched) =>
            opts.reportProgress!(
              Math.min(95, (fetched / maxPages) * 95),
              100,
              `fetched ${fetched}/${maxPages} pages`,
            )
        : undefined,
    });
    const payload = { url: result.url, markdown: result.markdown, pageCount: result.pagesScanned };
    return { content: [{ type: 'text', text: result.markdown }], structuredContent: payload };
  };
  try {
    return await withTimeout(
      run(),
      opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS,
      'generate_llms_txt',
    );
  } catch (err) {
    return toolError(err);
  }
}

/** `list_rules` — dump the rule registry, optionally filtered by category. */
export function listRulesTool(args: ListRulesArgs = {}): CallToolResult {
  const rules = allRules.filter((r) => !args.category || r.category === args.category);
  const payload = {
    rules: rules.map((r) => ({
      id: r.id,
      category: r.category,
      severity: r.severity,
      title: r.title,
      description: r.description,
    })),
  };
  const scope = args.category ? ` in category '${args.category}'` : '';
  return {
    content: [{ type: 'text', text: `${rules.length} geolint rules${scope}` }],
    structuredContent: payload,
  };
}

/** `list_ai_bots` — dump the AI bot registry (robots.txt tokens). */
export function listAiBotsTool(): CallToolResult {
  const payload = {
    bots: AI_BOTS.map((b) => ({
      token: b.id,
      vendor: b.company,
      purpose: b.purpose,
      robotsTxt: b.robotsTxt ?? 'unverified',
      retired: b.retired ?? false,
    })),
  };
  return {
    content: [{ type: 'text', text: `${payload.bots.length} known AI bot tokens` }],
    structuredContent: payload,
  };
}

/** `compare_urls` — scan two URLs and diff findings by findingKey identity. */
export async function compareUrlsTool(
  args: CompareUrlsArgs,
  opts: CallOpts = {},
): Promise<CallToolResult> {
  const run = async (): Promise<CallToolResult> => {
    const reportA = await scan(normalizeUrl(args.urlA), {
      timeout: args.timeout,
      onStage: stageProgress(opts.reportProgress, 0, 50),
    });
    const reportB = await scan(normalizeUrl(args.urlB), {
      timeout: args.timeout,
      onStage: stageProgress(opts.reportProgress, 50, 50),
    });
    const diff = diffReports(reportA, reportB);
    const pick = (list: Finding[]) =>
      list
        .filter((f) => !f.internal)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .slice(0, DIFF_LIMIT)
        .map((f) => ({ ruleId: f.ruleId, severity: f.severity, message: f.message }));
    const payload = {
      a: { url: reportA.url, score: reportA.score, grade: reportA.grade },
      b: { url: reportB.url, score: reportB.score, grade: reportB.grade },
      delta: diff.delta,
      added: pick(diff.added),
      resolved: pick(diff.resolved),
    };
    const sign = diff.delta > 0 ? '+' : '';
    const text = [
      'geolint compare',
      `A ${reportA.finalUrl} — ${reportA.score}/100 (${reportA.grade})`,
      `B ${reportB.finalUrl} — ${reportB.score}/100 (${reportB.grade})`,
      `delta ${sign}${diff.delta} · ${payload.added.length} added · ${payload.resolved.length} resolved`,
    ].join('\n');
    return { content: [{ type: 'text', text }], structuredContent: payload };
  };
  try {
    return await withTimeout(run(), opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS, 'compare_urls');
  } catch (err) {
    return toolError(err);
  }
}
