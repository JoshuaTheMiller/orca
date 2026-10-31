import { describe, expect, it } from 'vitest'
import type { GroupHeaderRow } from '../../../../../../shared/sidebar-list/row-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { ActivePluginProjectItem } from '@/store/plugin-sidebar-project-items'
import { buildRenderableRows } from './renderable-rows'
import { getRenderRowKey, type RenderRow } from './render-row'
import {
  collectVisiblePluginProjectItems,
  injectPluginProjectItemRows
} from './plugin-project-item-rows'
import { estimateRenderRowSize, getStickyHeaderIndexes } from '../viewport/virtual-rows'

const repo = (id: string, extra: Partial<Repo> = {}): Repo =>
  ({ id, path: `/code/${id}`, displayName: id.toUpperCase(), badgeColor: '#000', ...extra }) as Repo

const header = (id: string, extra: Partial<GroupHeaderRow> = {}): GroupHeaderRow => ({
  type: 'header',
  key: `repo:${id}`,
  count: 2,
  icon: { kind: 'project' },
  repo: repo(id),
  ...extra
})

const plugin = { pluginKey: 'samples.board', pluginName: 'Board' }
const item = (id: string): ActivePluginProjectItem => ({
  ...plugin,
  id,
  key: `samples.board/${id}`,
  title: id,
  runnable: {
    ...plugin,
    id: 'board.open',
    title: 'Open',
    context: 'global',
    handler: { type: 'worker' },
    keybindings: []
  }
})
const worktreeRow = (id: string) =>
  ({ type: 'item', rowKey: `wt:${id}`, sectionKey: 'x', lineageChildCount: 0, depth: 0 }) as never

const rows: RenderRow[] = [header('a'), worktreeRow('a1'), header('b'), worktreeRow('b1')]
const options = { groupBy: 'repo' as const, collapsedGroups: new Set<string>() }

const summary = (list: readonly RenderRow[]): string[] =>
  list.map((row) =>
    row.type === 'plugin-project-item' ? `item:${row.item.id}@${row.project.id}` : row.type
  )

describe('injectPluginProjectItemRows', () => {
  it('puts every item first under every project header, above its workspaces', () => {
    expect(summary(injectPluginProjectItemRows(rows, [item('one'), item('two')], options))).toEqual(
      ['header', 'item:one@a', 'item:two@a', 'item', 'header', 'item:one@b', 'item:two@b', 'item']
    )
  })

  it('returns the rows untouched with no items or outside project grouping', () => {
    expect(injectPluginProjectItemRows(rows, [], options)).toBe(rows)
    expect(
      injectPluginProjectItemRows(rows, [item('one')], { ...options, groupBy: 'workspace-status' })
    ).toBe(rows)
  })

  it('leaves a collapsed project without its items but keeps the others', () => {
    const collapsed = { ...options, collapsedGroups: new Set(['repo:a']) }
    expect(summary(injectPluginProjectItemRows(rows, [item('one')], collapsed))).toEqual([
      'header',
      'item',
      'header',
      'item:one@b',
      'item'
    ])
  })

  it('honors a header collapse key, and ignores a stale collapse on an empty project', () => {
    const scoped: RenderRow[] = [
      header('a', { collapseKey: 'host:local:repo:a' }),
      header('empty', { count: 0 })
    ]
    const collapsed = {
      ...options,
      collapsedGroups: new Set(['host:local:repo:a', 'repo:empty'])
    }
    expect(summary(injectPluginProjectItemRows(scoped, [item('one')], collapsed))).toEqual([
      'header',
      'header',
      'item:one@empty'
    ])
  })

  it('skips headers that are not projects', () => {
    const groupHeader = header('g', { repo: undefined })
    expect(summary(injectPluginProjectItemRows([groupHeader], [item('one')], options))).toEqual([
      'header'
    ])
  })

  it('names the project: label, local paths only, and the host', () => {
    const [, injected] = injectPluginProjectItemRows(
      [header('a', { label: 'Alpha' })],
      [item('one')],
      options
    )
    expect(injected).toMatchObject({
      project: { id: 'a', name: 'Alpha', paths: ['/code/a'], hostId: 'local' }
    })
    const remote = injectPluginProjectItemRows(
      [header('r', { repo: repo('r', { connectionId: 'box' }) })],
      [item('one')],
      options
    )[1]
    expect(remote).toMatchObject({ project: { paths: [], hostId: 'ssh:box' } })
  })

  it('gives each injected row a unique key and a fixed estimated height for the virtualizer', () => {
    const injected = injectPluginProjectItemRows(rows, [item('one'), item('two')], options)
    const keys = injected.map(getRenderRowKey)
    expect(new Set(keys).size).toBe(keys.length)
    const index = injected.findIndex((row) => row.type === 'plugin-project-item')
    expect(estimateRenderRowSize(injected, index, 0, null)).toBe(28)
  })

  it('keeps project headers the sticky ones and survives building renderable rows first', () => {
    const injected = injectPluginProjectItemRows(
      buildRenderableRows([header('a'), worktreeRow('a1')] as never),
      [item('one')],
      options
    )
    expect(getStickyHeaderIndexes(injected)).toEqual([0])
    expect(injected).toHaveLength(3)
  })
})

describe('collectVisiblePluginProjectItems', () => {
  it('lists the projects each item shows under, once each', () => {
    const injected = injectPluginProjectItemRows(rows, [item('one'), item('two')], options)
    expect(collectVisiblePluginProjectItems(injected)).toEqual([
      {
        pluginKey: 'samples.board',
        itemId: 'one',
        projects: [
          { id: 'a', name: 'A', paths: ['/code/a'] },
          { id: 'b', name: 'B', paths: ['/code/b'] }
        ]
      },
      {
        pluginKey: 'samples.board',
        itemId: 'two',
        projects: [
          { id: 'a', name: 'A', paths: ['/code/a'] },
          { id: 'b', name: 'B', paths: ['/code/b'] }
        ]
      }
    ])
  })

  it('omits collapsed projects and reports nothing without rows', () => {
    const collapsed = { ...options, collapsedGroups: new Set(['repo:a', 'repo:b']) }
    expect(
      collectVisiblePluginProjectItems(injectPluginProjectItemRows(rows, [item('one')], collapsed))
    ).toEqual([])
  })
})
