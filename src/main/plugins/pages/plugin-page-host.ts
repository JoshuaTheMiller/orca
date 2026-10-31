import { isAbsolute, resolve } from 'node:path'
import type { PluginPageOpenRequest } from '../../../shared/plugins/frames/plugin-page-document-bridge'
import type { ValidDiscoveredPlugin } from '../plugin-discovery'
import { PluginPageDocumentWatches } from './plugin-page-document-watch'

/**
 * Main's half of plugin pages: it answers `pages.open` by asking a window to show the page, and
 * owns the files that open pages watch. Nothing here knows about Electron windows; the app wires
 * in the opener, so a headless run (which has none) refuses the call.
 */
export class PluginPageHost {
  readonly documents = new PluginPageDocumentWatches()
  private opener: ((request: PluginPageOpenRequest) => boolean) | null = null

  constructor(
    private readonly resolveApprovedPlugin: (pluginKey: string) => ValidDiscoveredPlugin | null
  ) {}

  /** Shows a page in the focused window; the opener returns false when no window can. */
  setOpener(opener: ((request: PluginPageOpenRequest) => boolean) | null): void {
    this.opener = opener
  }

  /** Whether an approved plugin declares this page: the only pages anything may read a file for. */
  declares(pluginKey: string, pageId: string): boolean {
    return (
      this.resolveApprovedPlugin(pluginKey)?.manifest.contributes.pages.some(
        (page) => page.id === pageId
      ) === true
    )
  }

  async open(input: { pluginId: string; pageId: string; path?: string }): Promise<void> {
    if (!this.declares(input.pluginId, input.pageId)) {
      throw new Error(`plugin has no page "${input.pageId}"`)
    }
    // Why the platform check here: the schema is shared with the renderer and cannot use node:path.
    if (input.path !== undefined && !isAbsolute(input.path)) {
      throw new Error('path must be an absolute path')
    }
    const request: PluginPageOpenRequest = {
      pluginKey: input.pluginId,
      pageId: input.pageId,
      ...(input.path === undefined ? {} : { path: resolve(input.path) })
    }
    if (!this.opener?.(request)) {
      throw new Error('no window is available to show the page')
    }
  }

  dispose(): void {
    this.documents.dispose()
  }
}
