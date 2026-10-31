import { useEffect, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type {
  PluginPageDocumentFailure,
  PluginPageDocumentResult
} from '../../../../shared/plugins/frames/plugin-page-document-bridge'

export type PluginPageDocumentState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'failed'; reason: PluginPageDocumentFailure }

function stateOf(result: PluginPageDocumentResult): PluginPageDocumentState {
  return result.ok
    ? { status: 'ready', text: result.text }
    : { status: 'failed', reason: result.reason }
}

/**
 * The file a page was opened with, read once and then kept current by main while the page is
 * mounted. Unmounting (or changing file) releases main's single watch for this page.
 */
export function usePluginPageDocument(
  page: { pluginKey: string; id: string } | null,
  path: string | null
): PluginPageDocumentState {
  const [state, setState] = useState<PluginPageDocumentState>({ status: 'none' })
  const pluginKey = page?.pluginKey ?? null
  const pageId = page?.id ?? null

  useEffect(() => {
    if (!pluginKey || !pageId || !path) {
      setState({ status: 'none' })
      return
    }
    const pluginsApi = window.api?.plugins
    if (!pluginsApi?.openPageDocument) {
      setState({ status: 'failed', reason: 'unreadable' })
      return
    }
    const instanceId = createBrowserUuid()
    let active = true
    let updated = false
    setState({ status: 'loading' })
    // Why before the open: a change that lands while the first read is in flight must not be lost.
    const unsubscribe = pluginsApi.onPageDocumentChanged?.((update) => {
      if (active && update.instanceId === instanceId) {
        updated = true
        setState(stateOf(update.result))
      }
    })
    pluginsApi
      .openPageDocument({ pluginKey, pageId, instanceId, path })
      .then((result) => {
        // Why skip: an update that already arrived is newer than the first read.
        if (active && !updated) {
          setState(stateOf(result))
        }
      })
      .catch(() => {
        if (active && !updated) {
          setState({ status: 'failed', reason: 'unreadable' })
        }
      })
    return () => {
      active = false
      unsubscribe?.()
      void pluginsApi.closePageDocument?.({ instanceId })
    }
  }, [pluginKey, pageId, path])

  return state
}
