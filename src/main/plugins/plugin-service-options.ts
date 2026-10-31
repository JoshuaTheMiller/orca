import type { PluginWorkerFactory } from './workers/plugin-worker-manager'
import type { KeybindingOverrides } from '../../shared/keybindings'
import type { PluginKillListEntry } from '../../shared/plugins/catalog/plugin-kill-list'

import type { PluginOpenLinkRequest } from '../../shared/plugins/workers/plugin-host-links-schema'

export type PluginServiceOptions = {
  userDataPath: string
  hostVersion: string
  isPluginSystemEnabled: () => boolean
  getDisabledPlugins: () => string[]
  getPluginConsents: () => Record<string, string>
  getDevPluginPaths: () => string[]
  getKeybindings?: () => KeybindingOverrides
  getPluginKillListEntry?: (pluginKey: string) => PluginKillListEntry | null
  hostEntryPath?: string
  /** Opens a web link in the window that owns the link settings; false when none can. */
  openLink?: (request: PluginOpenLinkRequest) => boolean
  workerFactory?: PluginWorkerFactory
  maxActiveWorkers?: number
  idleReapMs?: number
}
