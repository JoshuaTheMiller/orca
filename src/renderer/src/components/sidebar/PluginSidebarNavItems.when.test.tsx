// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivePluginSidebarNavItem } from '@/store/plugin-sidebar-nav-items'
import { usePluginSettingValuesStore } from '@/store/plugin-setting-values'

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  getSettings: vi.fn(),
  changed: null as null | ((change: { pluginKey: string; key: string; value: unknown }) => void)
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ settings: {}, activeWorktreeId: 'wt-1', updateSettings: vi.fn() })
}))
vi.mock('@/store/plugin-sidebar-nav-items', () => ({
  usePluginSidebarNavItems: () => mocks.items
}))
vi.mock('@/lib/plugin-command-execution', () => ({ executePluginCommand: vi.fn() }))
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

import { PluginSidebarNavItems } from './PluginSidebarNavItems'

const plugin = { pluginKey: 'samples.graph', pluginName: 'Graph' }
const gate = {
  pluginKey: plugin.pluginKey,
  setting: 'show-graph',
  valueKey: 'samples.graph/show-graph',
  default: false
}
const command = (id: string, extra: Partial<ActivePluginSidebarNavItem> = {}) =>
  ({
    ...plugin,
    id,
    key: `samples.graph/${id}`,
    title: id,
    runnable: {
      ...plugin,
      id: 'graph.open',
      title: 'Open',
      context: 'global',
      handler: { type: 'worker' },
      keybindings: []
    },
    ...extra
  }) as ActivePluginSidebarNavItem

const roots: Root[] = []

async function render(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<PluginSidebarNavItems />)
  })
  return container
}

const titles = (container: ParentNode): string[] =>
  Array.from(container.querySelectorAll('[data-depth]')).map(
    (row) => row.querySelector('span')?.textContent ?? ''
  )

describe('PluginSidebarNavItems when gates', () => {
  beforeEach(() => {
    mocks.items = [command('always'), command('gated', { gate })]
    mocks.getSettings.mockReset()
    mocks.getSettings.mockResolvedValue({ 'show-graph': false })
    mocks.changed = null
    usePluginSettingValuesStore.setState({ values: {} })
    // SAFETY: only the preload members the component touches are stubbed.
    // oxlint-disable-next-line typescript/consistent-type-assertions
    vi.stubGlobal(
      'window',
      Object.assign(window, {
        api: {
          plugins: {
            getSettings: mocks.getSettings,
            onSettingChanged: (callback: typeof mocks.changed) => {
              mocks.changed = callback
              return () => undefined
            }
          }
        }
      })
    )
  })

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('hides a gated item while its setting is false and loads the plugin settings', async () => {
    const container = await render()

    expect(mocks.getSettings).toHaveBeenCalledWith({ pluginKey: plugin.pluginKey })
    expect(titles(container)).toEqual(['always'])
  })

  it('shows the item when the stored value is true', async () => {
    mocks.getSettings.mockResolvedValue({ 'show-graph': true })
    const container = await render()

    expect(titles(container)).toEqual(['always', 'gated'])
  })

  it('follows a change live, both ways', async () => {
    const container = await render()
    expect(titles(container)).toEqual(['always'])

    await act(async () => {
      mocks.changed?.({ pluginKey: plugin.pluginKey, key: 'show-graph', value: true })
    })
    expect(titles(container)).toEqual(['always', 'gated'])

    await act(async () => {
      mocks.changed?.({ pluginKey: plugin.pluginKey, key: 'show-graph', value: false })
    })
    expect(titles(container)).toEqual(['always'])
  })

  it('loads nothing when no item is gated', async () => {
    mocks.items = [command('always')]
    await render()

    expect(mocks.getSettings).not.toHaveBeenCalled()
  })
})
