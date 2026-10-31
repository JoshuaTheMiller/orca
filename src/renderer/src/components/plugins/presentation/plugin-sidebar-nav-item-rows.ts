import { translate } from '@/i18n/i18n'
import type { PluginContribution } from './plugin-contributions'

/** One row per sidebar nav item a plugin adds; the title is the label the sidebar shows. */
export function describeSidebarNavItemRows(
  items: readonly { title: string }[]
): PluginContribution[] {
  return items.map((item, index) => ({
    key: `sidebarNavItems:${index}`,
    kind: 'sidebarNavItems',
    title: item.title,
    detail: translate(
      'auto.components.settings.pluginContributions.sidebarNavItem',
      'Adds to the left sidebar'
    ),
    tone: 'default'
  }))
}
