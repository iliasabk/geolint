[← 英語ドキュメントへ戻る / Back to English README](../../README.md)

<p align="center">
  <img src="../../media/logo.svg" alt="geolint ロゴ" width="96">
</p>

<h1 align="center">geolint</h1>

<p align="center">
  <strong>AI検索のためのESLint。</strong> あなたのWebサイトがAI検索に対応しているかを監査します —
  AIクローラーのアクセス可否、llms.txt、構造化データ、引用されやすさをチェック。
</p>

---

## 30秒クイックスタート

インストール不要、設定不要:

```bash
npx @iliasabk/geolint check yoursite.com
```

geolintはページ、`robots.txt`、`llms.txt`を取得し、**51個の既知のAIクローラートークン**に対して
あなたの`robots.txt`を評価し、**52の監査ルール**を実行して、各検出項目に具体的な修正方法を
添えたスコア付きレポートを出力します。

## なぜgeolint？

- **AIの回答が新しいフロントページです。** ChatGPT、Perplexity、Claude、Copilot、Google AI Overviewsは、クローラーがあなたのページを取得・引用できるかどうかでトラフィックを送ります——あるいは送りません。
- **多くのサイトが意図せずAIクローラーをブロックしたり混乱させたりしています。** 古い`Disallow: /`、ステージング環境で残った`noindex`、JavaScriptを実行しないクローラーからは空に見えるクライアントサイドレンダリングのページなど。
- **既存ツールの多くはブロックリスト型かスコア表示型です。** すべてをブロックするよう勧めるか、改善方法のない数字を返すだけ。geolintは*リンター*です: 具体的な検出項目、具体的な修正方法、そしてすべてのプルリクエストでCI実行可能。

## 何をチェックするか

5カテゴリ・52ルール — `geolint rules`ですべてのルールを一覧でき、[docs/rules.md](../rules.md)には各ルールのチェック内容・重要性・修正方法が記載されています:

| カテゴリ | ルール数 | 例 |
| --- | ---: | --- |
| AIクローラーアクセス | 10 | `ai-crawler/search-bots-blocked`、`ai-crawler/wildcard-block-all`、`ai-crawler/user-fetch-bypass`、`ai-crawler/stale-tokens` |
| llms.txt | 10 | `llms-txt/missing`、`llms-txt/invalid-structure`、`llms-txt/broken-links`、`llms-txt/relative-links` |
| 構造化データ | 6 | `schema/no-jsonld`、`schema/invalid-jsonld`、`schema/missing-article-fields` |
| 引用されやすさ | 9 | `content/thin-content`、`content/no-h1`、`content/missing-dates`、`content/no-question-headings` |
| 技術的基盤 | 10 | `technical/client-rendered`、`technical/https`、`technical/slow-response`、`technical/sitemap-missing` |

## CI/CDでの実行

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

このActionはスコア/グレードのstep出力、GitHub Code Scanning向けのSARIFレポート、ジョブサマリーやPRコメント向けのMarkdownレポートを生成します。SARIFアップロード、PRコメントの更新、ベースラインとの差分検出などのレシピは[docs/github-action.md](../github-action.md)を参照してください。

### その他のCI環境

```bash
npx @iliasabk/geolint check https://example.com --fail-under 80
```

スコアがしきい値を下回る（または`--baseline`比較で検出項目が悪化する）場合は終了コード`1`、それ以外は`0`を返します — GitLab CI、CircleCI、npmスクリプト、デプロイ前フックと互換性があります。

### READMEバッジでスコアを表示

```bash
npx @iliasabk/geolint check https://example.com --badge
# → geolint-badge.svgを生成し、貼り付け用のMarkdownを出力
```

## 出力フォーマット

`-f pretty`（デフォルト）はターミナルレポートを描画します。機械可読フォーマット:

- `-f json` — 完全な`ScanReport`: 検出項目、カテゴリ別スコア、ボットアクセスマトリクス
- `-f sarif` — SARIF 2.1.0。GitHub Code Scanningに直接アップロード可能
- `-f markdown` — PRコメントやジョブサマリー向けの整形済みテーブル
- `-f html` — 自己完結型のインタラクティブレポート（スコアリング、検出項目フィルター、ボットマトリクス）。共有可能・ホスティング可能

`-o report.json`でファイルに出力。stdoutはパイプ用にクリーンなままです。

## プログラマティックAPI

```ts
import { scan } from '@iliasabk/geolint';

const report = await scan('https://example.com', {
  ignore: ['technical/https'],
  timeout: 10_000,
});

console.log(report.score, report.grade);          // 例: 86 'B'
for (const f of report.findings) {
  console.log(f.severity, f.ruleId, f.message, f.fix);
}
```

## AIアシスタントとの連携（MCP）

`geolint mcp`はstdio経由で[Model Context Protocol](https://modelcontextprotocol.io)を実装しています — Claude Desktop、Cursor、VS Code、Windsurfがネイティブツールとして直接サイトを監査し、`llms.txt`を生成し、URLを比較できます:

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
