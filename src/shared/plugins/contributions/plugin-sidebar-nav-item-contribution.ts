import { z } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginCommandIdSchema, pluginIdSchema } from '../manifest/plugin-manifest-fields'
import {
  pluginFieldDoc,
  PLUGIN_SIDEBAR_NAV_ITEMS_SINCE
} from '../manifest/plugin-schema-field-docs'
import { PLUGIN_PANEL_ICONS } from './plugin-panel-contribution'

export const PLUGIN_SIDEBAR_NAV_ITEM_LIMIT = 8

export const PLUGIN_SIDEBAR_NAV_ITEM_KINDS = ['command', 'toggle', 'checkbox'] as const
export type PluginSidebarNavItemKind = (typeof PLUGIN_SIDEBAR_NAV_ITEM_KINDS)[number]

export const pluginSidebarNavItemContributionSchema = z
  .object({
    id: pluginIdSchema.meta(
      pluginFieldDoc(
        "Nav item id, unique among this plugin's nav items. The reserved names `constructor` and `prototype` are refused.",
        PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
        ['open-graph']
      )
    ),
    title: safePluginDisplayText(z.string().min(1).max(64)).meta(
      pluginFieldDoc(
        'Label of the entry in the left sidebar nav list.',
        PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
        ['Graph']
      )
    ),
    icon: z
      .enum(PLUGIN_PANEL_ICONS)
      .optional()
      .meta(
        pluginFieldDoc(
          'Icon shown beside the label. Defaults to `plug`.',
          PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
          ['database']
        )
      ),
    kind: z
      .enum(PLUGIN_SIDEBAR_NAV_ITEM_KINDS)
      .optional()
      .meta(
        pluginFieldDoc(
          'What the entry is: `command` (default) runs a command, `toggle` is a switch and `checkbox` a checkbox. The last two hold a boolean the plugin reads with `sidebarNav.getValues`.',
          PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
          ['toggle']
        )
      ),
    command: pluginCommandIdSchema
      .optional()
      .meta(
        pluginFieldDoc(
          "Id of one of this plugin's `contributes.commands`. Clicking the item runs it as the command palette would. Required for `command` entries and refused on toggles and checkboxes.",
          PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
          ['graph.open']
        )
      ),
    setting: pluginIdSchema
      .optional()
      .meta(
        pluginFieldDoc(
          "Key of the boolean a toggle or checkbox holds, unique among this plugin's nav items. Required for toggles and checkboxes and refused on commands.",
          PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
          ['show-details']
        )
      ),
    default: z
      .boolean()
      .optional()
      .meta(
        pluginFieldDoc(
          'Value of a toggle or checkbox until the user flips it. Defaults to `false`.',
          PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
          [true]
        )
      ),
    parent: pluginIdSchema
      .optional()
      .meta(
        pluginFieldDoc(
          'Id of a `toggle` nav item of this plugin. The entry shows indented under it, and only while the toggle is on. A parent cannot itself have a parent.',
          PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
          ['show-details']
        )
      )
  })
  .strict()
  .superRefine((item, ctx) => {
    if ((item.kind ?? 'command') === 'command') {
      if (item.command === undefined) {
        ctx.addIssue({ code: 'custom', path: ['command'], message: 'required for a command item' })
      }
      for (const key of ['setting', 'default'] as const) {
        if (item[key] !== undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'only for a toggle or checkbox' })
        }
      }
      return
    }
    if (item.setting === undefined) {
      ctx.addIssue({ code: 'custom', path: ['setting'], message: `required for a ${item.kind}` })
    }
    if (item.command !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['command'], message: `not allowed on a ${item.kind}` })
    }
  })
  .meta({
    id: 'SidebarNavItemContribution',
    description:
      "An entry in the left sidebar nav list, under Search: a button that runs one of the same plugin's commands, or a toggle or checkbox holding a boolean. Requires the `declarative` execution profile or higher."
  })

export type PluginSidebarNavItemContribution = z.infer<
  typeof pluginSidebarNavItemContributionSchema
>
