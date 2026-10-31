import type { PluginHostListEntry } from '../../../preload/api-types'
import {
  fromPlugin,
  isLivePlugin,
  usePluginListDerived,
  type ActivePluginCommand
} from './plugin-panels'
import { pluginSettingValueKey } from './plugin-setting-values'
import { gateFor, type PluginSettingGate } from './plugin-sidebar-nav-items'

/** A project item of an enabled plugin, with the command it runs. */
export type ActivePluginProjectItem = {
  /** Unique across plugins: `<pluginKey>/<itemId>`; also the key hidden items are stored under. */
  key: string
  id: string
  title: string
  /** Lucide icon name from the closed panel icon set; absent means the default. */
  icon?: string
  /** Slot of its SVG icon, read with readContributionSvgIcon; absent for a built-in name. */
  svgIconSlot?: string
  pluginKey: string
  pluginName: string
  runnable: ActivePluginCommand
  /** The boolean plugin setting that must be true for the item to show. */
  gate?: PluginSettingGate
  /** The string plugin setting whose value is the default title; `default` holds until it loads. */
  titleSource?: { valueKey: string; pluginKey: string; setting: string; default: string }
}

/** Title the user gave one project's row, if any. */
export function pluginProjectItemTitleKey(itemKey: string, projectId: string): string {
  return `${itemKey}/${projectId}`
}

/** The row title: the user's name for this project, else the title setting's text, else the manifest title. */
export function resolvePluginProjectItemTitle(
  item: Pick<ActivePluginProjectItem, 'title'>,
  settingText: string | undefined,
  override: string | undefined
): string {
  return override?.trim() || settingText?.trim() || item.title
}

function titleSourceFor(
  plugin: PluginHostListEntry,
  setting: string
): NonNullable<ActivePluginProjectItem['titleSource']> {
  const declared = plugin.settings?.find((candidate) => candidate.id === setting)
  return {
    valueKey: pluginSettingValueKey(plugin.pluginKey, setting),
    pluginKey: plugin.pluginKey,
    setting,
    default:
      declared?.type === 'string' && typeof declared.default === 'string' ? declared.default : ''
  }
}

export function collectActivePluginProjectItems(
  plugins: readonly PluginHostListEntry[]
): ActivePluginProjectItem[] {
  return plugins.filter(isLivePlugin).flatMap((plugin) =>
    (plugin.projectItems ?? []).flatMap((item): ActivePluginProjectItem[] => {
      const command = plugin.commands.find((candidate) => candidate.id === item.command)
      // Why dropped: an item whose command is not registered would be a dead row under every project.
      if (!command) {
        return []
      }
      return [
        {
          key: `${plugin.pluginKey}/${item.id}`,
          id: item.id,
          title: item.title,
          ...(item.icon ? { icon: item.icon } : {}),
          ...(item.svgIconSlot ? { svgIconSlot: item.svgIconSlot } : {}),
          pluginKey: plugin.pluginKey,
          pluginName: plugin.name,
          runnable: fromPlugin(plugin, command),
          ...(item.when === undefined ? {} : { gate: gateFor(plugin, item.when) }),
          ...(item.titleSetting === undefined
            ? {}
            : { titleSource: titleSourceFor(plugin, item.titleSetting) })
        }
      ]
    })
  )
}

/** Items the user has not hidden and whose `when` setting is on (a gate not loaded reads as its default). */
export function visiblePluginProjectItems(
  items: readonly ActivePluginProjectItem[],
  hidden: readonly string[],
  gates: Readonly<Record<string, boolean>>
): ActivePluginProjectItem[] {
  return items.filter(
    (item) =>
      !hidden.includes(item.key) &&
      (item.gate === undefined || (gates[item.gate.valueKey] ?? item.gate.default))
  )
}

/** Project items of enabled plugins, sharing the plugin-list refresh. */
export function usePluginProjectItems(): ActivePluginProjectItem[] {
  return usePluginListDerived(collectActivePluginProjectItems)
}
