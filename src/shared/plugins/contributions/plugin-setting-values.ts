import {
  PLUGIN_SETTING_STRING_MAX_LENGTH,
  type PluginSettingContribution
} from './plugin-setting-contribution'

export type PluginSettingValue = boolean | string

type SettingShape = Pick<PluginSettingContribution, 'type' | 'options' | 'maxLength'>

/** Whether `value` is a legal value of the declared setting (type, enum membership, length). */
export function isValidPluginSettingValue(
  setting: SettingShape,
  value: unknown
): value is PluginSettingValue {
  switch (setting.type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'string':
      return (
        typeof value === 'string' &&
        value.length <= (setting.maxLength ?? PLUGIN_SETTING_STRING_MAX_LENGTH)
      )
    case 'enum':
      return (
        typeof value === 'string' &&
        (setting.options ?? []).some((option) => option.value === value)
      )
  }
}

/** Why a value is refused, or null when it is legal; the text reaches the plugin as `invalid_params`. */
export function pluginSettingValueIssue(
  setting: PluginSettingContribution,
  value: unknown
): string | null {
  if (isValidPluginSettingValue(setting, value)) {
    return null
  }
  if (setting.type === 'enum') {
    return `${setting.id} must be one of: ${(setting.options ?? []).map((o) => o.value).join(', ')}`
  }
  return setting.type === 'string'
    ? `${setting.id} must be a string of at most ${setting.maxLength ?? PLUGIN_SETTING_STRING_MAX_LENGTH} characters`
    : `${setting.id} must be true or false`
}

/**
 * Stored values with declared defaults applied. Undeclared keys pass through untouched (they are
 * the plugin's untyped settings); a declared key holding a value that no longer fits its
 * declaration (an update removed the option, say) reads as its default.
 */
export function resolvePluginSettings<Stored>(
  declared: readonly PluginSettingContribution[],
  stored: Readonly<Record<string, Stored>>
): Record<string, Stored | PluginSettingValue> {
  const merged: Record<string, Stored | PluginSettingValue> = { ...stored }
  for (const setting of declared) {
    const saved = Object.hasOwn(stored, setting.id) ? stored[setting.id] : undefined
    merged[setting.id] = isValidPluginSettingValue(setting, saved) ? saved : setting.default
  }
  return merged
}
