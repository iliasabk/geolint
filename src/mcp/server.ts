import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { RULE_CATEGORIES, TOOL_NAME, VERSION } from '../core/types.js';
import {
  type CallOpts,
  auditUrlTool,
  compareUrlsTool,
  generateLlmsTxtTool,
  listAiBotsTool,
  listRulesTool,
} from './tools.js';

const categorySchema = z.enum(RULE_CATEGORIES);

const severitySchema = z.enum(['error', 'warn', 'info']);
const gradeSchema = z.enum(['A', 'B', 'C', 'D', 'F']);
const urlArg = z.string().min(1).describe('URL to audit — https://… or a bare hostname');
const fetchTimeoutArg = z
  .number()
  .int()
  .positive()
  .describe('per-request fetch timeout in ms')
  .optional();

const findingSchema = z.object({
  ruleId: z.string(),
  severity: severitySchema,
  title: z.string(),
  message: z.string(),
  detail: z.string().optional(),
});

const auditOutput = z.object({
  url: z.string(),
  finalUrl: z.string(),
  score: z.number(),
  grade: gradeSchema,
  counts: z.object({
    errors: z.number().int(),
    warnings: z.number().int(),
    info: z.number().int(),
  }),
  categories: z.array(
    z.object({
      category: z.string(),
      label: z.string(),
      score: z.number(),
      max: z.number(),
    }),
  ),
  findings: z.array(findingSchema),
  truncated: z.boolean(),
});

const llmsTxtOutput = z.object({
  url: z.string(),
  markdown: z.string(),
  pageCount: z.number().int(),
});

const rulesOutput = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      severity: severitySchema,
      title: z.string(),
      description: z.string(),
    }),
  ),
});

const botsOutput = z.object({
  bots: z.array(
    z.object({
      token: z.string(),
      vendor: z.string(),
      purpose: z.enum(['training', 'search', 'user-fetch', 'mixed']),
      robotsTxt: z.enum(['honored', 'bypass', 'unverified']),
      retired: z.boolean(),
    }),
  ),
});

const scoreSchema = z.object({ url: z.string(), score: z.number(), grade: gradeSchema });
const diffFindingSchema = z.object({
  ruleId: z.string(),
  severity: severitySchema,
  message: z.string(),
});
const compareOutput = z.object({
  a: scoreSchema,
  b: scoreSchema,
  delta: z.number(),
  added: z.array(diffFindingSchema),
  resolved: z.array(diffFindingSchema),
});

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Build a `reportProgress` sink from the request's `_meta.progressToken`.
 * Returns undefined when the client did not ask for progress — the tools
 * then skip progress work entirely.
 */
function progressReporter(extra: ToolExtra): CallOpts['reportProgress'] | undefined {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) {
    return undefined;
  }
  return (progress, total, message) => {
    void extra
      .sendNotification({
        method: 'notifications/progress',
        params: { progressToken, progress, total, ...(message ? { message } : {}) },
      })
      .catch(() => {});
  };
}

/** Merge per-request progress reporting into the shared CallOpts. */
function withProgress(opts: CallOpts, extra: ToolExtra): CallOpts {
  const reportProgress = progressReporter(extra);
  return reportProgress ? { ...opts, reportProgress } : opts;
}

/**
 * Build the geolint MCP server: five read-only tools over the audit engine.
 * `callTimeoutMs` caps each tool call's wall-clock time (default 60 s).
 */
export function createGeolintServer(opts: CallOpts = {}): McpServer {
  const server = new McpServer({ name: TOOL_NAME, version: VERSION });

  server.registerTool(
    'audit_url',
    {
      description:
        'Audit a URL for AI-search readiness: GEO score (0–100), grade, per-category scores and findings (AI crawler access, llms.txt, structured data, citability, technical).',
      inputSchema: {
        url: urlArg,
        timeout: fetchTimeoutArg,
        category: z.array(categorySchema).describe('only run these rule categories').optional(),
        only: z.array(z.string()).describe('only run these rule ids').optional(),
        ignore: z.array(z.string()).describe('skip these rule ids').optional(),
        maxFindings: z
          .number()
          .int()
          .describe('max findings returned (default 20, clamped to 1–100)')
          .optional(),
      },
      outputSchema: auditOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args, extra) => auditUrlTool(args, withProgress(opts, extra)),
  );

  server.registerTool(
    'generate_llms_txt',
    {
      description:
        'Crawl a site and generate a spec-conformant llms.txt document listing its pages, grouped by top-level section.',
      inputSchema: {
        url: urlArg.describe('site URL to crawl'),
        maxPages: z
          .number()
          .int()
          .describe('max pages to crawl (default 30, clamped to 1–100)')
          .optional(),
        timeout: fetchTimeoutArg,
      },
      outputSchema: llmsTxtOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args, extra) => generateLlmsTxtTool(args, withProgress(opts, extra)),
  );

  server.registerTool(
    'list_rules',
    {
      description: 'List geolint audit rules (id, category, severity, title, description).',
      inputSchema: {
        category: categorySchema.describe('only show this category').optional(),
      },
      outputSchema: rulesOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => listRulesTool(args),
  );

  server.registerTool(
    'list_ai_bots',
    {
      description:
        'List known AI crawler/fetcher user-agent tokens: vendor, purpose (training/search/user-fetch/mixed), documented robots.txt behavior, retired flag.',
      outputSchema: botsOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => listAiBotsTool(),
  );

  server.registerTool(
    'compare_urls',
    {
      description:
        'Audit two URLs and compare them: score delta plus findings added in B and resolved vs A.',
      inputSchema: {
        urlA: z.string().min(1).describe('first (baseline) URL'),
        urlB: z.string().min(1).describe('second (candidate) URL'),
        timeout: fetchTimeoutArg,
      },
      outputSchema: compareOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args, extra) => compareUrlsTool(args, withProgress(opts, extra)),
  );

  return server;
}
