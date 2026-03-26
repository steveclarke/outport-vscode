import * as vscode from "vscode"
import { getPorts } from "./cli"
import {
  OUTPORT_SELECTOR,
  TEMPLATE_FIELDS,
  TEMPLATE_MODIFIERS,
  STANDALONE_VARS,
  parseOutportConfig,
} from "./schema"

/** Get the template expression at the cursor, e.g. "${rails.url:direct}" */
function getTemplateContext(document: vscode.TextDocument, position: vscode.Position) {
  const line = document.lineAt(position).text
  // Find the ${ that precedes the cursor
  const beforeCursor = line.substring(0, position.character)
  const openIdx = beforeCursor.lastIndexOf("${")
  if (openIdx === -1) return undefined

  const afterOpen = line.substring(openIdx + 2)
  const closeIdx = afterOpen.indexOf("}")
  const endIdx = closeIdx === -1 ? afterOpen.length : closeIdx
  const inner = afterOpen.substring(0, endIdx)

  return { inner, openIdx, endIdx: openIdx + 2 + endIdx }
}

// --- Completion Provider ---

class OutportCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    const ctx = getTemplateContext(document, position)
    if (!ctx) return undefined

    const config = parseOutportConfig(document)
    if (!config?.services) return undefined

    const serviceNames = Object.keys(config.services)
    const { inner, openIdx } = ctx
    const line = position.line

    // After "${service.field:" — suggest modifiers
    const modMatch = inner.match(/^(\w+)\.(\w+):(\w*)$/)
    if (modMatch) {
      const [, svcName, field, partial] = modMatch
      const colonIdx = openIdx + 2 + svcName.length + 1 + field.length + 1
      const replaceRange = new vscode.Range(line, colonIdx, line, colonIdx + partial.length)
      const mods = TEMPLATE_MODIFIERS[field]
      if (!mods) return []
      return mods.map((m) => {
        const item = new vscode.CompletionItem(m, vscode.CompletionItemKind.Value)
        item.detail = `${field}:${m}`
        item.range = replaceRange
        return item
      })
    }

    // After "${service.alias." or "${service.alias_url." — suggest alias labels
    const aliasLabelMatch = inner.match(/^(\w+)\.(alias|alias_url)\.(\w*)$/)
    if (aliasLabelMatch) {
      const [, svcName, aliasField, partial] = aliasLabelMatch
      const svc = config.services[svcName]
      if (!svc?.aliases) return []
      const dotIdx = openIdx + 2 + svcName.length + 1 + aliasField.length + 1
      const replaceRange = new vscode.Range(line, dotIdx, line, dotIdx + partial.length)
      return Object.keys(svc.aliases).map((label) => {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value)
        item.detail = `\${${svcName}.${aliasField}.${label}}`
        item.range = replaceRange
        return item
      })
    }

    // After "${service." — suggest fields + alias/alias_url
    const fieldMatch = inner.match(/^(\w+)\.(\w*)$/)
    if (fieldMatch) {
      const [, svcName, partial] = fieldMatch
      if (!config.services[svcName]) return []
      const dotIdx = openIdx + 2 + svcName.length + 1
      const replaceRange = new vscode.Range(line, dotIdx, line, dotIdx + partial.length)
      const items = TEMPLATE_FIELDS.map((f) => {
        const item = new vscode.CompletionItem(f, vscode.CompletionItemKind.Field)
        item.detail = `\${${svcName}.${f}}`
        item.range = replaceRange
        return item
      })
      // Add alias/alias_url if service has aliases
      const svc = config.services[svcName]
      if (svc.aliases) {
        for (const field of ["alias", "alias_url"]) {
          const item = new vscode.CompletionItem(field, vscode.CompletionItemKind.Field)
          item.detail = `\${${svcName}.${field}.LABEL}`
          item.range = replaceRange
          item.command = { command: "editor.action.triggerSuggest", title: "" }
          items.push(item)
        }
      }
      return items
    }

    // After "${" — suggest service names and standalone vars
    const prefixMatch = inner.match(/^(\w*)$/)
    if (prefixMatch) {
      const [, partial] = prefixMatch
      const startIdx = openIdx + 2
      const replaceRange = new vscode.Range(line, startIdx, line, startIdx + partial.length)
      const items: vscode.CompletionItem[] = []
      for (const name of serviceNames) {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module)
        item.detail = "service"
        item.range = replaceRange
        item.command = { command: "editor.action.triggerSuggest", title: "" }
        items.push(item)
      }
      for (const v of STANDALONE_VARS) {
        const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable)
        item.detail = "standalone variable"
        item.range = replaceRange
        items.push(item)
      }
      return items
    }

    return undefined
  }
}

// --- Hover Provider ---

class OutportHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const ctx = getTemplateContext(document, position)
    if (!ctx) return undefined

    const config = parseOutportConfig(document)
    if (!config?.services) return undefined

    const { inner, openIdx, endIdx } = ctx
    const line = position.line
    const range = new vscode.Range(line, openIdx, line, endIdx + 1) // include ${ and }

    // Match ${service.alias.label} or ${service.alias_url.label}
    const aliasMatch = inner.match(/^(\w+)\.(alias|alias_url)\.(\w+)$/)
    if (aliasMatch) {
      const [, svcName, field, label] = aliasMatch
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (cwd) {
        const result = await getPorts(cwd)
        if (result.ok) {
          const liveSvc = result.data.services[svcName]
          if (liveSvc?.aliases?.[label]) {
            const alias = liveSvc.aliases[label]
            const value = field === "alias" ? alias.hostname : alias.url
            if (value) {
              const md = new vscode.MarkdownString()
              md.appendCodeblock(value, "text")
              md.appendMarkdown(`\n\n*\`\${${inner}}\` — resolved from registry*`)
              return new vscode.Hover(md, range)
            }
          }
        }
      }
      const md = new vscode.MarkdownString()
      md.appendMarkdown(`**\${${inner}}**\n\n`)
      md.appendMarkdown(`Service: \`${svcName}\`  \nAlias: \`${label}\`  \nField: \`${field}\``)
      return new vscode.Hover(md, range)
    }

    // Match ${service.field} or ${service.field:modifier}
    const refMatch = inner.match(/^(\w+)\.(\w+)(?::(\w+))?$/)
    if (refMatch) {
      const [, svcName, field, modifier] = refMatch
      const svc = config.services[svcName]
      if (!svc) return new vscode.Hover(`Unknown service: \`${svcName}\``, range)

      // Try to get live resolved value from registry
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (cwd) {
        const result = await getPorts(cwd)
        if (result.ok) {
          const liveSvc = result.data.services[svcName]
          if (liveSvc) {
            let value: string | undefined
            if (field === "port") value = String(liveSvc.port)
            else if (field === "hostname") value = liveSvc.hostname
            else if (field === "env_var") value = liveSvc.env_var
            else if (field === "url" && modifier === "direct") {
              value = liveSvc.port ? `http://localhost:${liveSvc.port}` : undefined
            } else if (field === "url") value = liveSvc.url

            if (value) {
              const md = new vscode.MarkdownString()
              md.appendCodeblock(value, "text")
              md.appendMarkdown(`\n\n*\`\${${inner}}\` → resolved from registry*`)
              return new vscode.Hover(md, range)
            }
          }
        }
      }

      // Fallback: show field info
      const md = new vscode.MarkdownString()
      md.appendMarkdown(`**\${${inner}}**\n\n`)
      md.appendMarkdown(`Service: \`${svcName}\`  \nField: \`${field}\``)
      if (modifier) md.appendMarkdown(`  \nModifier: \`${modifier}\``)
      return new vscode.Hover(md, range)
    }

    // Match standalone ${instance} or ${project_name}
    const standaloneMatch = inner.match(/^(\w+)$/)
    if (standaloneMatch) {
      const varName = standaloneMatch[1]
      if (STANDALONE_VARS.includes(varName)) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (cwd) {
          const result = await getPorts(cwd)
          if (result.ok) {
            const md = new vscode.MarkdownString()
            if (varName === "instance") {
              md.appendCodeblock(result.data.instance, "text")
              md.appendMarkdown(`\n\n*\`\${instance}\` — current instance name*`)
            } else if (varName === "project_name") {
              md.appendCodeblock(result.data.project, "text")
              md.appendMarkdown(`\n\n*\`\${project_name}\` — project name from outport.yml*`)
            }
            return new vscode.Hover(md, range)
          }
        }
        if (varName === "instance") {
          return new vscode.Hover(`\`\${instance}\` — current instance name (e.g. "main")`, range)
        }
        if (varName === "project_name") {
          return new vscode.Hover(`\`\${project_name}\` — project name from outport.yml`, range)
        }
      }
    }

    return undefined
  }
}

// --- Definition Provider ---

class OutportDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location | undefined {
    const ctx = getTemplateContext(document, position)
    if (!ctx) return undefined

    const { inner } = ctx
    const refMatch = inner.match(/^(\w+)\.(\w+)(?::(\w+))?$/)
    if (!refMatch) return undefined

    const svcName = refMatch[1]
    const text = document.getText()
    const lines = text.split("\n")

    // Find the service definition line
    let inServices = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("services:")) {
        inServices = true
        continue
      }
      if (inServices) {
        const match = lines[i].match(new RegExp(`^  ${svcName}:`))
        if (match) {
          return new vscode.Location(document.uri, new vscode.Position(i, 2))
        }
        // Left services block
        if (lines[i].trim() !== "" && !/^\s/.test(lines[i])) {
          break
        }
      }
    }

    return undefined
  }
}

// --- Registration ---

export function registerTemplateIntelligence(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      OUTPORT_SELECTOR,
      new OutportCompletionProvider(),
      "$",
      "{",
      ".",
      ":",
    ),
    vscode.languages.registerHoverProvider(OUTPORT_SELECTOR, new OutportHoverProvider()),
    vscode.languages.registerDefinitionProvider(OUTPORT_SELECTOR, new OutportDefinitionProvider()),
  )
}
