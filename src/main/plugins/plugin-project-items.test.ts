import { describe, expect, it, vi } from 'vitest'
import { PluginProjectItems } from './plugin-project-items'

function create(declared: string[] = ['board']) {
  const onDetailChanged = vi.fn()
  const emitVisible = vi.fn()
  const items = new PluginProjectItems({
    declaredItemIds: () => declared,
    onDetailChanged,
    emitVisible
  })
  return { items, onDetailChanged, emitVisible }
}
const project = (id: string) => ({ id, name: id.toUpperCase(), paths: [`/code/${id}`] })

describe('PluginProjectItems details', () => {
  it('stores, announces and clears a detail per item and project', () => {
    const { items, onDetailChanged } = create()
    expect(items.setDetail('a.b', { itemId: 'board', projectId: 'p1', text: '3/7' })).toEqual({
      ok: true
    })
    items.setDetail('a.b', { itemId: 'board', projectId: 'p2', text: '1/2' })
    expect(items.snapshot()).toHaveLength(2)
    items.setDetail('a.b', { itemId: 'board', projectId: 'p1', text: '' })
    expect(items.snapshot()).toEqual([
      { pluginKey: 'a.b', itemId: 'board', projectId: 'p2', text: '1/2' }
    ])
    expect(onDetailChanged).toHaveBeenLastCalledWith({
      pluginKey: 'a.b',
      itemId: 'board',
      projectId: 'p1',
      text: ''
    })
  })

  it('does not announce an unchanged value', () => {
    const { items, onDetailChanged } = create()
    items.setDetail('a.b', { itemId: 'board', projectId: 'p1', text: '3/7' })
    items.setDetail('a.b', { itemId: 'board', projectId: 'p1', text: '3/7' })
    expect(onDetailChanged).toHaveBeenCalledTimes(1)
  })

  it('refuses an item the plugin does not declare', () => {
    const { items } = create(['board'])
    expect(items.setDetail('a.b', { itemId: 'other', projectId: 'p1', text: 'x' })).toMatchObject({
      ok: false,
      invalid: true
    })
    expect(items.snapshot()).toEqual([])
  })

  it('drops a plugin that is no longer live and tells windows to clear its rows', () => {
    const { items, onDetailChanged } = create()
    items.setDetail('a.b', { itemId: 'board', projectId: 'p1', text: '3/7' })
    items.setDetail('c.d', { itemId: 'board', projectId: 'p1', text: '9' })
    items.prune((key) => key === 'c.d')
    expect(items.snapshot().map((d) => d.pluginKey)).toEqual(['c.d'])
    expect(onDetailChanged).toHaveBeenLastCalledWith({
      pluginKey: 'a.b',
      itemId: 'board',
      projectId: 'p1',
      text: ''
    })
  })
})

describe('PluginProjectItems visible projects', () => {
  it('emits when an item first shows, only on change, and an empty set when it stops', () => {
    const { items, emitVisible } = create()
    items.reportVisible(1, [])
    expect(emitVisible).not.toHaveBeenCalled()
    items.reportVisible(1, [{ pluginKey: 'a.b', itemId: 'board', projects: [project('p2')] }])
    expect(emitVisible).toHaveBeenCalledWith('a.b', { itemId: 'board', projects: [project('p2')] })
    items.reportVisible(1, [{ pluginKey: 'a.b', itemId: 'board', projects: [project('p2')] }])
    expect(emitVisible).toHaveBeenCalledTimes(1)
    items.reportVisible(1, [])
    expect(emitVisible).toHaveBeenLastCalledWith('a.b', { itemId: 'board', projects: [] })
  })

  it('combines windows and keeps a project shown while any window shows it', () => {
    const { items, emitVisible } = create()
    items.reportVisible(1, [{ pluginKey: 'a.b', itemId: 'board', projects: [project('p1')] }])
    items.reportVisible(2, [
      { pluginKey: 'a.b', itemId: 'board', projects: [project('p1'), project('p2')] }
    ])
    expect(emitVisible).toHaveBeenLastCalledWith('a.b', {
      itemId: 'board',
      projects: [project('p1'), project('p2')]
    })
    items.dropSender(2)
    expect(emitVisible).toHaveBeenLastCalledWith('a.b', {
      itemId: 'board',
      projects: [project('p1')]
    })
  })

  it('emits again after the plugin was pruned and the item shows again', () => {
    const { items, emitVisible } = create()
    const report = [{ pluginKey: 'a.b', itemId: 'board', projects: [project('p1')] }]
    items.reportVisible(1, report)
    items.prune(() => false)
    items.reportVisible(1, [{ ...report[0], projects: [project('p1'), project('p3')] }])
    expect(emitVisible).toHaveBeenCalledTimes(2)
  })
})
