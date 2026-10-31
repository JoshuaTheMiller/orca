import { z } from 'zod'
import { PLUGIN_SIDEBAR_NAV_ITEM_LIMIT } from '../contributions/plugin-sidebar-nav-item-contribution'

export const sidebarNavGetValuesParams = z.strictObject({}).optional()
/** Keyed by the `setting` of each toggle and checkbox the plugin declares, defaults applied. */
export const sidebarNavGetValuesResult = z
  .object({
    values: z
      .record(z.string(), z.boolean())
      .refine((values) => Object.keys(values).length <= PLUGIN_SIDEBAR_NAV_ITEM_LIMIT)
  })
  .strict()
