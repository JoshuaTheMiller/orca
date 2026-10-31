import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { usePluginPageRequestsStore, collectActivePluginPages } from '@/store/plugin-pages'
import { ensurePluginPanelsLoaded, usePluginPanelsStore } from '@/store/plugin-panels'
import { isPluginPageView, pluginPageViewKey } from '../../../shared/top-level-view'
import type { PluginPageOpenRequest } from '../../../shared/plugins/frames/plugin-page-document-bridge'

async function showRequestedPage(request: PluginPageOpenRequest): Promise<void> {
  const viewKey = pluginPageViewKey(request.pluginKey, request.pageId)
  const hasPage = (): boolean =>
    collectActivePluginPages(usePluginPanelsStore.getState().plugins).some(
      (page) => page.viewKey === viewKey
    )
  if (!hasPage()) {
    // Why refetch: the plugin may have been enabled since the list last loaded.
    await usePluginPanelsStore.getState().fetchPlugins()
    if (!hasPage()) {
      return
    }
  }
  // Why always set: a call without a path replaces the file an earlier call gave this page.
  usePluginPageRequestsStore.getState().setPagePath(viewKey, request.path ?? null)
  useAppStore.getState().openPluginPage(viewKey)
}

/**
 * Routes `pages.open` into the window and keeps the view honest: a plugin page whose plugin or
 * page went away (uninstalled, disabled, updated without it) falls back to the previous view,
 * once the authoritative plugin list has loaded.
 */
export function usePluginPageRouting(): void {
  const activeView = useAppStore((state) => state.activeView)
  const closePluginPage = useAppStore((state) => state.closePluginPage)
  const plugins = usePluginPanelsStore((state) => state.plugins)
  const fetchStatus = usePluginPanelsStore((state) => state.fetchStatus)
  const pluginSystemEnabled = useAppStore((state) => state.settings?.pluginSystemEnabled === true)

  useEffect(() => {
    ensurePluginPanelsLoaded()
    return window.api?.plugins?.onOpenPageRequested?.((request) => {
      void showRequestedPage(request)
    })
  }, [])

  useEffect(() => {
    if (!isPluginPageView(activeView)) {
      return
    }
    // Why wait for ready: an empty list during startup or a failed fetch must not eject the view.
    if (fetchStatus !== 'ready' && pluginSystemEnabled) {
      return
    }
    if (!collectActivePluginPages(plugins).some((page) => page.viewKey === activeView)) {
      closePluginPage()
    }
  }, [activeView, closePluginPage, fetchStatus, pluginSystemEnabled, plugins])
}
