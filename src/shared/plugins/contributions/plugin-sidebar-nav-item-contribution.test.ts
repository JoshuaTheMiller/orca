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
