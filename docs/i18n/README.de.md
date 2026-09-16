[← Zurück zur englischen Dokumentation / Back to English README](../../README.md)

<p align="center">
  <img src="../../media/logo.svg" alt="geolint Logo" width="96">
</p>

<h1 align="center">geolint</h1>

<p align="center">
  <strong>ESLint für KI-Suche.</strong> Prüfe deine Website auf KI-Suchbereitschaft —
  KI-Crawler-Zugriff, llms.txt, strukturierte Daten und Zitierfähigkeit.
</p>

---

## 30-Sekunden-Schnellstart

Keine Installation, keine Konfiguration erforderlich:

```bash
npx @iliasabk/geolint check yoursite.com
```

geolint ruft die Seite, deren `robots.txt` und `llms.txt` ab, gleicht **51 bekannte KI-Crawler-Tokens** mit deiner `robots.txt` ab, führt **52 Audit-Regeln** aus und gibt einen bewerteten Bericht mit konkreten Lösungsvorschlägen für jeden Befund aus.

## Warum geolint?

- **KI-Antworten sind die neue Startseite.** ChatGPT, Perplexity, Claude, Copilot und Google AI Overviews leiten Traffic weiter — oder eben nicht —, je nachdem, ob deren Crawler deine Seiten abrufen und zitieren können.
- **Viele Websites blockieren oder verwirren KI-Crawler unabsichtlich.** Ein veraltetes `Disallow: /`, ein vergessenes `noindex` aus der Staging-Umgebung oder clientseitig gerenderte Seiten, die für Crawler ohne JavaScript-Ausführung leer wirken.
- **Bestehende Tools sind meist reine Blocklisten oder Score-Web-Apps.** Sie raten entweder dazu, alles zu blockieren, oder liefern eine Zahl ohne konkreten Lösungsweg. geolint ist der *Linter*: konkrete Befunde, konkrete Fehlerbehebungen und in der CI bei jedem Pull Request ausführbar.

## Was wird geprüft?

52 Regeln in 5 Kategorien — `geolint rules` listet alle Regeln auf, und [docs/rules.md](../rules.md) dokumentiert die genaue Prüfung, Relevanz und Behebung jedes Regelverstoßes:

| Kategorie | Regeln | Beispiele |
| --- | ---: | --- |
| KI-Crawler-Zugriff | 10 | `ai-crawler/search-bots-blocked`, `ai-crawler/wildcard-block-all`, `ai-crawler/user-fetch-bypass`, `ai-crawler/stale-tokens` |
| llms.txt | 10 | `llms-txt/missing`, `llms-txt/invalid-structure`, `llms-txt/broken-links`, `llms-txt/relative-links` |
| Strukturierte Daten | 6 | `schema/no-jsonld`, `schema/invalid-jsonld`, `schema/missing-article-fields` |
| Zitierfähigkeit | 9 | `content/thin-content`, `content/no-h1`, `content/missing-dates`, `content/no-question-headings` |
| Technische Grundlagen | 10 | `technical/client-rendered`, `technical/https`, `technical/slow-response`, `technical/sitemap-missing` |

## Ausführung in CI/CD

### GitHub Action

```yaml
- uses: iliasabk/geolint@v1
  id: geolint
  with:
    url: https://example.com
    fail-under: 80

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: ${{ steps.geolint.outputs.sarif-file }}
```

Die Action erzeugt Step-Outputs für Score/Grade, einen SARIF-Bericht für GitHub Code Scanning sowie einen Markdown-Bericht für Job-Summaries und PR-Kommentare. Vollständige Rezepte — SARIF-Upload, Aktualisierung eines einzelnen PR-Kommentars, Baseline-Drift-Erkennung — finden sich in [docs/github-action.md](../github-action.md).

### Andere CI-Umgebungen

```bash
npx @iliasabk/geolint check https://example.com --fail-under 80
```

Der Exit-Code ist `1`, falls der Score unter den Schwellenwert fällt (oder Befunde im Vergleich zu `--baseline` regressieren), andernfalls `0` — kompatibel mit GitLab CI, CircleCI, npm-Skripten und Pre-Deploy-Hooks.

### Score als README-Badge anzeigen

```bash
npx @iliasabk/geolint check https://example.com --badge
# → Schreibt geolint-badge.svg + gibt den Markdown-Code zum Einfügen aus
```

## Ausgabeformate

`-f pretty` (Standard) rendert den Terminal-Bericht. Verfügbare Maschinenformate:

- `-f json` — der vollständige `ScanReport`: Befunde, kategoriebezogene Bewertungen, Bot-Zugriffsmatrix
- `-f sarif` — SARIF 2.1.0, direkt in GitHub Code Scanning hochladbar
- `-f markdown` — Formatierte Tabellen für PR-Kommentare und Job-Summaries
- `-f html` — Ein eigenständiger interaktiver Bericht (Score-Ring, Filter für Befunde, Bot-Matrix), teilbar und hostbar

Mit `-o report.json` in eine Datei schreiben; stdout bleibt sauber für Pipes.

## Programmatische API

```ts
import { scan } from '@iliasabk/geolint';

const report = await scan('https://example.com', {
  ignore: ['technical/https'],
  timeout: 10_000,
});

console.log(report.score, report.grade);          // z. B. 86 'B'
for (const f of report.findings) {
  console.log(f.severity, f.ruleId, f.message, f.fix);
}
```

## Nutzung mit KI-Assistenten (MCP)

`geolint mcp` implementiert das [Model Context Protocol](https://modelcontextprotocol.io) über stdio — Claude Desktop, Cursor, VS Code und Windsurf können Websites analysieren, `llms.txt` generieren und URLs direkt als native Tools vergleichen:

```jsonc
// claude_desktop_config.json / ~/.cursor/mcp.json
{
  "mcpServers": {
    "geolint": {
      "command": "npx",
      "args": ["-y", "@iliasabk/geolint", "mcp"]
    }
  }
}
```
