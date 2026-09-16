import { describe, expect, it } from 'vitest';
import { VERSION } from '../../src/core/types.js';
import { REPORT_FORMATS, renderReport, renderSiteReport } from '../../src/reporters/index.js';
import { FINDINGS, makeReport, makeSiteReport } from './fixtures.js';

describe('html — registration & dispatch', () => {
  it("includes 'html' in REPORT_FORMATS", () => {
    expect(REPORT_FORMATS).toContain('html');
  });

  it('renderReport dispatches to the HTML renderer', () => {
    const out = renderReport(makeReport(), 'html');
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('</html>');
  });

  it('renderSiteReport dispatches to the HTML renderer', () => {
    const out = renderSiteReport(makeSiteReport(), 'html');
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('</html>');
  });
});

describe('html — ScanReport', () => {
  const report = makeReport();
  const out = renderReport(report, 'html');

  it('is a complete standalone document', () => {
    expect(out).toContain('<!doctype html>');
    expect(out).toContain('<html lang="en">');
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain('<style>');
    expect(out).toContain('<title>');
    expect(out).toContain('</html>');
  });

  it('renders the header with url, version and timestamp', () => {
    expect(out).toContain('geolint');
    expect(out).toContain(`v${VERSION}`);
    expect(out).toContain('https://example.com/');
    expect(out).toContain('2025-06-01 12:00 UTC');
    expect(out).toContain('HTTP 200');
  });

  it('shows the final url when redirected', () => {
    const redirected = makeReport({
      finalUrl: 'https://www.example.com/',
      page: { status: 200, contentType: 'text/html', timingMs: 42, redirected: true },
    });
    const o = renderReport(redirected, 'html');
    expect(o).toContain('→');
    expect(o).toContain('https://www.example.com/');
  });

  it('renders the score ring, numeric score and colored grade', () => {
    expect(out).toContain('74');
    expect(out).toContain('/100');
    expect(out).toContain('>C</strong>');
    expect(out).toContain('--p:74');
    // grade C → #dfb317 (same mapping as badge.ts)
    expect(out).toContain('style="--p:74;stroke:#dfb317"');
    expect(out).toContain('aria-label="Score 74 out of 100, grade C"');
  });

  it('renders the five category cards with score bars', () => {
    for (const label of [
      'AI Crawler Access',
      'llms.txt',
      'Structured Data',
      'Citability',
      'Technical Foundation',
    ]) {
      expect(out).toContain(label);
    }
    expect(out).toContain('✓ clean');
    expect(out).toContain('1 error');
  });

  it('renders findings grouped by severity with fix and evidence', () => {
    expect(out).toContain('Errors');
    expect(out).toContain('Warnings');
    expect(out).toContain('Hints');
    expect(out).toContain('llms-txt/missing');
    expect(out).toContain('No llms.txt found at /llms.txt');
    expect(out).toContain('Fix');
    expect(out).toContain('Create /llms.txt with an H1 title');
    expect(out).toContain('HTTP 404 — GET https://example.com/llms.txt');
  });

  it('includes the findings filter input', () => {
    expect(out).toContain('id="fq"');
    expect(out).toContain('type="search"');
  });

  it('collapses the hints group by default, expands it when verbose', () => {
    const hints = out.match(/<details class="sg sev-info"[^>]*>/)!;
    expect(hints[0]).not.toContain('open');
    const verbose = renderReport(report, 'html', { verbose: true });
    expect(verbose).toContain('<details class="sg sev-info" open>');
  });

  it('omits info findings entirely when verbose === false', () => {
    const quiet = renderReport(report, 'html', { verbose: false });
    expect(quiet).not.toContain('No FAQ-style Q&A blocks detected');
    expect(quiet).toContain('No llms.txt found');
  });

  it('renders the AI crawler matrix grouped by company', () => {
    expect(out).toContain('AI crawler access');
    expect(out).toContain('OpenAI');
    expect(out).toContain('Anthropic');
    expect(out).toContain('GPTBot');
    expect(out).toContain('PerplexityBot');
    expect(out).toContain('✓ allowed');
    expect(out).toContain('✕ blocked');
    expect(out).toContain('– unknown');
    expect(out).toContain('3/6 allowed');
    expect(out).toContain('2 blocked');
    expect(out).toContain('1 unknown');
    expect(out).toContain('user-fetch');
  });

  it('omits the bot matrix when no bots were evaluated', () => {
    const o = renderReport(makeReport({ bots: [] }), 'html');
    expect(o).not.toContain('AI crawler access');
  });

  it('lists passed rules only when verbose', () => {
    expect(out).not.toContain('checks passed</summary>');
    const verbose = renderReport(report, 'html', { verbose: true });
    expect(verbose).toContain('checks passed');
    expect(verbose).toContain('ai-crawler/gptbot-blocked');
  });

  it('renders the generated-by footer', () => {
    expect(out).toContain(`generated by geolint v${VERSION}`);
    expect(out).toContain('github.com/iliasabk/geolint');
  });
});

describe('html — XSS safety', () => {
  it('escapes malicious input in finding fields', () => {
    const evil = {
      ...FINDINGS[0]!,
      message: '<img src=x onerror=alert(1)> injected',
      detail: '<script>alert(2)</script>',
      fix: '"><svg onload=alert(3)>',
      evidence: '<iframe src="evil">',
    };
    const out = renderReport(makeReport({ findings: [evil] }), 'html');
    expect(out).not.toContain('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script>alert(2)</script>');
    expect(out).not.toContain('<svg onload=alert(3)>');
    expect(out).not.toContain('<iframe src="evil">');
    // escaped forms are present instead
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; injected');
    expect(out).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(out).toContain('&lt;iframe src=&quot;evil&quot;&gt;');
  });

  it('escapes hostile urls — no javascript: hrefs', () => {
    const out = renderReport(
      makeReport({ url: 'javascript:alert(1)//x', finalUrl: 'javascript:alert(1)//x' }),
      'html',
    );
    expect(out).not.toContain('href="javascript:');
    // still rendered as (escaped) text
    expect(out).toContain('javascript:alert(1)//x');
  });
});

describe('html — self-containment', () => {
  const out = renderReport(makeReport(), 'html');

  it('references no external resources', () => {
    expect(out).not.toMatch(/<script[^>]*src=/i);
    expect(out).not.toMatch(/<link[\s>]/i);
    expect(out).not.toContain('@import');
    expect(out).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(out).not.toMatch(/<img[^>]*src="http/i);
    expect(out).not.toContain('src="http');
  });

  it('only ever links to the scanned url or the repo', () => {
    const hrefs = [...out.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    for (const href of hrefs) {
      expect(
        href === 'https://example.com/' || href === 'https://github.com/iliasabk/geolint',
      ).toBe(true);
    }
  });
});

describe('html — SiteReport', () => {
  const site = makeSiteReport();
  const out = renderSiteReport(site, 'html');

  it('renders the site header with page stats', () => {
    expect(out).toContain('site audit');
    expect(out).toContain('https://site.example/');
    expect(out).toContain('3 pages scanned');
    expect(out).toContain('1 failed');
    expect(out).toContain('64');
  });

  it('renders the pages table sorted worst-first, linking to each page', () => {
    expect(out).toContain('Pages');
    const pricing = out.indexOf('/pricing');
    const about = out.indexOf('/about');
    expect(pricing).toBeGreaterThan(-1);
    expect(about).toBeGreaterThan(-1);
    expect(pricing).toBeLessThan(about);
    expect(out).toContain('href="https://site.example/pricing"');
    expect(out).toContain('>F</span>');
  });

  it('dedupes identical findings with a ×N pages chip', () => {
    expect(out).toContain('×2 pages');
    const aggregate = out.slice(out.indexOf('>Findings<'));
    const occurrences = aggregate.split('No llms.txt found').length - 1;
    expect(occurrences).toBe(1);
    expect(out).toContain('Identical &lt;title&gt; across multiple pages');
  });

  it('renders each page as an expandable drill-down with its own findings', () => {
    expect(out).toContain('<details class="pg">');
    expect(out).toContain('expand a row');
    const pgCount = out.split('<details class="pg">').length - 1;
    expect(pgCount).toBe(3);
    expect(out).toContain('open page ↗');
    expect(out).toContain('ring-sm');
  });

  it('renders aggregate score, categories and footer', () => {
    expect(out).toContain('--p:64');
    expect(out).toContain('Categories');
    expect(out).toContain(`generated by geolint v${VERSION}`);
  });
});
