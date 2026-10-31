import { z } from 'zod'

export const PLUGIN_LINK_URL_MAX_LENGTH = 4096

/** Orca's own link handling only routes web links; anything else (file:, javascript:, app schemes) is refused. */
export function isPluginOpenableWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const linksOpenParams = z.strictObject({
  url: z
    .string()
    .min(1)
    .max(PLUGIN_LINK_URL_MAX_LENGTH)
    .refine(isPluginOpenableWebUrl, 'only http and https URLs can be opened'),
  /** Forces the system browser, like holding the platform modifier plus Shift on a link. */
  external: z.boolean().optional()
})
export const linksOpenResult = z.object({ opened: z.boolean() })

/** Main tells the window to open the link, because the user's link settings live in the renderer. */
export const PLUGIN_OPEN_LINK_CHANNEL = 'plugins:openLink'
export type PluginOpenLinkRequest = { url: string; external: boolean }
