import { PLUGIN_PROJECT_ITEM_VISIBLE_PROJECT_LIMIT } from '../../shared/plugins/events/plugin-events'
import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'

export type PluginProjectItemProject = { id: string; name: string; paths: string[] }

export type PluginProjectItemDetail = {
  pluginKey: string
  itemId: string
  projectId: string
  /** Empty when cleared. */
  text: string
}

/** One window's report of where an item shows. */
export type PluginProjectItemVisibility = {
  pluginKey: string
  itemId: string
  projects: PluginProjectItemProject[]
}

type WriteResult = { ok: true } | { ok: false; error: string; invalid: true }

// Why a cap: a worker that sets details for ids it invents must not grow main's memory without bound.
const DETAIL_LIMIT_PER_PLUGIN = 2048

const detailKey = (itemId: string, projectId: string): string => `${itemId}\u0000${projectId}`

/**
 * Project item state main keeps in memory: the detail text workers set per plugin, item and project,
 * and the projects each item shows under (reported by the windows), turned into `projectItems.visible`
 * events. Nothing is persisted; a plugin that goes away loses its details.
 */
export class PluginProjectItems {
  private readonly details = new Map<string, Map<string, string>>()
  private readonly visibleBySender = new Map<number, PluginProjectItemVisibility[]>()
  private readonly lastEmitted = new Map<string, string>()

  constructor(
    private readonly deps: {
      declaredItemIds: (pluginKey: string) => readonly string[]
      onDetailChanged: (change: PluginProjectItemDetail) => void
      emitVisible: (
        pluginKey: string,
        payload: { itemId: string; projects: PluginProjectItemProject[] }
      ) => void
    }
  ) {}

  setDetail(
    pluginKey: string,
    input: { itemId: string; projectId: string; text: string }
  ): WriteResult {
    if (!this.deps.declaredItemIds(pluginKey).includes(input.itemId)) {
      return {
        ok: false,
        error: `${input.itemId} is not a project item of this plugin`,
        invalid: true
      }
    }
    const forPlugin = this.details.get(pluginKey) ?? new Map<string, string>()
    const key = detailKey(input.itemId, input.projectId)
    const before = forPlugin.get(key) ?? ''
    if (input.text === '') {
      forPlugin.delete(key)
    } else if (forPlugin.has(key) || forPlugin.size < DETAIL_LIMIT_PER_PLUGIN) {
      forPlugin.set(key, input.text)
    } else {
      return { ok: false, error: 'too many project item details', invalid: true }
    }
    if (forPlugin.size > 0) {
      this.details.set(pluginKey, forPlugin)
    } else {
      this.details.delete(pluginKey)
    }
    if (before !== input.text) {
      this.deps.onDetailChanged({ pluginKey, ...input })
    }
    return { ok: true }
  }

  snapshot(): PluginProjectItemDetail[] {
    return [...this.details].flatMap(([pluginKey, forPlugin]) =>
      [...forPlugin].map(([key, text]) => {
        const [itemId, projectId] = key.split('\u0000')
        return { pluginKey, itemId, projectId, text }
      })
    )
  }

  /** Forgets a plugin's details, telling windows to clear them. */
  clearPlugin(pluginKey: string): void {
    const forPlugin = this.details.get(pluginKey)
    this.details.delete(pluginKey)
    for (const key of this.lastEmitted.keys()) {
      if (key.startsWith(`${pluginKey}\u0001`)) {
        this.lastEmitted.delete(key)
      }
    }
    for (const key of forPlugin?.keys() ?? []) {
      const [itemId, projectId] = key.split('\u0000')
      this.deps.onDetailChanged({ pluginKey, itemId, projectId, text: '' })
    }
  }

  /** Drops details of plugins that are no longer enabled, installed and approved. */
  prune(isLive: (pluginKey: string) => boolean): void {
    for (const pluginKey of Array.from(this.details.keys())) {
      if (!isLive(pluginKey)) {
        this.clearPlugin(pluginKey)
      }
    }
  }

  /** Replaces what one window shows, then sends `projectItems.visible` for every item whose combined set changed. */
  reportVisible(senderId: number, report: readonly PluginProjectItemVisibility[]): void {
    const before = this.visibleKeys()
    if (report.length === 0) {
      this.visibleBySender.delete(senderId)
    } else {
      this.visibleBySender.set(senderId, [...report])
    }
    this.announce(before)
  }

  dropSender(senderId: number): void {
    this.reportVisible(senderId, [])
  }

  private visibleKeys(): Set<string> {
    const keys = new Set<string>()
    for (const report of this.visibleBySender.values()) {
      for (const entry of report) {
        keys.add(`${entry.pluginKey}\u0001${entry.itemId}`)
      }
    }
    return keys
  }

  private combined(pluginKey: string, itemId: string): PluginProjectItemProject[] {
    const byId = new Map<string, PluginProjectItemProject>()
    for (const report of this.visibleBySender.values()) {
      for (const entry of report) {
        if (entry.pluginKey === pluginKey && entry.itemId === itemId) {
          for (const project of entry.projects) {
            byId.set(project.id, project)
          }
        }
      }
    }
    return [...byId.values()]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, PLUGIN_PROJECT_ITEM_VISIBLE_PROJECT_LIMIT)
  }

  private announce(keysBefore: ReadonlySet<string>): void {
    for (const key of new Set([...keysBefore, ...this.visibleKeys()])) {
      const [pluginKey, itemId] = key.split('\u0001')
      const projects = this.combined(pluginKey, itemId)
      const serialized = JSON.stringify(projects)
      const previous = this.lastEmitted.get(key)
      // Why skip the first empty set: an item that never showed has nothing to take back.
      if (previous === serialized || (previous === undefined && projects.length === 0)) {
        continue
      }
      this.lastEmitted.set(key, serialized)
      this.deps.emitVisible(pluginKey, { itemId, projects })
    }
  }
}

/** The project items a plugin declares, for a service that knows its valid plugins. */
export function createPluginServiceProjectItems(service: {
  options: { onProjectItemDetailChanged?: (change: PluginProjectItemDetail) => void }
  findValidPlugin(pluginKey: string): { manifest: PluginManifest } | null
  emitEvent(event: 'projectItems.visible', payload: unknown, onlyPluginKey: string): void
}): PluginProjectItems {
  return new PluginProjectItems({
    declaredItemIds: (pluginKey) =>
      service.findValidPlugin(pluginKey)?.manifest.contributes.projectItems.map((i) => i.id) ?? [],
    onDetailChanged: (change) => service.options.onProjectItemDetailChanged?.(change),
    // Why one plugin: the projects and their paths go to the plugin that owns the item alone.
    emitVisible: (pluginKey, payload) =>
      service.emitEvent('projectItems.visible', payload, pluginKey)
  })
}
