import * as vscode from "vscode"
import {
  getPorts,
  runDoctor,
  CliResult,
  CliError,
  PortsOutput,
  DoctorCheck,
  TunnelInfo,
} from "../cli"
import {
  ProjectItem,
  ServiceItem,
  ComputedHeaderItem,
  ComputedItem,
  DoctorHeaderItem,
  DoctorCheckItem,
  TunnelHeaderItem,
  TunnelItem,
  MessageItem,
} from "./items"

type OutportTreeItem =
  | ProjectItem
  | ServiceItem
  | ComputedHeaderItem
  | ComputedItem
  | DoctorHeaderItem
  | DoctorCheckItem
  | TunnelHeaderItem
  | TunnelItem
  | MessageItem

export class OutportTreeProvider implements vscode.TreeDataProvider<OutportTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OutportTreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private projectData: Map<string, PortsOutput> = new Map()
  private cliErrors: Array<{ folderName: string; error: CliError }> = []
  private notFound = false
  private notRegistered = false
  private doctorIssues: DoctorCheck[] = []
  private activeTunnels: TunnelInfo[] = []
  private outputChannel: vscode.OutputChannel
  private onDataLoaded?: (result: CliResult<PortsOutput>) => void
  private healthPollTimer?: ReturnType<typeof setInterval>
  private currentPollInterval?: number
  private lastSnapshot = ""
  private refreshing = false
  private static readonly FAST_POLL_MS = 5_000
  private static readonly SLOW_POLL_MS = 30_000

  constructor(
    outputChannel: vscode.OutputChannel,
    onDataLoaded?: (result: CliResult<PortsOutput>) => void,
  ) {
    this.outputChannel = outputChannel
    this.onDataLoaded = onDataLoaded
  }

  dispose(): void {
    if (this.healthPollTimer) {
      clearInterval(this.healthPollTimer)
      this.healthPollTimer = undefined
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    try {
      await this.fetchData()
    } finally {
      this.refreshing = false
    }
  }

  private async fetchData(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders
    if (!folders || folders.length === 0) {
      this.projectData.clear()
      this.cliErrors = []
      this.notFound = false
      this.notRegistered = false
      this.doctorIssues = []
      this.lastSnapshot = ""
      this._onDidChangeTreeData.fire()
      return
    }

    const newProjectData = new Map<string, PortsOutput>()
    const newErrors: Array<{ folderName: string; error: CliError }> = []
    const seen = new Set<string>()
    let newNotFound = false
    let newNotRegistered = false
    let firstResult: CliResult<PortsOutput> | undefined
    for (const folder of folders) {
      const result = await getPorts(folder.uri.fsPath)
      if (result.ok) {
        const key = `${result.data.project}/${result.data.instance}`
        if (!seen.has(key)) {
          seen.add(key)
          newProjectData.set(key, result.data)
        }
        if (!firstResult) firstResult = result
      } else if (result.error.kind === "not-found") {
        newNotFound = true
        break
      } else if (result.error.kind === "not-registered") {
        newNotRegistered = true
      } else {
        this.outputChannel.appendLine(`[error] ${folder.name}: ${result.error.message}`)
        newErrors.push({ folderName: folder.name, error: result.error })
      }
    }

    // Only run doctor when at least one project registered successfully.
    let newDoctorIssues: DoctorCheck[] = []
    if (newProjectData.size > 0) {
      const doctorResult = await runDoctor(folders[0].uri.fsPath)
      if (doctorResult.ok) {
        newDoctorIssues = doctorResult.data.results.filter(
          (r) => r.status === "warn" || r.status === "fail",
        )
      }
    }

    // Compare to previous state — skip tree rebuild if nothing changed
    const snapshot = JSON.stringify({
      projects: Array.from(newProjectData.entries()),
      notFound: newNotFound,
      notRegistered: newNotRegistered,
      errors: newErrors,
      doctor: newDoctorIssues,
      tunnels: this.activeTunnels,
    })

    if (snapshot === this.lastSnapshot) return
    this.lastSnapshot = snapshot

    // Update cached state
    this.projectData = newProjectData
    this.cliErrors = newErrors
    this.notFound = newNotFound
    this.notRegistered = newNotRegistered
    this.doctorIssues = newDoctorIssues

    // Notify status bar with first successful result (stable across polls)
    if (firstResult) {
      this.onDataLoaded?.(firstResult)
    } else if (newNotRegistered) {
      this.onDataLoaded?.({
        ok: false,
        error: { kind: "not-registered", message: "Not registered" },
      })
    }

    // Adjust poll interval: fast when services are down, slow when healthy
    const anyDown = [...newProjectData.values()].some((data) =>
      Object.values(data.services).some((svc) => svc.up === false),
    )
    this.setPollInterval(
      anyDown ? OutportTreeProvider.FAST_POLL_MS : OutportTreeProvider.SLOW_POLL_MS,
    )

    this._onDidChangeTreeData.fire()
  }

  setTunnels(tunnels: TunnelInfo[]): void {
    this.activeTunnels = tunnels
    this.lastSnapshot = "" // Invalidate so next getChildren triggers refresh
    this._onDidChangeTreeData.fire()
  }

  private setPollInterval(intervalMs: number): void {
    if (this.currentPollInterval === intervalMs) return
    if (this.healthPollTimer) clearInterval(this.healthPollTimer)
    this.currentPollInterval = intervalMs
    this.healthPollTimer = setInterval(() => {
      this.refresh()
    }, intervalMs)
  }

  getTreeItem(element: OutportTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: OutportTreeItem): Promise<OutportTreeItem[]> {
    if (!element) {
      // If no data yet, trigger initial load
      if (this.lastSnapshot === "") {
        await this.refresh()
      }
      return this.getTopLevel()
    }
    if (element instanceof ProjectItem) {
      const key = `${element.projectName}/${element.instance}`
      const data = this.projectData.get(key)
      if (data) return this.getProjectChildren(key, data)
    }
    if (element instanceof ComputedHeaderItem) {
      const data = this.projectData.get(element.projectKey)
      if (data) return this.getComputedChildren(data)
    }
    if (element instanceof DoctorHeaderItem) {
      return this.doctorIssues.map((check) => new DoctorCheckItem(check))
    }
    if (element instanceof TunnelHeaderItem) {
      return this.activeTunnels.map((t) => new TunnelItem(t))
    }
    return []
  }

  private getTopLevel(): OutportTreeItem[] {
    if (this.notFound) {
      return [new MessageItem("Outport CLI not found — install from outport.dev", "warning")]
    }

    const items: OutportTreeItem[] = []

    for (const [, data] of this.projectData) {
      items.push(new ProjectItem(data.project, data.instance))
    }

    if (this.notRegistered && !items.some((i) => i instanceof ProjectItem)) {
      items.push(new MessageItem('Run "outport up" to allocate ports', "info"))
    }

    for (const { folderName, error } of this.cliErrors) {
      items.push(new MessageItem(`${folderName}: ${error.message}`, "error"))
    }

    if (items.length === 0) {
      return [new MessageItem("No .outport.yml found", "info")]
    }

    if (this.activeTunnels.length > 0) {
      items.push(new TunnelHeaderItem())
    }

    if (this.doctorIssues.length > 0) {
      items.push(new DoctorHeaderItem())
    }

    return items
  }

  private getProjectChildren(projectKey: string, data: PortsOutput): OutportTreeItem[] {
    const items: OutportTreeItem[] = []
    for (const [name, service] of Object.entries(data.services)) {
      items.push(new ServiceItem(name, service))
    }
    if (data.computed && Object.keys(data.computed).length > 0) {
      items.push(new ComputedHeaderItem(projectKey))
    }
    return items
  }

  private getComputedChildren(data: PortsOutput): OutportTreeItem[] {
    if (!data.computed) return []
    return Object.entries(data.computed).map(([name, computed]) => new ComputedItem(name, computed))
  }
}
