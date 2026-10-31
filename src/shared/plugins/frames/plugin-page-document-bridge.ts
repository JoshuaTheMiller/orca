import { CUSTOM_EDITOR_DOCUMENT_MAX_BYTES } from './plugin-custom-editor-bridge'

/**
 * The file a page was opened with (`pages.open` with a `path`). It reaches the page frame as the
 * same read-only `orca.document` a custom editor sees, so the plugin never learns the path.
 */

/** Same cap as a custom editor's document, so one file size rule covers both. */
export const PLUGIN_PAGE_DOCUMENT_MAX_BYTES = CUSTOM_EDITOR_DOCUMENT_MAX_BYTES
/** Quiet time after the last change event before the file is read again. */
export const PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS = 200

export type PluginPageDocumentFailure = 'not_found' | 'not_a_file' | 'too_large' | 'unreadable'

export type PluginPageDocumentResult =
  | { ok: true; text: string }
  | { ok: false; reason: PluginPageDocumentFailure }

/** Pushed to the window that shows the page whenever the watched file changes. */
export type PluginPageDocumentUpdate = {
  instanceId: string
  result: PluginPageDocumentResult
}

/** Sent to the focused window when a plugin calls `pages.open`. */
export type PluginPageOpenRequest = {
  pluginKey: string
  pageId: string
  /** Absolute path of a local file the page shows; absent for a page that shows none. */
  path?: string
}
