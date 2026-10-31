import { describe, expect, it } from 'vitest'
import type { PluginHostListEntry } from '../../../preload/api-types'
import { collectActivePluginSidebarNavItems } from './plugin-sidebar-nav-items'

function plugin(
  pluginKey: string,
  status: PluginHostListEntry['status'],
  overrides: Partial<PluginHostListEntry> = {}
): PluginHostListEntry {
  return {
    pluginKey,
    consentFingerprint: 'sha256-test',
    name: pluginKey,
    version: '1.0.0',
    publisher: 'samples',
    status,
    needsReconsent: false,
    isDev: false,
    official: false,
    bundled: false,
    capabilities: [],
    panels: [],
    commands: [
      {
        id: 'open',
        title: 'Open',
        context: 'global',
        handler: { type: 'worker' },
        keybindings: []
      }
    ],
    sidebarNavItems: [{ id: 'nav', title: 'Nav', command: 'open' }],
    hasWorker: true,
    restarts: 0,
    ...overrides
  }
}

describe('collectActivePluginSidebarNavItems', () => {
  it('keys items per plugin and carries the command they run', () => {
    const [item] = collectActivePluginSidebarNavItems([plugin('samples.a', 'idle')])
    expect(item).toMatchObject({
      key: 'samples.a/nav',
      pluginKey: 'samples.a',
      runnable: { id: 'open', pluginKey: 'samples.a' }
    })
  })

  it('skips plugins that are not live', () => {
    const plugins = (['disabled', 'pending', 'errored', 'invalid'] as const).map((status) =>
      plugin(`samples.${status}`, status)
    )
    expect(collectActivePluginSidebarNavItems(plugins)).toEqual([])
    expect(collectActivePluginSidebarNavItems([plugin('samples.up', 'running')])).toHaveLength(1)
  })

  it('skips an item whose command is not registered and tolerates older hosts', () => {
    expect(
      collectActivePluginSidebarNavItems([
        plugin('samples.a', 'idle', { commands: [] }),
        plugin('samples.b', 'idle', { sidebarNavItems: undefined })
      ])
    ).toEqual([])
  })

  it('collects toggles and checkboxes with their value key, default and parent, needing no command', () => {
    const items = collectActivePluginSidebarNavItems([
      plugin('samples.a', 'idle', {
        commands: [],
        sidebarNavItems: [
          { id: 'details', title: 'Details', kind: 'toggle', setting: 'show-details' },
          {
            id: 'labels',
            title: 'Labels',
            kind: 'checkbox',
            setting: 'show-labels',
            default: true,
            parent: 'details'
          }
        ]
      })
    ])
    expect(items).toMatchObject([
      {
        key: 'samples.a/details',
        kind: 'toggle',
        valueKey: 'samples.a/show-details',
        default: false
      },
      {
        key: 'samples.a/labels',
        kind: 'checkbox',
        valueKey: 'samples.a/show-labels',
        default: true,
        parentKey: 'samples.a/details'
      }
    ])
    expect(items[0]).not.toHaveProperty('runnable')
  })
})
