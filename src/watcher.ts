import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

export function createRegistryWatcher(onChanged: () => void): vscode.Disposable {
  const registryDir = path.join(os.homedir(), '.local', 'share', 'outport');

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(registryDir), '*.json'),
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const debouncedRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChanged, 150);
  };

  watcher.onDidChange(debouncedRefresh);
  watcher.onDidCreate(debouncedRefresh);
  watcher.onDidDelete(debouncedRefresh);

  return watcher;
}
