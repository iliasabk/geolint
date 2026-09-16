[← Volver a la documentación en inglés / Back to English README](../../README.md)

<p align="center">
  <img src="../../media/logo.svg" alt="geolint Logo" width="96">
</p>

<h1 align="center">geolint</h1>

<p align="center">
  <strong>ESLint para la búsqueda con IA.</strong> Audita la preparación de tu sitio web
  para la búsqueda con IA: acceso de crawlers de IA, llms.txt, datos estructurados
  y citabilidad.
</p>

---

## Inicio rápido en 30 segundos

Sin instalación ni configuración:

```bash
npx @iliasabk/geolint check yoursite.com
```

geolint descarga la página, su `robots.txt` y su `llms.txt`, evalúa tu `robots.txt`
contra **51 tokens conocidos de crawlers de IA**, ejecuta **52 reglas de auditoría**
y genera un informe puntuado con una corrección concreta para cada hallazgo.

## ¿Por qué geolint?

- **Las respuestas de IA son la nueva página de inicio.** ChatGPT, Perplexity, Claude, Copilot y Google AI Overviews dirigen tráfico —o no— según puedan sus crawlers leer y citar tus páginas.
- **Muchos sitios bloquean o confunden a los crawlers de IA sin querer.** Un `Disallow: /` obsoleto, un `noindex` olvidado del entorno de staging o páginas renderizadas en el cliente que parecen vacías para crawlers sin JavaScript.
- **Las herramientas existentes suelen ser listas de bloqueo o aplicaciones de puntuación.** O bien sugieren bloquearlo todo, o dan un número sin indicarte cómo mejorarlo. geolint es el *linter*: hallazgos concretos, correcciones concretas y ejecutable en CI en cada pull request.

## ¿Qué se audita?

52 reglas en 5 categorías — `geolint rules` las enumera todas, y [docs/rules.md](../rules.md) documenta la comprobación exacta, el motivo y la corrección de cada una:

| Categoría | Reglas | Ejemplos |
| --- | ---: | --- |
| Acceso de crawlers de IA | 10 | `ai-crawler/search-bots-blocked`, `ai-crawler/wildcard-block-all`, `ai-crawler/user-fetch-bypass`, `ai-crawler/stale-tokens` |
| llms.txt | 10 | `llms-txt/missing`, `llms-txt/invalid-structure`, `llms-txt/broken-links`, `llms-txt/relative-links` |
| Datos estructurados | 6 | `schema/no-jsonld`, `schema/invalid-jsonld`, `schema/missing-article-fields` |
| Citabilidad | 9 | `content/thin-content`, `content/no-h1`, `content/missing-dates`, `content/no-question-headings` |
| Fundamentos técnicos | 10 | `technical/client-rendered`, `technical/https`, `technical/slow-response`, `technical/sitemap-missing` |

## Ejecución en CI/CD

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

La action produce outputs de step para score/grado, un informe SARIF para GitHub Code Scanning y un informe Markdown para job summaries y comentarios de PR. Recetas completas —subida de SARIF, comentario de PR actualizable, detección de desviación respecto a la baseline— en [docs/github-action.md](../github-action.md).

### Otros entornos de CI

```bash
npx @iliasabk/geolint check https://example.com --fail-under 80
```

El código de salida es `1` si la puntuación cae por debajo del umbral (o los hallazgos empeoran respecto a `--baseline`), y `0` en caso contrario —compatible con GitLab CI, CircleCI, scripts de npm y hooks pre-deploy.

### Mostrar la puntuación como badge en el README

```bash
npx @iliasabk/geolint check https://example.com --badge
# → escribe geolint-badge.svg e imprime el Markdown para pegar
```

## Formatos de salida

`-f pretty` (por defecto) renderiza el informe en terminal. Formatos para máquinas:

- `-f json` — el `ScanReport` completo: hallazgos, puntuaciones por categoría, matriz de acceso de bots
- `-f sarif` — SARIF 2.1.0, subible directamente a GitHub Code Scanning
- `-f markdown` — tablas formateadas para comentarios de PR y job summaries
- `-f html` — informe interactivo autocontenido (anillo de puntuación, filtros de hallazgos, matriz de bots), listo para compartir y alojar

Escribe a un archivo con `-o report.json`; stdout se mantiene limpio para pipes.

## API programática

```ts
import { scan } from '@iliasabk/geolint';

const report = await scan('https://example.com', {
  ignore: ['technical/https'],
  timeout: 10_000,
});

console.log(report.score, report.grade);          // p. ej. 86 'B'
for (const f of report.findings) {
  console.log(f.severity, f.ruleId, f.message, f.fix);
}
```

## Uso con asistentes de IA (MCP)

`geolint mcp` implementa el [Model Context Protocol](https://modelcontextprotocol.io) sobre stdio — Claude Desktop, Cursor, VS Code y Windsurf pueden auditar sitios web, generar `llms.txt` y comparar URLs directamente como herramientas nativas:

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
