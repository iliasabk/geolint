import { load } from 'cheerio';
import type { PageData } from '../core/types.js';
import { crawlPages } from './crawl.js';
import { normalizeUrl, stderrStatus } from './util.js';

export interface InitOptions {
  /** Max pages to crawl when building the link list. Default 30. */
  maxPages?: number;
  timeout?: number;
  userAgent?: string;
  /** Status sink for progress lines (stderr). */
  status?: (msg: string) => void;
  /** Called after each fetched page — used for MCP progress reporting. */
  onPage?: (fetched: number) => void;
}

export interface InitResult {
  url: string;
  markdown: string;
  pagesScanned: number;
}

interface PageInfo {
  url: string;
  pathname: string;
  title: string;
  description: string;
}

function pageInfo(url: string, page: PageData): PageInfo {
  const $ = load(page.html);
  const pathname = new URL(url).pathname;
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() ?? '';
  return { url, pathname, title, description };
}

/** 'api-reference' → 'Api Reference'; 'docs' → 'Docs'. */
function labelFor(segment: string): string {
  return segment.replace(/[-_+]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Strip characters that would break [text](url) markdown links. */
function clean(text: string): string {
  return text
    .replace(/[[\]()*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Render crawled pages as a llms.txt document per llmstxt.org conventions:
 * one H1 site title, a blockquote summary, then H2 sections grouping pages
 * by their first path segment (root pages land in 'Main').
 */
export function buildLlmsTxt(startUrl: string, pages: PageInfo[]): string {
  const host = new URL(startUrl).hostname;
  const entry = pages[0];
  const title = clean(entry?.title ?? '') || host;
  const summary = clean(entry?.description ?? '') || `Key pages and resources on ${host}.`;

  const groups = new Map<string, PageInfo[]>();
  for (const p of pages) {
    const first = p.pathname.split('/').filter(Boolean)[0];
    const label = first ? labelFor(first) : 'Main';
    const list = groups.get(label) ?? [];
    list.push(p);
    groups.set(label, list);
  }

  const lines: string[] = [`# ${title}`, `> ${summary}`, ''];
  for (const [label, items] of groups) {
    lines.push(`## ${label}`);
    for (const p of items) {
      const text = clean(p.title) || p.pathname;
      const desc = clean(p.description);
      lines.push(`- [${text}](${p.url})${desc ? `: ${desc}` : ''}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * `geolint init` — crawl the site (reusing the crawl machinery) and generate
 * a spec-conformant llms.txt listing its pages, grouped by top-level section.
 */
export async function runInit(input: string, opts: InitOptions = {}): Promise<InitResult> {
  const url = normalizeUrl(input);
  const status = opts.status ?? stderrStatus;
  const maxPages = opts.maxPages ?? 30;
  status(`Crawling ${url} (max ${maxPages} pages)…`);

  const { pages } = await crawlPages(url, {
    maxPages,
    timeout: opts.timeout,
    userAgent: opts.userAgent,
    onPage: opts.onPage ? (_page, fetched) => opts.onPage!(fetched) : undefined,
  });
  const infos = pages.flatMap((p) => (p.page ? [pageInfo(p.url, p.page)] : []));
  const markdown = buildLlmsTxt(url, infos);
  status(`Generated llms.txt from ${infos.length} page(s)`);
  return { url, markdown, pagesScanned: infos.length };
}
