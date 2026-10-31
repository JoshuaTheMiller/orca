import { useEffect } from 'react'
import { useAppStore } from '@/store'
import {
  findSidebarBodyCard,
  usePluginSidebarCards,
  type ActivePluginSidebarCard
} from '@/store/plugin-sidebar-cards'

/**
 * Resolves the sidebar body to a plugin card when it names one, returns to Projects when that card
 * is gone (plugin off, `when` false), and tells main which card this window shows so the plugin's
 * worker hears of it. A closed sidebar shows nothing.
 */
export function usePluginSidebarCardBody(sidebarOpen: boolean): {
  cards: ActivePluginSidebarCard[]
  current: ActivePluginSidebarCard | null
} {
  const cards = usePluginSidebarCards()
  const sidebarBody = useAppStore((s) => s.sidebarBody ?? 'workspaces')
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)
  const current = findSidebarBodyCard(sidebarBody, cards)
  const namesCard = sidebarBody.startsWith('plugin:')
  useEffect(() => {
    if (namesCard && !current) {
      setSidebarBody('workspaces')
    }
  }, [namesCard, current, setSidebarBody])
  const shownPluginKey = sidebarOpen ? (current?.pluginKey ?? null) : null
  const shownCardId = sidebarOpen ? (current?.id ?? null) : null
  useEffect(() => {
    const setShown = window.api?.plugins?.setSidebarCardShown
    if (!setShown) {
      return
    }
    void setShown(
      shownPluginKey !== null && shownCardId !== null
        ? { pluginKey: shownPluginKey, cardId: shownCardId }
        : null
    ).catch(() => undefined)
  }, [shownPluginKey, shownCardId])
  return { cards, current }
}
