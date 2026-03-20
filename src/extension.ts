import * as vscode from "vscode"
import { CliResult, getPorts, runUp, runDown, startShare, stopShare, isSharing } from "./cli"
import { OutportTreeProvider } from "./sidebar/provider"
import { ServiceItem } from "./sidebar/items"
import { createStatusBar, updateStatusBar } from "./statusbar"
import { registerDiagnostics } from "./diagnostics"
import { registerTemplateIntelligence } from "./template"
import { createRegistryWatcher } from "./watcher"

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
                treeProvider.setTunnels([])
              }
            },
          },
        )
      })
    },
  )
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Outport")

  vscode.commands.executeCommand("setContext", "outport.active", true)

  createStatusBar(context)

  registerDiagnostics(context)
  registerTemplateIntelligence(context)

  const treeProvider = new OutportTreeProvider(outputChannel, (result) => {
    updateStatusBar(result)
  })
  const treeView = vscode.window.createTreeView("outportView", { treeDataProvider: treeProvider })
  context.subscriptions.push(treeView)

  const refresh = () => {
    treeProvider.refresh()
  }

  // Refresh immediately when the panel becomes visible (user clicks the icon)
  treeView.onDidChangeVisibility((e) => {
    if (e.visible) refresh()
  })

  const watcher = createRegistryWatcher(() => refresh())
  context.subscriptions.push(watcher)
  context.subscriptions.push({ dispose: () => treeProvider.dispose() })

  context.subscriptions.push(
    vscode.commands.registerCommand("outport.refresh", () => refresh()),

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

    vscode.commands.registerCommand("outport.openService", (urlOrItem: string | ServiceItem) => {
      const url = typeof urlOrItem === "string" ? urlOrItem : urlOrItem?.service?.url
      if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url))
      }
    }),

    vscode.commands.registerCommand("outport.copyPort", (item: ServiceItem) => {
      if (item?.service?.port) {
        vscode.env.clipboard.writeText(String(item.service.port))
      }
    }),

    vscode.commands.registerCommand("outport.copyUrl", (item: ServiceItem) => {
      if (item?.service?.url) {
        vscode.env.clipboard.writeText(item.service.url)
      }
    }),

    vscode.commands.registerCommand("outport.copyEnvVar", (item: ServiceItem) => {
      if (item?.service) {
        vscode.env.clipboard.writeText(`${item.service.env_var}=${item.service.port}`)
      }
    }),

    vscode.commands.registerCommand("outport.share", () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!cwd) return
      if (isSharing()) {
        vscode.window.showInformationMessage("Already sharing")
        return
      }
      doShare(cwd, outputChannel, treeProvider, false)
    }),

    vscode.commands.registerCommand("outport.stopShare", () => {
      stopShare()
    }),
  )

  // Populate the status bar immediately on activation, without waiting
  // for the user to open the sidebar panel
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (cwd) {
    getPorts(cwd).then((result) => updateStatusBar(result))
  }

  outputChannel.appendLine("Outport extension activated")
}

export function deactivate(): void {
  stopShare()
}
