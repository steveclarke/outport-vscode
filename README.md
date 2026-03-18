# Outport for VS Code

See your [Outport](https://outport.dev) ports, URLs, and service health right in VS Code.

## Features

- **Sidebar panel** — Services, ports, URLs, and health indicators in the Explorer sidebar
- **Clickable URLs** — Click any HTTP service to open it in your browser
- **Copy to clipboard** — Right-click to copy ports, URLs, or env var assignments
- **Status bar** — Shows your project name and instance at a glance
- **Config authoring** — Autocomplete and validation for `.outport.yml`
- **Auto-refresh** — Sidebar updates when you run `outport up` or `outport down`

## Requirements

- [Outport CLI](https://outport.dev) installed and on your `$PATH`
- [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for config authoring features

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `outport.binaryPath` | `outport` | Path to the outport binary |

## Commands

All commands are available from the Command Palette (Cmd+Shift+P):

- **Outport: Run Up** — Allocate ports and write `.env` files
- **Outport: Run Up --force** — Re-allocate all ports from scratch
- **Outport: Run Down** — Remove project from registry and clean `.env` files
- **Outport: Refresh** — Refresh the sidebar panel
