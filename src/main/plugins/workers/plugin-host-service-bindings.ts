import { PLUGIN_WORKSPACE_TERMINAL_LIMIT } from '../../../shared/plugins/workers/plugin-host-api'
import type { PluginHostServices } from './plugin-host-methods'
import { PluginSecretsStore } from '../plugin-secrets-store'
import { PluginKvStore } from '../plugin-storage-store'
import type { RuntimeFileOpenPosition } from '../../../shared/runtime-file-contracts'
import type { TerminalInputKind } from '../../../shared/terminal-input-kind'

export type PluginRuntimeDelegate = {
  resolveActiveWorktreeContext(): Promise<{
    worktreeId: string
    path: string
    branch: string
    displayName: string
  } | null>
  listTerminals(
    worktreeSelector?: string,
    limit?: number,
    opts?: { includeVisualLayouts?: boolean }
  ): Promise<{ terminals: { handle: string; title: string | null }[] }>
  sendTerminal(
    handle: string,
    action: { text?: string; enter?: boolean },
    options: { inputKind: TerminalInputKind }
  ): Promise<{ accepted: boolean }>
  dispatchPluginNotification(input: {
    pluginId: string
    title: string
    body?: string
  }): Promise<{ delivered: boolean }>
  openLocalAbsoluteFile(
    absolutePath: string,
    position?: RuntimeFileOpenPosition,
    /** Open as a tab of this workspace even when the file lies outside it. */
    options?: { activeWorktreeId?: string }
  ): Promise<unknown>
}

export function bindPluginHostServices(input: {
  delegate: PluginRuntimeDelegate
  pluginsDataDir: string
  /** One plugin's toggle and checkbox values, defaults applied. */
  sidebarNavValues: (pluginKey: string) => Record<string, boolean>
  /** Reads and writes the plugin's settings, declared defaults and validation included. */
  settings: PluginHostServices['settings']
  /** Keeps the detail text of project item rows. */
  projectItems: PluginHostServices['projectItems']
}): PluginHostServices {
  const { delegate, pluginsDataDir } = input
  return {
    resolveActiveWorktreeContext: async () => {
      const context = await delegate.resolveActiveWorktreeContext()
      if (!context) {
        return null
      }
      // Retain path-bearing worktree IDs for host membership checks; public projections exclude them.
      return {
        worktreeId: context.worktreeId,
        branch: context.branch,
        displayName: context.displayName
      }
    },
    listWorktreeTerminals: async (worktreeId) => {
      const result = await delegate.listTerminals(
        `id:${worktreeId}`,
        PLUGIN_WORKSPACE_TERMINAL_LIMIT,
        { includeVisualLayouts: false }
      )
      return result.terminals
        .slice(0, PLUGIN_WORKSPACE_TERMINAL_LIMIT)
        .map((terminal) => ({ id: terminal.handle }))
    },
    sendTerminalText: async (terminalId, action) => {
      const result = await delegate.sendTerminal(terminalId, action, { inputKind: 'driving' })
      return { accepted: result.accepted }
    },
    dispatchPluginNotification: (notification) => delegate.dispatchPluginNotification(notification),
    openEditorFile: async (absolutePath, position, placement) => {
      if (placement === 'active-workspace') {
        const context = await delegate.resolveActiveWorktreeContext()
        if (!context) {
          throw new Error('no active workspace is available to open the file in')
        }
        await delegate.openLocalAbsoluteFile(absolutePath, position, {
          activeWorktreeId: context.worktreeId
        })
        return { opened: true }
      }
      await delegate.openLocalAbsoluteFile(absolutePath, position)
      return { opened: true }
    },
    sidebarNavValues: input.sidebarNavValues,
    projectItems: input.projectItems,
    storage: {
      get: (key, itemKey) => new PluginKvStore(pluginsDataDir, key, 'storage.json').get(itemKey),
      set: (key, itemKey, value) =>
        new PluginKvStore(pluginsDataDir, key, 'storage.json').set(itemKey, value),
      delete: (key, itemKey) =>
        new PluginKvStore(pluginsDataDir, key, 'storage.json').delete(itemKey),
      keys: (key) => new PluginKvStore(pluginsDataDir, key, 'storage.json').keys()
    },
    secrets: {
      get: (key, itemKey) => new PluginSecretsStore(pluginsDataDir, key).get(itemKey),
      set: (key, itemKey, value) => new PluginSecretsStore(pluginsDataDir, key).set(itemKey, value),
      delete: (key, itemKey) => new PluginSecretsStore(pluginsDataDir, key).delete(itemKey)
    },
    settings: input.settings
  }
}
