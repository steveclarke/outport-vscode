import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export interface ServiceJSON {
  port: number;
  env_var: string;
  preferred_port?: number;
  protocol?: string;
  hostname?: string;
  url?: string;
  up?: boolean;
  env_files: string[];
}

export interface ComputedJSON {
  value?: string;
  values?: Record<string, string>;
  env_files?: string[];
}

export interface PortsOutput {
  project: string;
  instance: string;
  services: Record<string, ServiceJSON>;
  computed?: Record<string, ComputedJSON>;
  env_files: string[];
}

export interface CliError {
  kind: 'not-found' | 'not-registered' | 'cli-error';
  message: string;
}

export type CliResult<T> = { ok: true; data: T } | { ok: false; error: CliError };

function getBinaryPath(): string {
  const config = vscode.workspace.getConfiguration('outport');
  return config.get<string>('binaryPath', 'outport');
}

async function runOutport(args: string[], cwd: string): Promise<CliResult<string>> {
  const bin = getBinaryPath();
  try {
    const { stdout } = await execFileAsync(bin, args, {
      cwd,
      timeout: 15_000,
    });
    return { ok: true, data: stdout };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { ok: false, error: { kind: 'not-found', message: `outport binary not found at "${bin}"` } };
    }
    const stderr = err.stderr?.trim() || err.message;
    if (stderr.includes('No .outport.yml found') || stderr.includes('not found in registry')) {
      return { ok: false, error: { kind: 'not-registered', message: stderr } };
    }
    return { ok: false, error: { kind: 'cli-error', message: stderr } };
  }
}

export async function getPorts(cwd: string): Promise<CliResult<PortsOutput>> {
  const result = await runOutport(['ports', '--json', '--check', '--computed'], cwd);
  if (!result.ok) return result;
  try {
    const trimmed = result.data.trim();
    if (!trimmed.startsWith('{')) {
      return { ok: false, error: { kind: 'not-registered', message: trimmed } };
    }
    const data = JSON.parse(trimmed) as PortsOutput;
    return { ok: true, data };
  } catch {
    return { ok: false, error: { kind: 'cli-error', message: 'Failed to parse outport JSON output' } };
  }
}

export async function runUp(cwd: string, force: boolean): Promise<CliResult<string>> {
  const args = ['up', '--json'];
  if (force) args.push('--force');
  return runOutport(args, cwd);
}

export async function runDown(cwd: string): Promise<CliResult<string>> {
  return runOutport(['down'], cwd);
}

export interface DoctorCheck {
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

export interface DoctorOutput {
  results: DoctorCheck[];
  passed: boolean;
}

// --- Share (long-lived process) ---

export interface TunnelInfo {
  service: string;
  url: string;
  port: number;
}

export interface ShareOutput {
  tunnels: TunnelInfo[];
}

let shareProcess: ChildProcess | undefined;

export function isSharing(): boolean {
  return shareProcess !== undefined;
}

export function startShare(
  cwd: string,
  onTunnels: (tunnels: TunnelInfo[]) => void,
  onExit: () => void,
  onError: (message: string) => void,
): void {
  if (shareProcess) {
    onError('Already sharing');
    return;
  }

  const bin = getBinaryPath();
  const proc = spawn(bin, ['share', '--json'], { cwd });
  shareProcess = proc;

  let stdout = '';

  proc.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
    // Try to parse — JSON is complete when we can parse it
    try {
      const data = JSON.parse(stdout.trim()) as ShareOutput;
      if (data.tunnels) {
        onTunnels(data.tunnels);
      }
    } catch {
      // Not complete yet, keep buffering
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) onError(msg);
  });

  proc.on('error', (err) => {
    shareProcess = undefined;
    onError(err.message);
    onExit();
  });

  proc.on('close', () => {
    shareProcess = undefined;
    onExit();
  });
}

export function stopShare(): void {
  if (shareProcess) {
    shareProcess.kill('SIGTERM');
    shareProcess = undefined;
  }
}

export async function runDoctor(cwd: string): Promise<CliResult<DoctorOutput>> {
  const bin = getBinaryPath();
  try {
    const { stdout } = await execFileAsync(bin, ['doctor', '--json'], { cwd, timeout: 15_000 });
    const data = JSON.parse(stdout.trim()) as DoctorOutput;
    return { ok: true, data };
  } catch (err: any) {
    // doctor exits non-zero when checks fail, but stdout still has the JSON
    if (err.stdout) {
      try {
        const data = JSON.parse(err.stdout.trim()) as DoctorOutput;
        return { ok: true, data };
      } catch { /* fall through */ }
    }
    if (err.code === 'ENOENT') {
      return { ok: false, error: { kind: 'not-found', message: `outport binary not found at "${bin}"` } };
    }
    return { ok: false, error: { kind: 'cli-error', message: err.stderr?.trim() || err.message } };
  }
}
