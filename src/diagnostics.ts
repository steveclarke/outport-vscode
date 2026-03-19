import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

// --- Types ---

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

// --- Template validation constants ---

const TEMPLATE_VAR_RE = /\$\{(\w+)\.(\w+)(?::(\w+))?\}/g;
const STANDALONE_VAR_RE = /\$\{(\w+)\}|\$\{(\w+):[+-]/g;

const VALID_FIELDS = new Set(['port', 'hostname', 'url']);
const VALID_MODIFIERS: Record<string, Set<string>> = {
  url: new Set(['direct']),
};
const VALID_STANDALONE_VARS = new Set(['instance']);

// --- Position mapping ---

/**
 * Find the line number of a key within a YAML document,
 * optionally scoped under a parent key.
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
      // Left the parent block
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

// --- Helpers ---

function resolveEnvFiles(envFile: string | string[] | undefined): string[] {
  if (!envFile) return ['.env'];
  if (typeof envFile === 'string') return [envFile];
  return envFile;
}

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

// --- Template validation ---

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

// --- Main validation ---

export function validateConfig(config: OutportConfig): DiagnosticError[] {
  const errors: DiagnosticError[] = [];
  if (!config.services) return errors;

  // Duplicate env_var per file
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

  // Service-level checks
  for (const [name, svc] of Object.entries(config.services)) {
    if (svc.hostname && svc.protocol !== 'http' && svc.protocol !== 'https') {
      errors.push({
        message: `Service "${name}": hostname requires protocol http or https`,
        severity: 'error',
        key: 'hostname',
        parentKey: name,
      });
    }

    if (svc.hostname && config.name) {
      const stem = svc.hostname.replace(/\.test$/, '');
      if (!stem.includes(config.name)) {
        errors.push({
          message: `Service "${name}": hostname "${svc.hostname}" must contain project name "${config.name}"`,
          severity: 'warning',
          key: 'hostname',
          parentKey: name,
        });
      }
    }
  }

  // Computed value checks
  if (config.computed) {
    const serviceEnvVars = new Set(
      Object.values(config.services).map(s => s.env_var).filter(Boolean)
    );

    for (const [name, cv] of Object.entries(config.computed)) {
      // Name collision
      if (serviceEnvVars.has(name)) {
        errors.push({
          message: `Computed value "${name}" conflicts with a service env_var of the same name`,
          severity: 'error',
          key: name,
          parentKey: 'computed',
        });
      }

      // Missing value
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

      // Template references
      const templates = [cv.value, ...Object.values(perFileEntries)].filter(Boolean) as string[];
      for (const template of templates) {
        errors.push(...validateTemplateRefs(name, template, config.services));
      }
    }
  }

  return errors;
}

// --- VS Code integration ---

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
      // YAML syntax errors are handled by the YAML extension
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
  return name.endsWith('.outport.yml') || name.endsWith('.outport.yaml');
}
