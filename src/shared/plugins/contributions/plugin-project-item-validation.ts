import type { RefinementCtx } from 'zod'
import type { PluginProjectItemContribution } from './plugin-project-item-contribution'
import type { PluginSettingContribution } from './plugin-setting-contribution'

/** Rules that span the manifest: the command a project item runs, the string its `titleSetting` names and the boolean its `when` names. */
export function validatePluginProjectItems(
  items: readonly PluginProjectItemContribution[],
  commandIds: ReadonlySet<string>,
  settings: readonly Pick<PluginSettingContribution, 'id' | 'type'>[],
  ctx: RefinementCtx
): void {
  for (const [index, item] of items.entries()) {
    const issue = (field: string, message: string): void =>
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'projectItems', index, field],
        message
      })
    if (!commandIds.has(item.command)) {
      issue('command', `unknown contributed command: ${item.command}`)
    }
    if (item.titleSetting !== undefined) {
      const source = settings.find((setting) => setting.id === item.titleSetting)
      if (!source) {
        issue('titleSetting', `unknown contributed setting: ${item.titleSetting}`)
      } else if (source.type !== 'string') {
        issue('titleSetting', `setting ${item.titleSetting} must be a string`)
      }
    }
    if (item.when !== undefined) {
      const gate = settings.find((setting) => setting.id === item.when)
      if (!gate) {
        issue('when', `unknown contributed setting: ${item.when}`)
      } else if (gate.type !== 'boolean') {
        issue('when', `setting ${item.when} must be a boolean`)
      }
    }
  }
}
