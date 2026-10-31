import type { PluginSidebarCardItem } from '../../shared/plugins/contributions/plugin-sidebar-card-items'

export type PluginSidebarCardRef = { pluginKey: string; cardId: string }

export type PluginSidebarCardsDeps = {
  /** Whether the plugin is enabled, approved and declares this card right now. */
  isDeclared: (pluginKey: string, cardId: string) => boolean
  /** Tells the owning plugin's worker (starting it when shown) that its card is shown or hidden. */
  announceVisibility: (pluginKey: string, cardId: string, visible: boolean) => void
  /** Tells windows that a card's rows changed. */
  itemsChanged: (pluginKey: string, cardId: string) => void
}

const cardKey = (pluginKey: string, cardId: string): string => `${pluginKey}/${cardId}`

/**
 * Rows plugin workers set for their sidebar cards, and which card each window shows. Everything
 * is in memory: rows survive a worker restart and a closed card, and end with the plugin.
 */
export class PluginSidebarCards {
  private readonly rows = new Map<string, readonly PluginSidebarCardItem[]>()
  /** The card each window shows, by window id; a window shows at most one. */
  private readonly shownByWindow = new Map<number, PluginSidebarCardRef>()
  private readonly viewers = new Map<string, number>()

  constructor(private readonly deps: PluginSidebarCardsDeps) {}

  setItems(
    pluginKey: string,
    cardId: string,
    items: readonly PluginSidebarCardItem[]
  ): { ok: true } | { ok: false; error: string; invalid: true } {
    if (!this.deps.isDeclared(pluginKey, cardId)) {
      return { ok: false, error: `${cardId} is not a declared sidebar card`, invalid: true }
    }
    this.rows.set(cardKey(pluginKey, cardId), items)
    this.deps.itemsChanged(pluginKey, cardId)
    return { ok: true }
  }

  getItems(pluginKey: string, cardId: string): readonly PluginSidebarCardItem[] {
    return this.deps.isDeclared(pluginKey, cardId)
      ? (this.rows.get(cardKey(pluginKey, cardId)) ?? [])
      : []
  }

  /** The row a window clicked, as the worker last set it; null when it is gone or the card is not live. */
  findItem(pluginKey: string, cardId: string, itemId: string): PluginSidebarCardItem | null {
    return this.getItems(pluginKey, cardId).find((item) => item.id === itemId) ?? null
  }

  /** Records which card a window shows (null for none). The first viewer and the last leaving announce. */
  setWindowCard(windowId: number, card: PluginSidebarCardRef | null): void {
    const before = this.shownByWindow.get(windowId)
    if (before && card && before.pluginKey === card.pluginKey && before.cardId === card.cardId) {
      return
    }
    if (card && !this.deps.isDeclared(card.pluginKey, card.cardId)) {
      card = null
    }
    if (card) {
      this.shownByWindow.set(windowId, card)
      this.adjust(card, 1)
    } else {
      this.shownByWindow.delete(windowId)
    }
    if (before) {
      this.adjust(before, -1)
    }
  }

  dropWindow(windowId: number): void {
    this.setWindowCard(windowId, null)
  }

  /** A shown card keeps its worker alive. */
  isShown(pluginKey: string): boolean {
    for (const key of this.viewers.keys()) {
      if (key.startsWith(`${pluginKey}/`)) {
        return true
      }
    }
    return false
  }

  /** Forgets rows and viewers of cards that are no longer declared by a live plugin. */
  prune(): void {
    for (const key of this.rows.keys()) {
      const cut = key.lastIndexOf('/')
      if (!this.deps.isDeclared(key.slice(0, cut), key.slice(cut + 1))) {
        this.rows.delete(key)
      }
    }
    for (const [windowId, card] of this.shownByWindow) {
      if (!this.deps.isDeclared(card.pluginKey, card.cardId)) {
        this.shownByWindow.delete(windowId)
        this.viewers.delete(cardKey(card.pluginKey, card.cardId))
      }
    }
  }

  private adjust(card: PluginSidebarCardRef, delta: 1 | -1): void {
    const key = cardKey(card.pluginKey, card.cardId)
    const next = (this.viewers.get(key) ?? 0) + delta
    if (next > 0) {
      this.viewers.set(key, next)
    } else {
      this.viewers.delete(key)
    }
    if ((delta === 1 && next === 1) || (delta === -1 && next <= 0)) {
      this.deps.announceVisibility(card.pluginKey, card.cardId, delta === 1)
    }
  }
}
