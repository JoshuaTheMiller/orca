import type { PluginHostListEntry, PluginHostSidebarNavItem } from '../../../preload/api-types'
import {
  fromPlugin,
  isLivePlugin,
  usePluginListDerived,
  type ActivePluginCommand
} from './plugin-panels'

/** A nav item from an enabled plugin, with the command it runs. `key` is unique across plugins. */
export type ActivePluginSidebarNavItem = PluginHostSidebarNavItem & {
  key: string
  pluginKey: string
  pluginName: string
  runnable: ActivePluginCommand
}

export function collectActivePluginSidebarNavItems(
  plugins: readonly PluginHostListEntry[]
): ActivePluginSidebarNavItem[] {
  return plugins.filter(isLivePlugin).flatMap((plugin) =>
    (plugin.sidebarNavItems ?? []).flatMap((item) => {
      const command = plugin.commands.find((candidate) => candidate.id === item.command)
      // Why dropped: an item whose command is not registered would be a dead button.
      return command
        ? [
            {
              ...fromPlugin(plugin, item),
              key: `${plugin.pluginKey}/${item.id}`,
              runnable: fromPlugin(plugin, command)
            }
          ]
        : []
    })
  )
}

/** Nav items of enabled plugins, sharing the plugin-list refresh. */
export function usePluginSidebarNavItems(): ActivePluginSidebarNavItem[] {
  return usePluginListDerived(collectActivePluginSidebarNavItems)
}
