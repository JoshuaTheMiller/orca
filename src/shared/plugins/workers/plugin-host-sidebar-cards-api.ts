import { z } from 'zod'
import {
  pluginSidebarCardIdSchema,
  pluginSidebarCardItemsSchema
} from '../contributions/plugin-sidebar-card-items'

export const sidebarCardsSetItemsParams = z.strictObject({
  cardId: pluginSidebarCardIdSchema,
  items: pluginSidebarCardItemsSchema
})
export const sidebarCardsSetItemsResult = z.object({ ok: z.literal(true) })
