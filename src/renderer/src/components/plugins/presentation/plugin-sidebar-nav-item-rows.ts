import { translate } from '@/i18n/i18n'
import type { PluginContribution } from './plugin-contributions'

export type SidebarNavItemSource = { title: string; kind?: 'command' | 'toggle' | 'checkbox' }

/** A catalog summary item; its detail is the command id, or `kind:setting` for a toggle or checkbox. */
export function navItemFromSummary(item: { name: string; detail?: string }): SidebarNavItemSource {
  const [kind, setting] = (item.detail ?? '').split(':')
  return setting !== undefined && (kind === 'toggle' || kind === 'checkbox')
    ? { title: item.name, kind }
    : { title: item.name }
}

/** One row per sidebar nav item a plugin adds; the title is the label the sidebar shows. */
export function describeSidebarNavItemRows(
  items: readonly SidebarNavItemSource[]
): PluginContribution[] {
  return items.map((item, index) => ({
    key: `sidebarNavItems:${index}`,
    kind: 'sidebarNavItems',
    title: item.title,
    detail:
      item.kind === 'toggle'
        ? translate(
            'auto.components.settings.pluginContributions.sidebarNavToggle',
            'Adds a toggle to the left sidebar'
          )
        : item.kind === 'checkbox'
          ? translate(
              'auto.components.settings.pluginContributions.sidebarNavCheckbox',
              'Adds a checkbox to the left sidebar'
            )
          : translate(
              'auto.components.settings.pluginContributions.sidebarNavItem',
              'Adds to the left sidebar'
            ),
    tone: 'default'
  }))
}
