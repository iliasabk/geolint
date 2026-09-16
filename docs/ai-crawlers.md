# AI crawler & fetcher reference

A maintained registry of **47 active AI bot tokens** (51 including retired)
that site owners can control via `robots.txt` — the same data that powers
`geolint bots`, the `list_ai_bots` MCP tool and every robots.txt audit.

**Why purpose matters:** blocking a *search* or *user-fetch* bot makes your site
invisible in AI answers **now**; blocking a *training* bot only affects future
model data. *Control-only* tokens are opt-out signals, not crawlers.

## Quick postures for robots.txt

```txt
# Allow AI search citations, opt out of training (recommended for most sites)
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: GPTBot
Disallow: /
```

```txt
# Block every AI crawler & fetcher (control tokens excluded — they are not crawlers)
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: OAI-AdsBot
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Googlebot
User-agent: Applebot
User-agent: meta-externalagent
User-agent: Meta-WebIndexer
User-agent: Meta-ExternalFetcher
User-agent: facebookexternalhit
User-agent: Amazonbot
User-agent: Amzn-SearchBot
User-agent: Amzn-User
User-agent: MistralAI-User
User-agent: MistralAI-Index
User-agent: MistralAI-Training
User-agent: Bingbot
User-agent: DuckDuckBot
User-agent: DuckAssistBot
User-agent: YouBot
User-agent: KimiBot
User-agent: Kimi-User
User-agent: TongyiBot
User-agent: ExaBot
User-agent: TavilyBot
User-agent: Timpibot
User-agent: Bytespider
User-agent: CCBot
User-agent: cohere-ai
User-agent: cohere-training-data-crawler
User-agent: Diffbot
User-agent: webzio
User-agent: ImagesiftBot
User-agent: PanguBot
User-agent: Kangaroo Bot
User-agent: AI2Bot
User-agent: Ai2Bot-Dolma
User-agent: ICC-Crawler
User-agent: VelenPublicWebCrawler
Disallow: /
```

Run `npx @iliasabk/geolint bots` for the live list, or `check yoursite.com` to
evaluate your own robots.txt against every token below.

## Search & answer crawlers (14)

> ⚠️ Blocking these removes your site from AI answers **immediately**.
| Token | Company | robots.txt | Notes |
| --- | --- | --- | --- |
| `OAI-SearchBot` | OpenAI | ✅ honored |  Blocking removes the site from ChatGPT search citations. [docs](https://developers.openai.com/api/docs/bots) |
| `Claude-SearchBot` | Anthropic | ✅ honored |   [docs](https://support.claude.com/en/articles/8896518) |
| `PerplexityBot` | Perplexity | ✅ honored |  Perplexity states full compliance since the 2024 reporting controversy. [docs](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md) |
| `Googlebot` | Google | ✅ honored |  AI Overviews and AI Mode are served from the Search index — blocking Googlebot is the only full opt-out. [docs](https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers) |
| `Applebot` | Apple | ✅ honored |  Feeds Siri/Spotlight answers; falls back to Googlebot rules when no Applebot rules exist. [docs](https://support.apple.com/en-us/119829) |
| `Meta-WebIndexer` | Meta | ✅ honored |   [docs](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/) |
| `Amzn-SearchBot` | Amazon | ✅ honored |  Indexes for Alexa/Rufus answers — explicitly not used for training. [docs](https://developer.amazon.com/amazonbot) |
| `MistralAI-Index` | Mistral AI | ❔ unverified |   [docs](https://docs.mistral.ai/robots) |
| `Bingbot` | Microsoft | ✅ honored |  Copilot answers and much third-party AI grounding run on the Bing index. [docs](https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0) |
| `DuckDuckBot` | DuckDuckGo | ✅ honored |   — |
| `YouBot` | You.com | ✅ honored |   [docs](https://you.com) |
| `ExaBot` | Exa | ❔ unverified |   — |
| `TavilyBot` | Tavily | ❔ unverified |   — |
| `Timpibot` | Timpi | ❔ unverified |  Third-party directories report inconsistent robots.txt compliance. — |

## User-triggered fetchers (10)

> ⚠️ Blocking these removes your site from AI answers **immediately**.
| Token | Company | robots.txt | Notes |
| --- | --- | --- | --- |
| `ChatGPT-User` | OpenAI | ⚠️ may bypass |  OpenAI: "robots.txt rules may not apply" to user-initiated fetches. [docs](https://developers.openai.com/api/docs/bots) |
| `Claude-User` | Anthropic | ✅ honored |  Anthropic documents robots.txt compliance for all three bots. [docs](https://support.claude.com/en/articles/8896518) |
| `Perplexity-User` | Perplexity | ⚠️ may bypass |  Perplexity docs: this fetcher "generally ignores robots.txt". [docs](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md) |
| `Meta-ExternalFetcher` | Meta | ⚠️ may bypass |  User-triggered fetcher; Meta documents it may bypass robots.txt. [docs](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/) |
| `facebookexternalhit` | Meta | ❔ unverified |  Link-preview fetcher. [docs](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/) |
| `Amzn-User` | Amazon | ✅ honored |   [docs](https://developer.amazon.com/amazonbot) |
| `MistralAI-User` | Mistral AI | ❔ unverified |   [docs](https://docs.mistral.ai/robots) |
| `DuckAssistBot` | DuckDuckGo | ✅ honored |  Fetches for Duck.ai answers; opt-out takes effect within 72h. [docs](https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot) |
| `Kimi-User` | Moonshot AI | ❔ unverified |   — |
| `cohere-ai` | Cohere | ❔ unverified |  Widely mislabeled as a training crawler; community-documented as live retrieval. — |

## Mixed-purpose crawlers (5)


| Token | Company | robots.txt | Notes |
| --- | --- | --- | --- |
| `OAI-AdsBot` | OpenAI | ✅ honored |   [docs](https://help.openai.com/en/articles/20001243) |
| `Amazonbot` | Amazon | ✅ honored |  No Crawl-delay support; honors page-level noarchive as a training opt-out. [docs](https://developer.amazon.com/amazonbot) |
| `TongyiBot` | Alibaba | ❔ unverified |   — |
| `Bytespider` | ByteDance | ❔ unverified |  Highest-volume AI bot per Cloudflare data; third-party studies report robots.txt non-compliance — enforce at WAF level if blocking. — |
| `Diffbot` | Diffbot | ✅ honored |  Honors Disallow + Crawl-delay but ignores the Allow directive. [docs](https://www.diffbot.com/docs/crawl/) |

## Training crawlers (15)


| Token | Company | robots.txt | Notes |
| --- | --- | --- | --- |
| `GPTBot` | OpenAI | ✅ honored |   [docs](https://developers.openai.com/api/docs/bots) |
| `ClaudeBot` | Anthropic | ✅ honored |   [docs](https://support.claude.com/en/articles/8896518) |
| `meta-externalagent` | Meta | ✅ honored |   [docs](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/) |
| `MistralAI-Training` | Mistral AI | ❔ unverified |   [docs](https://docs.mistral.ai/robots) |
| `KimiBot` | Moonshot AI | ❔ unverified |   — |
| `CCBot` | Common Crawl | ✅ honored |  Common Crawl datasets feed many LLMs; blocking is a de-facto training opt-out. [docs](https://commoncrawl.org/faq) |
| `cohere-training-data-crawler` | Cohere | ❔ unverified |   — |
| `webzio` | Webz.io | ✅ honored |   — |
| `ImagesiftBot` | The Hive | ✅ honored |   [docs](https://imagesift.com/about) |
| `PanguBot` | Huawei | ❔ unverified |   — |
| `Kangaroo Bot` | Kangaroo LLM | ❔ unverified |  Token contains a literal space. — |
| `AI2Bot` | Allen Institute for AI | ✅ honored |   [docs](https://allenai.org/crawler) |
| `Ai2Bot-Dolma` | Allen Institute for AI | ✅ honored |   [docs](https://allenai.org/crawler) |
| `ICC-Crawler` | NICT | ❔ unverified |   — |
| `VelenPublicWebCrawler` | Velen | ❔ unverified |   — |

## Opt-out control tokens

> Not crawlers — they are signals vendors check before using your content.

| Token | Company | robots.txt | Notes |
| --- | --- | --- | --- |
| `Google-Extended` | Google | ✅ honored |  *(opt-out signal, not a crawler)* Control token for Gemini/Vertex training — never fetches; does not affect ranking or AI Overviews. [docs](https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers) |
| `Applebot-Extended` | Apple | ✅ honored |  *(opt-out signal, not a crawler)* Opt-out token for training — does not crawl webpages. [docs](https://support.apple.com/en-us/119829) |
| `Webzio-Extended` | Webz.io | ✅ honored |  *(opt-out signal, not a crawler)* Opt-out token governing AI/ML use of collected data. — |

## Retired tokens

> Still found in older robots.txt files — safe to replace with the successor.

| Token | Company | robots.txt | Notes |
| --- | --- | --- | --- |
| `anthropic-ai` | Anthropic | ❔ unverified |  ~~retired~~ → `ClaudeBot`  — |
| `Claude-Web` | Anthropic | ❔ unverified |  ~~retired~~ → `Claude-SearchBot`  — |
| `FacebookBot` | Meta | ❔ unverified |  ~~retired~~ → `meta-externalagent`  — |
| `omgilibot` | Webz.io | ✅ honored |  ~~retired~~ → `webzio`  — |

---

_This file is generated by `scripts/gen-bots-doc.ts` from `src/core/bots.ts` (51 tokens). Do not edit by hand._
Corrections welcome via issue or PR — please cite vendor documentation.
