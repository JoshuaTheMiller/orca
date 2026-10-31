import { create } from 'zustand'
import type { PluginSettingValue } from '../../../preload/api-types'

type ValuesByPlugin = Record<string, Record<string, PluginSettingValue>>

/** Declared plugin settings with defaults applied, mirrored from main; main owns the truth. */
export const usePluginSettingValuesStore = create<{ values: ValuesByPlugin }>(() => ({
  values: {}
}))

/** Key of one setting across plugins, e.g. in a gates map. */
export function pluginSettingValueKey(pluginKey: string, setting: string): string {
  return `${pluginKey}/${setting}`
}

// Why the object, not a flag: the bridge is one per window, and a replaced bridge needs its own listener.
let watched: object | null = null

function isSettingValue(value: unknown): value is PluginSettingValue {
  return typeof value === 'boolean' || typeof value === 'string'
}

function watchChanges(): void {
  const plugins = window.api?.plugins
  if (!plugins?.onSettingChanged || watched === plugins) {
    return
  }
  watched = plugins
  // Why one app-lifetime listener: values are shared by the settings page and the sidebar.
  plugins.onSettingChanged(({ pluginKey, key, value }) => {
    if (!isSettingValue(value)) {
      return
    }
    usePluginSettingValuesStore.setState((state) => ({
      values: { ...state.values, [pluginKey]: { ...state.values[pluginKey], [key]: value } }
    }))
  })
}

/** Reads one plugin's declared setting values and keeps them current as they change. */
export function loadPluginSettingValues(pluginKey: string): void {
  const plugins = window.api?.plugins
  if (!plugins?.getSettings) {
    return
  }
  watchChanges()
  void plugins
    .getSettings({ pluginKey })
    .then((loaded) => {
      const values = Object.fromEntries(Object.entries(loaded).filter(([, v]) => isSettingValue(v)))
      usePluginSettingValuesStore.setState((state) => ({
        values: { ...state.values, [pluginKey]: { ...state.values[pluginKey], ...values } }
      }))
    })
    // Why ignored: an older host has none; every setting then reads as its default.
    .catch(() => undefined)
}
