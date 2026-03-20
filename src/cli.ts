import { execFile, spawn, ChildProcess } from "child_process"
import { promisify } from "util"
import * as vscode from "vscode"

const execFileAsync = promisify(execFile)

export interface ServiceJSON {
  port: number
  env_var: string
  preferred_port?: number
  protocol?: string
  hostname?: string
  url?: string
  up?: boolean
  env_files: string[]
}

export interface ComputedJSON {
  value?: string
  values?: Record<string, string>
  env_files?: string[]
}

export interface PortsOutput {
  project: string
  instance: string
  services: Record<string, ServiceJSON>
  computed?: Record<string, ComputedJSON>
  env_files: string[]
}

export interface CliError {
  kind: "not-found" | "not-registered" | "external-approval" | "cli-error"
  message: string
}

const EXTERNAL_APPROVAL_MARKER = "external env files require interactive approval"

export function categorizeCliError(stderr: string, code: string | undefined, bin: string): CliError {
  if (code === "ENOENT") {
    return { kind: "not-found", message: `outport binary not found at "${bin}"` }
  }
  if (stderr.includes(EXTERNAL_APPROVAL_MARKER)) {
    return { kind: "external-approval", message: stderr }
  }
  if (stderr.includes("No outport.yml found") || stderr.includes("not found in registry")) {
    return { kind: "not-registered", message: stderr }
  }
  return { kind: "cli-error", message: stderr }
}

export type CliResult<T> = { ok: true; data: T } | { ok: false; error: CliError }

function getBinaryPath(): string {
  const config = vscode.workspace.getConfiguration("outport")
  return config.get<string>("binaryPath", "outport")
}

async function runOutport(args: string[], cwd: string): Promise<CliResult<string>> {
  const bin = getBinaryPath()
  try {
    const { stdout } = await execFileAsync(bin, args, {
      cwd,
      timeout: 15_000,
    })
    return { ok: true, data: stdout }
  } catch (err: any) {
    const stderr = err.stderr?.trim() || err.message
    return { ok: false, error: categorizeCliError(stderr, err.code, bin) }
  }
}

export async function getPorts(cwd: string): Promise<CliResult<PortsOutput>> {
  const result = await runOutport(["ports", "--json", "--check", "--computed"], cwd)
  if (!result.ok) return result
  try {
    const trimmed = result.data.trim()
    if (!trimmed.startsWith("{")) {
      return { ok: false, error: { kind: "not-registered", message: trimmed } }
    }
    const data = JSON.parse(trimmed) as PortsOutput
    return { ok: true, data }
  } catch {
    return {
      ok: false,
      error: { kind: "cli-error", message: "Failed to parse outport JSON output" },
    }
  }
}

export function buildUpArgs(force: boolean, yes: boolean): string[] {
  const args = ["up", "--json"]
  if (force) args.push("--force")
  if (yes) args.push("--yes")
  return args
}

export function buildDownArgs(yes: boolean): string[] {
  const args = ["down"]
  if (yes) args.push("--yes")
  return args
}

export async function runUp(cwd: string, force: boolean, yes = false): Promise<CliResult<string>> {
  return runOutport(buildUpArgs(force, yes), cwd)
}

export async function runDown(cwd: string, yes = false): Promise<CliResult<string>> {
  return runOutport(buildDownArgs(yes), cwd)
}

export interface DoctorCheck {
  name: string
  category: string
  status: "pass" | "warn" | "fail"
  message: string
  fix?: string
}

export interface DoctorOutput {
  results: DoctorCheck[]
  passed: boolean
}

// --- Share (long-lived process) ---

export interface TunnelInfo {
  service: string
  url: string
  port: number
}

export interface ShareOutput {
  tunnels: TunnelInfo[]
}

let shareProcess: ChildProcess | undefined

export function isSharing(): boolean {
  return shareProcess !== undefined
}

export function startShare(
  cwd: string,
  onTunnels: (tunnels: TunnelInfo[]) => void,
  onExit: () => void,
  onError: (message: string) => void,
  onStderr?: (message: string) => void,
  options?: { yes?: boolean; onExternalApproval?: () => void },
): void {
  if (shareProcess) {
    onError("Already sharing")
    return
  }

  const bin = getBinaryPath()
  const args = ["share", "--json"]
  if (options?.yes) args.push("--yes")
  const proc = spawn(bin, args, { cwd })
  shareProcess = proc

  let stdout = ""
  let needsApproval = false

  proc.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString()
    try {
      const data = JSON.parse(stdout.trim()) as ShareOutput
      stdout = ""
      if (data.tunnels) {
        onTunnels(data.tunnels)
      }
    } catch {
      // Not complete yet, keep buffering
    }
  })

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString()
    if (!needsApproval && msg.includes(EXTERNAL_APPROVAL_MARKER)) {
      needsApproval = true
    }
    const trimmed = msg.trim()
    if (trimmed) onStderr?.(trimmed)
  })

  proc.on("error", (err) => {
    // Don't call onExit here — 'close' always fires after 'error'
    onError(err.message)
  })

  proc.on("close", () => {
    // Only clean up if this is still the active share process.
    // Prevents a stale close event from corrupting a new session
    // started between stopShare() and the old process exiting.
    if (shareProcess === proc) {
      shareProcess = undefined
    }
    if (needsApproval && options?.onExternalApproval) {
      options.onExternalApproval()
    } else {
      onExit()
    }
  })
}

export function stopShare(): void {
  if (shareProcess) {
    shareProcess.kill("SIGTERM")
    // Don't null shareProcess here — let the 'close' handler do it.
    // This prevents a race where startShare() is called before the
    // old process emits 'close'.
  }
}

export async function runDoctor(cwd: string): Promise<CliResult<DoctorOutput>> {
  const bin = getBinaryPath()
  try {
    const { stdout } = await execFileAsync(bin, ["doctor", "--json"], { cwd, timeout: 15_000 })
    const data = JSON.parse(stdout.trim()) as DoctorOutput
    return { ok: true, data }
  } catch (err: any) {
    // doctor exits non-zero when checks fail, but stdout still has the JSON
    if (err.stdout) {
      try {
        const data = JSON.parse(err.stdout.trim()) as DoctorOutput
        return { ok: true, data }
      } catch {
        /* fall through */
      }
    }
    const stderr = err.stderr?.trim() || err.message
    return { ok: false, error: categorizeCliError(stderr, err.code, bin) }
  }
}
