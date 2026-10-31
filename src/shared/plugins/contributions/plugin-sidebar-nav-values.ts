type StatefulNavItem = { kind?: string; setting?: string; default?: boolean }

/** Key of one toggle or checkbox value in `pluginSidebarNavValues`. */
export function pluginSidebarNavValueKey(pluginKey: string, setting: string): string {
  return `${pluginKey}/${setting}`
}

/** Splits a stored key; a plugin key may hold a slash itself, a setting never does. */
export function parsePluginSidebarNavValueKey(
  key: string
): { pluginKey: string; setting: string } | null {
  const at = key.lastIndexOf('/')
  return at > 0 && at < key.length - 1
    ? { pluginKey: key.slice(0, at), setting: key.slice(at + 1) }
    : null
}

/** One plugin's toggle and checkbox values with defaults applied; stored values of undeclared settings are ignored. */
export function resolvePluginSidebarNavValues(
  pluginKey: string,
  items: readonly StatefulNavItem[],
  stored: Readonly<Record<string, boolean>> | undefined
): Record<string, boolean> {
  const values: Record<string, boolean> = {}
  for (const item of items) {
    if (item.setting === undefined || (item.kind !== 'toggle' && item.kind !== 'checkbox')) {
      continue
    }
    const saved = stored?.[pluginSidebarNavValueKey(pluginKey, item.setting)]
    values[item.setting] = typeof saved === 'boolean' ? saved : (item.default ?? false)
  }
  return values
}
