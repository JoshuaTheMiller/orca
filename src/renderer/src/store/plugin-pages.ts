import { create } from 'zustand'
import type { PluginHostListEntry, PluginHostPage } from '../../../preload/api-types'
import type { PluginPageTopLevelView } from '../../../shared/ui-chrome-types'
import { fromPlugin, isLivePlugin, usePluginListDerived } from './plugin-panels'

/** A page contribution from an enabled plugin. */
export type ActivePluginPage = PluginHostPage & {
  pluginKey: string
  pluginName: string
}

/** Pages need no worker, so they stay available while it is idle or restarting. */
export function collectActivePluginPages(
  plugins: readonly PluginHostListEntry[]
): ActivePluginPage[] {
  return plugins
    .filter(isLivePlugin)
    .flatMap((plugin) => (plugin.pages ?? []).map((page) => fromPlugin(plugin, page)))
}

export function usePluginPages(): ActivePluginPage[] {
  return usePluginListDerived(collectActivePluginPages)
}

type PluginPageRequestsState = {
  /** The local file each page was last asked to show; null for none. Session-only. */
  paths: Record<string, string | null>
  setPagePath: (viewKey: PluginPageTopLevelView, path: string | null) => void
}

export const usePluginPageRequestsStore = create<PluginPageRequestsState>()((set) => ({
  paths: {},
  setPagePath: (viewKey, path) =>
    set((state) =>
      state.paths[viewKey] === path ? state : { paths: { ...state.paths, [viewKey]: path } }
    )
}))
