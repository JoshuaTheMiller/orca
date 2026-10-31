import React, { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { translate } from '@/i18n/i18n'
import type { ActivePluginSidebarCard } from '@/store/plugin-sidebar-cards'
import type { PluginSidebarCardItem } from '../../../../shared/plugins/contributions/plugin-sidebar-card-items'
import { PluginSidebarCardRow } from './PluginSidebarCardRow'
import { runPluginSidebarCardAction } from './plugin-sidebar-card-actions'

/** Past this many rows the list renders only the rows in view. */
export const PLUGIN_SIDEBAR_CARD_VIRTUALIZE_AFTER = 100
const ESTIMATED_ROW_HEIGHT = 44

/** The rows main last holds for a card, kept current as the plugin worker sets them. */
function usePluginSidebarCardItems(card: ActivePluginSidebarCard): PluginSidebarCardItem[] | null {
  const [items, setItems] = useState<PluginSidebarCardItem[] | null>(null)
  const { pluginKey, id: cardId } = card
  useEffect(() => {
    let stale = false
    const load = (): void => {
      window.api.plugins
        .getSidebarCardItems({ pluginKey, cardId })
        .then((loaded) => {
          if (!stale) {
            setItems(loaded)
          }
        })
        // Why: an older host has no rows; the card then reads as empty.
        .catch(() => {
          if (!stale) {
            setItems([])
          }
        })
    }
    load()
    const stop = window.api.plugins.onSidebarCardItemsChanged((change) => {
      if (change.pluginKey === pluginKey && change.cardId === cardId) {
        load()
      }
    })
    return () => {
      stale = true
      stop()
    }
  }, [pluginKey, cardId])
  return items
}

function VirtualizedRows({
  items,
  onRun
}: {
  items: readonly PluginSidebarCardItem[]
  onRun: (item: PluginSidebarCardItem) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => items[index]?.id ?? index,
    overscan: 8
  })
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-2">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          return item ? (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <PluginSidebarCardRow item={item} onRun={onRun} />
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

/** The left sidebar body of a plugin card: the rows its worker set, or its empty text. */
export default function PluginSidebarCardBody({
  card
}: {
  card: ActivePluginSidebarCard
}): React.JSX.Element {
  useTranslation()
  const items = usePluginSidebarCardItems(card)
  const run = React.useCallback(
    (item: PluginSidebarCardItem) =>
      void runPluginSidebarCardAction({ pluginKey: card.pluginKey, cardId: card.id }, item),
    [card.pluginKey, card.id]
  )
  if (items === null) {
    return <div className="min-h-0 flex-1" />
  }
  if (items.length === 0) {
    return (
      <div
        data-plugin-sidebar-card-empty=""
        className="min-h-0 flex-1 px-4 py-6 text-center text-xs text-worktree-sidebar-foreground/45"
      >
        {card.emptyText ??
          translate('auto.components.sidebar.PluginSidebarCard.empty', 'Nothing to show yet.')}
      </div>
    )
  }
  if (items.length > PLUGIN_SIDEBAR_CARD_VIRTUALIZE_AFTER) {
    return <VirtualizedRows items={items} onRun={run} />
  }
  return (
    <div
      data-plugin-sidebar-card={card.body}
      className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-2"
    >
      {items.map((item) => (
        <PluginSidebarCardRow key={item.id} item={item} onRun={run} />
      ))}
    </div>
  )
}
