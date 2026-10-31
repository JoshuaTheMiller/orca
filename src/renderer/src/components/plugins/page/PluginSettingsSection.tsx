import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Switch } from '../../ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import type {
  PluginHostListEntry,
  PluginHostSetting,
  PluginSettingValue
} from '../../../../../preload/api-types'
import { loadPluginSettingValues, usePluginSettingValuesStore } from '@/store/plugin-setting-values'
import { PLUGIN_SETTING_STRING_MAX_LENGTH } from '../../../../../shared/plugins/contributions/plugin-setting-contribution'
import { DetailSection } from './PluginDetailSections'

const NO_VALUES: Readonly<Record<string, PluginSettingValue>> = {}

function reportFailure(error: string | undefined): void {
  toast.error(
    translate(
      'auto.components.settings.PluginSettingsSection.saveFailed',
      'Could not save the setting'
    ),
    { description: error }
  )
}

async function write(
  run: () => Promise<{ ok: true } | { ok: false; error: string }>
): Promise<void> {
  try {
    const outcome = await run()
    if (!outcome.ok) {
      reportFailure(outcome.error)
    }
  } catch (cause) {
    reportFailure(cause instanceof Error ? cause.message : String(cause))
  }
}

function StringControl({
  setting,
  value,
  onCommit
}: {
  setting: PluginHostSetting
  value: string
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  // Why follow `value`: a reset, or a change from the plugin itself, replaces what was typed.
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft !== value) {
      onCommit(draft)
    }
  }
  return (
    <Input
      value={draft}
      maxLength={setting.maxLength ?? PLUGIN_SETTING_STRING_MAX_LENGTH}
      aria-label={setting.title}
      className="h-7 w-48 text-xs"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
        }
      }}
    />
  )
}

function SettingControl({
  setting,
  value,
  onChange
}: {
  setting: PluginHostSetting
  value: PluginSettingValue
  onChange: (value: PluginSettingValue) => void
}): React.JSX.Element {
  if (setting.type === 'boolean') {
    return <Switch checked={value === true} aria-label={setting.title} onCheckedChange={onChange} />
  }
  if (setting.type === 'enum') {
    return (
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-48 text-xs" aria-label={setting.title}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(setting.options ?? []).map((option) => (
            // Manifest labels are plugin-owned and render without app-catalog translation.
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return <StringControl setting={setting} value={String(value)} onCommit={onChange} />
}

function SettingRow({
  pluginKey,
  setting,
  value
}: {
  pluginKey: string
  setting: PluginHostSetting
  value: PluginSettingValue
}): React.JSX.Element {
  const plugins = window.api.plugins
  const atDefault = value === setting.default
  return (
    <div
      data-plugin-setting={setting.id}
      className="flex min-h-10 items-center gap-3 border-t border-border px-3.5 py-2 text-sm first:border-t-0"
    >
      <div className="min-w-0 flex-1">
        <p>{setting.title}</p>
        {setting.description ? (
          <p className="mt-px text-xs text-muted-foreground">{setting.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {atDefault ? null : (
          <Button
            variant="ghost"
            size="xs"
            aria-label={translate(
              'auto.components.settings.PluginSettingsSection.resetNamed',
              'Reset {{value0}} to its default',
              { value0: setting.title }
            )}
            onClick={() => void write(() => plugins.resetSetting({ pluginKey, key: setting.id }))}
          >
            <RotateCcw />
            {translate('auto.components.settings.PluginSettingsSection.reset', 'Reset')}
          </Button>
        )}
        <SettingControl
          setting={setting}
          value={value}
          onChange={(next) =>
            void write(() => plugins.setSetting({ pluginKey, key: setting.id, value: next }))
          }
        />
      </div>
    </div>
  )
}

/** The settings an enabled plugin declares, edited here and saved the moment they change. */
export function PluginSettingsSection({
  plugin
}: {
  plugin: Pick<PluginHostListEntry, 'pluginKey' | 'settings'>
}): React.JSX.Element | null {
  const { pluginKey } = plugin
  const stored = usePluginSettingValuesStore((state) => state.values[pluginKey] ?? NO_VALUES)
  useEffect(() => loadPluginSettingValues(pluginKey), [pluginKey])
  const settings = plugin.settings ?? []
  if (settings.length === 0) {
    return null
  }
  return (
    <DetailSection
      title={translate('auto.components.settings.PluginSettingsSection.title', 'Settings')}
    >
      {settings.map((setting) => (
        <SettingRow
          key={setting.id}
          pluginKey={pluginKey}
          setting={setting}
          value={stored[setting.id] ?? setting.default}
        />
      ))}
    </DetailSection>
  )
}
