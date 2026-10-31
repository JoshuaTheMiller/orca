import type { PluginHostPage } from '../../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { usePluginPageRequestsStore } from '@/store/plugin-pages'
import { Button } from '../../ui/button'

/** Leaves Settings for the view it came from and shows the page there. */
export function openPluginPageFromSettings(page: Pick<PluginHostPage, 'viewKey'>): void {
  const state = useAppStore.getState()
  state.closeSettingsPage()
  // Why null: opening from here names no file, so an earlier file must not follow it.
  usePluginPageRequestsStore.getState().setPagePath(page.viewKey, null)
  state.openPluginPage(page.viewKey)
}

export function PluginContributionActionPage({
  page
}: {
  page: PluginHostPage
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="xs"
      aria-label={translate(
        'auto.components.settings.PluginContributionActionPage.openName',
        'Open page: {{value0}}',
        { value0: page.title }
      )}
      onClick={() => openPluginPageFromSettings(page)}
    >
      {translate('auto.components.settings.PluginContributionActionPage.open', 'Open page')}
    </Button>
  )
}
