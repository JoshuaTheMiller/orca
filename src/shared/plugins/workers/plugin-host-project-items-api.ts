import { z } from 'zod'
import { sanitizePluginDisplayText } from '../manifest/plugin-display-text'

export const PROJECT_ITEM_DETAIL_MAX_LENGTH = 16
export const PROJECT_ITEM_PROJECT_ID_MAX_LENGTH = 2048

/** Why overwrite: a detail is shown on one line, so line breaks and unsafe characters are stripped, not refused. */
export const projectItemsSetDetailParams = z.strictObject({
  itemId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(PROJECT_ITEM_PROJECT_ID_MAX_LENGTH),
  /** An empty string clears the detail. */
  text: z.string().max(PROJECT_ITEM_DETAIL_MAX_LENGTH).overwrite(sanitizePluginDisplayText)
})
export const projectItemsSetDetailResult = z.object({ ok: z.literal(true) })
