import * as vscode from "vscode"
import { CliResult, PortsOutput } from "./cli"

let statusBarItem: vscode.StatusBarItem | undefined

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  statusBarItem.command = "outportView.focus"
  context.subscriptions.push(statusBarItem)
  return statusBarItem
}

export function updateStatusBar(result: CliResult<PortsOutput> | null): void {
  if (!statusBarItem) return

  if (!result) {
    statusBarItem.hide()
    return
  }

  if (result.ok) {
    const { project, instance } = result.data
    statusBarItem.text = `$(plug) ${project} [${instance}]`
    statusBarItem.tooltip = "Click to show Outport sidebar"
    statusBarItem.show()
    return
  }

  if (result.error.kind === "not-registered") {
    statusBarItem.text = `$(plug) (run outport up)`
    statusBarItem.tooltip = "Outport config found but not registered — run outport up"
    statusBarItem.show()
    return
  }

  statusBarItem.hide()
}
