import * as vscode from 'vscode';
import { getPorts, CliResult, PortsOutput } from '../cli';
import { ProjectItem, ServiceItem, ComputedHeaderItem, ComputedItem, MessageItem } from './items';

type OutportTreeItem = ProjectItem | ServiceItem | ComputedHeaderItem | ComputedItem | MessageItem;

export class OutportTreeProvider implements vscode.TreeDataProvider<OutportTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OutportTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projectData: Map<string, PortsOutput> = new Map();
  private outputChannel: vscode.OutputChannel;
  private onDataLoaded?: (result: CliResult<PortsOutput>) => void;

  constructor(outputChannel: vscode.OutputChannel, onDataLoaded?: (result: CliResult<PortsOutput>) => void) {
    this.outputChannel = outputChannel;
    this.onDataLoaded = onDataLoaded;
  }

  refresh(): void {
    this.projectData.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: OutportTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: OutportTreeItem): Promise<OutportTreeItem[]> {
    if (!element) {
      return this.getTopLevel();
    }
    if (element instanceof ProjectItem) {
      const key = `${element.projectName}/${element.instance}`;
      const data = this.projectData.get(key);
      if (data) return this.getProjectChildren(key, data);
    }
    if (element instanceof ComputedHeaderItem) {
      const data = this.projectData.get(element.projectKey);
      if (data) return this.getComputedChildren(data);
    }
    return [];
  }

  private async getTopLevel(): Promise<OutportTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return [new MessageItem('No workspace folder open', 'warning')];
    }

    const items: OutportTreeItem[] = [];
    const seen = new Set<string>();
    for (const folder of folders) {
      const result = await getPorts(folder.uri.fsPath);
      if (result.ok) {
        const key = `${result.data.project}/${result.data.instance}`;
        // Deduplicate — multiple workspace folders may resolve to the same project
        if (seen.has(key)) continue;
        seen.add(key);
        this.projectData.set(key, result.data);
        items.push(new ProjectItem(result.data.project, result.data.instance));
        this.onDataLoaded?.(result);
      } else if (result.error.kind === 'not-found') {
        return [new MessageItem('Outport CLI not found — install from outport.dev', 'warning')];
      } else if (result.error.kind === 'not-registered') {
        // Only show once per workspace, not per folder
        if (!seen.has('not-registered')) {
          seen.add('not-registered');
          items.push(new MessageItem('Run "outport up" to allocate ports', 'info'));
        }
      } else {
        this.outputChannel.appendLine(`[error] ${folder.name}: ${result.error.message}`);
        items.push(new MessageItem(`${folder.name}: ${result.error.message}`, 'error'));
      }
    }

    if (items.length === 0) {
      return [new MessageItem('No .outport.yml found', 'info')];
    }

    return items;
  }

  private getProjectChildren(projectKey: string, data: PortsOutput): OutportTreeItem[] {
    const items: OutportTreeItem[] = [];
    for (const [name, service] of Object.entries(data.services)) {
      items.push(new ServiceItem(name, service));
    }
    if (data.computed && Object.keys(data.computed).length > 0) {
      items.push(new ComputedHeaderItem(projectKey));
    }
    return items;
  }

  private getComputedChildren(data: PortsOutput): OutportTreeItem[] {
    if (!data.computed) return [];
    return Object.entries(data.computed).map(
      ([name, computed]) => new ComputedItem(name, computed),
    );
  }
}
