import { translate } from '@/i18n/i18n'
import type { PluginContribution } from './plugin-contributions'

export type SidebarCardSource = { title: string }

/** One row per sidebar card a plugin adds; the title is the name in the Projects header switcher. */
export function describeSidebarCardRows(items: readonly SidebarCardSource[]): PluginContribution[] {
  return items.map((item, index) => ({
    key: `sidebarCards:${index}`,
    kind: 'sidebarCards',
    title: item.title,
    detail: translate(
      'auto.components.settings.pluginContributions.sidebarCard',
      'Adds a left sidebar view'
    ),
    tone: 'default'
  }))
}
