import { translate } from '@/i18n/i18n'
import type { PluginContribution } from './plugin-contributions'

export type SettingSource = { title: string }

/** One row for all the settings a plugin adds: "Adds 3 settings", the titles being the settings page's to show. */
export function describeSettingRows(items: readonly SettingSource[]): PluginContribution[] {
  if (items.length === 0) {
    return []
  }
  return [
    {
      key: 'settings:all',
      kind: 'settings',
      title: translate('auto.components.settings.pluginContributions.settingsTitle', 'Settings'),
      detail:
        items.length === 1
          ? translate('auto.components.settings.pluginContributions.settingsOne', 'Adds 1 setting')
          : translate(
              'auto.components.settings.pluginContributions.settingsMany',
              'Adds {{value0}} settings',
              { value0: items.length }
            ),
      tone: 'default'
    }
  ]
}
