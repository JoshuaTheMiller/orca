import { z } from 'zod'
import type { RefinementCtx } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginIdSchema } from '../manifest/plugin-manifest-fields'
import { pluginFieldDoc, PLUGIN_SIDEBAR_CARDS_SINCE } from '../manifest/plugin-schema-field-docs'
import { PLUGIN_PANEL_ICONS } from './plugin-panel-contribution'
import type { PluginSettingContribution } from './plugin-setting-contribution'

export const PLUGIN_SIDEBAR_CARD_LIMIT = 4

const SINCE = PLUGIN_SIDEBAR_CARDS_SINCE

export const pluginSidebarCardContributionSchema = z
  .object({
    id: pluginIdSchema.meta(
      pluginFieldDoc(
        "Card id, unique among this plugin's cards. The reserved names `constructor` and `prototype` are refused.",
        SINCE,
        ['open-issues']
      )
    ),
    title: safePluginDisplayText(z.string().min(1).max(32)).meta(
      pluginFieldDoc(
        'Name of the left-sidebar view, shown beside Projects in the switcher in the sidebar header.',
        SINCE,
        ['Issues']
      )
    ),
    icon: z
      .enum(PLUGIN_PANEL_ICONS)
      .optional()
      .meta(pluginFieldDoc('Icon shown in the switcher. Defaults to `plug`.', SINCE, ['database'])),
    emptyText: safePluginDisplayText(z.string().min(1).max(160))
      .optional()
      .meta(
        pluginFieldDoc(
          'Text shown while the plugin has set no rows. Defaults to a generic message.',
          SINCE,
          ['Nothing to show yet.']
        )
      ),
    when: pluginIdSchema
      .optional()
      .meta(
        pluginFieldDoc(
          "Id of a `boolean` entry in this plugin's `contributes.settings`. The card is offered only while that setting is true, and the sidebar returns to Projects if it turns false while shown.",
          SINCE,
          ['show-issues']
        )
      )
  })
  .strict()
  .meta({
    id: 'SidebarCardContribution',
    description:
      "An alternative left-sidebar view the user switches to from the Projects header. Its rows come from the plugin's worker through `sidebarCards.setItems`. Requires `main` and the `trusted-worker` execution profile."
  })

export type PluginSidebarCardContribution = z.infer<typeof pluginSidebarCardContributionSchema>

/** Rules that span cards: each `when` must name a boolean setting this plugin declares. */
export function validatePluginSidebarCards(
  cards: readonly PluginSidebarCardContribution[],
  settings: readonly Pick<PluginSettingContribution, 'id' | 'type'>[],
  ctx: RefinementCtx
): void {
  for (const [index, card] of cards.entries()) {
    if (card.when === undefined) {
      continue
    }
    const gate = settings.find((setting) => setting.id === card.when)
    const message = !gate
      ? `unknown contributed setting: ${card.when}`
      : gate.type !== 'boolean'
        ? `setting ${card.when} must be a boolean`
        : null
    if (message) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'sidebarCards', index, 'when'],
        message
      })
    }
  }
}
