# Releasing

## Steps

1. Bump the version in `package.json`
2. Commit and push
3. Package the extension:
   ```bash
   npx @vscode/vsce package
   ```
4. Upload the `.vsix` at https://marketplace.visualstudio.com/manage
5. Create a GitHub release:
   ```bash
   gh release create v<version> --title "v<version>" --notes "Release notes here" ./outport-<version>.vsix
   ```
6. Clean up:
   ```bash
   rm *.vsix
   ```
