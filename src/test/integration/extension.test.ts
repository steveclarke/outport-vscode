import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration', () => {
  test('extension should be present', () => {
    const ext = vscode.extensions.getExtension('steveclarke.outport');
    assert.ok(ext, 'Extension not found');
  });

  test('extension should activate', async () => {
    const ext = vscode.extensions.getExtension('steveclarke.outport')!;
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('commands should be registered', async () => {
    const ext = vscode.extensions.getExtension('steveclarke.outport')!;
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('outport.refresh'), 'Missing outport.refresh');
    assert.ok(commands.includes('outport.up'), 'Missing outport.up');
    assert.ok(commands.includes('outport.down'), 'Missing outport.down');
    assert.ok(commands.includes('outport.openService'), 'Missing outport.openService');
  });
});
