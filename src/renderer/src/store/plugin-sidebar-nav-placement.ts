import type {
  ActivePluginSidebarNavItem,
  ActivePluginSidebarStateItem
} from './plugin-sidebar-nav-items'

export function isStateNavItem(
  item: ActivePluginSidebarNavItem
): item is ActivePluginSidebarStateItem {
  return item.kind === 'toggle' || item.kind === 'checkbox'
}

export type PlacedPluginSidebarNavItem = {
  item: ActivePluginSidebarNavItem
  /** 1 for a child shown under its toggle. */
  depth: 0 | 1
}

/** Items in sidebar order: each child right under its toggle, only while the toggle is on and neither is hidden. */
export function placePluginSidebarNavItems(
  items: readonly ActivePluginSidebarNavItem[],
  values: Readonly<Record<string, boolean>>,
  hidden: readonly string[]
): PlacedPluginSidebarNavItem[] {
  const visible = items.filter((item) => !hidden.includes(item.key))
  const placed: PlacedPluginSidebarNavItem[] = []
  for (const item of visible.filter((candidate) => !candidate.parentKey)) {
    placed.push({ item, depth: 0 })
    if (
      !isStateNavItem(item) ||
      item.kind !== 'toggle' ||
      !(values[item.valueKey] ?? item.default)
    ) {
      continue
    }
    for (const child of visible.filter((candidate) => candidate.parentKey === item.key)) {
      placed.push({ item: child, depth: 1 })
    }
  }
  return placed
}
