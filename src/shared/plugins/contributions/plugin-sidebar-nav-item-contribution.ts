import { z } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginCommandIdSchema, pluginIdSchema } from '../manifest/plugin-manifest-fields'
import {
  pluginFieldDoc,
  PLUGIN_SIDEBAR_NAV_ITEMS_SINCE
} from '../manifest/plugin-schema-field-docs'
import { PLUGIN_PANEL_ICONS } from './plugin-panel-contribution'

export const PLUGIN_SIDEBAR_NAV_ITEM_LIMIT = 8

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
    command: pluginCommandIdSchema.meta(
      pluginFieldDoc(
        "Id of one of this plugin's `contributes.commands`. Clicking the item runs it as the command palette would.",
        PLUGIN_SIDEBAR_NAV_ITEMS_SINCE,
        ['graph.open']
      )
    )
  })
  .strict()
  .meta({
    id: 'SidebarNavItemContribution',
    description:
      "An entry in the left sidebar nav list, under Search, that runs one of the same plugin's commands. Requires the `declarative` execution profile or higher."
  })

export type PluginSidebarNavItemContribution = z.infer<
  typeof pluginSidebarNavItemContributionSchema
>
