import type { PluginHostListEntry, PluginHostSidebarNavItem } from '../../../preload/api-types'
import { pluginSidebarNavValueKey } from '../../../shared/plugins/contributions/plugin-sidebar-nav-values'
import {
  fromPlugin,
  isLivePlugin,
  usePluginListDerived,
  type ActivePluginCommand
} from './plugin-panels'

type ActiveNavItemBase = Omit<
  PluginHostSidebarNavItem,
  'kind' | 'command' | 'setting' | 'default'
> & {
  /** Unique across plugins. */
  key: string
  pluginKey: string
  pluginName: string
  /** Key of the toggle this item shows under, when it has a parent. */
  parentKey?: string
}

/** A nav item that runs one of the plugin's commands. */
export type ActivePluginSidebarCommandItem = ActiveNavItemBase & {
  kind?: 'command'
  runnable: ActivePluginCommand
}

/** A toggle or checkbox; its value lives in `pluginSidebarNavValues` under `valueKey`. */
export type ActivePluginSidebarStateItem = ActiveNavItemBase & {
  kind: 'toggle' | 'checkbox'
  valueKey: string
  setting: string
  default: boolean
}

export type ActivePluginSidebarNavItem =
  | ActivePluginSidebarCommandItem
  | ActivePluginSidebarStateItem

export function collectActivePluginSidebarNavItems(
  plugins: readonly PluginHostListEntry[]
): ActivePluginSidebarNavItem[] {
  return plugins.filter(isLivePlugin).flatMap((plugin) =>
    (plugin.sidebarNavItems ?? []).flatMap((item): ActivePluginSidebarNavItem[] => {
      const { kind, command: commandId, setting, default: initial, parent, ...shown } = item
      const base = {
        ...fromPlugin(plugin, shown),
        key: `${plugin.pluginKey}/${item.id}`,
        ...(parent ? { parentKey: `${plugin.pluginKey}/${parent}` } : {})
      }
      if ((kind === 'toggle' || kind === 'checkbox') && setting !== undefined) {
        return [
          {
            ...base,
            kind,
            setting,
            default: initial ?? false,
            valueKey: pluginSidebarNavValueKey(plugin.pluginKey, setting)
          }
        ]
      }
      const command = plugin.commands.find((candidate) => candidate.id === commandId)
      // Why dropped: an item whose command is not registered would be a dead button.
      return command ? [{ ...base, runnable: fromPlugin(plugin, command) }] : []
    })
  )
}

/** Nav items of enabled plugins, sharing the plugin-list refresh. */
export function usePluginSidebarNavItems(): ActivePluginSidebarNavItem[] {
  return usePluginListDerived(collectActivePluginSidebarNavItems)
}
