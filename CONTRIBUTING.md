# Contributing to geolint

Thanks for helping make the web more readable for AI search engines! This guide
covers local development, project layout and how to extend the auditor. For bugs
and features, please use the [issue templates](https://github.com/iliasabk/geolint/issues/new/choose).

## Development setup

Requirements: **Node.js >= 22** and npm.

```bash
git clone https://github.com/iliasabk/geolint.git
cd geolint
npm install
npm run dev
npm run geolint -- check https://example.com
npm run build
node dist/cli.js check https://example.com
```

### Everyday commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the vitest suite once |
| `npm run test:watch` | Re-run tests on change |
| `npm run lint:ci` | Biome check (what CI runs; no autofix) |
| `npm run lint` | Biome check with `--write` autofix |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | tsup bundle to `dist/` |

CI runs `lint:ci` → `typecheck` → `test` → `build` → a CLI smoke test on
Node 22 and 24, so all four must pass locally before a PR is mergeable.

## Project layout

```
src/       CLI, commands, scan engine, rules, reporters and utilities
test/      vitest specs mirroring src/
docs/      rules.md and github-action.md
action.yml composite GitHub Action
```

Type contracts (`ScanReport`, `Rule`, `Finding`, `Grade`…) live in
`src/core/types.ts` — read that file first.

## Adding a rule

1. Copy the template in `src/rules/technical/https.ts`.
2. Return `[]` when the page is unavailable instead of throwing.
3. Reuse the existing `RuleContext` and its rate-limited helpers.
4. Register the rule in `src/rules/index.ts` with a unique category-prefixed id.
5. Add a spec under `test/rules/` covering pass, fail, and `page === null`.
6. Regenerate `docs/rules.md` with `npx tsx scripts/gen-rules-docs.ts`.

Rule severity is `error` for the most serious findings, `warn` for softer
problems, and `info` for advisory findings.

## Adding commands and reporters

Register new commands in `src/commands/index.ts`, reuse the shared scan engine,
and preserve exit codes: `0` pass, `1` gate or baseline failure, `2` runtime
error. Reporters belong in `src/reporters/`, must be registered in its index,
and must produce deterministic output.

## Commit and pull request process

Use [Conventional Commits](https://www.conventionalcommits.org/), branch from
`main`, keep the PR focused, fill in the template, and ensure CI is green on
both Node versions. Open an issue first for anything bigger than a typo.

## Release process

Update `package.json`, `VERSION` in `src/core/types.ts`, and
`CHANGELOG.md`; tag the release and let the release workflow publish it with
provenance.

## Code of conduct

Be kind and constructive. Assume good intent; disagree on ideas, not people.
Maintainers may remove comments or contributors who don't.

## Focused validation

When a change touches one rule or command, run its focused Vitest spec together
with `npm run lint:ci`, `npm run typecheck`, and `npm run build`. Use the
full `npm test` suite when shared scanner or reporter behavior changes.
