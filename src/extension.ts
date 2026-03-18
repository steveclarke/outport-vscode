import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Outport');
  outputChannel.appendLine('Outport extension activated');
}

export function deactivate(): void {}
