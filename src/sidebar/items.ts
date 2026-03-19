import * as vscode from 'vscode';
import { ServiceJSON, ComputedJSON, DoctorCheck } from '../cli';

export class ProjectItem extends vscode.TreeItem {
  constructor(
    public readonly projectName: string,
    public readonly instance: string,
  ) {
    super(`${projectName} [${instance}]`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('globe');
  }
}

export class ServiceItem extends vscode.TreeItem {
  constructor(
    public readonly serviceName: string,
    public readonly service: ServiceJSON,
  ) {
    super(serviceName, vscode.TreeItemCollapsibleState.None);

    const isHttp = service.protocol === 'http' || service.protocol === 'https';
    const isUp = service.up === true;

    this.description = `${service.env_var}=${service.port}`;
    if (service.url) {
      this.description += `    ${service.url}`;
    }

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${serviceName}**\n\n`);
    this.tooltip.appendMarkdown(`- Port: \`${service.port}\`\n`);
    this.tooltip.appendMarkdown(`- Env var: \`${service.env_var}\`\n`);
    if (service.hostname) this.tooltip.appendMarkdown(`- Hostname: \`${service.hostname}\`\n`);
    if (service.url) this.tooltip.appendMarkdown(`- URL: ${service.url}\n`);
    if (service.up !== undefined) this.tooltip.appendMarkdown(`- Status: ${isUp ? 'listening' : 'not listening'}\n`);

    this.iconPath = new vscode.ThemeIcon(
      service.up === true ? 'pass-filled' : service.up === false ? 'circle-large-outline' : 'circle-outline',
      service.up === true ? new vscode.ThemeColor('testing.iconPassed') : service.up === false ? new vscode.ThemeColor('testing.iconFailed') : undefined,
    );

    if (isHttp && service.url) {
      this.contextValue = 'httpService';
      this.command = {
        command: 'outport.openService',
        title: 'Open in Browser',
        arguments: [service.url],
      };
    } else {
      this.contextValue = 'service';
    }
  }
}

export class ComputedHeaderItem extends vscode.TreeItem {
  constructor(public readonly projectKey: string) {
    super('Computed', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'computedHeader';
    this.iconPath = new vscode.ThemeIcon('symbol-variable');
  }
}

export class ComputedItem extends vscode.TreeItem {
  constructor(name: string, computed: ComputedJSON) {
    super(name, vscode.TreeItemCollapsibleState.None);
    // Use top-level value if present, otherwise show first per-file value
    const displayValue = computed.value
      ?? (computed.values ? Object.values(computed.values)[0] : '');
    this.description = displayValue;
    this.tooltip = computed.values
      ? Object.entries(computed.values).map(([f, v]) => `${f}: ${v}`).join('\n')
      : `${name} = ${displayValue}`;
    this.contextValue = 'computed';
    this.iconPath = new vscode.ThemeIcon('symbol-constant');
  }
}

export class DoctorHeaderItem extends vscode.TreeItem {
  constructor() {
    super('System Health', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'doctorHeader';
    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
  }
}

export class DoctorCheckItem extends vscode.TreeItem {
  constructor(check: DoctorCheck) {
    super(check.name, vscode.TreeItemCollapsibleState.None);
    this.description = check.message;
    this.tooltip = `[${check.category}] ${check.name}: ${check.message}`;
    this.contextValue = 'doctorCheck';

    if (check.status === 'fail') {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    } else {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    }
  }
}

export class MessageItem extends vscode.TreeItem {
  constructor(message: string, icon?: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'message';
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
  }
}
