import { describe, expect, it, vi } from 'vitest'
import type { PluginSidebarNavItemContribution } from '../../shared/plugins/contributions/plugin-sidebar-nav-item-contribution'
import { createPluginSidebarNavEvents } from './plugin-sidebar-nav-events'

const declared: PluginSidebarNavItemContribution[] = [
  { id: 'details', title: 'Details', kind: 'toggle', setting: 'show-details' },
  { id: 'labels', title: 'Labels', kind: 'checkbox', setting: 'show-labels', default: true }
]

function notifier(initial?: Record<string, boolean>) {
  const emit = vi.fn()
  const events = createPluginSidebarNavEvents({
    initial,
    declaredItems: (pluginKey) => (pluginKey === 'samples.graph' ? declared : []),
    emit
  })
  return { events, emit }
}

describe('sidebarNav.valueChanged', () => {
  it('reports a flipped toggle to the owning plugin only', () => {
    const { events, emit } = notifier()
    events.valuesChanged({ 'samples.graph/show-details': true })
    expect(emit).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith('samples.graph', { setting: 'show-details', value: true })
  })

  it('compares effective values, so a default does not count as a change', () => {
    const { events, emit } = notifier()
    // Stored equal to the default (false) and a checkbox left at its default (true).
    events.valuesChanged({ 'samples.graph/show-details': false, 'samples.graph/show-labels': true })
    expect(emit).not.toHaveBeenCalled()
    events.valuesChanged({ 'samples.graph/show-labels': false })
    expect(emit).toHaveBeenCalledWith('samples.graph', { setting: 'show-labels', value: false })
  })

  it('reports a value dropping back to its default and skips the unchanged', () => {
    const { events, emit } = notifier({
      'samples.graph/show-details': true,
      'samples.graph/show-labels': false
    })
    events.valuesChanged({ 'samples.graph/show-labels': false })
    expect(emit).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith('samples.graph', { setting: 'show-details', value: false })
  })

  it('ignores settings the plugin does not declare and other plugins', () => {
    const { events, emit } = notifier()
    events.valuesChanged({ 'samples.graph/removed': true, 'samples.other/show-details': true })
    expect(emit).not.toHaveBeenCalled()
  })

  it('tracks the latest record across calls', () => {
    const { events, emit } = notifier()
    events.valuesChanged({ 'samples.graph/show-details': true })
    events.valuesChanged({ 'samples.graph/show-details': true })
    events.valuesChanged(undefined)
    expect(emit.mock.calls.map(([, payload]) => payload.value)).toEqual([true, false])
  })
})
