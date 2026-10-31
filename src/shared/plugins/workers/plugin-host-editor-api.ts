import { z } from 'zod'

export const PLUGIN_EDITOR_PATH_MAX_LENGTH = 4096

// Why a pattern, not node:path: this table is shared with hosts on other platforms, and a
// plugin may name a Windows path to a Linux host or the reverse; the handler re-checks the real one.
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/

export const editorOpenFileParams = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(PLUGIN_EDITOR_PATH_MAX_LENGTH)
    .refine((path) => ABSOLUTE_PATH.test(path), 'path must be absolute'),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional()
})
export const editorOpenFileResult = z.object({ opened: z.boolean() })
