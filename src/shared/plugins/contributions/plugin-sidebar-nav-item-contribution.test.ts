import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import { PLUGIN_SIDEBAR_NAV_ITEMS_SINCE } from '../manifest/plugin-schema-field-docs'
import { PLUGIN_SCHEMA_NEWEST_SINCE } from '../installation/plugin-host-version'
import { pluginCatalogTypes } from '../catalog/plugin-catalog-types'
import { pluginUpdateAccessGrowth } from '../approval/plugin-update-access-growth'
import { pluginContributionSummary } from './plugin-contribution-summary'
import { PLUGIN_SIDEBAR_NAV_ITEM_LIMIT } from './plugin-sidebar-nav-item-contribution'

const item = { id: 'graph', title: 'Graph', icon: 'database', command: 'graph.open' }

function manifest(contributes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2,
    execution: 'declarative',
    id: 'graph',
    publisher: 'samples',
    name: 'Graph',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_SIDEBAR_NAV_ITEMS_SINCE}` },
    contributes: {
      commands: [{ id: 'graph.open', title: 'Graph: Open', action: 'view.tasks' }],
      sidebarNavItems: [item],
      ...contributes
    }
  }
}

function parsed(contributes: Record<string, unknown> = {}) {
  const result = parsePluginManifest(manifest(contributes))
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.manifest
}

describe('contributes.sidebarNavItems', () => {
  it('is the newest schema since, and a declarative point', () => {
    expect(PLUGIN_SCHEMA_NEWEST_SINCE).toBe(PLUGIN_SIDEBAR_NAV_ITEMS_SINCE)
    expect(parsed().contributes.sidebarNavItems).toEqual([item])
  })

  it('defaults to none and leaves the icon optional', () => {
    expect(parsed({ sidebarNavItems: undefined }).contributes.sidebarNavItems).toEqual([])
    const { icon: _icon, ...bare } = item
    expect(parsed({ sidebarNavItems: [bare] }).contributes.sidebarNavItems[0]).not.toHaveProperty(
      'icon'
    )
  })

  it('refuses a command the plugin does not contribute', () => {
    const result = parsePluginManifest(
      manifest({ sidebarNavItems: [{ ...item, command: 'missing' }] })
    )
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toContain('unknown contributed command: missing')
  })

  it('refuses duplicate ids, unknown icons and unknown fields', () => {
    const duplicate = parsePluginManifest(manifest({ sidebarNavItems: [item, item] }))
    expect(!duplicate.ok && duplicate.error).toContain('duplicate sidebarNavItems id: graph')
    expect(
      parsePluginManifest(manifest({ sidebarNavItems: [{ ...item, icon: 'not-an-icon' }] }))
    ).toMatchObject({ ok: false })
    expect(
      parsePluginManifest(manifest({ sidebarNavItems: [{ ...item, badge: 1 }] }))
    ).toMatchObject({ ok: false })
  })

  it('allows eight items and refuses a ninth', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...item, id: `item-${index}` }))
    expect(PLUGIN_SIDEBAR_NAV_ITEM_LIMIT).toBe(8)
    expect(parsePluginManifest(manifest({ sidebarNavItems: many(8) })).ok).toBe(true)
    expect(parsePluginManifest(manifest({ sidebarNavItems: many(9) })).ok).toBe(false)
  })

  describe('toggles, checkboxes and parents', () => {
    const toggle = { id: 'details', title: 'Details', kind: 'toggle', setting: 'show-details' }
    const checkbox = {
      id: 'labels',
      title: 'Labels',
      kind: 'checkbox',
      setting: 'show-labels',
      default: true,
      parent: 'details'
    }
    const issue = (items: unknown[]) => {
      const result = parsePluginManifest(manifest({ sidebarNavItems: items }))
      return result.ok ? null : result.error
    }

    it('accepts a toggle with a child command and a child checkbox', () => {
      const child = { ...item, id: 'open', parent: 'details' }
      const items = parsed({ sidebarNavItems: [item, toggle, child, checkbox] }).contributes
        .sidebarNavItems
      expect(items).toEqual([item, toggle, child, checkbox])
    })

    it('requires a command on command items and a setting on toggles and checkboxes', () => {
      const { command: _command, ...noCommand } = item
      expect(issue([noCommand])).toContain('required for a command item')
      expect(issue([{ ...noCommand, kind: 'command' }])).toContain('required for a command item')
      const { setting: _setting, ...noSetting } = toggle
      expect(issue([noSetting])).toContain('required for a toggle')
      expect(issue([{ ...noSetting, kind: 'checkbox' }])).toContain('required for a checkbox')
    })

    it('forbids a command on stateful items and a setting or default on commands', () => {
      expect(issue([{ ...toggle, command: 'graph.open' }])).toContain('not allowed on a toggle')
      expect(issue([{ ...item, setting: 'show-details' }])).toContain(
        'only for a toggle or checkbox'
      )
      expect(issue([{ ...item, default: true }])).toContain('only for a toggle or checkbox')
    })

    it('refuses an unsafe setting key and a duplicate one', () => {
      expect(issue([{ ...toggle, setting: 'Show Details' }])).toContain('kebab-case')
      expect(issue([{ ...toggle, setting: 'constructor' }])).toContain('reserved name')
      expect(
        issue([toggle, { ...checkbox, parent: undefined, setting: 'show-details' }])
      ).toContain('duplicate setting: show-details')
    })

    it('refuses a parent that is missing, not a toggle, or the item itself', () => {
      expect(issue([toggle, { ...checkbox, parent: 'nope' }])).toContain(
        'unknown sidebar nav item: nope'
      )
      expect(issue([item, { ...checkbox, parent: 'graph' }])).toContain('must be a toggle')
      expect(
        issue([toggle, { ...checkbox, id: 'more', setting: 'more', parent: 'labels' }, checkbox])
      ).toContain('must be a toggle')
      expect(issue([{ ...toggle, parent: 'details' }])).toContain('its own parent')
    })

    it('refuses nesting deeper than one level, including a cycle', () => {
      const inner = {
        id: 'inner',
        title: 'Inner',
        kind: 'toggle',
        setting: 'inner',
        parent: 'details'
      }
      expect(issue([toggle, inner, { ...checkbox, parent: 'inner' }])).toContain(
        'only one level is allowed'
      )
      expect(
        issue([
          { ...toggle, parent: 'inner' },
          { ...inner, parent: 'details' }
        ])
      ).toContain('parent cycle')
    })

    it('summarizes a toggle by kind and setting, and counts it as access growth', () => {
      const plugin = parsed({ sidebarNavItems: [toggle] })
      expect(
        pluginContributionSummary(plugin).filter((entry) => entry.kind === 'sidebarNavItems')
      ).toEqual([{ kind: 'sidebarNavItems', name: 'Details', detail: 'toggle:show-details' }])
      const before = parsed({ sidebarNavItems: [] })
      expect(pluginUpdateAccessGrowth(before, plugin).contributions).toContain('sidebarNavItems')
    })
  })

  it('refuses a data execution profile', () => {
    expect(parsePluginManifest({ ...manifest(), execution: 'data' })).toMatchObject({ ok: false })
  })

  it('is summarized with its command and adds no catalog type of its own', () => {
    const plugin = parsed()
    expect(
      pluginContributionSummary(plugin).filter((entry) => entry.kind === 'sidebarNavItems')
    ).toEqual([{ kind: 'sidebarNavItems', name: 'Graph', detail: 'graph.open' }])
    expect(pluginCatalogTypes(plugin)).toEqual(['instructions'])
  })

  it('counts a new nav item as access growth, like a new command', () => {
    const before = parsed({ sidebarNavItems: [] })
    const after = parsed()
    expect(pluginUpdateAccessGrowth(before, after).contributions).toContain('sidebarNavItems')
    expect(pluginUpdateAccessGrowth(after, after).contributions).toEqual([])
  })
})
