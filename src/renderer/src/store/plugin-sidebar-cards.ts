import type { PluginHostListEntry, PluginHostSidebarCard } from '../../../preload/api-types'
import {
  parsePluginSidebarCardBody,
  pluginSidebarCardBody,
  type PluginSidebarCardBody
} from '../../../shared/plugins/contributions/plugin-sidebar-card-items'
import { gateFor, type PluginSettingGate } from './plugin-sidebar-nav-items'
import { fromPlugin, isLivePlugin, usePluginListDerived } from './plugin-panels'
import { useMemo } from 'react'
import { usePluginSettingGates } from './use-plugin-setting-gates'

/** A sidebar card of an enabled plugin, before its `when` gate is applied. */
export type ActivePluginSidebarCard = Omit<PluginHostSidebarCard, 'when'> & {
  /** The `sidebarBody` value that shows this card. */
  body: PluginSidebarCardBody
  pluginKey: string
  pluginName: string
  gate?: PluginSettingGate
}

export function collectActivePluginSidebarCards(
  plugins: readonly PluginHostListEntry[]
): ActivePluginSidebarCard[] {
  return plugins.filter(isLivePlugin).flatMap((plugin) =>
    (plugin.sidebarCards ?? []).map(({ when, ...card }) => {
      const gate = when === undefined ? undefined : gateFor(plugin, when)
      return {
        ...fromPlugin(plugin, card),
        body: pluginSidebarCardBody(plugin.pluginKey, card.id),
        ...(gate ? { gate } : {})
      }
    })
  )
}

/** Cards the user may switch to now: their plugin is on and their `when` setting, if any, is true. */
export function usePluginSidebarCards(): ActivePluginSidebarCard[] {
  const cards = usePluginListDerived(collectActivePluginSidebarCards)
  const gates = usePluginSettingGates(cards)
  return useMemo(
    () =>
      cards.filter(
        (card) => card.gate === undefined || (gates[card.gate.valueKey] ?? card.gate.default)
      ),
    [cards, gates]
  )
}

/** The card a `sidebarBody` value names among those available, or null for Projects and Agents. */
export function findSidebarBodyCard(
  body: string,
  cards: readonly ActivePluginSidebarCard[]
): ActivePluginSidebarCard | null {
  return parsePluginSidebarCardBody(body)
    ? (cards.find((card) => card.body === body) ?? null)
    : null
}
