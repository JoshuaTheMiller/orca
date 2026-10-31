import type { PluginSettingContribution } from '../../shared/plugins/contributions/plugin-setting-contribution'
import {
  pluginSettingValueIssue,
  resolvePluginSettings
} from '../../shared/plugins/contributions/plugin-setting-values'
import type { PluginJsonValue } from '../../shared/plugins/workers/plugin-host-api'
import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import { getPluginsDataDir } from './plugin-discovery'
import { PluginKvStore, type PluginKvWriteResult } from './plugin-storage-store'

export type PluginSettingChange = { pluginKey: string; key: string; value: PluginJsonValue }

/** `invalid` marks a value the declaration refuses, so callers answer `invalid_params` rather than a failure. */
export type PluginSettingWriteResult =
  | PluginKvWriteResult
  | { ok: false; error: string; invalid: true }

export type PluginSettingsAccess = {
  /** Stored values with declared defaults applied; keys written with `settings.set` come along. */
  getAll(pluginKey: string): Record<string, PluginJsonValue>
  /** Writes one key. A declared key must fit its declaration; an effective change is announced. */
  set(pluginKey: string, key: string, value: PluginJsonValue): PluginSettingWriteResult
  /** Drops the stored value of a declared key, so it reads as its default again. */
  reset(pluginKey: string, key: string): PluginSettingWriteResult
}

/**
 * The one door to a plugin's `settings.json`, shared by `settings.get`/`settings.set` and by Orca's
 * settings UI, so declared and untyped settings live in the same store and every change is
 * announced from the same place.
 */
export function createPluginSettingsAccess(deps: {
  pluginsDataDir: string
  declared: (pluginKey: string) => readonly PluginSettingContribution[]
  onChanged: (change: PluginSettingChange) => void
}): PluginSettingsAccess {
  const store = (pluginKey: string): PluginKvStore =>
    new PluginKvStore(deps.pluginsDataDir, pluginKey, 'settings.json')
  const effective = (pluginKey: string): Record<string, PluginJsonValue> =>
    resolvePluginSettings(deps.declared(pluginKey), store(pluginKey).getAll())
  const announce = (
    pluginKey: string,
    key: string,
    before: PluginJsonValue | undefined,
    after: PluginJsonValue | undefined
  ): void => {
    // Why compare the effective values: storing the default, or the value already in force, changes nothing.
    if (after !== undefined && JSON.stringify(before) !== JSON.stringify(after)) {
      deps.onChanged({ pluginKey, key, value: after })
    }
  }
  return {
    getAll: effective,
    set(pluginKey, key, value) {
      const setting = deps.declared(pluginKey).find((candidate) => candidate.id === key)
      const issue = setting ? pluginSettingValueIssue(setting, value) : null
      if (issue) {
        return { ok: false, error: issue, invalid: true }
      }
      const before = effective(pluginKey)[key]
      const written = store(pluginKey).set(key, value)
      if (written.ok) {
        announce(pluginKey, key, before, effective(pluginKey)[key])
      }
      return written
    },
    reset(pluginKey, key) {
      if (!deps.declared(pluginKey).some((candidate) => candidate.id === key)) {
        return { ok: false, error: `${key} is not a declared setting`, invalid: true }
      }
      const before = effective(pluginKey)[key]
      store(pluginKey).delete(key)
      announce(pluginKey, key, before, effective(pluginKey)[key])
      return { ok: true }
    }
  }
}

/** The settings access of a plugin service: declared settings come from its valid plugins, and a change reaches the owning plugin's worker and the options callback. */
export function createPluginServiceSettings(service: {
  options: {
    userDataPath: string
    onPluginSettingChanged?: (change: PluginSettingChange) => void
  }
  findValidPlugin(pluginKey: string): { manifest: PluginManifest } | null
  emitEvent(event: 'settings.changed', payload: unknown, onlyPluginKey: string): void
}): PluginSettingsAccess {
  return createPluginSettingsAccess({
    pluginsDataDir: getPluginsDataDir(service.options.userDataPath),
    declared: (pluginKey) =>
      service.findValidPlugin(pluginKey)?.manifest.contributes.settings ?? [],
    onChanged: (change) => {
      // Why one plugin: a value belongs to the plugin that declared or wrote it.
      service.emitEvent(
        'settings.changed',
        { key: change.key, value: change.value },
        change.pluginKey
      )
      service.options.onPluginSettingChanged?.(change)
    }
  })
}
