import type { HostSectionRow } from '../../../../../../shared/sidebar-list/host-section-rows'
import type { ActivePluginProjectItem } from '@/store/plugin-sidebar-project-items'
import type { PluginProjectItemTarget } from './plugin-project-item-rows'

type WorktreeItemRow = Extract<HostSectionRow, { type: 'item' }>
/** A plugin's project item under one project header; exists only in the render layer, so shared and paired-client row plans never see it. */
export type PluginProjectItemRenderRow = {
  type: 'plugin-project-item'
  key: string
  item: ActivePluginProjectItem
  project: PluginProjectItemTarget
  /** Nesting depth of the project header it follows. */
  groupDepth: number
}

export type RenderRow =
  | HostSectionRow
  | { type: 'lineage-group'; key: string; rows: WorktreeItemRow[] }
  | PluginProjectItemRenderRow

export function getRenderRowKey(row: RenderRow): string {
  if (row.type === 'plugin-project-item') {
    return `plugin-project-item:${row.key}`
  }
  if (row.type === 'host-header') {
    return `host:${row.hostId}`
  }
  if (row.type === 'header') {
    return row.hostId ? `hdr:${row.hostId}:${row.key}` : `hdr:${row.key}`
  }
  if (row.type === 'lineage-group') {
    return `lineage-group:${row.key}`
  }
  if (row.type === 'imported-worktrees-card') {
    return `imported:${row.key}`
  }
  if (row.type === 'new-external-worktrees-inbox') {
    return `inbox:${row.key}`
  }
  if (row.type === 'pending-creation') {
    return `pending:${row.creationId}`
  }
  if (row.type === 'folder-workspace') {
    return row.key
  }
  return `wt:${row.rowKey}`
}
