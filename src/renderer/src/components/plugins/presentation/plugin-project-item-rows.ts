import { translate } from '@/i18n/i18n'
import type { PluginContribution } from './plugin-contributions'

export type ProjectItemSource = { title: string }

/** One row per project item a plugin adds; the title is the label the sidebar shows under each project. */
export function describeProjectItemRows(items: readonly ProjectItemSource[]): PluginContribution[] {
  return items.map((item, index) => ({
    key: `projectItems:${index}`,
    kind: 'projectItems',
    title: item.title,
    detail: translate(
      'auto.components.settings.pluginContributions.projectItem',
      'Adds under each project in the left sidebar'
    ),
    tone: 'default'
  }))
}
