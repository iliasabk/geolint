# geolint — agent install guide

geolint is a linter for AI-search readiness ("ESLint for AI search"). It ships
as a single npm package that provides both a CLI and an MCP server over stdio.

## Requirements

- Node.js >= 20 (only for `npx` execution — no repo clone needed)
- No API keys, no environment variables, no build step

## Install as an MCP server (recommended)

Add this entry to the client's MCP configuration and restart the client:

```json
{
  "mcpServers": {
    "geolint": {
      "command": "npx",
      "args": ["-y", "@iliasabk/geolint", "mcp"]
    }
  }
}
```

Config file locations:

- Claude Desktop: `claude_desktop_config.json`
- Cursor: `~/.cursor/mcp.json`
- VS Code: `.vscode/mcp.json` or user settings
- Cline: MCP settings JSON

The server exposes five tools: `audit_url`, `generate_llms_txt`,
`list_rules`, `list_ai_bots`, `compare_urls`. All output is JSON-RPC on
stdout; diagnostics go to stderr.

## Verify the install

```bash
npx -y @iliasabk/geolint --version   # prints 0.4.0
npx -y @iliasabk/geolint check example.com   # runs a full audit
```

If `npx` is unavailable, install globally first:

```bash
npm install -g @iliasabk/geolint
geolint mcp   # then point the MCP config at `geolint` instead of npx
```

## Notes

- Every tool call has a wall-clock timeout (default 60 s); a hung site
  cannot stall the client.
- The server is also listed in the official MCP registry as
  `io.github.iliasabk/geolint`.
- Full tool reference: `docs/mcp.md` in the repository.
