# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run compile        # TypeScript → /out (must run before tests)
npm run watch          # TypeScript watch mode for development
npm run build          # ESBuild production bundle (minified)
npm run lint           # ESLint
npm run test           # All tests (unit + integration, requires compile first)
npm run test:unit      # Unit tests only
```

## Architecture

`src/extension.ts` is the entry point. It wires together four components:

- **`cli.ts`** — Wraps the `outport` binary. Categorizes errors as `not-found`, `not-registered`, or `cli-error` — these drive what the UI displays.
- **`sidebar/provider.ts`** — `OutportTreeProvider` implements `TreeDataProvider`. Two-speed polling (5s when services are down, 30s when healthy). Deduplicates projects across multi-folder workspaces.
- **`watcher.ts`** — Watches the outport registry at `~/.local/share/outport/*.json` to detect external changes.
- **`statusbar.ts`** — Status bar indicator.

Data flow: CLI returns JSON → provider parses into tree items → tree view renders. File watcher and polling trigger re-fetches.

## Testing

- **Unit tests** (`src/test/unit/`): CLI parsing, tree item construction.
- **Integration tests** (`src/test/integration/`): Extension activation, command registration. Uses `test-fixtures/workspace/`.

No runtime dependencies — only VS Code APIs and Node.js built-ins.
