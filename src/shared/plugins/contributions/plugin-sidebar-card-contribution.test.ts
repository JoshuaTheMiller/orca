import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import { satisfiesOrcaEngineRange } from '../manifest/plugin-manifest-engine-range'
import { PLUGIN_SIDEBAR_CARDS_SINCE } from '../manifest/plugin-schema-field-docs'
import { PLUGIN_SCHEMA_NEWEST_SINCE } from '../installation/plugin-host-version'
import { pluginUpdateAccessGrowth } from '../approval/plugin-update-access-growth'
import { pluginExecutionProfile } from './plugin-execution-profile'
import { pluginContributionSummary } from './plugin-contribution-summary'
import { PLUGIN_RESERVED_CONTRIBUTION_POINTS } from './plugin-contribution-points'
import { PLUGIN_SIDEBAR_CARD_LIMIT } from './plugin-sidebar-card-contribution'
import {
  parsePluginSidebarCardBody,
  pluginSidebarCardBody,
  pluginSidebarCardItemsSchema
} from './plugin-sidebar-card-items'

const card = { id: 'issues', title: 'Issues', icon: 'bug', emptyText: 'No issues.', when: 'show' }
const showSetting = { id: 'show', title: 'Show issues', type: 'boolean', default: true }

function manifest(contributes: Record<string, unknown> = {}, main: string | null = 'worker.js') {
  return {
    manifestVersion: 2,
    execution: 'trusted-worker',
    id: 'tracker',
    publisher: 'samples',
    name: 'Tracker',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_SIDEBAR_CARDS_SINCE}` },
    ...(main ? { main } : {}),
    contributes: { settings: [showSetting], sidebarCards: [card], ...contributes }
  }
}

function parsed(contributes: Record<string, unknown> = {}) {
  const result = parsePluginManifest(manifest(contributes))
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.manifest
}

function errorOf(raw: unknown): string {
  const result = parsePluginManifest(raw)
  return result.ok ? '' : result.error
}

describe('contributes.sidebarCards', () => {
  it('is no longer reserved and is read by every release from its since on', () => {
    expect(Object.keys(PLUGIN_RESERVED_CONTRIBUTION_POINTS)).not.toContain('sidebarCards')
    expect(PLUGIN_SIDEBAR_CARDS_SINCE).toBe('1.4.250')
    expect(
      satisfiesOrcaEngineRange(PLUGIN_SCHEMA_NEWEST_SINCE, `>=${PLUGIN_SIDEBAR_CARDS_SINCE}`)
    ).toBe(true)
    expect(parsed().contributes.sidebarCards).toEqual([card])
  })

  it('defaults to none and leaves icon, empty text and gate optional', () => {
    expect(parsed({ sidebarCards: undefined }).contributes.sidebarCards).toEqual([])
    expect(parsed({ sidebarCards: [{ id: 'a', title: 'A' }] }).contributes.sidebarCards).toEqual([
      { id: 'a', title: 'A' }
    ])
  })

  it('allows at most four cards, with unique ids', () => {
    const many = Array.from({ length: PLUGIN_SIDEBAR_CARD_LIMIT + 1 }, (_, index) => ({
      id: `card-${index}`,
      title: `Card ${index}`
    }))
    expect(errorOf(manifest({ sidebarCards: many }))).toContain('sidebarCards')
    expect(parsed({ sidebarCards: many.slice(0, 4) }).contributes.sidebarCards).toHaveLength(4)
    expect(errorOf(manifest({ sidebarCards: [many[0], many[0]] }))).toContain(
      'duplicate sidebarCards id: card-0'
    )
  })

  it('refuses unknown fields, unknown icons and over-long titles', () => {
    for (const bad of [
      { ...card, layout: 'grid' },
      { ...card, icon: 'not-an-icon' },
      { ...card, title: 'x'.repeat(33) }
    ]) {
      expect(errorOf(manifest({ sidebarCards: [bad] }))).toContain('sidebarCards')
    }
  })

  it('needs a boolean setting of the same plugin for `when`', () => {
    expect(errorOf(manifest({ sidebarCards: [{ ...card, when: 'missing' }] }))).toContain(
      'unknown contributed setting: missing'
    )
    const text = { id: 'name', title: 'Name', type: 'string', default: '' }
    expect(
      errorOf(manifest({ settings: [text], sidebarCards: [{ ...card, when: 'name' }] }))
    ).toContain('setting name must be a boolean')
  })

  it('needs a worker, and the trusted-worker profile', () => {
    expect(errorOf(manifest({}, null))).toContain('required when contributes.sidebarCards')
    expect(errorOf({ ...manifest(), execution: 'declarative', capabilities: [] })).toContain(
      'trusted-worker'
    )
    expect(pluginExecutionProfile(parsed())).toBe('trusted-worker')
  })

  it('lets a worker subscribe to its visibility, but only with a card declared', () => {
    const events = [{ on: 'sidebarCards.visibilityChanged' }]
    expect(parsed({ events }).contributes.events).toEqual(events)
    expect(errorOf(manifest({ events, sidebarCards: [] }))).toContain(
      'sidebarCards.visibilityChanged requires a contributes.sidebarCards entry'
    )
  })

  it('names each card in the catalog summary', () => {
    expect(
      pluginContributionSummary(parsed()).filter((item) => item.kind === 'sidebarCards')
    ).toEqual([{ kind: 'sidebarCards', name: 'Issues' }])
  })

  it('counts a new card as access growth, but not a retitled one', () => {
    const before = parsed()
    const retitled = parsed({ sidebarCards: [{ ...card, title: 'Tickets' }] })
    const added = parsed({ sidebarCards: [card, { id: 'prs', title: 'Pull requests' }] })
    expect(pluginUpdateAccessGrowth(before, retitled).contributions).toEqual([])
    expect(pluginUpdateAccessGrowth(before, added).contributions).toEqual(['sidebarCards'])
  })
})

describe('sidebar card rows', () => {
  const row = { id: 'one', title: 'One' }

  it('accepts every documented row field', () => {
    const rows = [
      {
        id: 'a',
        title: 'A',
        subtitle: 'sub',
        icon: 'bug',
        badges: [{ label: 'new', tone: 'success' }, { label: 'plain' }],
        action: { kind: 'command', command: 'tracker.open', args: { id: 1 } }
      },
      { id: 'b', title: 'B', action: { kind: 'openFile', path: '/tmp/a.md', placement: 'auto' } }
    ]
    expect(pluginSidebarCardItemsSchema.safeParse(rows).success).toBe(true)
  })

  it('bounds rows, badges, strings and command args', () => {
    const tooLong = (value: unknown) => pluginSidebarCardItemsSchema.safeParse(value).success
    expect(tooLong([row, row])).toBe(false)
    expect(tooLong([{ ...row, badges: Array.from({ length: 5 }, () => ({ label: 'x' })) }])).toBe(
      false
    )
    expect(tooLong([{ ...row, badges: [{ label: 'x'.repeat(25) }] }])).toBe(false)
    expect(tooLong([{ ...row, badges: [{ label: 'x', tone: 'pink' }] }])).toBe(false)
    expect(tooLong([{ ...row, subtitle: 'x'.repeat(241) }])).toBe(false)
    expect(
      tooLong([
        { ...row, action: { kind: 'command', command: 'tracker.open', args: 'x'.repeat(5000) } }
      ])
    ).toBe(false)
    expect(tooLong([{ ...row, action: { kind: 'openFile', path: 'relative' } }])).toBe(false)
    expect(
      tooLong([{ ...row, action: { kind: 'openFile', path: '/a', placement: 'popup' } }])
    ).toBe(false)
  })

  it('round-trips the sidebar body value', () => {
    const body = pluginSidebarCardBody('samples.tracker', 'issues')
    expect(body).toBe('plugin:samples.tracker/issues')
    expect(parsePluginSidebarCardBody(body)).toEqual({
      pluginKey: 'samples.tracker',
      cardId: 'issues'
    })
    expect(parsePluginSidebarCardBody('agents')).toBeNull()
    expect(parsePluginSidebarCardBody('plugin:nothing')).toBeNull()
  })
})
