import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  usePluginProjectItems,
  visiblePluginProjectItems
} from '@/store/plugin-sidebar-project-items'
import type { HostSectionRow } from '../../../../../../shared/sidebar-list/host-section-rows'
import type { WorktreeGroupBy } from '../../../../../../shared/sidebar-list/row-types'
import { usePluginProjectItemTitles } from '../../use-plugin-project-item-titles'
import { usePluginSettingGates } from '@/store/use-plugin-setting-gates'
import { injectPluginProjectItemRows } from './plugin-project-item-rows'
import type { RenderRow } from './render-row'
import { buildRenderableRows } from './renderable-rows'
import { useReportVisiblePluginProjectItems } from './use-report-visible-plugin-project-items'

const NO_HIDDEN_PLUGIN_ITEMS: readonly string[] = []

/** The rows the virtualizer lays out: the section rows with lineage grouped, plus enabled plugins' project items. */
export function useRenderRows(rows: HostSectionRow[], groupBy: WorktreeGroupBy): RenderRow[] {
  const pluginProjectItems = usePluginProjectItems()
  const hidden = useAppStore((s) => s.settings?.hiddenPluginProjectItems ?? NO_HIDDEN_PLUGIN_ITEMS)
  const gates = usePluginSettingGates(pluginProjectItems)
  const gated = useMemo(
    () => visiblePluginProjectItems(pluginProjectItems, hidden, gates),
    [pluginProjectItems, hidden, gates]
  )
  const shown = usePluginProjectItemTitles(gated)
  const renderRows = useMemo(
    () => injectPluginProjectItemRows(buildRenderableRows(rows), shown, { groupBy }),
    [rows, shown, groupBy]
  )
  useReportVisiblePluginProjectItems(renderRows)
  return renderRows
}
