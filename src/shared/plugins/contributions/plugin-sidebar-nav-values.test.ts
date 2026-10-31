import { describe, expect, it } from 'vitest'
import {
  parsePluginSidebarNavValueKey,
  pluginSidebarNavValueKey,
  resolvePluginSidebarNavValues
} from './plugin-sidebar-nav-values'

const items = [
  { kind: 'command' },
  { kind: 'toggle', setting: 'show-details' },
  { kind: 'checkbox', setting: 'show-labels', default: true }
]

describe('plugin sidebar nav values', () => {
  it('applies defaults, lets stored values win and ignores commands and undeclared keys', () => {
    expect(resolvePluginSidebarNavValues('samples.graph', items, undefined)).toEqual({
      'show-details': false,
      'show-labels': true
    })
    expect(
      resolvePluginSidebarNavValues('samples.graph', items, {
        'samples.graph/show-details': true,
        'samples.graph/show-labels': false,
        'samples.graph/gone': true,
        'samples.other/show-details': false
      })
    ).toEqual({ 'show-details': true, 'show-labels': false })
  })

  it('round-trips a key, splitting at the last slash', () => {
    const key = pluginSidebarNavValueKey('samples/graph', 'show-details')
    expect(key).toBe('samples/graph/show-details')
    expect(parsePluginSidebarNavValueKey(key)).toEqual({
      pluginKey: 'samples/graph',
      setting: 'show-details'
    })
    expect(parsePluginSidebarNavValueKey('nothing')).toBeNull()
  })
})
