import type { PluginWorkerFactory } from './workers/plugin-worker-manager'
import type { KeybindingOverrides } from '../../shared/keybindings'
import type { PluginJsonValue } from '../../shared/plugins/workers/plugin-host-api'
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
  /** The user's stored sidebar toggle and checkbox values, keyed `<pluginKey>/<setting>`. */
  getSidebarNavValues?: () => Record<string, boolean>
  /** Called after a plugin setting takes a new value, whoever changed it, so windows can follow. */
  onPluginSettingChanged?: (change: {
    pluginKey: string
    key: string
    value: PluginJsonValue
  }) => void
  getPluginKillListEntry?: (pluginKey: string) => PluginKillListEntry | null
  hostEntryPath?: string
  /** Opens a web link in the window that owns the link settings; false when none can. */
  openLink?: (request: PluginOpenLinkRequest) => boolean
  workerFactory?: PluginWorkerFactory
  maxActiveWorkers?: number
  idleReapMs?: number
}
