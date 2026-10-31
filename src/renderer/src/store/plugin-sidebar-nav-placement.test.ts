import { describe, expect, it } from 'vitest'
import type {
  ActivePluginSidebarNavItem,
  ActivePluginSidebarStateItem
} from './plugin-sidebar-nav-items'
import { placePluginSidebarNavItems } from './plugin-sidebar-nav-placement'

const base = { pluginKey: 'samples.a', pluginName: 'A' }
const toggle = (id: string, parentKey?: string): ActivePluginSidebarStateItem => ({
  ...base,
  id,
  key: `samples.a/${id}`,
  title: id,
  kind: 'toggle',
  setting: id,
  default: false,
  valueKey: `samples.a/${id}`,
  ...(parentKey ? { parentKey } : {})
})
const child = (id: string, parentKey: string): ActivePluginSidebarNavItem => ({
  ...base,
  id,
  key: `samples.a/${id}`,
  title: id,
  parentKey,
  runnable: {
    ...base,
    id: 'open',
    title: 'Open',
    context: 'global',
    handler: { type: 'worker' },
    keybindings: []
  }
})

const parent = toggle('parent')
const items = [child('first', parent.key), toggle('other'), parent, child('second', parent.key)]
const ids = (placed: ReturnType<typeof placePluginSidebarNavItems>): string[] =>
  placed.map(({ item, depth }) => `${depth}:${item.id}`)

describe('placePluginSidebarNavItems', () => {
  it('leaves children out while their toggle is off', () => {
    expect(ids(placePluginSidebarNavItems(items, {}, []))).toEqual(['0:other', '0:parent'])
  })

  it('puts children right under a toggle that is on, in manifest order', () => {
    expect(ids(placePluginSidebarNavItems(items, { [parent.valueKey]: true }, []))).toEqual([
      '0:other',
      '0:parent',
      '1:first',
      '1:second'
    ])
  })

  it('uses the default of a toggle with no stored value', () => {
    const on = { ...toggle('parent'), default: true }
    expect(ids(placePluginSidebarNavItems([on, child('first', on.key)], {}, []))).toEqual([
      '0:parent',
      '1:first'
    ])
  })

  it('hides a hidden parent with its children, and a hidden child alone', () => {
    const values = { [parent.valueKey]: true }
    expect(ids(placePluginSidebarNavItems(items, values, [parent.key]))).toEqual(['0:other'])
    expect(ids(placePluginSidebarNavItems(items, values, ['samples.a/first']))).toEqual([
      '0:other',
      '0:parent',
      '1:second'
    ])
  })

  it('never shows a checkbox parent as a switch for its children', () => {
    const checkbox: ActivePluginSidebarStateItem = { ...toggle('box'), kind: 'checkbox' }
    expect(
      ids(
        placePluginSidebarNavItems(
          [checkbox, child('kid', checkbox.key)],
          { [checkbox.valueKey]: true },
          []
        )
      )
    ).toEqual(['0:box'])
  })

  describe('when gates', () => {
    const gate = { pluginKey: 'samples.a', setting: 'show', valueKey: 'samples.a/show' }
    const gated = (
      id: string,
      initial: boolean,
      parentKey?: string
    ): ActivePluginSidebarNavItem => ({
      ...child(id, parentKey ?? ''),
      ...(parentKey ? {} : { parentKey: undefined }),
      gate: { ...gate, default: initial }
    })

    it('shows an item only while its setting is true, and reads the default until loaded', () => {
      const item = gated('graph', true)
      expect(ids(placePluginSidebarNavItems([item], {}, [], {}))).toEqual(['0:graph'])
      expect(ids(placePluginSidebarNavItems([item], {}, [], { [gate.valueKey]: false }))).toEqual(
        []
      )
      expect(
        ids(placePluginSidebarNavItems([gated('graph', false)], {}, [], { [gate.valueKey]: true }))
      ).toEqual(['0:graph'])
      expect(ids(placePluginSidebarNavItems([gated('graph', false)], {}, [], {}))).toEqual([])
    })

    it('needs both the toggle and its own gate for a child', () => {
      const kid = { ...child('kid', parent.key), gate: { ...gate, default: false } }
      const on = { [parent.valueKey]: true }
      expect(ids(placePluginSidebarNavItems([parent, kid], on, [], {}))).toEqual(['0:parent'])
      expect(
        ids(placePluginSidebarNavItems([parent, kid], on, [], { [gate.valueKey]: true }))
      ).toEqual(['0:parent', '1:kid'])
      expect(
        ids(placePluginSidebarNavItems([parent, kid], {}, [], { [gate.valueKey]: true }))
      ).toEqual(['0:parent'])
    })

    it('takes the children with a gated toggle that is closed', () => {
      const closed = { ...toggle('parent'), gate: { ...gate, default: false } }
      const kid = child('kid', closed.key)
      expect(
        ids(placePluginSidebarNavItems([closed, kid], { [closed.valueKey]: true }, [], {}))
      ).toEqual([])
    })
  })
})
