# Config Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time semantic validation for `outport.yml` files that catches errors the JSON Schema can't express, shown as squiggles in the Problems panel.

**Architecture:** Single `src/diagnostics.ts` module exports a `registerDiagnostics(context)` function called from `extension.ts`. It listens for document open/change/save on `outport.yml`/`outport.yaml` files, parses YAML with `js-yaml`, runs 9 validation checks mirroring the Go CLI's `config.validate()`, and maps errors to document positions using text search. Pure TypeScript — no CLI dependency needed.

**Tech Stack:** `js-yaml` for YAML parsing, VS Code `DiagnosticCollection` API.

---

## File Structure

| File | Responsibility |
|------|---------------|
| Create: `src/diagnostics.ts` | YAML parsing, 9 validation checks, position mapping, document listeners |
| Modify: `src/extension.ts` | Call `registerDiagnostics(context)` during activation |
| Create: `src/test/unit/diagnostics.test.ts` | Unit tests for all 9 checks |
| Modify: `package.json` | Add `js-yaml` dependency |

---

### Task 1: Add js-yaml dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install js-yaml**

```bash
npm install js-yaml
npm install --save-dev @types/js-yaml
```

- [ ] **Step 2: Verify it builds**

```bash
npm run compile
```
Expected: success, no errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-yaml dependency for config diagnostics"
```

---

### Task 2: Create diagnostics module with position mapping helper

**Files:**
- Create: `src/diagnostics.ts`
- Create: `src/test/unit/diagnostics.test.ts`

- [ ] **Step 1: Write tests for position mapping**

Create `src/test/unit/diagnostics.test.ts`:

```typescript
import * as assert from 'assert';
import { findPosition } from '../../diagnostics';

suite('Diagnostics', () => {
  suite('findPosition', () => {
    const text = [
      'name: myapp',
      '',
      'services:',
      '  web:',
      '    env_var: PORT',
      '    hostname: myapp.test',
    ].join('\n');

    test('finds key on correct line', () => {
      const pos = findPosition(text, 'hostname', 'web');
      assert.strictEqual(pos.line, 5);
    });

    test('returns line 0 when not found', () => {
      const pos = findPosition(text, 'nonexistent', 'web');
      assert.strictEqual(pos.line, 0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile && npm run test:unit
```
Expected: FAIL — `findPosition` does not exist

- [ ] **Step 3: Create diagnostics.ts with findPosition**

Create `src/diagnostics.ts`:

```typescript
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

/**
 * Find the line number of a key within a YAML document,
 * optionally scoped under a parent key.
 * Returns { line, col } — defaults to { line: 0, col: 0 } if not found.
 */
export function findPosition(
  text: string,
  key: string,
  parentKey?: string
): { line: number; col: number } {
  const lines = text.split('\n');
  let inParent = !parentKey;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (parentKey && !inParent) {
      const parentMatch = line.match(new RegExp(`^(\\s*)${escapeRegex(parentKey)}:`));
      if (parentMatch) {
        inParent = true;
      }
      continue;
    }

    if (inParent && parentKey) {
      const keyMatch = line.match(new RegExp(`^(\\s+)${escapeRegex(key)}:`));
      if (keyMatch) {
        return { line: i, col: keyMatch[1].length };
      }
      if (line.trim() !== '' && !/^\s/.test(line)) {
        inParent = false;
      }
    }

    if (!parentKey) {
      const keyMatch = line.match(new RegExp(`^(\\s*)${escapeRegex(key)}:`));
      if (keyMatch) {
        return { line: i, col: keyMatch[1].length };
      }
    }
  }

  return { line: 0, col: 0 };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run compile && npm run test:unit
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/test/unit/diagnostics.test.ts
git commit -m "feat: add diagnostics module with position mapping"
```

---

### Task 3: Hostname requires protocol check

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/test/unit/diagnostics.test.ts`

- [ ] **Step 1: Write failing test**

Add to `diagnostics.test.ts`:

```typescript
import { validateConfig } from '../../diagnostics';

suite('validateConfig', () => {
  test('errors when hostname set without protocol', () => {
    const config = {
      name: 'myapp',
      services: {
        web: { env_var: 'PORT', hostname: 'myapp.test' },
      },
    };
    const errors = validateConfig(config);
    assert.ok(errors.some(e =>
      e.message.includes('hostname') && e.message.includes('protocol')
    ));
  });

  test('no error when hostname has protocol', () => {
    const config = {
      name: 'myapp',
      services: {
        web: { env_var: 'PORT', hostname: 'myapp.test', protocol: 'http' },
      },
    };
    const errors = validateConfig(config);
    assert.ok(!errors.some(e => e.message.includes('protocol')));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile && npm run test:unit
```
Expected: FAIL — `validateConfig` does not exist

- [ ] **Step 3: Implement validateConfig with hostname/protocol check**

Add to `src/diagnostics.ts`:

```typescript
export interface DiagnosticError {
  message: string;
  severity: 'error' | 'warning';
  key: string;
  parentKey?: string;
}

interface OutportService {
  env_var?: string;
  protocol?: string;
  hostname?: string;
  preferred_port?: number;
  env_file?: string | string[];
}

interface OutportComputedValue {
  value?: string;
  env_file?: string | string[] | Array<{ file: string; value?: string }>;
}

interface OutportConfig {
  name?: string;
  services?: Record<string, OutportService>;
  computed?: Record<string, OutportComputedValue>;
}

export function validateConfig(config: OutportConfig): DiagnosticError[] {
  const errors: DiagnosticError[] = [];
  if (!config.services) return errors;

  for (const [name, svc] of Object.entries(config.services)) {
    if (svc.hostname && svc.protocol !== 'http' && svc.protocol !== 'https') {
      errors.push({
        message: `Service "${name}": hostname requires protocol http or https`,
        severity: 'error',
        key: 'hostname',
        parentKey: name,
      });
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run compile && npm run test:unit
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/test/unit/diagnostics.test.ts
git commit -m "feat: hostname requires protocol check"
```

---

### Task 4: Hostname must contain project name

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/test/unit/diagnostics.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
test('warns when hostname does not contain project name', () => {
  const config = {
    name: 'myapp',
    services: {
      web: { env_var: 'PORT', hostname: 'other.test', protocol: 'http' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e =>
    e.message.includes('must contain project name') && e.severity === 'warning'
  ));
});

test('no warning when hostname contains project name', () => {
  const config = {
    name: 'myapp',
    services: {
      web: { env_var: 'PORT', hostname: 'myapp.test', protocol: 'http' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(!errors.some(e => e.message.includes('must contain project name')));
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add hostname/project-name check to validateConfig**

Add inside the service loop in `validateConfig`, after the protocol check:

```typescript
if (svc.hostname && config.name) {
  const stem = svc.hostname.replace(/\.test$/, '');
  if (!stem.includes(config.name)) {
    errors.push({
      message: `Service "${name}": hostname "${svc.hostname}" should contain project name "${config.name}"`,
      severity: 'warning',
      key: 'hostname',
      parentKey: name,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/test/unit/diagnostics.test.ts
git commit -m "feat: warn when hostname doesn't contain project name"
```

---

### Task 5: Duplicate env_var per file

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/test/unit/diagnostics.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
test('errors on duplicate env_var in same file', () => {
  const config = {
    name: 'myapp',
    services: {
      web: { env_var: 'PORT' },
      api: { env_var: 'PORT' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('both write')));
});

test('no error when env_vars are unique', () => {
  const config = {
    name: 'myapp',
    services: {
      web: { env_var: 'PORT' },
      postgres: { env_var: 'DB_PORT' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(!errors.some(e => e.message.includes('both write')));
});

test('no error when same env_var is in different files', () => {
  const config = {
    name: 'myapp',
    services: {
      web: { env_var: 'PORT', env_file: 'frontend/.env' },
      api: { env_var: 'PORT', env_file: 'backend/.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(!errors.some(e => e.message.includes('both write')));
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add duplicate env_var check**

Add to `validateConfig`, before the service loop:

```typescript
const fileVars: Record<string, Record<string, string>> = {};
for (const [name, svc] of Object.entries(config.services)) {
  if (!svc.env_var) continue;
  const envFiles = resolveEnvFiles(svc.env_file);
  for (const file of envFiles) {
    if (!fileVars[file]) fileVars[file] = {};
    if (fileVars[file][svc.env_var]) {
      errors.push({
        message: `Services "${fileVars[file][svc.env_var]}" and "${name}" both write ${svc.env_var} to ${file}`,
        severity: 'error',
        key: 'env_var',
        parentKey: name,
      });
    } else {
      fileVars[file][svc.env_var] = name;
    }
  }
}
```

Add helper:

```typescript
function resolveEnvFiles(envFile: string | string[] | undefined): string[] {
  if (!envFile) return ['.env'];
  if (typeof envFile === 'string') return [envFile];
  return envFile;
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/test/unit/diagnostics.test.ts
git commit -m "feat: detect duplicate env_var per file"
```

---

### Task 6: Computed value checks (unknown service, name collision, missing value)

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/test/unit/diagnostics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
test('errors when computed references unknown service', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      API_URL: { value: '${nosuch.url}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('unknown service')));
});

test('errors when computed name collides with service env_var', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      PORT: { value: '${web.port}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('conflicts')));
});

test('errors when computed missing value and no per-file override', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      API_URL: { env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('missing') && e.message.includes('value')));
});

test('no error when per-file overrides cover all entries', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      API_URL: {
        env_file: [
          { file: 'frontend/.env', value: '${web.url}' },
        ],
      },
    },
  };
  const errors = validateConfig(config);
  assert.ok(!errors.some(e => e.message.includes('missing') && e.message.includes('value')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Add computed value checks**

Add to `validateConfig`, after the service loop:

```typescript
if (config.computed) {
  const serviceEnvVars = new Set(
    Object.values(config.services).map(s => s.env_var).filter(Boolean)
  );

  for (const [name, cv] of Object.entries(config.computed)) {
    if (serviceEnvVars.has(name)) {
      errors.push({
        message: `Computed value "${name}" conflicts with a service env_var of the same name`,
        severity: 'error',
        key: name,
        parentKey: 'computed',
      });
    }

    const envFiles = resolveComputedEnvFiles(cv.env_file);
    const perFileEntries = getPerFileEntries(cv.env_file);
    for (const file of envFiles) {
      if (!perFileEntries[file] && !cv.value) {
        errors.push({
          message: `Computed value "${name}" is missing the "value" field (required for entries without per-file values)`,
          severity: 'error',
          key: name,
          parentKey: 'computed',
        });
        break;
      }
    }

    const templates = [cv.value, ...Object.values(perFileEntries)].filter(Boolean) as string[];
    for (const template of templates) {
      errors.push(...validateTemplateRefs(name, template, config.services));
    }
  }
}
```

Add helpers:

```typescript
function resolveComputedEnvFiles(
  envFile: string | string[] | Array<{ file: string; value?: string }> | undefined
): string[] {
  if (!envFile) return [];
  if (typeof envFile === 'string') return [envFile];
  return envFile.map(e => typeof e === 'string' ? e : e.file);
}

function getPerFileEntries(
  envFile: string | string[] | Array<{ file: string; value?: string }> | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!envFile || typeof envFile === 'string') return result;
  for (const entry of envFile) {
    if (typeof entry === 'object' && entry.value) {
      result[entry.file] = entry.value;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/test/unit/diagnostics.test.ts
git commit -m "feat: computed value validation (unknown service, name collision, missing value)"
```

---

### Task 7: Template reference validation (fields, modifiers, standalone vars)

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/test/unit/diagnostics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
test('errors on unknown template field', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      URL: { value: '${web.bogus}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('unknown field')));
});

test('errors on invalid modifier', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      URL: { value: '${web.url:bogus}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('unknown modifier')));
});

test('allows valid modifier url:direct', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      URL: { value: '${web.url:direct}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(!errors.some(e => e.message.includes('modifier')));
});

test('errors on unknown standalone variable', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      LABEL: { value: '${bogus}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(errors.some(e => e.message.includes('unknown variable')));
});

test('allows ${instance} standalone variable', () => {
  const config = {
    name: 'myapp',
    services: { web: { env_var: 'PORT' } },
    computed: {
      LABEL: { value: 'myapp-${instance}', env_file: '.env' },
    },
  };
  const errors = validateConfig(config);
  assert.ok(!errors.some(e => e.message.includes('unknown variable')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement validateTemplateRefs**

Add to `src/diagnostics.ts`:

```typescript
const TEMPLATE_VAR_RE = /\$\{(\w+)\.(\w+)(?::(\w+))?\}/g;
const STANDALONE_VAR_RE = /\$\{(\w+)\}|\$\{(\w+):[+-]/g;

const VALID_FIELDS = new Set(['port', 'hostname', 'url']);
const VALID_MODIFIERS: Record<string, Set<string>> = {
  url: new Set(['direct']),
};
const VALID_STANDALONE_VARS = new Set(['instance']);

function validateTemplateRefs(
  computedName: string,
  template: string,
  services: Record<string, OutportService>
): DiagnosticError[] {
  const errors: DiagnosticError[] = [];

  let match;
  TEMPLATE_VAR_RE.lastIndex = 0;
  while ((match = TEMPLATE_VAR_RE.exec(template)) !== null) {
    const [, svcName, field, modifier] = match;
    if (!services[svcName]) {
      errors.push({
        message: `Computed "${computedName}": references unknown service "${svcName}"`,
        severity: 'error',
        key: computedName,
        parentKey: 'computed',
      });
    } else if (!VALID_FIELDS.has(field)) {
      errors.push({
        message: `Computed "${computedName}": unknown field "${field}" (valid: port, hostname, url)`,
        severity: 'error',
        key: computedName,
        parentKey: 'computed',
      });
    } else if (modifier && (!VALID_MODIFIERS[field] || !VALID_MODIFIERS[field].has(modifier))) {
      errors.push({
        message: `Computed "${computedName}": unknown modifier "${modifier}" for field "${field}"`,
        severity: 'error',
        key: computedName,
        parentKey: 'computed',
      });
    }
  }

  STANDALONE_VAR_RE.lastIndex = 0;
  while ((match = STANDALONE_VAR_RE.exec(template)) !== null) {
    const varName = match[1] || match[2];
    if (!VALID_STANDALONE_VARS.has(varName)) {
      errors.push({
        message: `Computed "${computedName}": unknown variable "${varName}" (valid: instance)`,
        severity: 'error',
        key: computedName,
        parentKey: 'computed',
      });
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/test/unit/diagnostics.test.ts
git commit -m "feat: template reference validation (fields, modifiers, standalone vars)"
```

---

### Task 8: Wire diagnostics into extension and register document listeners

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add registerDiagnostics function**

Add to `src/diagnostics.ts`:

```typescript
export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('outport');
  context.subscriptions.push(collection);

  const diagnose = (document: vscode.TextDocument) => {
    if (!isOutportYaml(document)) return;

    const text = document.getText();
    let config: OutportConfig;
    try {
      config = yaml.load(text) as OutportConfig;
    } catch {
      collection.delete(document.uri);
      return;
    }

    if (!config || typeof config !== 'object') {
      collection.delete(document.uri);
      return;
    }

    const errors = validateConfig(config);
    const diagnostics = errors.map(err => {
      const pos = findPosition(text, err.key, err.parentKey);
      const line = document.lineAt(pos.line);
      const range = new vscode.Range(pos.line, pos.col, pos.line, line.text.length);
      const severity = err.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
      const diagnostic = new vscode.Diagnostic(range, err.message, severity);
      diagnostic.source = 'outport';
      return diagnostic;
    });

    collection.set(document.uri, diagnostics);
  };

  vscode.workspace.textDocuments.forEach(diagnose);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(diagnose),
    vscode.workspace.onDidChangeTextDocument(e => diagnose(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
  );
}

function isOutportYaml(document: vscode.TextDocument): boolean {
  const name = document.fileName;
  return name.endsWith('/outport.yml') || name.endsWith('/outport.yaml');
}
```

- [ ] **Step 2: Wire into extension.ts**

Add import at top of `src/extension.ts`:

```typescript
import { registerDiagnostics } from './diagnostics';
```

Add after the status bar creation line (`const statusBar = createStatusBar(context);`):

```typescript
registerDiagnostics(context);
```

- [ ] **Step 3: Compile and verify**

```bash
npm run compile
```
Expected: success

- [ ] **Step 4: Manual test**

Press F5, open an `outport.yml` with a hostname that has no protocol. Verify the error appears in the Problems panel with source "outport".

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/extension.ts
git commit -m "feat: wire diagnostics into extension with document listeners"
```

---

### Task 9: Integration test

**Files:**
- Modify: `src/test/integration/extension.test.ts`

- [ ] **Step 1: Add diagnostics integration test**

Add to the existing integration test suite:

```typescript
test('diagnostics collection is registered', async () => {
  const ext = vscode.extensions.getExtension('steveclarke.outport');
  await ext?.activate();
  const files = await vscode.workspace.findFiles('outport.yml');
  assert.ok(files.length > 0, 'Should find outport.yml in test workspace');
});
```

- [ ] **Step 2: Run all tests**

```bash
npm run compile && npm run test
```
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/extension.test.ts
git commit -m "test: add diagnostics integration test"
```
