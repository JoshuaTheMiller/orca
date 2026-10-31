import { describe, expect, it } from 'vitest'
import type { GroupHeaderRow } from '../../../../../../shared/sidebar-list/row-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { ActivePluginProjectItem } from '@/store/plugin-sidebar-project-items'
import { buildRenderableRows } from './renderable-rows'
import { getRenderRowKey, type RenderRow } from './render-row'
import {
  collectVisiblePluginProjectItems,
  injectPluginProjectItemRows
} from './plugin-project-item-rows'
import { estimateRenderRowSize, getStickyHeaderIndexes } from '../viewport/virtual-rows'

const repo = (id: string, extra: Partial<Repo> = {}): Repo =>
  ({
    id,
    path: `/code/${id}`,
    displayName: id.toUpperCase(),
    badgeColor: '#000',
    ...extra
  }) as Repo

const header = (id: string, extra: Partial<GroupHeaderRow> = {}): GroupHeaderRow => ({
  type: 'header',
  key: `repo:${id}`,
  count: 2,
  icon: { kind: 'project' },
  repo: repo(id),
  ...extra
})

const group = (id: string): ProjectGroup => ({
  id,
  name: `Folder ${id}`,
  parentPath: null,
  parentGroupId: null,
  createdFrom: 'folder-scan',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 0,
  updatedAt: 0
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
  ({
    type: 'item',
    rowKey: `wt:${id}`,
    sectionKey: 'x',
    lineageChildCount: 0,
    depth: 0
  }) as never

const rows: RenderRow[] = [header('a'), worktreeRow('a1'), header('b'), worktreeRow('b1')]
const options = { groupBy: 'repo' as const }

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
      injectPluginProjectItemRows(rows, [item('one')], {
        ...options,
        groupBy: 'workspace-status'
      })
    ).toBe(rows)
  })

  it('keeps the items under a collapsed project, which stays a quick way in', () => {
    const collapsed: RenderRow[] = [header('a', { count: 0 }), header('b', { collapseKey: 'k' })]
    expect(summary(injectPluginProjectItemRows(collapsed, [item('one')], options))).toEqual([
      'header',
      'item:one@a',
      'header',
      'item:one@b'
    ])
  })

  it('gives a top-level folder project the items but not the projects nested in it', () => {
    const folder = (id: string, depth: number): GroupHeaderRow => ({
      type: 'header',
      key: `group:${id}`,
      label: `Folder ${id}`,
      count: 3,
      icon: { kind: 'project' },
      projectGroup: { ...group(id), parentPath: `/code/${id}` },
      projectGroupDepth: depth
    })
    const list: RenderRow[] = [
      folder('f', 0),
      header('nested', { projectGroupDepth: 1 }),
      folder('sub', 1),
      header('top')
    ]
    expect(summary(injectPluginProjectItemRows(list, [item('one')], options))).toEqual([
      'header',
      'item:one@f',
      'header',
      'header',
      'header',
      'item:one@top'
    ])
    const [, injected] = injectPluginProjectItemRows(list, [item('one')], options)
    expect(injected).toMatchObject({
      project: {
        id: 'f',
        name: 'Folder f',
        paths: ['/code/f'],
        hostId: 'local'
      },
      groupDepth: 0
    })
  })

  it('names a remote or path-less folder project with no local paths', () => {
    const groupHeader = (extra: Partial<ProjectGroup>): GroupHeaderRow => ({
      type: 'header',
      key: 'group:g',
      label: 'G',
      count: 1,
      icon: { kind: 'project' },
      projectGroup: { ...group('g'), ...extra },
      projectGroupDepth: 0
    })
    const remote = injectPluginProjectItemRows(
      [groupHeader({ parentPath: '/srv/g', connectionId: 'box' })],
      [item('one')],
      options
    )[1]
    expect(remote).toMatchObject({
      project: { id: 'g', paths: [], hostId: 'ssh:box' }
    })
    const manual = injectPluginProjectItemRows(
      [groupHeader({ parentPath: null })],
      [item('one')],
      options
    )[1]
    expect(manual).toMatchObject({ project: { paths: [], hostId: 'local' } })
  })

  it('skips the synthetic Ungrouped header', () => {
    const ungrouped: GroupHeaderRow = {
      type: 'header',
      key: 'group:none',
      count: 1,
      icon: { kind: 'project' },
      projectGroup: { id: null, name: 'Ungrouped', tabOrder: 0 }
    }
    expect(summary(injectPluginProjectItemRows([ungrouped], [item('one')], options))).toEqual([
      'header'
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

  it('still reports a collapsed project, since its items stay in the list', () => {
    const collapsed: RenderRow[] = [header('a', { collapseKey: 'k' })]
    expect(
      collectVisiblePluginProjectItems(
        injectPluginProjectItemRows(collapsed, [item('one')], options)
      )
    ).toEqual([
      {
        pluginKey: 'samples.board',
        itemId: 'one',
        projects: [{ id: 'a', name: 'A', paths: ['/code/a'] }]
      }
    ])
    expect(collectVisiblePluginProjectItems([])).toEqual([])
  })
})
