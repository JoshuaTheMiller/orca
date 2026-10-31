import { useEffect, useMemo } from 'react'
import {
  loadPluginSettingValues,
  pluginSettingValueKey,
  usePluginSettingValuesStore
} from './plugin-setting-values'

/** Values of the plugin settings that contributions wait on (`when`), kept current as they change. */
export function usePluginSettingGates(
  items: readonly { gate?: { pluginKey: string } }[]
): Readonly<Record<string, boolean>> {
  const stored = usePluginSettingValuesStore((s) => s.values)
  const gatedPlugins = [
    ...new Set(items.flatMap((item) => (item.gate ? [item.gate.pluginKey] : [])))
  ]
  const gatedKey = gatedPlugins.join(' ')
  useEffect(() => {
    for (const pluginKey of gatedKey ? gatedKey.split(' ') : []) {
      loadPluginSettingValues(pluginKey)
    }
  }, [gatedKey])
  return useMemo(() => {
    const gates: Record<string, boolean> = {}
    for (const [pluginKey, values] of Object.entries(stored)) {
      for (const [setting, value] of Object.entries(values)) {
        if (typeof value === 'boolean') {
          gates[pluginSettingValueKey(pluginKey, setting)] = value
        }
      }
    }
    return gates
  }, [stored])
}
