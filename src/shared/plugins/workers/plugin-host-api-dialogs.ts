import { z } from 'zod'

export const PLUGIN_DIALOG_TITLE_MAX_LENGTH = 120
export const PLUGIN_DIALOG_PATH_MAX_LENGTH = 4096

// Why a pattern: this module is electron- and node-free, so it cannot ask node:path.
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/

export const dialogsPickFolderParams = z.strictObject({
  title: z.string().min(1).max(PLUGIN_DIALOG_TITLE_MAX_LENGTH).optional(),
  defaultPath: z
    .string()
    .max(PLUGIN_DIALOG_PATH_MAX_LENGTH)
    .refine((value) => ABSOLUTE_PATH.test(value), 'must be an absolute path')
    .optional(),
  /** Creates `defaultPath` first when it is missing and lies under the user's home folder. */
  createIfMissing: z.boolean().optional()
})
export const dialogsPickFolderResult = z.object({ path: z.string().min(1).nullable() })
