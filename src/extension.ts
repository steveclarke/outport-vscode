import * as vscode from 'vscode';
import { getPorts, runUp, runDown } from './cli';
import { OutportTreeProvider } from './sidebar/provider';
import { createStatusBar, updateStatusBar } from './statusbar';
import { createRegistryWatcher } from './watcher';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Outport');

  vscode.commands.executeCommand('setContext', 'outport.active', true);

  const statusBar = createStatusBar(context);

  const treeProvider = new OutportTreeProvider(outputChannel, (result) => {
    updateStatusBar(result);
  });
  vscode.window.registerTreeDataProvider('outportView', treeProvider);

  const refresh = () => {
    treeProvider.refresh();
  };

  const watcher = createRegistryWatcher(() => refresh());
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.commands.registerCommand('outport.refresh', () => refresh()),

    vscode.commands.registerCommand('outport.up', async () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!cwd) return;
      outputChannel.appendLine('> outport up');
      outputChannel.show(true);
      const result = await runUp(cwd, false);
      if (result.ok) {
        outputChannel.appendLine(result.data);
      } else {
        outputChannel.appendLine(`Error: ${result.error.message}`);
      }
      refresh();
    }),

    vscode.commands.registerCommand('outport.upForce', async () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!cwd) return;
      outputChannel.appendLine('> outport up --force');
      outputChannel.show(true);
      const result = await runUp(cwd, true);
      if (result.ok) {
        outputChannel.appendLine(result.data);
      } else {
        outputChannel.appendLine(`Error: ${result.error.message}`);
      }
      refresh();
    }),

    vscode.commands.registerCommand('outport.down', async () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!cwd) return;
      outputChannel.appendLine('> outport down');
      outputChannel.show(true);
      const result = await runDown(cwd);
      if (result.ok) {
        outputChannel.appendLine(result.data);
      } else {
        outputChannel.appendLine(`Error: ${result.error.message}`);
      }
      refresh();
    }),

    vscode.commands.registerCommand('outport.openService', (urlOrItem: string | any) => {
      const url = typeof urlOrItem === 'string' ? urlOrItem : urlOrItem?.service?.url;
      if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),

    vscode.commands.registerCommand('outport.copyPort', (item: any) => {
      if (item?.service?.port) {
        vscode.env.clipboard.writeText(String(item.service.port));
      }
    }),

    vscode.commands.registerCommand('outport.copyUrl', (item: any) => {
      if (item?.service?.url) {
        vscode.env.clipboard.writeText(item.service.url);
      }
    }),

    vscode.commands.registerCommand('outport.copyEnvVar', (item: any) => {
      if (item?.service) {
        vscode.env.clipboard.writeText(`${item.service.env_var}=${item.service.port}`);
      }
    }),
  );

  // Populate the status bar immediately on activation, without waiting
  // for the user to open the sidebar panel
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (cwd) {
    getPorts(cwd).then((result) => updateStatusBar(result));
  }

  outputChannel.appendLine('Outport extension activated');
}

export function deactivate(): void {}
