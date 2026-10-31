import { describe, expect, it, vi } from 'vitest'
import { PluginSidebarCards } from './plugin-sidebar-cards'

function create(declared = new Set(['samples.demo/issues', 'samples.demo/prs'])) {
  const announceVisibility = vi.fn()
  const itemsChanged = vi.fn()
  const cards = new PluginSidebarCards({
    isDeclared: (pluginKey, cardId) => declared.has(`${pluginKey}/${cardId}`),
    announceVisibility,
    itemsChanged
  })
  return { cards, declared, announceVisibility, itemsChanged }
}

const issues = { pluginKey: 'samples.demo', cardId: 'issues' }
const prs = { pluginKey: 'samples.demo', cardId: 'prs' }

describe('PluginSidebarCards rows', () => {
  it('keeps the rows last set and tells windows they changed', () => {
    const { cards, itemsChanged } = create()
    expect(cards.getItems('samples.demo', 'issues')).toEqual([])
    expect(cards.setItems('samples.demo', 'issues', [{ id: 'a', title: 'A' }])).toEqual({
      ok: true
    })
    expect(itemsChanged).toHaveBeenCalledWith('samples.demo', 'issues')
    expect(cards.getItems('samples.demo', 'issues')).toEqual([{ id: 'a', title: 'A' }])
    cards.setItems('samples.demo', 'issues', [{ id: 'b', title: 'B' }])
    expect(cards.getItems('samples.demo', 'issues')).toEqual([{ id: 'b', title: 'B' }])
    expect(cards.findItem('samples.demo', 'issues', 'a')).toBeNull()
  })

  it('refuses a card the plugin did not declare, without storing anything', () => {
    const { cards, itemsChanged } = create()
    expect(cards.setItems('samples.demo', 'other', [])).toMatchObject({ ok: false, invalid: true })
    expect(cards.setItems('samples.other', 'issues', [])).toMatchObject({ ok: false })
    expect(itemsChanged).not.toHaveBeenCalled()
  })

  it('keeps rows while the card is closed and drops them when the plugin goes', () => {
    const { cards, declared } = create()
    cards.setItems('samples.demo', 'issues', [{ id: 'a', title: 'A' }])
    cards.setWindowCard(1, issues)
    cards.setWindowCard(1, null)
    expect(cards.getItems('samples.demo', 'issues')).toHaveLength(1)

    declared.clear()
    cards.prune()
    declared.add('samples.demo/issues')
    expect(cards.getItems('samples.demo', 'issues')).toEqual([])
  })
})

describe('PluginSidebarCards visibility', () => {
  it('announces the first window showing a card and the last one leaving', () => {
    const { cards, announceVisibility } = create()
    cards.setWindowCard(1, issues)
    cards.setWindowCard(2, issues)
    expect(announceVisibility).toHaveBeenCalledTimes(1)
    expect(announceVisibility).toHaveBeenLastCalledWith('samples.demo', 'issues', true)
    expect(cards.isShown('samples.demo')).toBe(true)

    cards.setWindowCard(1, null)
    expect(announceVisibility).toHaveBeenCalledTimes(1)
    cards.setWindowCard(2, null)
    expect(announceVisibility).toHaveBeenLastCalledWith('samples.demo', 'issues', false)
    expect(cards.isShown('samples.demo')).toBe(false)
  })

  it('moves a window between cards, and repeats nothing', () => {
    const { cards, announceVisibility } = create()
    cards.setWindowCard(1, issues)
    cards.setWindowCard(1, issues)
    cards.setWindowCard(1, prs)
    expect(announceVisibility.mock.calls).toEqual([
      ['samples.demo', 'issues', true],
      ['samples.demo', 'prs', true],
      ['samples.demo', 'issues', false]
    ])
  })

  it('treats a destroyed window as having closed its card', () => {
    const { cards, announceVisibility } = create()
    cards.setWindowCard(7, issues)
    cards.dropWindow(7)
    expect(announceVisibility).toHaveBeenLastCalledWith('samples.demo', 'issues', false)
    cards.dropWindow(7)
    expect(announceVisibility).toHaveBeenCalledTimes(2)
  })

  it('ignores a window reporting a card that is not declared', () => {
    const { cards, announceVisibility } = create()
    cards.setWindowCard(1, { pluginKey: 'samples.demo', cardId: 'ghost' })
    expect(announceVisibility).not.toHaveBeenCalled()
    expect(cards.isShown('samples.demo')).toBe(false)
  })

  it('forgets viewers of a card whose plugin went away, without announcing', () => {
    const { cards, declared, announceVisibility } = create()
    cards.setWindowCard(1, issues)
    declared.delete('samples.demo/issues')
    cards.prune()
    expect(cards.isShown('samples.demo')).toBe(false)
    expect(announceVisibility).toHaveBeenCalledTimes(1)
  })
})
