import { describe, expect, it } from 'vitest'
import { describeSidebarNavItemRows, navItemFromSummary } from './plugin-sidebar-nav-item-rows'

describe('sidebar nav item rows', () => {
  it('reads the kind of a toggle or checkbox from a catalog summary, and leaves commands plain', () => {
    expect(navItemFromSummary({ name: 'Open', detail: 'graph.open' })).toEqual({
      title: 'Open'
    })
    expect(navItemFromSummary({ name: 'Open' })).toEqual({ title: 'Open' })
    expect(navItemFromSummary({ name: 'Details', detail: 'toggle:show-details' })).toEqual({
      title: 'Details',
      kind: 'toggle'
    })
    expect(navItemFromSummary({ name: 'Labels', detail: 'checkbox:show-labels' })).toEqual({
      title: 'Labels',
      kind: 'checkbox'
    })
  })

  it('lists a toggle and a checkbox beside commands, each saying what it adds', () => {
    const rows = describeSidebarNavItemRows([
      { title: 'Open' },
      { title: 'Details', kind: 'toggle' },
      { title: 'Labels', kind: 'checkbox' }
    ])
    expect(rows.map((row) => [row.title, row.detail])).toEqual([
      ['Open', 'Adds to the left sidebar'],
      ['Details', 'Adds a toggle to the left sidebar'],
      ['Labels', 'Adds a checkbox to the left sidebar']
    ])
  })
})
