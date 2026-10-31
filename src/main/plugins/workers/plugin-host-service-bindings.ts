import { PLUGIN_WORKSPACE_TERMINAL_LIMIT } from '../../../shared/plugins/workers/plugin-host-api'
import {
  PluginHostInvalidParamsError,
  type PluginHostServices
} from './plugin-host-method-bindings'
import { UnknownProjectError } from '../../runtime/files/unknown-project-error'
import { PluginSecretsStore } from '../plugin-secrets-store'
import { PluginKvStore } from '../plugin-storage-store'
import type { RuntimeFileOpenPosition } from '../../../shared/runtime-file-contracts'
import type { PluginOpenLinkRequest } from '../../../shared/plugins/workers/plugin-host-links-schema'
import type {
  AgentSessionOpenOutcome,
  AgentSessionOpenTarget
} from '../../../shared/agent-session-open'
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
  openAgentSession(target: AgentSessionOpenTarget): Promise<AgentSessionOpenOutcome>
  dispatchPluginNotification(input: {
    pluginId: string
    title: string
    body?: string
  }): Promise<{ delivered: boolean }>
  openLocalAbsoluteFile(
    absolutePath: string,
    position?: RuntimeFileOpenPosition,
    /** Open as a tab of this workspace even when the file lies outside it; `projectId` outranks it with the project's own workspace. */
    options?: { activeWorktreeId?: string; projectId?: string }
  ): Promise<unknown>
}

export function bindPluginHostServices(input: {
  delegate: PluginRuntimeDelegate
  pluginsDataDir: string
  /** One plugin's toggle and checkbox values, defaults applied. */
  sidebarNavValues: (pluginKey: string) => Record<string, boolean>
  openLink?: (request: PluginOpenLinkRequest) => boolean
  /** Replaces the rows of one of the plugin's declared sidebar cards. */
  setSidebarCardItems: PluginHostServices['setSidebarCardItems']
  /** Reads and writes the plugin's settings, declared defaults and validation included. */
  settings: PluginHostServices['settings']
  /** Keeps the detail text of project item rows. */
  projectItems: PluginHostServices['projectItems']
  pickFolder?: PluginHostServices['pickFolder']
}): PluginHostServices {
  const { delegate, pluginsDataDir, openLink, pickFolder } = input
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
    openAgentSession: (target) => delegate.openAgentSession(target),
    dispatchPluginNotification: (notification) => delegate.dispatchPluginNotification(notification),
    openEditorFile: async (absolutePath, position, options) => {
      const projectId = options?.projectId
      if (projectId || options?.placement === 'active-workspace') {
        const context = await delegate.resolveActiveWorktreeContext()
        // Why: a project open falls back to the floating workspace; only a bare active-workspace request needs a focus.
        if (!context && !projectId) {
          throw new Error('no active workspace is available to open the file in')
        }
        try {
          await delegate.openLocalAbsoluteFile(absolutePath, position, {
            ...(context ? { activeWorktreeId: context.worktreeId } : {}),
            ...(projectId ? { projectId } : {})
          })
        } catch (error) {
          throw error instanceof UnknownProjectError
            ? new PluginHostInvalidParamsError('projectId: unknown project')
            : error
        }
        return { opened: true }
      }
      await delegate.openLocalAbsoluteFile(absolutePath, position)
      return { opened: true }
    },
    sidebarNavValues: input.sidebarNavValues,
    openLink: async (request) => ({ opened: openLink?.(request) ?? false }),
    setSidebarCardItems: input.setSidebarCardItems,
    projectItems: input.projectItems,
    pickFolder,
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
