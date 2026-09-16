import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { AI_BOTS } from '../../src/core/bots.js';
import { RULE_CATEGORIES } from '../../src/core/types.js';
import {
  auditUrlTool,
  compareUrlsTool,
  generateLlmsTxtTool,
  listAiBotsTool,
  listRulesTool,
  withTimeout,
} from '../../src/mcp/tools.js';
import { allRules } from '../../src/rules/index.js';
import { DEFAULT_HTML, withFixtureServer } from '../helpers.js';

const OPEN_ROBOTS = `User-agent: *
Allow: /
`;

const BLOCK_ALL_ROBOTS = `User-agent: *
Disallow: /
`;

const VALID_LLMS = `# Example Site
> An example site used in tests.

## Docs
- [Getting Started](https://example.com/docs/start): How to start
`;

/** Extract the first text block of a tool result. */
function textOf(res: CallToolResult): string {
  const item = res.content[0];
  return item?.type === 'text' ? item.text : '';
}

const HEALTHY_ROUTES = [
  { path: '/', body: DEFAULT_HTML },
  { path: '/robots.txt', body: OPEN_ROBOTS, headers: { 'content-type': 'text/plain' } },
  { path: '/llms.txt', body: VALID_LLMS, headers: { 'content-type': 'text/plain' } },
];

const BLOCKED_ROUTES = [
  { path: '/', body: DEFAULT_HTML },
  { path: '/robots.txt', body: BLOCK_ALL_ROBOTS, headers: { 'content-type': 'text/plain' } },
];

type AuditPayload = {
  url: string;
  finalUrl: string;
  score: number;
  grade: string;
  counts: { errors: number; warnings: number; info: number };
  categories: { category: string; label: string; score: number; max: number }[];
  findings: { ruleId: string; severity: string; title: string; message: string; detail?: string }[];
  truncated: boolean;
};

describe('auditUrlTool', () => {
  it('returns a structured audit for a healthy site', async () => {
    await withFixtureServer(HEALTHY_ROUTES, async (origin) => {
      const res = await auditUrlTool({ url: origin });
      expect(res.isError).toBeUndefined();
      const p = res.structuredContent as AuditPayload;
      expect(p.url).toBe(`${origin}/`);
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(p.grade);
      expect(p.categories).toHaveLength(RULE_CATEGORIES.length);
      expect(p.categories.map((c) => c.max)).toEqual([100, 100, 100, 100, 100]);
      expect(p.counts.errors + p.counts.warnings + p.counts.info).toBeGreaterThanOrEqual(
        p.findings.length,
      );
      expect(res.content[0]?.type).toBe('text');
      expect(textOf(res)).toContain('geolint audit');
    });
  });

  it('sorts findings by severity and truncates at maxFindings', async () => {
    await withFixtureServer(BLOCKED_ROUTES, async (origin) => {
      const res = await auditUrlTool({ url: origin, maxFindings: 2 });
      const p = res.structuredContent as AuditPayload;
      expect(p.findings).toHaveLength(2);
      expect(p.truncated).toBe(true);
      expect(p.counts.errors).toBeGreaterThan(0);
      const order = { error: 0, warn: 1, info: 2 };
      const ranks = p.findings.map((f) => order[f.severity as keyof typeof order]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
  });

  it('does not truncate when findings fit', async () => {
    await withFixtureServer(BLOCKED_ROUTES, async (origin) => {
      const res = await auditUrlTool({ url: origin, maxFindings: 100 });
      const p = res.structuredContent as AuditPayload;
      expect(p.truncated).toBe(false);
      expect(p.findings.length).toBe(p.counts.errors + p.counts.warnings + p.counts.info);
    });
  });

  it('respects category selection', async () => {
    await withFixtureServer(BLOCKED_ROUTES, async (origin) => {
      const res = await auditUrlTool({ url: origin, category: ['ai-crawler'] });
      const p = res.structuredContent as AuditPayload;
      expect(p.categories).toHaveLength(1);
      expect(p.categories[0]?.category).toBe('ai-crawler');
      for (const f of p.findings) {
        expect(f.ruleId.startsWith('ai-crawler/')).toBe(true);
      }
    });
  });

  it('reports an unreachable site as findings, not a tool error', async () => {
    const res = await auditUrlTool({ url: 'http://127.0.0.1:1/' });
    expect(res.isError).toBeUndefined();
    const p = res.structuredContent as AuditPayload;
    expect(p.counts.errors).toBeGreaterThan(0);
  });

  it('returns isError for an invalid URL', async () => {
    const res = await auditUrlTool({ url: 'not a url' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('invalid URL');
  });

  it('times out a hung target instead of stalling', async () => {
    const server: Server = createServer(() => {
      // never respond — simulates a hung site
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await auditUrlTool({ url: `http://127.0.0.1:${port}/` }, { callTimeoutMs: 150 });
      expect(res.isError).toBe(true);
      expect(textOf(res)).toContain('timed out');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('generateLlmsTxtTool', () => {
  const page = (title: string, links: string[] = []): string =>
    `<!doctype html><html><head><title>${title}</title><meta name="description" content="d"></head><body>${links
      .map((l) => `<a href="${l}">x</a>`)
      .join('')}</body></html>`;

  const routes = [
    { path: '/', body: page('My Site', ['/docs/a', '/about']) },
    { path: '/docs/a', body: page('Doc A') },
    { path: '/about', body: page('About') },
    { path: '/robots.txt', status: 404 },
  ];

  it('returns markdown plus pageCount', async () => {
    await withFixtureServer(routes, async (origin) => {
      const res = await generateLlmsTxtTool({ url: origin });
      expect(res.isError).toBeUndefined();
      const p = res.structuredContent as { url: string; markdown: string; pageCount: number };
      expect(p.pageCount).toBe(3);
      expect(p.markdown.startsWith('# My Site')).toBe(true);
      expect(textOf(res)).toBe(p.markdown);
    });
  });

  it('clamps maxPages', async () => {
    await withFixtureServer(routes, async (origin) => {
      const res = await generateLlmsTxtTool({ url: origin, maxPages: 2 });
      const p = res.structuredContent as { pageCount: number };
      expect(p.pageCount).toBe(2);
    });
  });

  it('returns isError for an invalid URL', async () => {
    const res = await generateLlmsTxtTool({ url: 'not a url' });
    expect(res.isError).toBe(true);
  });
});

describe('listRulesTool', () => {
  it('lists every rule when no category is given', () => {
    const res = listRulesTool();
    const { rules } = res.structuredContent as {
      rules: {
        id: string;
        category: string;
        severity: string;
        title: string;
        description: string;
      }[];
    };
    expect(rules).toHaveLength(allRules.length);
    expect(rules[0]?.id).toContain('/');
    for (const r of rules) {
      expect(RULE_CATEGORIES).toContain(r.category);
      expect(['error', 'warn', 'info']).toContain(r.severity);
    }
  });

  it('filters by category', () => {
    const res = listRulesTool({ category: 'schema' });
    const { rules } = res.structuredContent as { rules: { category: string }[] };
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.category).toBe('schema');
    }
  });
});

describe('listAiBotsTool', () => {
  it('lists the whole registry with real fields', () => {
    const res = listAiBotsTool();
    const { bots } = res.structuredContent as {
      bots: {
        token: string;
        vendor: string;
        purpose: string;
        robotsTxt: string;
        retired: boolean;
      }[];
    };
    expect(bots).toHaveLength(AI_BOTS.length);
    const gpt = bots.find((b) => b.token === 'GPTBot');
    expect(gpt?.vendor).toBe('OpenAI');
    expect(gpt?.purpose).toBe('training');
    expect(gpt?.robotsTxt).toBe('honored');
    expect(bots.find((b) => b.token === 'ChatGPT-User')?.robotsTxt).toBe('bypass');
    expect(bots.some((b) => b.retired)).toBe(true);
  });
});

describe('compareUrlsTool', () => {
  it('reports delta, added and resolved findings', async () => {
    await withFixtureServer(HEALTHY_ROUTES, async (originA) => {
      await withFixtureServer(BLOCKED_ROUTES, async (originB) => {
        const res = await compareUrlsTool({ urlA: originA, urlB: originB });
        expect(res.isError).toBeUndefined();
        const p = res.structuredContent as {
          a: { url: string; score: number; grade: string };
          b: { url: string; score: number; grade: string };
          delta: number;
          added: { ruleId: string; severity: string; message: string }[];
          resolved: { ruleId: string; severity: string; message: string }[];
        };
        expect(p.b.score).toBeLessThan(p.a.score);
        expect(p.delta).toBe(p.b.score - p.a.score);
        expect(p.delta).toBeLessThan(0);
        expect(p.added.length).toBeGreaterThan(0);
        expect(p.added.some((f) => f.ruleId === 'ai-crawler/search-bots-blocked')).toBe(true);
        expect(p.added.every((f) => f.ruleId.startsWith('ai-crawler/'))).toBe(true);
        expect(textOf(res)).toContain('delta');
      });
    });
  });

  it('identical sites produce a zero delta', async () => {
    await withFixtureServer(HEALTHY_ROUTES, async (origin) => {
      const res = await compareUrlsTool({ urlA: origin, urlB: `${origin}/` });
      const p = res.structuredContent as { delta: number; added: unknown[]; resolved: unknown[] };
      expect(p.delta).toBe(0);
      expect(p.added).toHaveLength(0);
      expect(p.resolved).toHaveLength(0);
    });
  });

  it('returns isError when a URL is invalid', async () => {
    const res = await compareUrlsTool({ urlA: 'not a url', urlB: 'example.com' });
    expect(res.isError).toBe(true);
  });
});

describe('progress reporting', () => {
  type ProgressCall = { progress: number; total: number; message?: string };
  const collect = () => {
    const calls: ProgressCall[] = [];
    return {
      calls,
      sink: (progress: number, total: number, message?: string) => {
        calls.push({ progress, total, message });
      },
    };
  };

  it('auditUrlTool reports fetch → robots → llms-txt → rules → done', async () => {
    await withFixtureServer(HEALTHY_ROUTES, async (origin) => {
      const { calls, sink } = collect();
      const res = await auditUrlTool({ url: origin }, { reportProgress: sink });
      expect(res.isError).toBeUndefined();
      const stages = calls.map((c) => c.message);
      expect(stages).toEqual(['fetch', 'robots', 'llms-txt', 'rules', 'done']);
      const progresses = calls.map((c) => c.progress);
      expect(progresses).toEqual([...progresses].sort((a, b) => a - b));
      expect(progresses[0]).toBeGreaterThan(0);
      expect(progresses[progresses.length - 1]).toBe(100);
      for (const c of calls) {
        expect(c.total).toBe(100);
      }
    });
  });

  it('generateLlmsTxtTool reports per-page crawl progress', async () => {
    await withFixtureServer(
      [
        { path: '/', body: '<html><body><a href="/a">x</a></body></html>' },
        { path: '/a', body: '<html><body>a</body></html>' },
        { path: '/robots.txt', status: 404 },
      ],
      async (origin) => {
        const { calls, sink } = collect();
        const res = await generateLlmsTxtTool(
          { url: origin, maxPages: 5 },
          { reportProgress: sink },
        );
        expect(res.isError).toBeUndefined();
        expect(calls.length).toBeGreaterThanOrEqual(2);
        expect(calls.some((c) => /fetched \d+\/5 pages/.test(c.message ?? ''))).toBe(true);
        for (const c of calls) {
          expect(c.progress).toBeLessThanOrEqual(95);
        }
      },
    );
  });

  it('compareUrlsTool maps the second scan onto the upper half', async () => {
    await withFixtureServer(HEALTHY_ROUTES, async (origin) => {
      const { calls, sink } = collect();
      const res = await compareUrlsTool(
        { urlA: origin, urlB: `${origin}/` },
        { reportProgress: sink },
      );
      expect(res.isError).toBeUndefined();
      expect(calls.length).toBe(10);
      const mid = calls.findIndex((c) => c.progress > 50);
      expect(mid).toBe(5);
      expect(calls[4]?.progress).toBe(50);
      expect(calls[calls.length - 1]?.progress).toBe(100);
    });
  });
});

describe('withTimeout', () => {
  it('rejects when the deadline beats the work', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 5000));
    await expect(withTimeout(slow, 50, 'op')).rejects.toThrow('op timed out after 50 ms');
  });

  it('passes through fast results', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'op')).resolves.toBe(42);
  });
});
