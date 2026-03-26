# CLAUDE.md

## Build & Development Commands

```bash
npm run compile        # TypeScript → /out (must run before tests)
npm run watch          # TypeScript watch mode for development
npm run build          # ESBuild production bundle (minified)
npm run lint           # oxlint
npm run test           # All tests (unit + integration, requires compile first)
npm run test:unit      # Unit tests only
```

## Releasing

See [RELEASING.md](RELEASING.md) for the full release process.

## Testing

- **Unit tests** (`src/test/unit/`): CLI parsing, tree item construction, diagnostics validation.
- **Integration tests** (`src/test/integration/`): Extension activation, command registration. Uses `test-fixtures/workspace/`.
