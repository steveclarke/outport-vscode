import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'unitTests',
    files: 'out/test/unit/**/*.test.js',
    mocha: { ui: 'tdd', timeout: 5000 },
  },
  {
    label: 'integrationTests',
    files: 'out/test/integration/**/*.test.js',
    workspaceFolder: './test-fixtures/workspace',
    mocha: { ui: 'tdd', timeout: 20000 },
  },
]);
