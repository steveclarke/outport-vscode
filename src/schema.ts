import * as vscode from "vscode"
import * as yaml from "js-yaml"

// --- Config types (parsed from outport.yml) ---

export interface OutportService {
  env_var?: string
  hostname?: string
  preferred_port?: number
  env_file?: string | string[]
  aliases?: Record<string, string>
}

export interface OutportComputedValue {
  value?: string
  env_file?: string | string[] | Array<{ file: string; value?: string }>
}

export interface OutportConfig {
  name?: string
  services?: Record<string, OutportService>
  computed?: Record<string, OutportComputedValue>
}

// --- Template expression constants ---

export const TEMPLATE_FIELDS = ["port", "hostname", "url", "env_var"]
export const TEMPLATE_MODIFIERS: Record<string, string[]> = {
  url: ["direct"],
}
export const STANDALONE_VARS = ["instance", "project_name"]

// --- File matching ---

export const OUTPORT_SELECTOR: vscode.DocumentSelector = [
  { language: "yaml", pattern: "**/outport.yml" },
  { language: "yaml", pattern: "**/outport.yaml" },
]

export function isOutportYaml(document: vscode.TextDocument): boolean {
  const name = document.fileName
  return name.endsWith("/outport.yml") || name.endsWith("/outport.yaml")
}

// --- YAML parsing ---

export function parseOutportConfig(document: vscode.TextDocument): OutportConfig | undefined {
  try {
    const config = yaml.load(document.getText()) as OutportConfig
    return config && typeof config === "object" ? config : undefined
  } catch {
    return undefined
  }
}
