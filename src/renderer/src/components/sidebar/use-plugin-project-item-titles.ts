import React from 'react'
import { loadPluginSettingValues, usePluginSettingValuesStore } from '@/store/plugin-setting-values'
import {
  resolvePluginProjectItemTitle,
  type ActivePluginProjectItem
} from '@/store/plugin-sidebar-project-items'

/** Items with `titleSetting` carrying that setting's current text as their title, updating live. */
export function usePluginProjectItemTitles(
  items: readonly ActivePluginProjectItem[]
): ActivePluginProjectItem[] {
  const stored = usePluginSettingValuesStore((s) => s.values)
  const sourcePlugins = [
    ...new Set(items.flatMap((item) => (item.titleSource ? [item.titleSource.pluginKey] : [])))
  ]
  const sourceKey = sourcePlugins.join(' ')
  React.useEffect(() => {
    for (const pluginKey of sourceKey ? sourceKey.split(' ') : []) {
      loadPluginSettingValues(pluginKey)
    }
  }, [sourceKey])
  return React.useMemo(
    () =>
      items.map((item) => {
        const source = item.titleSource
        if (!source) {
          return item
        }
        const value = stored[source.pluginKey]?.[source.setting]
        const text = typeof value === 'string' ? value : source.default
        return { ...item, title: resolvePluginProjectItemTitle(item, text, undefined) }
      }),
    [items, stored]
  )
}
