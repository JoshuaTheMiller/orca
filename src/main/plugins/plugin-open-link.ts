import {
  PLUGIN_OPEN_LINK_CHANNEL,
  type PluginOpenLinkRequest
} from '../../shared/plugins/workers/plugin-host-links-schema'

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

/** Sends one request to a window; false when there is none to take it. */
export function sendToPluginWindow(window: LinkWindow | null, channel: string, payload: unknown): boolean {
  if (!window || window.isDestroyed()) {
    return false
  }
  window.webContents.send(channel, payload)
  return true
}
