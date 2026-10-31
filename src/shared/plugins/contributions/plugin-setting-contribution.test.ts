import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import { PLUGIN_SETTINGS_SINCE } from '../manifest/plugin-schema-field-docs'
import { PLUGIN_SCHEMA_NEWEST_SINCE } from '../installation/plugin-host-version'
import { pluginUpdateAccessGrowth } from '../approval/plugin-update-access-growth'
import { PLUGIN_EVENT_CAPABILITY } from './plugin-event-contribution'
import { pluginContributionSummary } from './plugin-contribution-summary'
import { PLUGIN_SETTING_LIMIT } from './plugin-setting-contribution'
import { PLUGIN_RESERVED_CONTRIBUTION_POINTS } from './plugin-contribution-points'
import { isValidPluginSettingValue, resolvePluginSettings } from './plugin-setting-values'

const flag = { id: 'show-graph', title: 'Show graph', type: 'boolean', default: true }
const layout = {
  id: 'layout',
  title: 'Layout',
  description: 'How nodes are arranged.',
  type: 'enum',
  default: 'tree',
  options: [
    { value: 'tree', label: 'Tree' },
    { value: 'radial', label: 'Radial' }
  ]
}
const nickname = { id: 'nickname', title: 'Nickname', type: 'string', default: 'orca' }

function manifest(contributes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2,
    execution: 'declarative',
    id: 'graph',
    publisher: 'samples',
    name: 'Graph',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_SETTINGS_SINCE}` },
    contributes: {
      commands: [{ id: 'graph.open', title: 'Graph: Open', action: 'view.tasks' }],
      settings: [flag, layout, nickname],
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

function refusal(contributes: Record<string, unknown>): string {
  const result = parsePluginManifest(manifest(contributes))
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}

describe('contributes.settings', () => {
  it('is no longer reserved, and is the newest schema since', () => {
    expect(Object.keys(PLUGIN_RESERVED_CONTRIBUTION_POINTS)).not.toContain('settings')
    expect(PLUGIN_SCHEMA_NEWEST_SINCE).toBe(PLUGIN_SETTINGS_SINCE)
    expect(PLUGIN_SETTINGS_SINCE).toBe('1.4.249')
    expect(parsed().contributes.settings).toEqual([flag, layout, nickname])
  })

  it('defaults to none and works with the declarative profile', () => {
    expect(parsed({ settings: undefined }).contributes.settings).toEqual([])
    const data = parsePluginManifest({ ...manifest({ commands: [] }), execution: 'data' })
    expect(data.ok).toBe(false)
  })

  it('requires a default that matches the type', () => {
    expect(refusal({ settings: [{ ...flag, default: 'yes' }] })).toContain('true or false')
    expect(refusal({ settings: [{ ...nickname, default: true }] })).toContain('must be a string')
    expect(refusal({ settings: [{ ...flag, default: undefined }] })).toContain('default')
  })

  it('bounds a string default by maxLength, which defaults to 200', () => {
    expect(refusal({ settings: [{ ...nickname, maxLength: 3 }] })).toContain(
      'longer than maxLength'
    )
    expect(refusal({ settings: [{ ...nickname, default: 'x'.repeat(201) }] })).toContain(
      'longer than maxLength'
    )
    expect(
      parsed({ settings: [{ ...nickname, default: 'x'.repeat(200) }] }).contributes.settings
    ).toHaveLength(1)
    expect(refusal({ settings: [{ ...nickname, maxLength: 1001 }] })).toContain('1000')
  })

  it('validates enum options: 2 to 20, distinct, with the default among them', () => {
    expect(refusal({ settings: [{ ...layout, options: undefined }] })).toContain(
      'required for an enum'
    )
    expect(refusal({ settings: [{ ...layout, options: [layout.options[0]] }] })).toContain(
      'options'
    )
    const many = Array.from({ length: 21 }, (_, i) => ({ value: `v${i}`, label: `V${i}` }))
    expect(refusal({ settings: [{ ...layout, options: many, default: 'v0' }] })).toContain(
      'options'
    )
    const twenty = many.slice(0, 20)
    expect(
      parsed({ settings: [{ ...layout, options: twenty, default: 'v19' }] }).contributes.settings
    ).toHaveLength(1)
    expect(
      refusal({ settings: [{ ...layout, options: [layout.options[0], layout.options[0]] }] })
    ).toContain('distinct')
    expect(refusal({ settings: [{ ...layout, default: 'spiral' }] })).toContain(
      'one of the option values'
    )
    expect(refusal({ settings: [{ ...layout, default: true }] })).toContain(
      'one of the option values'
    )
  })

  it('refuses fields that do not belong to the type', () => {
    expect(refusal({ settings: [{ ...flag, options: layout.options }] })).toContain(
      'only for an enum'
    )
    expect(refusal({ settings: [{ ...flag, maxLength: 5 }] })).toContain('only for a string')
    expect(refusal({ settings: [{ ...layout, maxLength: 5 }] })).toContain('only for a string')
    expect(refusal({ settings: [{ ...flag, extra: 1 }] })).toBeTruthy()
  })

  it('refuses duplicate ids, reserved names and more than the limit', () => {
    expect(refusal({ settings: [flag, flag] })).toContain('duplicate')
    expect(refusal({ settings: [{ ...flag, id: 'constructor' }] })).toContain('reserved')
    expect(refusal({ settings: [{ ...flag, id: 'Not Kebab' }] })).toContain('kebab')
    const tooMany = Array.from({ length: PLUGIN_SETTING_LIMIT + 1 }, (_, i) => ({
      ...flag,
      id: `s-${i}`
    }))
    expect(refusal({ settings: tooMany })).toBeTruthy()
    expect(
      parsed({ settings: tooMany.slice(0, PLUGIN_SETTING_LIMIT) }).contributes.settings
    ).toHaveLength(PLUGIN_SETTING_LIMIT)
  })

  it('lists settings in the catalog summary with their type', () => {
    expect(pluginContributionSummary(parsed()).filter((item) => item.kind === 'settings')).toEqual([
      { kind: 'settings', name: 'Show graph', detail: 'boolean' },
      { kind: 'settings', name: 'Layout', detail: 'enum' },
      { kind: 'settings', name: 'Nickname', detail: 'string' }
    ])
  })

  it('is not access growth, however many settings an update adds', () => {
    const installed = parsed({ settings: [] })
    const next = parsed()
    expect(pluginUpdateAccessGrowth(installed, next).contributions).toEqual([])
  })

  it('delivers settings.changed under settings:own, in a worker with the event declared', () => {
    expect(PLUGIN_EVENT_CAPABILITY['settings.changed']).toBe('settings:own')
    const result = parsePluginManifest({
      ...manifest({ events: [{ on: 'settings.changed' }] }),
      execution: 'trusted-worker',
      main: 'worker.js',
      capabilities: [{ kind: 'settings:own' }]
    })
    expect(result.ok).toBe(true)
    const missing = parsePluginManifest({
      ...manifest({ events: [{ on: 'settings.changed' }] }),
      execution: 'trusted-worker',
      main: 'worker.js'
    })
    expect(!missing.ok && missing.error).toContain('settings:own')
  })
})

describe('sidebar nav item when', () => {
  const gated = { id: 'graph', title: 'Graph', command: 'graph.open', when: 'show-graph' }

  it('accepts a boolean setting of the same plugin, on any kind', () => {
    const items = parsed({
      sidebarNavItems: [
        gated,
        { id: 'details', title: 'Details', kind: 'toggle', setting: 'details', when: 'show-graph' },
        {
          id: 'child',
          title: 'Child',
          command: 'graph.open',
          parent: 'details',
          when: 'show-graph'
        }
      ]
    }).contributes.sidebarNavItems
    expect(items.map((item) => item.when)).toEqual(['show-graph', 'show-graph', 'show-graph'])
  })

  it('refuses a setting that is missing or not a boolean', () => {
    expect(refusal({ sidebarNavItems: [{ ...gated, when: 'missing' }] })).toContain(
      'unknown contributed setting: missing'
    )
    expect(refusal({ sidebarNavItems: [{ ...gated, when: 'layout' }] })).toContain(
      'must be a boolean'
    )
    expect(refusal({ sidebarNavItems: [{ ...gated, when: 'Not Kebab' }] })).toBeTruthy()
  })

  it('refuses a when when the plugin declares no settings', () => {
    expect(refusal({ settings: [], sidebarNavItems: [gated] })).toContain(
      'unknown contributed setting'
    )
  })
})

describe('setting values', () => {
  const [, enumSetting, stringSetting] = parsed().contributes.settings

  it('checks type, options and length', () => {
    expect(isValidPluginSettingValue(enumSetting, 'radial')).toBe(true)
    expect(isValidPluginSettingValue(enumSetting, 'spiral')).toBe(false)
    expect(isValidPluginSettingValue(stringSetting, 'x'.repeat(200))).toBe(true)
    expect(isValidPluginSettingValue(stringSetting, 'x'.repeat(201))).toBe(false)
    expect(isValidPluginSettingValue(stringSetting, 4)).toBe(false)
  })

  it('applies defaults, keeps untyped keys, and resets a value that no longer fits', () => {
    const declared = parsed().contributes.settings
    expect(
      resolvePluginSettings(declared, { layout: 'spiral', 'show-graph': false, extra: [1] })
    ).toEqual({ layout: 'tree', 'show-graph': false, nickname: 'orca', extra: [1] })
  })
})
