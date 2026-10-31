import { z } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginCommandIdSchema, pluginIdSchema } from '../manifest/plugin-manifest-fields'
import {
  pluginFieldDoc,
  PLUGIN_PROJECT_ITEMS_SINCE,
  PLUGIN_SETTINGS_SINCE
} from '../manifest/plugin-schema-field-docs'
import { pluginSvgIconPathSchema } from '../images/plugin-svg-icon'
import { PLUGIN_PANEL_ICONS } from './plugin-panel-contribution'

export const PLUGIN_PROJECT_ITEM_LIMIT = 4

export const pluginProjectItemContributionSchema = z
  .object({
    id: pluginIdSchema.meta(
      pluginFieldDoc(
        "Project item id, unique among this plugin's project items. The reserved names `constructor` and `prototype` are refused.",
        PLUGIN_PROJECT_ITEMS_SINCE,
        ['open-board']
      )
    ),
    title: safePluginDisplayText(z.string().min(1).max(64)).meta(
      pluginFieldDoc(
        'Label of the row under each project in the left sidebar Projects list.',
        PLUGIN_PROJECT_ITEMS_SINCE,
        ['Board']
      )
    ),
    icon: z
      .union([z.enum(PLUGIN_PANEL_ICONS), pluginSvgIconPathSchema])
      .optional()
      .meta(
        pluginFieldDoc(
          'Icon shown beside the label: a built-in name, or the path of an SVG file in the plugin. Defaults to `plug`.',
          PLUGIN_PROJECT_ITEMS_SINCE,
          ['database']
        )
      ),
    command: pluginCommandIdSchema.meta(
      pluginFieldDoc(
        "Id of one of this plugin's `contributes.commands`. Clicking the row runs it as the command palette would, with `{ project: { id, name, paths, hostId }, itemTitle }` as its argument (`itemTitle` is the row title as the user sees it). A command that maps to a built-in action takes no arguments and ignores them.",
        PLUGIN_PROJECT_ITEMS_SINCE,
        ['board.open']
      )
    ),
    titleSetting: pluginIdSchema
      .optional()
      .meta(
        pluginFieldDoc(
          "Id of a `string` entry in this plugin's `contributes.settings`. While that setting holds text, the row's default title is that text, updating when the user changes it; an empty value falls back to `title`. The user can still rename the row per project.",
          PLUGIN_PROJECT_ITEMS_SINCE,
          ['board-name']
        )
      ),
    when: pluginIdSchema
      .optional()
      .meta(
        pluginFieldDoc(
          "Id of a `boolean` entry in this plugin's `contributes.settings`. The row shows only while that setting is true, and reacts when the user changes it.",
          PLUGIN_SETTINGS_SINCE,
          ['show-board']
        )
      )
  })
  .strict()
  .meta({
    id: 'ProjectItemContribution',
    description:
      "A row shown first under every project in the left sidebar Projects list: a button that runs one of the same plugin's commands with the project as its argument. Requires the `declarative` execution profile or higher."
  })

export type PluginProjectItemContribution = z.infer<typeof pluginProjectItemContributionSchema>
