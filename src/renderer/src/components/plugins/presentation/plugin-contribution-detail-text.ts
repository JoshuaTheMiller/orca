import { PLUGIN_LANGUAGE_PACK_MIN_COVERAGE } from '../../../../../shared/plugins/languages/plugin-language-pack-coverage'
import { translate } from '@/i18n/i18n'

const FILE_LIST_LIMIT = 4

export function withMode(
  kindLabel: string,
  mode: 'light' | 'dark' | 'unknown' | undefined
): string {
  if (mode === 'dark') {
    return `${kindLabel} · ${translate('auto.components.settings.pluginContributions.dark', 'Dark')}`
  }
  if (mode === 'light') {
    return `${kindLabel} · ${translate('auto.components.settings.pluginContributions.light', 'Light')}`
  }
  return kindLabel
}

export function fileList(extensions: readonly string[], filenames: readonly string[]): string {
  const files = [...extensions, ...filenames]
  const shown = files.slice(0, FILE_LIST_LIMIT).join(', ')
  return files.length > FILE_LIST_LIMIT ? `${shown} +${files.length - FILE_LIST_LIMIT}` : shown
}

export function languageDetail(coverage: number | undefined): {
  detail: string
  tone: 'default' | 'warning'
} {
  const label = translate(
    'auto.components.settings.PluginDetailSections.typeLanguagePack',
    'Interface language'
  )
  if (coverage === undefined) {
    return { detail: label, tone: 'default' }
  }
  if (coverage < PLUGIN_LANGUAGE_PACK_MIN_COVERAGE) {
    return {
      detail: translate(
        'auto.components.settings.pluginContributions.languageIncomplete',
        '{{value0}}% translated, too incomplete to use as Orca’s language',
        { value0: coverage }
      ),
      tone: 'warning'
    }
  }
  return {
    detail: translate(
      'auto.components.settings.pluginContributions.languageCoverage',
      'Interface language · {{value0}}% translated',
      { value0: coverage }
    ),
    tone: 'default'
  }
}
