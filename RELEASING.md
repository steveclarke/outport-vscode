# Releasing

## Steps

1. **Bump version** in `package.json`
2. **Compile and test**
   ```bash
   npm run compile && npm run test
   ```
3. **Package the VSIX**
   ```bash
   npx vsce package
   ```
   This produces `outport-<version>.vsix` in the repo root.
4. **Commit and tag**
   ```bash
   git add package.json
   git commit -m "chore: bump to v<version>"
   git tag v<version>
   git push && git push --tags
   ```
5. **Upload to the marketplace**
   Go to https://marketplace.visualstudio.com/manage/publishers/steveclarke and upload the `.vsix` file.

## Notes

- `.vsix` files are gitignored — leave them in place after packaging.
- We don't use `vsce publish` (no PAT configured). Upload via the web UI instead.
- Version scheme: bump minor for new features or breaking changes, patch for fixes.
