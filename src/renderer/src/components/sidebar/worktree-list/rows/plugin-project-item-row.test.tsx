// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { PluginProjectItemRenderRow } from '../listing/render-row'
import { usePluginProjectItemDetailsStore } from '@/store/plugin-project-item-details'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  updateSettings: vi.fn(),
  execute: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))
vi.mock('@/lib/plugin-command-execution', () => ({ executePluginCommand: mocks.execute }))
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" data-menu-item onClick={onSelect}>
      {children}
    </button>
  )
}))
vi.mock('./PluginProjectItemRenameDialog', () => ({
  PluginProjectItemRenameDialog: ({
    open,
    currentName,
    onSave
  }: {
    open: boolean
    currentName: string
    onSave: (name: string) => void
  }) =>
    open ? (
      <button type="button" data-rename-dialog={currentName} onClick={() => onSave('Renamed')} />
    ) : null
}))

import { renderPluginProjectItemVirtualRow } from './plugin-project-item-row'

const plugin = { pluginKey: 'samples.board', pluginName: 'Board' }
const row: PluginProjectItemRenderRow = {
  type: 'plugin-project-item',
  key: 'hdr:repo-1/samples.board/open',
  groupDepth: 0,
  project: { id: 'repo-1', name: 'Repo One', paths: ['C:\\code\\one'], hostId: 'local' },
  item: {
    ...plugin,
    id: 'open',
    key: 'samples.board/open',
    title: 'Board',
    runnable: {
      ...plugin,
      id: 'board.open',
      title: 'Open',
      context: 'global',
      handler: { type: 'worker' },
      keybindings: []
    }
  }
}
const vItem = { key: row.key, index: 1, start: 40, size: 28, end: 68, lane: 0 } as VirtualItem

const roots: Root[] = []
async function render(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      renderPluginProjectItemVirtualRow({ row, vItem, measureVirtualRowElement: () => undefined })
    )
  })
  return container
}
const click = (element: Element): Promise<void> =>
  act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
const menuItem = (container: ParentNode, text: string): Element => {
  const found = Array.from(container.querySelectorAll('[data-menu-item]')).find((el) =>
    el.textContent?.includes(text)
  )
  if (!found) {
    throw new Error(`menu item not found: ${text}`)
  }
  return found
}

describe('plugin project item row', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(undefined)
    mocks.state = {
      settings: {},
      activeWorktreeId: null,
      updateSettings: mocks.updateSettings
    }
    usePluginProjectItemDetailsStore.setState({ details: {} })
  })

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('runs its command with the project and the title as the user sees it', async () => {
    const container = await render()
    await click(container.querySelector('[data-plugin-project-item]')!)
    expect(mocks.execute).toHaveBeenCalledWith(row.item.runnable, 'plugin-palette', {
      project: row.project,
      itemTitle: 'Board'
    })
  })

  it('shows the user name for this project over the default title, and passes it on click', async () => {
    mocks.state = {
      ...mocks.state,
      settings: { pluginProjectItemTitles: { 'samples.board/open/repo-1': 'Sprint' } }
    }
    const container = await render()
    expect(container.querySelector('[data-plugin-project-item] span')?.textContent).toBe('Sprint')
    await click(container.querySelector('[data-plugin-project-item]')!)
    expect(mocks.execute.mock.calls[0][2]).toMatchObject({ itemTitle: 'Sprint' })
  })

  it('renames through the dialog, keyed by plugin, item and project', async () => {
    const container = await render()
    await click(menuItem(container, 'Rename'))
    await click(container.querySelector('[data-rename-dialog]')!)
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      pluginProjectItemTitles: { 'samples.board/open/repo-1': 'Renamed' }
    })
  })

  it('offers Reset name only while an override exists, and drops just that key', async () => {
    let container = await render()
    expect(container.textContent).not.toContain('Reset name')
    mocks.state = {
      ...mocks.state,
      settings: {
        pluginProjectItemTitles: {
          'samples.board/open/repo-1': 'Sprint',
          'samples.board/open/repo-2': 'Other'
        }
      }
    }
    document.body.innerHTML = ''
    container = await render()
    await click(menuItem(container, 'Reset name'))
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      pluginProjectItemTitles: { 'samples.board/open/repo-2': 'Other' }
    })
  })

  it('hides the item for every project by its plugin key', async () => {
    mocks.state = { ...mocks.state, settings: { hiddenPluginProjectItems: ['other/x'] } }
    const container = await render()
    await click(menuItem(container, 'Hide from sidebar'))
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      hiddenPluginProjectItems: ['other/x', 'samples.board/open']
    })
  })

  it('shows the worker detail for this project only, muted and with tabular digits', async () => {
    usePluginProjectItemDetailsStore.setState({
      details: {
        'samples.board/open\u0000repo-1': '3/7',
        'samples.board/open\u0000repo-2': '9/9'
      }
    })
    const container = await render()
    const detail = container.querySelector('[data-plugin-project-item-detail]')
    expect(detail?.textContent).toBe('3/7')
    expect(detail?.className).toContain('tabular-nums')
  })

  it('is disabled for a workspace-scoped command while no workspace is active', async () => {
    const scoped = {
      ...row,
      item: { ...row.item, runnable: { ...row.item.runnable, context: 'workspace' as const } }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () => {
      root.render(
        renderPluginProjectItemVirtualRow({
          row: scoped,
          vItem,
          measureVirtualRowElement: () => undefined
        })
      )
    })
    expect(container.querySelector<HTMLButtonElement>('[data-plugin-project-item]')?.disabled).toBe(
      true
    )
  })
})
