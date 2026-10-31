import {
  getRepoExecutionHostId,
  isRepoOnCatalogHost
} from '../../../../../../shared/execution-host'
import type {
  GroupHeaderRow,
  WorktreeGroupBy
} from '../../../../../../shared/sidebar-list/row-types'
import type { ActivePluginProjectItem } from '@/store/plugin-sidebar-project-items'
import { getRenderRowKey, type PluginProjectItemRenderRow, type RenderRow } from './render-row'

/** The `project` argument a project item's command receives. */
export type PluginProjectItemTarget = {
  id: string
  name: string
  /** Absolute paths on this machine; empty when the project lives on an SSH or runtime host. */
  paths: string[]
  hostId: string
}

/**
 * The project a top-level header stands for, or null for headers that get no items.
 * Top level means `projectGroupDepth` 0 (or absent): an ungrouped git repo project, or a folder
 * project (a project group header, which carries `projectGroup` and no `repo`). Projects nested
 * inside a folder project sit at depth 1 or deeper and get nothing, as do nested folders.
 */
function projectTargetOf(header: GroupHeaderRow): PluginProjectItemTarget | null {
  if ((header.projectGroupDepth ?? 0) > 0) {
    return null
  }
  const repo = header.repo
  if (repo) {
    return {
      id: repo.id,
      name: header.label ?? repo.displayName,
      // Why local only: a remote path means nothing to a plugin worker running on this machine.
      paths: isRepoOnCatalogHost(repo) ? [repo.path] : [],
      hostId: header.hostId ?? getRepoExecutionHostId(repo)
    }
  }
  const group = header.projectGroup
  // Why the id check: the synthetic "Ungrouped" header has a null id and is not a project.
  if (!group || group.id === null || !('parentPath' in group)) {
    return null
  }
  return {
    id: group.id,
    name: header.label ?? group.name,
    paths: group.parentPath && isRepoOnCatalogHost(group) ? [group.parentPath] : [],
    hostId: header.hostId ?? getRepoExecutionHostId(group)
  }
}

/**
 * Puts each visible plugin project item right under every top-level project header (a git repo
 * project or a folder project), above its workspaces.
 * Why a render-layer step: the shared row plan also feeds main and paired clients, which know nothing
 * of plugins, and injecting here keeps the rows inside the virtualizer's own row list.
 * Items exist only where project headers do (grouped by project) and follow the header through the
 * sidebar filters. They stay when the header is collapsed, as a quick way in, and projects nested
 * inside a folder project get none.
 */
export function injectPluginProjectItemRows(
  rows: readonly RenderRow[],
  items: readonly ActivePluginProjectItem[],
  options: { groupBy: WorktreeGroupBy }
): RenderRow[] {
  if (items.length === 0 || options.groupBy !== 'repo') {
    return rows as RenderRow[]
  }
  const result: RenderRow[] = []
  for (const row of rows) {
    result.push(row)
    if (row.type !== 'header') {
      continue
    }
    const project = projectTargetOf(row)
    if (!project) {
      continue
    }
    for (const item of items) {
      const injected: PluginProjectItemRenderRow = {
        type: 'plugin-project-item',
        key: `${getRenderRowKey(row)}/${item.key}`,
        item,
        project,
        groupDepth: 0
      }
      result.push(injected)
    }
  }
  return result
}

export type VisiblePluginProjectItem = {
  pluginKey: string
  itemId: string
  projects: { id: string; name: string; paths: string[] }[]
}

/** Which projects each plugin item shows under in these rows, for `projectItems.visible`. */
export function collectVisiblePluginProjectItems(
  rows: readonly RenderRow[]
): VisiblePluginProjectItem[] {
  const byItem = new Map<string, VisiblePluginProjectItem>()
  for (const row of rows) {
    if (row.type !== 'plugin-project-item') {
      continue
    }
    const entry = byItem.get(row.item.key) ?? {
      pluginKey: row.item.pluginKey,
      itemId: row.item.id,
      projects: []
    }
    if (!entry.projects.some((project) => project.id === row.project.id)) {
      const { id, name, paths } = row.project
      entry.projects.push({ id, name, paths })
    }
    byItem.set(row.item.key, entry)
  }
  return [...byItem.values()]
}
