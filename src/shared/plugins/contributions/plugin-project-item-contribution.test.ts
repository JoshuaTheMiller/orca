import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import { satisfiesOrcaEngineRange } from '../manifest/plugin-manifest-engine-range'
import { PLUGIN_PROJECT_ITEMS_SINCE } from '../manifest/plugin-schema-field-docs'
import { PLUGIN_SCHEMA_NEWEST_SINCE } from '../installation/plugin-host-version'
import { pluginCatalogTypes } from '../catalog/plugin-catalog-types'
import { pluginUpdateAccessGrowth } from '../approval/plugin-update-access-growth'
import { PLUGIN_EVENT_PAYLOAD_SCHEMAS } from '../events/plugin-events'
import { PLUGIN_HOST_API, PLUGIN_HOST_API_MINOR } from '../workers/plugin-host-api'
import { pluginContributionSummary } from './plugin-contribution-summary'
import { PLUGIN_PROJECT_ITEM_LIMIT } from './plugin-project-item-contribution'

const item = { id: 'board', title: 'Board', icon: 'database', command: 'board.open' }

function manifest(contributes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2,
    execution: 'declarative',
    id: 'board',
    publisher: 'samples',
    name: 'Board',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_PROJECT_ITEMS_SINCE}` },
    contributes: {
      commands: [{ id: 'board.open', title: 'Board: Open', action: 'view.tasks' }],
      projectItems: [item],
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

const issue = (contributes: Record<string, unknown>): string | null => {
  const result = parsePluginManifest(manifest(contributes))
  return result.ok ? null : result.error
}

describe('contributes.projectItems', () => {
  it('is a declarative point, read from 1.4.251 on', () => {
    expect(PLUGIN_PROJECT_ITEMS_SINCE).toBe('1.4.251')
    expect(
      satisfiesOrcaEngineRange(PLUGIN_SCHEMA_NEWEST_SINCE, `>=${PLUGIN_PROJECT_ITEMS_SINCE}`)
    ).toBe(true)
    expect(parsed().contributes.projectItems).toEqual([item])
    expect(parsePluginManifest({ ...manifest(), execution: 'data' })).toMatchObject({ ok: false })
  })

  it('defaults to none and leaves the icon optional', () => {
    expect(parsed({ projectItems: undefined }).contributes.projectItems).toEqual([])
    const { icon: _icon, ...bare } = item
    expect(parsed({ projectItems: [bare] }).contributes.projectItems[0]).not.toHaveProperty('icon')
  })

  it('requires a command and refuses one the plugin does not contribute', () => {
    const { command: _command, ...noCommand } = item
    expect(parsePluginManifest(manifest({ projectItems: [noCommand] }))).toMatchObject({
      ok: false
    })
    expect(issue({ projectItems: [{ ...item, command: 'missing' }] })).toContain(
      'unknown contributed command: missing'
    )
  })

  it('refuses duplicate ids, unknown icons, unknown fields and a kind', () => {
    expect(issue({ projectItems: [item, item] })).toContain('duplicate projectItems id: board')
    expect(issue({ projectItems: [{ ...item, icon: 'not-an-icon' }] })).not.toBeNull()
    expect(issue({ projectItems: [{ ...item, badge: 1 }] })).not.toBeNull()
    expect(issue({ projectItems: [{ ...item, kind: 'toggle' }] })).not.toBeNull()
  })

  it('allows four items and refuses a fifth', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...item, id: `item-${index}` }))
    expect(PLUGIN_PROJECT_ITEM_LIMIT).toBe(4)
    expect(parsePluginManifest(manifest({ projectItems: many(4) })).ok).toBe(true)
    expect(parsePluginManifest(manifest({ projectItems: many(5) })).ok).toBe(false)
  })

  describe('when', () => {
    const settings = [{ id: 'show-board', title: 'Show board', type: 'boolean', default: true }]

    it('accepts a boolean setting of the plugin', () => {
      const items = parsed({ settings, projectItems: [{ ...item, when: 'show-board' }] })
        .contributes.projectItems
      expect(items[0].when).toBe('show-board')
    })

    it('refuses an unknown setting and a setting that is not a boolean', () => {
      expect(issue({ projectItems: [{ ...item, when: 'missing' }] })).toContain(
        'unknown contributed setting: missing'
      )
      const text = [{ id: 'layout', title: 'Layout', type: 'string', default: 'a' }]
      expect(issue({ settings: text, projectItems: [{ ...item, when: 'layout' }] })).toContain(
        'must be a boolean'
      )
    })
  })

  describe('titleSetting', () => {
    const text = [{ id: 'board-name', title: 'Board name', type: 'string', default: '' }]

    it('accepts a string setting of the plugin', () => {
      const items = parsed({
        settings: text,
        projectItems: [{ ...item, titleSetting: 'board-name' }]
      }).contributes.projectItems
      expect(items[0].titleSetting).toBe('board-name')
    })

    it('refuses an unknown setting and one that is not a string', () => {
      expect(issue({ projectItems: [{ ...item, titleSetting: 'missing' }] })).toContain(
        'unknown contributed setting: missing'
      )
      const flag = [{ id: 'flag', title: 'Flag', type: 'boolean', default: true }]
      expect(
        issue({ settings: flag, projectItems: [{ ...item, titleSetting: 'flag' }] })
      ).toContain('must be a string')
    })
  })

  it('is summarized with its command, adds no catalog type and counts as access growth', () => {
    const plugin = parsed()
    expect(
      pluginContributionSummary(plugin).filter((entry) => entry.kind === 'projectItems')
    ).toEqual([{ kind: 'projectItems', name: 'Board', detail: 'board.open' }])
    expect(pluginCatalogTypes(plugin)).toEqual(['instructions'])
    const before = parsed({ projectItems: [] })
    expect(pluginUpdateAccessGrowth(before, plugin).contributions).toContain('projectItems')
    expect(pluginUpdateAccessGrowth(plugin, plugin).contributions).toEqual([])
  })

  describe('projectItems.visible event', () => {
    const worker = {
      main: 'main.mjs',
      capabilities: [{ kind: 'workspace:read' }],
      execution: 'trusted-worker'
    }
    const subscribe = (extra: Record<string, unknown> = {}) =>
      parsePluginManifest({
        ...manifest({ events: [{ on: 'projectItems.visible' }] }),
        ...worker,
        ...extra
      })

    it('can be declared with workspace:read and a worker', () => {
      expect(subscribe().ok).toBe(true)
    })

    it('needs workspace:read and an engine floor of the release that added it', () => {
      const noCapability = subscribe({ capabilities: [] })
      expect(!noCapability.ok && noCapability.error).toContain('workspace:read')
      expect(subscribe({ engines: { orca: '>=1.4.250' } }).ok).toBe(false)
    })

    it('has a bounded payload', () => {
      const schema = PLUGIN_EVENT_PAYLOAD_SCHEMAS['projectItems.visible']
      expect(
        schema.safeParse({
          itemId: 'board',
          projects: [{ id: 'p1', name: 'P1', paths: ['C:\\code\\p1'] }]
        }).success
      ).toBe(true)
      expect(
        schema.safeParse({ itemId: 'board', projects: [{ id: 'p1', name: 'P1' }] }).success
      ).toBe(false)
    })
  })

  it('adds the worker-only projectItems.setDetail host method and raises the minor', () => {
    const method = PLUGIN_HOST_API['projectItems.setDetail']
    expect(method.surfaces).toEqual(['worker'])
    expect(method.mutation).toBe(false)
    expect(method.params.safeParse({ itemId: 'board', projectId: 'p', text: '3/7' }).success).toBe(
      true
    )
    expect(method.params.safeParse({ itemId: 'board', projectId: 'p', text: '' }).success).toBe(
      true
    )
    expect(
      method.params.safeParse({ itemId: 'board', projectId: 'p', text: 'x'.repeat(17) }).success
    ).toBe(false)
    expect(PLUGIN_HOST_API_MINOR).toBe(4)
  })
})
