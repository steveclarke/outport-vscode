<p align="center">
  <a href="https://outport.app">
    <img src="brand/logo-horizontal-color-600.png" width="280" alt="Outport">
  </a>
</p>

# Outport for VS Code

**See your [Outport](https://outport.app) ports, URLs, and service health right in VS Code.**

<p align="center">
  <img src="docs/images/sidebar.png" width="360" alt="Outport sidebar showing services, ports, health status, and computed values">
</p>

## Features

- **Sidebar panel** — Services, ports, URLs, hostname aliases, and health indicators in the Activity Bar
- **Clickable URLs** — Click any HTTP service to open it in your browser
- **Copy to clipboard** — Right-click to copy ports, URLs, or env var assignments
- **Sharing** — Start and stop Cloudflare tunnels to share services publicly
- **Status bar** — Shows your project name and instance at a glance
- **System health** — Runs `outport doctor` and surfaces warnings in the sidebar
- **Config authoring** — Schema validation, template autocomplete (`${service.port}`, `${service.alias.label}`, `${instance}`, etc.), hover with live resolved values, and go-to-definition for service references
- **Auto-refresh** — Sidebar updates when you run `outport up` or `outport down`, or when external changes are detected

## Requirements

- [Outport CLI](https://outport.app) installed and on your `$PATH`
- [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for config authoring features

## Commands

All commands are available from the Command Palette (Cmd+Shift+P):

| Command | Description |
|---------|-------------|
| **Outport: Run Up** | Allocate ports and write `.env` files |
| **Outport: Run Up --force** | Re-allocate all ports from scratch |
| **Outport: Run Down** | Remove project from registry and clean `.env` files |
| **Outport: Share** | Create public tunnel URLs for HTTP services |
| **Outport: Stop Sharing** | Stop sharing and close tunnels |
| **Outport: Refresh** | Refresh the sidebar panel |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `outport.binaryPath` | `outport` | Path to the outport binary |

## Development

```bash
npm install           # Install dependencies
```

Then press F5 in VS Code to launch the Extension Development Host.

## License

MIT
