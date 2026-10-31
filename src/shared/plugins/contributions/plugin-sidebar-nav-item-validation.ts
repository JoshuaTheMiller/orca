import type { RefinementCtx } from 'zod'
import type { PluginSettingContribution } from './plugin-setting-contribution'
import type { PluginSidebarNavItemContribution } from './plugin-sidebar-nav-item-contribution'

/**
 * Rules that span several nav items: command references, unique settings, the parent chain and
 * the boolean setting a `when` names.
 * Per-item rules (which fields a kind requires) live in the item schema.
 */
export function validatePluginSidebarNavItems(
  items: readonly PluginSidebarNavItemContribution[],
  commandIds: ReadonlySet<string>,
  settings: readonly Pick<PluginSettingContribution, 'id' | 'type'>[],
  ctx: RefinementCtx
): void {
  const byId = new Map(items.map((item) => [item.id, item]))
  const seenSettings = new Set<string>()
  for (const [index, item] of items.entries()) {
    const issue = (field: string, message: string): void =>
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'sidebarNavItems', index, field],
        message
      })
    if (item.command !== undefined && !commandIds.has(item.command)) {
      issue('command', `unknown contributed command: ${item.command}`)
    }
    if (item.when !== undefined) {
      const gate = settings.find((setting) => setting.id === item.when)
      if (!gate) {
        issue('when', `unknown contributed setting: ${item.when}`)
      } else if (gate.type !== 'boolean') {
        issue('when', `setting ${item.when} must be a boolean`)
      }
    }
    if (item.setting !== undefined) {
      if (seenSettings.has(item.setting)) {
        issue('setting', `duplicate setting: ${item.setting}`)
      }
      seenSettings.add(item.setting)
    }
    if (item.parent === undefined) {
      continue
    }
    const parent = byId.get(item.parent)
    if (item.parent === item.id) {
      issue('parent', 'an item cannot be its own parent')
    } else if (!parent) {
      issue('parent', `unknown sidebar nav item: ${item.parent}`)
    } else if (parent.kind !== 'toggle') {
      issue('parent', `parent ${item.parent} must be a toggle`)
    } else if (parent.parent !== undefined) {
      // Why one level: the sidebar indents a single step, and a chain would also allow cycles.
      issue(
        'parent',
        parent.parent === item.id
          ? `parent cycle between ${item.id} and ${item.parent}`
          : `parent ${item.parent} is itself nested; only one level is allowed`
      )
    }
  }
}
