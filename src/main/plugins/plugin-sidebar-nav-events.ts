import {
  parsePluginSidebarNavValueKey,
  resolvePluginSidebarNavValues
} from '../../shared/plugins/contributions/plugin-sidebar-nav-values'
import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import type { PluginSidebarNavItemContribution } from '../../shared/plugins/contributions/plugin-sidebar-nav-item-contribution'

type NavValues = Readonly<Record<string, boolean>>

/** One plugin's toggle and checkbox values, defaults applied; none for a plugin that is not valid. */
export function readPluginSidebarNavValues(
  service: {
    findValidPlugin(pluginKey: string): { manifest: PluginManifest } | null
    options: { getSidebarNavValues?: () => NavValues }
  },
  pluginKey: string
): Record<string, boolean> {
  const items = service.findValidPlugin(pluginKey)?.manifest.contributes.sidebarNavItems ?? []
  return resolvePluginSidebarNavValues(pluginKey, items, service.options.getSidebarNavValues?.())
}

/**
 * Turns stored toggle and checkbox changes into `sidebarNav.valueChanged` events for the owning plugin.
 * Compares effective values (defaults applied), so storing the default, or a value for a setting the
 * plugin no longer declares, sends nothing.
 */
export function createPluginSidebarNavEvents(deps: {
  initial: NavValues | undefined
  declaredItems: (pluginKey: string) => readonly PluginSidebarNavItemContribution[]
  emit: (pluginKey: string, payload: { setting: string; value: boolean }) => void
}): { valuesChanged: (next: NavValues | undefined) => void } {
  let previous: NavValues = deps.initial ?? {}
  return {
    valuesChanged(next) {
      const current: NavValues = next ?? {}
      const before = previous
      previous = current
      for (const key of new Set([...Object.keys(before), ...Object.keys(current)])) {
        if (before[key] === current[key]) {
          continue
        }
        const parsed = parsePluginSidebarNavValueKey(key)
        if (!parsed) {
          continue
        }
        const items = deps.declaredItems(parsed.pluginKey)
        const was = resolvePluginSidebarNavValues(parsed.pluginKey, items, before)[parsed.setting]
        const now = resolvePluginSidebarNavValues(parsed.pluginKey, items, current)[parsed.setting]
        if (now !== undefined && was !== now) {
          deps.emit(parsed.pluginKey, { setting: parsed.setting, value: now })
        }
      }
    }
  }
}
