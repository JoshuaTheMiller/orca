import { describe, expect, it } from 'vitest'
import type { PluginHostListEntry } from '../../../preload/api-types'
import {
  collectActivePluginProjectItems,
  pluginProjectItemTitleKey,
  resolvePluginProjectItemTitle,
  visiblePluginProjectItems
} from './plugin-sidebar-project-items'

function plugin(overrides: Partial<PluginHostListEntry> = {}): PluginHostListEntry {
  return {
    pluginKey: 'samples.board',
    name: 'Board',
    status: 'running',
    commands: [
      {
        id: 'board.open',
        title: 'Open',
        context: 'global',
        handler: { type: 'worker' },
        keybindings: []
      }
    ],
    settings: [
      { id: 'show', title: 'Show', type: 'boolean', default: true },
      { id: 'label', title: 'Label', type: 'string', default: 'Backlog' }
    ],
    projectItems: [
      { id: 'open', title: 'Board', command: 'board.open', when: 'show', titleSetting: 'label' }
    ],
    ...overrides
  } as PluginHostListEntry
}

describe('collectActivePluginProjectItems', () => {
  it('collects items of live plugins with their command, gate and title source', () => {
    const [found] = collectActivePluginProjectItems([plugin()])
    expect(found).toMatchObject({
      key: 'samples.board/open',
      id: 'open',
      title: 'Board',
      runnable: { id: 'board.open' },
      gate: { valueKey: 'samples.board/show', default: true },
      titleSource: { valueKey: 'samples.board/label', setting: 'label', default: 'Backlog' }
    })
  })

  it('skips disabled plugins, hosts without items, and items whose command is gone', () => {
    expect(collectActivePluginProjectItems([plugin({ status: 'disabled' })])).toEqual([])
    expect(collectActivePluginProjectItems([plugin({ projectItems: undefined })])).toEqual([])
    expect(collectActivePluginProjectItems([plugin({ commands: [] })])).toEqual([])
  })
})

describe('visiblePluginProjectItems', () => {
  const items = collectActivePluginProjectItems([plugin()])

  it('applies the when gate (default until loaded) and the hidden list', () => {
    expect(visiblePluginProjectItems(items, [], {})).toHaveLength(1)
    expect(visiblePluginProjectItems(items, [], { 'samples.board/show': false })).toEqual([])
    expect(visiblePluginProjectItems(items, ['samples.board/open'], {})).toEqual([])
  })
})

describe('resolvePluginProjectItemTitle', () => {
  const item = { title: 'Board' }

  it('prefers the user name, then the setting text, then the manifest title', () => {
    expect(resolvePluginProjectItemTitle(item, 'Backlog', 'Sprint')).toBe('Sprint')
    expect(resolvePluginProjectItemTitle(item, 'Backlog', undefined)).toBe('Backlog')
    expect(resolvePluginProjectItemTitle(item, '  ', '')).toBe('Board')
    expect(resolvePluginProjectItemTitle(item, undefined, undefined)).toBe('Board')
  })

  it('keys a user name by plugin, item and project', () => {
    expect(pluginProjectItemTitleKey('samples.board/open', 'repo-1')).toBe(
      'samples.board/open/repo-1'
    )
  })
})
