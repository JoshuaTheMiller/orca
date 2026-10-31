import {
  PLUGIN_OPEN_LINK_CHANNEL,
  type PluginOpenLinkRequest
} from '../../shared/plugins/workers/plugin-host-links-schema'

import type { PluginPageOpenRequest } from '../../shared/plugins/frames/plugin-page-document-bridge'

type LinkWindow = {
  isDestroyed(): boolean
  webContents: { send(channel: string, ...args: unknown[]): void }
}

/** Hands a link to the window that owns the user's link settings; false when no window can take it. */
export function createPluginLinkOpener(
  getWindow: () => LinkWindow | null
): (request: PluginOpenLinkRequest) => boolean {
  return (request) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) {
      return false
    }
    try {
      window.webContents.send(PLUGIN_OPEN_LINK_CHANNEL, request)
      return true
    } catch {
      // Why: the renderer can disappear between isDestroyed() and send().
      return false
    }
  }
}

/** Hands a page request to the window the caller is using; false when no window can take it. */
export function createPluginPageOpener(
  getWindow: () => LinkWindow | null
): (request: PluginPageOpenRequest) => boolean {
  return (request) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) {
      return false
    }
    window.webContents.send('plugins:openPageRequested', request)
    return true
  }
}
