import { z } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginIdSchema, pluginRelativePathSchema } from '../manifest/plugin-manifest-fields'
import {
  pluginPathFieldDoc,
  pluginFieldDoc,
  PLUGIN_PAGES_SINCE
} from '../manifest/plugin-schema-field-docs'
import { PLUGIN_PANEL_ICONS } from './plugin-panel-contribution'

export const PLUGIN_PAGE_LIMIT = 4

export const pluginPageContributionSchema = z
  .object({
    id: pluginIdSchema.meta(
      pluginFieldDoc(
        "Page id, unique among this plugin's pages. The reserved names `constructor` and `prototype` are refused.",
        PLUGIN_PAGES_SINCE,
        ['report']
      )
    ),
    title: safePluginDisplayText(z.string().min(1).max(256)).meta(
      pluginFieldDoc('Title shown in the page header.', PLUGIN_PAGES_SINCE, ['Report'])
    ),
    icon: z
      .enum(PLUGIN_PANEL_ICONS)
      .optional()
      .meta(
        pluginFieldDoc(
          'Icon shown for the page in Orca. Same names as panel icons. Defaults to `plug`.',
          PLUGIN_PAGES_SINCE,
          ['file-text']
        )
      ),
    entry: pluginRelativePathSchema.meta(
      pluginPathFieldDoc(
        'HTML file, relative to the plugin root, rendered full size in the main area inside a sandboxed frame like a panel. A worker or another frame opens it with `pages.open`. It is trusted code: install pages you trust.',
        PLUGIN_PAGES_SINCE,
        ['page/index.html']
      )
    )
  })
  .strict()
  .meta({
    id: 'PageContribution',
    description:
      'A full-page view shown in the main area, like the built-in Tasks and Automations pages. Requires the `sandboxed-ui` execution profile or higher.'
  })

export type PluginPageContribution = z.infer<typeof pluginPageContributionSchema>
