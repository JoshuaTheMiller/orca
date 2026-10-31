import { z } from 'zod'

export const PLUGIN_EDITOR_PATH_MAX_LENGTH = 4096
export const PLUGIN_EDITOR_PROJECT_ID_MAX_LENGTH = 256

// Why a pattern, not node:path: this table is shared with hosts on other platforms, and a
// plugin may name a Windows path to a Linux host or the reverse; the handler re-checks the real one.
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/

/** `auto` opens in the workspace owning the path, else the floating workspace; `active-workspace` opens beside the focused workspace's terminals. */
export const PLUGIN_EDITOR_PLACEMENTS = ['auto', 'active-workspace'] as const
export type PluginEditorPlacement = (typeof PLUGIN_EDITOR_PLACEMENTS)[number]

export const editorOpenFileParams = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(PLUGIN_EDITOR_PATH_MAX_LENGTH)
    .refine((path) => ABSOLUTE_PATH.test(path), 'path must be absolute'),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  placement: z.enum(PLUGIN_EDITOR_PLACEMENTS).optional(),
  // Why: the id a sidebar project item hands the plugin, a repo id or a project-group id; it outranks `placement`.
  projectId: z.string().min(1).max(PLUGIN_EDITOR_PROJECT_ID_MAX_LENGTH).optional()
})
export const editorOpenFileResult = z.object({ opened: z.boolean() })
