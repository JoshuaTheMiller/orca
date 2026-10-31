import { z } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginCommandIdSchema, pluginIdSchema } from '../manifest/plugin-manifest-fields'
import { PLUGIN_PANEL_ICONS } from './plugin-panel-contribution'
import { PLUGIN_EDITOR_PLACEMENTS } from '../workers/plugin-host-editor-api'

export const PLUGIN_SIDEBAR_CARD_ITEM_LIMIT = 500
export const PLUGIN_SIDEBAR_CARD_BADGE_LIMIT = 4
export const PLUGIN_SIDEBAR_CARD_ARGS_MAX_BYTES = 4096
export const PLUGIN_SIDEBAR_CARD_TONES = [
  'neutral',
  'info',
  'warning',
  'danger',
  'success'
] as const
export type PluginSidebarCardTone = (typeof PLUGIN_SIDEBAR_CARD_TONES)[number]

// Why a pattern, like editor.openFile: the host may be on another platform than the plugin's paths.
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|[/])/

const badgeSchema = z
  .object({
    label: safePluginDisplayText(z.string().min(1).max(24)),
    tone: z.enum(PLUGIN_SIDEBAR_CARD_TONES).optional()
  })
  .strict()

const commandActionSchema = z
  .object({
    kind: z.literal('command'),
    command: pluginCommandIdSchema,
    args: z
      .json()
      .optional()
      .refine(
        (args) => JSON.stringify(args ?? null).length <= PLUGIN_SIDEBAR_CARD_ARGS_MAX_BYTES,
        `args must stay under ${PLUGIN_SIDEBAR_CARD_ARGS_MAX_BYTES} bytes`
      )
  })
  .strict()

const openFileActionSchema = z
  .object({
    kind: z.literal('openFile'),
    path: z
      .string()
      .min(1)
      .max(4096)
      .refine((path) => ABSOLUTE_PATH.test(path), 'path must be absolute'),
    placement: z.enum(PLUGIN_EDITOR_PLACEMENTS).optional()
  })
  .strict()

export const pluginSidebarCardActionSchema = z.discriminatedUnion('kind', [
  commandActionSchema,
  openFileActionSchema
])
export type PluginSidebarCardAction = z.infer<typeof pluginSidebarCardActionSchema>

export const pluginSidebarCardItemSchema = z
  .object({
    id: z.string().min(1).max(256),
    title: safePluginDisplayText(z.string().min(1).max(160)),
    subtitle: safePluginDisplayText(z.string().min(1).max(240)).optional(),
    badges: z.array(badgeSchema).max(PLUGIN_SIDEBAR_CARD_BADGE_LIMIT).optional(),
    icon: z.enum(PLUGIN_PANEL_ICONS).optional(),
    action: pluginSidebarCardActionSchema.optional()
  })
  .strict()
export type PluginSidebarCardItem = z.infer<typeof pluginSidebarCardItemSchema>

export const pluginSidebarCardItemsSchema = z
  .array(pluginSidebarCardItemSchema)
  .max(PLUGIN_SIDEBAR_CARD_ITEM_LIMIT)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'row ids must be unique'
  )

export const pluginSidebarCardIdSchema = pluginIdSchema

/** `sidebarBody` value of a plugin card. A plugin key and a card id never hold a slash beyond the one joining them. */
export type PluginSidebarCardBody = `plugin:${string}`

export function pluginSidebarCardBody(pluginKey: string, cardId: string): PluginSidebarCardBody {
  return `plugin:${pluginKey}/${cardId}`
}

export function isPluginSidebarCardBody(body: unknown): body is PluginSidebarCardBody {
  return typeof body === 'string' && parsePluginSidebarCardBody(body) !== null
}

export function parsePluginSidebarCardBody(
  body: string
): { pluginKey: string; cardId: string } | null {
  if (!body.startsWith('plugin:')) {
    return null
  }
  const rest = body.slice('plugin:'.length)
  const cut = rest.lastIndexOf('/')
  return cut > 0 && cut < rest.length - 1
    ? { pluginKey: rest.slice(0, cut), cardId: rest.slice(cut + 1) }
    : null
}
