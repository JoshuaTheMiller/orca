import { create } from 'zustand'

/** Detail text workers set on project item rows, mirrored from main; main owns the truth. */
export const usePluginProjectItemDetailsStore = create<{ details: Record<string, string> }>(() => ({
  details: {}
}))

/** Key of one row's detail: the item across plugins, then the project. */
export function pluginProjectItemDetailKey(itemKey: string, projectId: string): string {
  return `${itemKey}\u0000${projectId}`
}

// Why the object, not a flag: the bridge is one per window, and a replaced bridge needs its own listener.
let watched: object | null = null

function applyChange(change: {
  pluginKey: string
  itemId: string
  projectId: string
  text: string
}): void {
  const key = pluginProjectItemDetailKey(`${change.pluginKey}/${change.itemId}`, change.projectId)
  usePluginProjectItemDetailsStore.setState(({ details }) => {
    if (change.text === '') {
      const { [key]: _removed, ...rest } = details
      return { details: rest }
    }
    return { details: { ...details, [key]: change.text } }
  })
}

/** Reads the details workers have set so far and keeps them current; safe to call from every row host. */
export function loadPluginProjectItemDetails(): void {
  const plugins = window.api?.plugins
  if (!plugins?.getProjectItemDetails || watched === plugins) {
    return
  }
  watched = plugins
  plugins.onProjectItemDetailChanged(applyChange)
  void plugins
    .getProjectItemDetails()
    .then((loaded) => loaded.forEach(applyChange))
    // Why ignored: an older host has none; rows then show no detail.
    .catch(() => undefined)
}
