import type { CheerioAPI } from 'cheerio';

export const VERSION = '0.3.2';
export const TOOL_NAME = 'geolint';

export type Severity = 'error' | 'warn' | 'info';

export type RuleCategory = 'ai-crawler' | 'llms-txt' | 'schema' | 'content' | 'technical';

export const RULE_CATEGORIES: RuleCategory[] = [
  'ai-crawler',
  'llms-txt',
  'schema',
  'content',
  'technical',
];

export const CATEGORY_LABELS: Record<RuleCategory, string> = {
  'ai-crawler': 'AI Crawler Access',
  'llms-txt': 'llms.txt',
  schema: 'Structured Data',
  content: 'Citability',
  technical: 'Technical Foundation',
};

/**
 * A finding produced by a rule. Rules return RuleFinding (without ruleId);
 * the engine stamps the ruleId onto each returned finding.
 */
export interface RuleFinding {
  severity: Severity;
  /** Short, human-readable summary of what was found. */
  message: string;
  /** Longer explanation / context. */
  detail?: string;
  /** Concrete remediation advice. */
  fix?: string;
  /** Evidence snippet (e.g. the offending line from robots.txt). */
  evidence?: string;
}

export interface Finding extends RuleFinding {
  ruleId: string;
  /** Tool-internal diagnostics (e.g. a rule that threw) — reported but never scored. */
  internal?: boolean;
}

export interface PageData {
  /** Requested URL. */
  url: string;
  /** Final URL after redirects. */
  finalUrl: string;
  status: number;
  /** Response headers, lowercased keys. */
  headers: Record<string, string>;
  html: string;
  timingMs: number;
  redirected: boolean;
  contentType: string;
}

export interface RobotRule {
  type: 'allow' | 'disallow';
  path: string;
}

export interface RobotGroup {
  /** User-agent tokens this group applies to (lowercased). */
  agents: string[];
  rules: RobotRule[];
  crawlDelay?: number;
}

export interface RobotsData {
  /** URL the robots.txt was fetched from. */
  url: string;
  /** HTTP status, 0 when the fetch itself failed. */
  status: number;
  raw: string | null;
  groups: RobotGroup[];
  sitemaps: string[];
}

export interface LlmsTxtLink {
  text: string;
  url: string;
}

export interface LlmsTxtSection {
  heading: string;
  links: LlmsTxtLink[];
}

export interface LlmsTxtParsed {
  /** The H1 title (required by the spec). */
  title: string | null;
  /** The blockquote summary. */
  summary: string | null;
  sections: LlmsTxtSection[];
  linkCount: number;
}

export interface LlmsTxtData {
  url: string;
  status: number;
  raw: string | null;
  parsed: LlmsTxtParsed | null;
}

/** Coarse pipeline stages a scan moves through, in order. */
export type ScanStage = 'fetch' | 'robots' | 'llms-txt' | 'rules' | 'done';

export interface ScanOptions {
  /** Fetch timeout in ms. Default 15000. */
  timeout?: number;
  /** Custom User-Agent for fetching. */
  userAgent?: string;
  /** Only run these rule ids. */
  only?: string[];
  /** Skip these rule ids. */
  ignore?: string[];
  /** Only run these categories. */
  categories?: RuleCategory[];
  /** Upper bound on auxiliary fetches a single scan may perform (sitemap etc.). Default 10. */
  maxExtraFetches?: number;
  /**
   * Called at the start of each pipeline stage — lets transports like the
   * MCP server report scan progress without coupling to engine internals.
   */
  onStage?: (stage: ScanStage) => void;
}

export interface ResolvedScanOptions {
  timeout: number;
  userAgent: string;
  only: string[];
  ignore: string[];
  categories: RuleCategory[] | null;
  maxExtraFetches: number;
}

/**
 * Context handed to every rule. `page`/`$` are null when the target URL
 * could not be fetched — rules must handle that case.
 */
export interface RuleContext {
  /** Requested URL. */
  url: string;
  /** Final URL after redirects (equals url when the fetch failed). */
  finalUrl: string;
  page: PageData | null;
  /** Cheerio instance for page.html, null when page is null. */
  $: CheerioAPI | null;
  robots: RobotsData | null;
  llmsTxt: LlmsTxtData | null;
  options: ResolvedScanOptions;
  /**
   * Fetch an additional page within the audit's scope (sitemap, nested
   * llms-full.txt…); a few rules may also sample cross-origin links
   * (llms-txt/broken-links). Rate-limited via options.maxExtraFetches;
   * throws when the budget is exhausted.
   */
  fetchPage: (url: string) => Promise<PageData>;
}

export interface Rule {
  /** e.g. 'ai-crawler/gptbot-blocked'. Unique, kebab-case, category-prefixed. */
  id: string;
  category: RuleCategory;
  /** Short title shown in reports. */
  title: string;
  /** One-paragraph explanation of why this matters for AI search. */
  description: string;
  severity: Severity;
  check: (ctx: RuleContext) => RuleFinding[] | Promise<RuleFinding[]>;
}

export interface CategoryScore {
  score: number;
  errors: number;
  warnings: number;
  infos: number;
  /** Rule ids that ran in this category. */
  rulesRun: string[];
  /** Rule ids that produced no findings. */
  passed: string[];
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Whether a known AI bot may fetch the site root per robots.txt. */
export interface BotAccess {
  id: string;
  name: string;
  company: string;
  purpose: 'training' | 'search' | 'user-fetch' | 'mixed';
  /** null = robots.txt could not be evaluated (missing/unreachable). */
  allowed: boolean | null;
}

export interface ScanReport {
  tool: { name: string; version: string };
  url: string;
  finalUrl: string;
  scannedAt: string;
  durationMs: number;
  page: {
    status: number;
    contentType: string;
    timingMs: number;
    redirected: boolean;
  } | null;
  robots: { url: string; status: number; groupCount: number; sitemaps: string[] } | null;
  llmsTxt: { url: string; status: number; title: string | null; linkCount: number } | null;
  bots: BotAccess[];
  findings: Finding[];
  score: number;
  grade: Grade;
  categories: Record<RuleCategory, CategoryScore>;
}

export interface SiteReport {
  tool: { name: string; version: string };
  url: string;
  scannedAt: string;
  durationMs: number;
  pages: ScanReport[];
  findings: Finding[];
  score: number;
  grade: Grade;
  categories: Record<RuleCategory, CategoryScore>;
  stats: { pagesScanned: number; pagesFailed: number };
}
