import { describe, expect, it } from 'vitest'
import type { PluginHostListEntry } from '../../../preload/api-types'
import { collectActivePluginSidebarCards, findSidebarBodyCard } from './plugin-sidebar-cards'

function plugin(overrides: Partial<PluginHostListEntry> = {}): PluginHostListEntry {
  // SAFETY: only the members the collector reads are filled in.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  return {
    pluginKey: 'samples.tracker',
    name: 'Tracker',
    status: 'running',
    settings: [{ id: 'show', title: 'Show', type: 'boolean', default: true }],
    sidebarCards: [
      { id: 'issues', title: 'Issues', icon: 'bug', when: 'show' },
      { id: 'prs', title: 'Pull requests' }
    ],
    ...overrides
  } as PluginHostListEntry
}

describe('collectActivePluginSidebarCards', () => {
  it('lists the cards of enabled plugins with their sidebar body value and gate', () => {
    const cards = collectActivePluginSidebarCards([plugin()])
    expect(cards.map((card) => card.body)).toEqual([
      'plugin:samples.tracker/issues',
      'plugin:samples.tracker/prs'
    ])
    expect(cards[0]).toMatchObject({
      title: 'Issues',
      icon: 'bug',
      pluginName: 'Tracker',
      gate: { valueKey: 'samples.tracker/show', default: true }
    })
    expect(cards[1]).not.toHaveProperty('gate')
  })

  it('offers nothing from a disabled or invalid plugin, or one that predates cards', () => {
    expect(
      collectActivePluginSidebarCards([
        plugin({ status: 'disabled' }),
        plugin({ status: 'invalid' }),
        plugin({ sidebarCards: undefined })
      ])
    ).toEqual([])
  })

  it('closes a gate that names a setting the plugin lacks', () => {
    const [card] = collectActivePluginSidebarCards([
      plugin({ settings: [], sidebarCards: [{ id: 'issues', title: 'Issues', when: 'gone' }] })
    ])
    expect(card?.gate?.default).toBe(false)
  })
})

describe('findSidebarBodyCard', () => {
  const cards = collectActivePluginSidebarCards([plugin()])

  it('finds the card a plugin body names, and nothing for the built-in bodies', () => {
    expect(findSidebarBodyCard('plugin:samples.tracker/prs', cards)?.title).toBe('Pull requests')
    expect(findSidebarBodyCard('workspaces', cards)).toBeNull()
    expect(findSidebarBodyCard('agents', cards)).toBeNull()
    expect(findSidebarBodyCard('plugin:samples.tracker/gone', cards)).toBeNull()
  })
})
