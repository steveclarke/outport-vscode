# External Env File Approval Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Handle the CLI v0.20.0 FlagError when external env files need approval, by detecting the error, prompting the user in VS Code, and retrying with `--yes`.

**Architecture:** Extend the error categorization layer (`cli.ts`) with an `external-approval` error kind detected via stderr string matching. For `up`/`down` commands (which use `execFile`), extend `runCliCommand` with an optional approval-retry callback. For `share` (which uses `spawn`), add FlagError detection in the process close handler and prompt-then-retry via a new callback. Rely on the CLI's registry-based approval persistence — users approve once per project.

**Tech Stack:** VS Code Extension API, TypeScript, Mocha (TDD)

**GitHub Issue:** #8

---

## Design Decisions

1. **Approach: Detect-Prompt-Retry** — The extension detects the `FlagError` from stderr, shows a VS Code warning message with an "Allow" button, and retries with `--yes` if approved. This preserves the CLI's safety model while giving users a native approval experience.

2. **Approval persistence** — Relies entirely on the CLI's registry-based persistence (`ApprovedExternalFiles`). After one approval via the extension, subsequent commands work without prompting. No extension-level persistence needed.

3. **No sidebar changes** — The `getPorts` polling command is read-only and never triggers the FlagError. External file visibility in the sidebar is deferred to a follow-up.

4. **String matching** — Detect the FlagError via `stderr.includes("external env files require interactive approval")`. This matches the CLI's `ErrNonInteractive` message.

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/cli.ts` | Modify | Add `external-approval` error kind, extract `categorizeCliError()`, add `yes` param to `runUp`/`runDown`, add options to `startShare` |
| `src/extension.ts` | Modify | Approval prompt in `runCliCommand`, share retry flow |
| `src/test/unit/cli.test.ts` | Modify | Tests for error categorization and `--yes` arg construction |

---

### Task 1: Extract error categorization and add `external-approval` kind

**Files:**
- Modify: `src/cli.ts:32-64`
- Test: `src/test/unit/cli.test.ts`

- [ ] **Step 1: Write failing tests for error categorization**

Add a new test suite in `src/test/unit/cli.test.ts`:

```typescript
suite("CLI Error Categorization", () => {
  // Import will be added after implementation
  // import { categorizeCliError } from "../../cli"

  test("categorizes ENOENT as not-found", () => {
    const result = categorizeCliError("", "ENOENT", "outport")
    assert.strictEqual(result.kind, "not-found")
  })

  test("categorizes missing yml as not-registered", () => {
    const result = categorizeCliError("No outport.yml found", undefined, "outport")
    assert.strictEqual(result.kind, "not-registered")
  })

  test("categorizes registry miss as not-registered", () => {
    const result = categorizeCliError("myapp not found in registry", undefined, "outport")
    assert.strictEqual(result.kind, "not-registered")
  })

  test("categorizes external approval error", () => {
    const stderr =
      "external env files require interactive approval; use -y to allow or move files inside the project directory"
    const result = categorizeCliError(stderr, undefined, "outport")
    assert.strictEqual(result.kind, "external-approval")
  })

  test("categorizes unknown errors as cli-error", () => {
    const result = categorizeCliError("something went wrong", undefined, "outport")
    assert.strictEqual(result.kind, "cli-error")
    assert.strictEqual(result.message, "something went wrong")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npm run test:unit`
Expected: FAIL — `categorizeCliError` is not defined

- [ ] **Step 3: Extract `categorizeCliError()` and add `external-approval` kind**

In `src/cli.ts`, update the `CliError` interface and extract the categorization logic:

```typescript
export interface CliError {
  kind: "not-found" | "not-registered" | "external-approval" | "cli-error"
  message: string
}
```

Add a new exported function (above `runOutport`):

```typescript
export function categorizeCliError(stderr: string, code: string | undefined, bin: string): CliError {
  if (code === "ENOENT") {
    return { kind: "not-found", message: `outport binary not found at "${bin}"` }
  }
  if (stderr.includes("external env files require interactive approval")) {
    return { kind: "external-approval", message: stderr }
  }
  if (stderr.includes("No outport.yml found") || stderr.includes("not found in registry")) {
    return { kind: "not-registered", message: stderr }
  }
  return { kind: "cli-error", message: stderr }
}
```

Update `runOutport` to use it — replace the catch block body (lines 52-64):

```typescript
  } catch (err: any) {
    const stderr = err.stderr?.trim() || err.message
    return { ok: false, error: categorizeCliError(stderr, err.code, bin) }
  }
```

- [ ] **Step 4: Add import in test file**

Add at top of `src/test/unit/cli.test.ts`:

```typescript
import { categorizeCliError } from "../../cli"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/test/unit/cli.test.ts
git commit -m "refactor: extract categorizeCliError, add external-approval error kind"
```

---

### Task 2: Add `--yes` flag support to `runUp` and `runDown`

**Files:**
- Modify: `src/cli.ts:85-93`
- Test: `src/test/unit/cli.test.ts`

- [ ] **Step 1: Write failing tests for --yes arg construction**

The CLI functions use `execFile` internally so we can't test execution, but we can test the args array construction by extracting it. Add to `src/test/unit/cli.test.ts`:

```typescript
suite("CLI Command Args", () => {
  // import { buildUpArgs, buildDownArgs } from "../../cli"

  test("runUp builds args without yes", () => {
    const args = buildUpArgs(false, false)
    assert.deepStrictEqual(args, ["up", "--json"])
  })

  test("runUp builds args with force", () => {
    const args = buildUpArgs(true, false)
    assert.deepStrictEqual(args, ["up", "--json", "--force"])
  })

  test("runUp builds args with yes", () => {
    const args = buildUpArgs(false, true)
    assert.deepStrictEqual(args, ["up", "--json", "--yes"])
  })

  test("runUp builds args with force and yes", () => {
    const args = buildUpArgs(true, true)
    assert.deepStrictEqual(args, ["up", "--json", "--force", "--yes"])
  })

  test("runDown builds args without yes", () => {
    const args = buildDownArgs(false)
    assert.deepStrictEqual(args, ["down"])
  })

  test("runDown builds args with yes", () => {
    const args = buildDownArgs(true)
    assert.deepStrictEqual(args, ["down", "--yes"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npm run test:unit`
Expected: FAIL — `buildUpArgs` and `buildDownArgs` not defined

- [ ] **Step 3: Extract arg builders and add `yes` parameter**

In `src/cli.ts`, add exported helpers and update `runUp`/`runDown`:

```typescript
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
```

- [ ] **Step 4: Add imports in test file**

```typescript
import { categorizeCliError, buildUpArgs, buildDownArgs } from "../../cli"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `npm run compile && npm run test`
Expected: All tests PASS (no regressions — `runUp`/`runDown` signature changes are backward-compatible via defaults)

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/test/unit/cli.test.ts
git commit -m "feat: add --yes flag support to runUp and runDown"
```

---

### Task 3: Add approval prompt to `up` and `down` commands

**Files:**
- Modify: `src/extension.ts:10-27` (`runCliCommand`)
- Modify: `src/extension.ts:58-71` (command registrations)

- [ ] **Step 1: Extend `runCliCommand` with approval retry**

In `src/extension.ts`, add an optional `approvalRetryFn` parameter and approval logic to `runCliCommand`:

```typescript
async function runCliCommand(
  label: string,
  cliFn: (cwd: string) => Promise<CliResult<string>>,
  outputChannel: vscode.OutputChannel,
  refresh: () => void,
  approvalRetryFn?: (cwd: string) => Promise<CliResult<string>>,
): Promise<void> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!cwd) return
  outputChannel.appendLine(`> ${label}`)
  outputChannel.show(true)
  let result = await cliFn(cwd)
  if (!result.ok && result.error.kind === "external-approval" && approvalRetryFn) {
    const choice = await vscode.window.showWarningMessage(
      "This project writes to env files outside the project directory. Allow?",
      "Allow",
    )
    if (choice === "Allow") {
      outputChannel.appendLine(`> ${label} --yes`)
      result = await approvalRetryFn(cwd)
    }
  }
  if (result.ok) {
    outputChannel.appendLine(result.data)
  } else {
    outputChannel.appendLine(`Error: ${result.error.message}`)
  }
  refresh()
}
```

- [ ] **Step 2: Wire up approval retry in command registrations**

Update the three command registrations to pass the retry function:

```typescript
vscode.commands.registerCommand("outport.up", () =>
  runCliCommand(
    "outport up",
    (cwd) => runUp(cwd, false),
    outputChannel,
    refresh,
    (cwd) => runUp(cwd, false, true),
  ),
),

vscode.commands.registerCommand("outport.upForce", () =>
  runCliCommand(
    "outport up --force",
    (cwd) => runUp(cwd, true),
    outputChannel,
    refresh,
    (cwd) => runUp(cwd, true, true),
  ),
),

vscode.commands.registerCommand("outport.down", () =>
  runCliCommand(
    "outport down",
    (cwd) => runDown(cwd),
    outputChannel,
    refresh,
    (cwd) => runDown(cwd, true),
  ),
),
```

- [ ] **Step 3: Run full test suite**

Run: `npm run compile && npm run test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add external env file approval prompt for up/down commands"
```

---

### Task 4: Add approval handling to `share` command

**Files:**
- Modify: `src/cli.ts:108-186` (`startShare`)
- Modify: `src/extension.ts:98-152` (share command handler)

- [ ] **Step 1: Add options parameter to `startShare`**

In `src/cli.ts`, add an options parameter to `startShare`. Keep the existing positional callback params for backward compatibility, add the options bag at the end:

```typescript
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
  let stderrBuf = ""

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
    stderrBuf += msg
    const trimmed = msg.trim()
    if (trimmed) onStderr?.(trimmed)
  })

  proc.on("error", (err) => {
    onError(err.message)
  })

  proc.on("close", () => {
    if (shareProcess === proc) {
      shareProcess = undefined
    }
    if (
      stderrBuf.includes("external env files require interactive approval") &&
      options?.onExternalApproval
    ) {
      options.onExternalApproval()
    } else {
      onExit()
    }
  })
}
```

- [ ] **Step 2: Refactor share command handler with approval retry**

In `src/extension.ts`, extract the share logic into a helper function that supports retry. Replace the share command registration (lines 98-152):

```typescript
vscode.commands.registerCommand("outport.share", () => {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!cwd) return
  if (isSharing()) {
    vscode.window.showInformationMessage("Already sharing")
    return
  }
  doShare(cwd, outputChannel, treeProvider, false)
}),
```

Add the `doShare` helper function (above `activate` or as a module-level function):

```typescript
function doShare(
  cwd: string,
  outputChannel: vscode.OutputChannel,
  treeProvider: OutportTreeProvider,
  yes: boolean,
): void {
  outputChannel.appendLine(`> outport share${yes ? " --yes" : ""}`)
  outputChannel.show(true)
  vscode.commands.executeCommand("setContext", "outport.sharing", true)

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Starting tunnels…",
      cancellable: true,
    },
    (_progress, token) => {
      return new Promise<void>((resolve) => {
        token.onCancellationRequested(() => {
          stopShare()
          resolve()
        })

        startShare(
          cwd,
          (tunnels) => {
            outputChannel.appendLine(`Sharing ${tunnels.length} service(s)`)
            for (const t of tunnels) {
              outputChannel.appendLine(`  ${t.service}: ${t.url}`)
            }
            treeProvider.setTunnels(tunnels)
            resolve()
            vscode.window.showInformationMessage(`Sharing ${tunnels.length} service(s)`)
          },
          () => {
            outputChannel.appendLine("Sharing stopped")
            vscode.commands.executeCommand("setContext", "outport.sharing", false)
            treeProvider.setTunnels([])
            resolve()
          },
          (msg) => {
            outputChannel.appendLine(`Share error: ${msg}`)
            vscode.commands.executeCommand("setContext", "outport.sharing", false)
            treeProvider.setTunnels([])
            resolve()
          },
          (msg) => {
            outputChannel.appendLine(`[share] ${msg}`)
          },
          {
            yes,
            async onExternalApproval() {
              resolve() // Close the progress notification
              const choice = await vscode.window.showWarningMessage(
                "This project writes to env files outside the project directory. Allow?",
                "Allow",
              )
              if (choice === "Allow") {
                doShare(cwd, outputChannel, treeProvider, true)
              } else {
                vscode.commands.executeCommand("setContext", "outport.sharing", false)
              }
            },
          },
        )
      })
    },
  )
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm run compile && npm run test`
Expected: All tests PASS

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/extension.ts
git commit -m "feat: add external env file approval flow for share command"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Build the extension**

Run: `npm run build`
Expected: Clean build with no errors

- [ ] **Step 2: Verify test scenarios**

Test the following scenarios (requires a project with external env files configured in `outport.yml`):

1. **First `up` with external files** — Should show "Allow?" warning, clicking Allow retries with `--yes`, command succeeds
2. **Subsequent `up`** — Should work without prompting (CLI registry persistence)
3. **`up --force`** — Should clear approvals and re-prompt
4. **Deny approval** — Should show error in output channel, no retry
5. **`down` with external files** — Same approval flow as `up`
6. **`share` with external files** — Should detect FlagError, prompt, and restart share on approval

- [ ] **Step 3: Final commit (if any fixups needed)**

---

## Follow-up Considerations (Not in Scope)

These are deferred design questions from the issue that don't affect the core approval flow:

- **Sidebar display of external files**: The CLI JSON output includes `external_files` with `config_path` and `resolved_path`. Could add an "External Files" section under each project in the tree view. Requires adding `external_files` to `PortsOutput` interface.
- **Resolved path visibility**: Show both config path and resolved absolute path in hover tooltips.
- **Post-write warnings**: The CLI prints a warning after every write to external files. Could surface as a VS Code notification or sidebar badge. Current approach is silent after initial approval.
